from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import select

from .config import get_settings
from .db import SessionLocal
from .models import ROLE_SUPERUSER, SiteSettings, Staff
from .routers import admin, auth, participant, public, staff
from .security import hash_password


def bootstrap() -> None:
    """Создаёт строку настроек и первого суперюзера, если их ещё нет."""
    s = get_settings()
    s.ensure_dirs()
    with SessionLocal() as db:
        if db.get(SiteSettings, 1) is None:
            db.add(SiteSettings(id=1, registration_code=s.registration_code))
        if not db.scalar(select(Staff).where(Staff.role == ROLE_SUPERUSER)):
            db.add(Staff(login=s.admin_login, password_hash=hash_password(s.admin_password),
                         full_name="Администратор", role=ROLE_SUPERUSER))
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap()
    yield


app = FastAPI(title="Сбор презентаций", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

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
