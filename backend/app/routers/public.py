from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select

from ..deps import DB, get_site_settings
from ..models import Section, SiteSettings
from ..schemas import PublicSettings, SectionOut

router = APIRouter(prefix="/api/public", tags=["public"])


def logo_url(s: SiteSettings) -> str | None:
    if not s.logo_path or not Path(s.logo_path).exists():
        return None
    return f"/api/public/logo?v={int(Path(s.logo_path).stat().st_mtime)}"


@router.get("/settings", response_model=PublicSettings)
def public_settings(db: DB):
    s = get_site_settings(db)
    sections = db.scalars(select(Section).order_by(Section.position, Section.id)).all()
    return PublicSettings(
        site_title=s.site_title,
        site_subtitle=s.site_subtitle,
        event_name=s.event_name,
        footer_text=s.footer_text,
        primary_color=s.primary_color,
        logo_url=logo_url(s),
        deadline=s.deadline,
        registration_open=s.registration_open,
        sections=[SectionOut.model_validate(x) for x in sections],
    )


@router.get("/logo")
def logo(db: DB):
    s = get_site_settings(db)
    if not s.logo_path or not Path(s.logo_path).exists():
        raise HTTPException(404, "Логотип не задан")
    return FileResponse(s.logo_path, headers={
        "Cache-Control": "public, max-age=31536000",
        # SVG может содержать <script>: при открытии напрямую запрещаем любые скрипты
        "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
        "Content-Disposition": "inline",
    })
