from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from sqlalchemy import select

from .config import INSECURE_ADMIN_PASSWORDS, get_settings
from .db import SessionLocal
from .models import ROLE_SUPERUSER, SiteSettings, Staff
from .routers import admin, auth, participant, public, staff
from .security import hash_password


def bootstrap() -> None:
    """Создаёт строку настроек и первого суперюзера, если их ещё нет."""
    s = get_settings()
    s.check_secrets()
    s.ensure_dirs()
    with SessionLocal() as db:
        if db.get(SiteSettings, 1) is None:
            db.add(SiteSettings(id=1, registration_code=s.registration_code))
        if not db.scalar(select(Staff).where(Staff.role == ROLE_SUPERUSER)):
            if s.admin_password in INSECURE_ADMIN_PASSWORDS:
                raise RuntimeError("ADMIN_PASSWORD не задан или стандартный — задайте свой в .env")
            db.add(Staff(login=s.admin_login, password_hash=hash_password(s.admin_password),
                         full_name="Администратор", role=ROLE_SUPERUSER))
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap()
    yield


_docs = get_settings().enable_docs
app = FastAPI(
    title="Сбор презентаций", lifespan=lifespan,
    docs_url="/api/docs" if _docs else None,
    openapi_url="/api/openapi.json" if _docs else None,
    redoc_url=None,
)

_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "same-origin")
    h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    # Swagger UI тянет скрипты с CDN — ему CSP не ставим
    if not request.url.path.startswith("/api/docs"):
        h.setdefault("Content-Security-Policy", _CSP)
    return response

for r in (public.router, auth.router, participant.router, staff.router, admin.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"ok": True}


# ---------------------------------------------------------------- frontend ---

_static = get_settings().static_dir
if _static and (_static / "index.html").exists():
    from fastapi import HTTPException
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    _static = _static.resolve()
    app.mount("/assets", StaticFiles(directory=_static / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not Found")
        candidate = (_static / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(_static):
            return FileResponse(candidate)
        return FileResponse(_static / "index.html", headers={"Cache-Control": "no-cache"})
