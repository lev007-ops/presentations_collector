import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import func, or_, select

from ..config import get_settings
from ..deps import DB, CurrentSuperuser, get_site_settings
from ..models import ROLE_ORGANIZER, ROLE_SUPERUSER, MergedPresentation, Participant, Section, Staff
from ..schemas import (
    AdminParticipantUpdate, AdminSettings, AdminSettingsIn, IdList, MergedOut, ParticipantOut, SectionIn,
    SectionOut, StaffCreate, StaffOut, StaffSectionOut, StaffUpdate, Stats,
)
from ..security import hash_password
from ..services.common import get_section_or_404, section_participants, set_participant_section
from ..services.files import remove_dir, remove_file, safe_filename, save_presentation_upload
from ..services.merge import Branding, MergeItem, merge_presentations
from ..services.serializers import merge_snapshot, merged_out, participant_out, staff_out
from .public import logo_url
from .staff import section_summary

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ------------------------------------------------------------------ stats ---


@router.get("/stats", response_model=Stats)
def stats(_: CurrentSuperuser, db: DB):
    return Stats(
        participants=db.scalar(select(func.count(Participant.id))) or 0,
        with_file=db.scalar(select(func.count(Participant.id)).where(Participant.file_path.is_not(None))) or 0,
        without_section=db.scalar(select(func.count(Participant.id)).where(Participant.section_id.is_(None))) or 0,
        sections=db.scalar(select(func.count(Section.id))) or 0,
        organizers=db.scalar(select(func.count(Staff.id))) or 0,
    )


# --------------------------------------------------------------- settings ---


def _settings_out(s) -> AdminSettings:
    return AdminSettings(
        site_title=s.site_title, site_subtitle=s.site_subtitle, event_name=s.event_name,
        footer_text=s.footer_text, primary_color=s.primary_color, logo_url=logo_url(s),
        registration_code=s.registration_code, registration_open=s.registration_open, deadline=s.deadline,
    )


@router.get("/settings", response_model=AdminSettings)
def get_settings_(_: CurrentSuperuser, db: DB):
    return _settings_out(get_site_settings(db))


@router.put("/settings", response_model=AdminSettings)
def put_settings(data: AdminSettingsIn, _: CurrentSuperuser, db: DB):
    s = get_site_settings(db)
    s.site_title = data.site_title.strip()
    s.site_subtitle = (data.site_subtitle or "").strip() or None
    s.event_name = (data.event_name or "").strip() or None
    s.footer_text = (data.footer_text or "").strip() or None
    s.primary_color = data.primary_color
    s.registration_code = data.registration_code.strip()
    s.registration_open = data.registration_open
    s.deadline = data.deadline
    db.commit()
    return _settings_out(s)


LOGO_EXT = {".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"}


@router.post("/settings/logo", response_model=AdminSettings)
async def upload_logo(_: CurrentSuperuser, db: DB, file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in LOGO_EXT:
        raise HTTPException(400, "Логотип должен быть картинкой: PNG, JPG, SVG, WEBP или GIF")
    data = await file.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "Логотип больше 5 МБ")
    s = get_site_settings(db)
    remove_file(s.logo_path)
    path = get_settings().branding_dir / f"logo{ext}"
    path.write_bytes(data)
    s.logo_path = str(path)
    db.commit()
    return _settings_out(s)


@router.delete("/settings/logo", response_model=AdminSettings)
def delete_logo(_: CurrentSuperuser, db: DB):
    s = get_site_settings(db)
    remove_file(s.logo_path)
    s.logo_path = None
    db.commit()
    return _settings_out(s)


# --------------------------------------------------------------- sections ---


@router.post("/sections", response_model=SectionOut)
def create_section(data: SectionIn, _: CurrentSuperuser, db: DB):
    if db.scalar(select(Section).where(Section.name == data.name)):
        raise HTTPException(409, "Секция с таким названием уже есть")
    pos = (db.scalar(select(func.max(Section.position))) or 0) + 1
    sec = Section(name=data.name, position=pos)
    db.add(sec)
    db.commit()
    return SectionOut.model_validate(sec)


@router.put("/sections/order", response_model=list[SectionOut])
def order_sections(data: IdList, _: CurrentSuperuser, db: DB):
    secs = {s.id: s for s in db.scalars(select(Section))}
    for i, sid in enumerate(data.ids, start=1):
        if sid in secs:
            secs[sid].position = i
    db.commit()
    return [SectionOut.model_validate(s) for s in sorted(secs.values(), key=lambda s: (s.position, s.id))]


@router.put("/sections/{section_id}", response_model=SectionOut)
def rename_section(section_id: int, data: SectionIn, _: CurrentSuperuser, db: DB):
    sec = get_section_or_404(db, section_id)
    other = db.scalar(select(Section).where(Section.name == data.name, Section.id != section_id))
    if other:
        raise HTTPException(409, "Секция с таким названием уже есть")
    sec.name = data.name
    db.commit()
    return SectionOut.model_validate(sec)


@router.delete("/sections/{section_id}")
def delete_section(section_id: int, _: CurrentSuperuser, db: DB):
    sec = get_section_or_404(db, section_id)
    for m in sec.merged:
        remove_file(m.file_path)
    db.delete(sec)
    db.commit()
    return {"ok": True}


@router.put("/sections/{section_id}/order", response_model=list[ParticipantOut])
def order_participants(section_id: int, data: IdList, _: CurrentSuperuser, db: DB):
    get_section_or_404(db, section_id)
    parts = section_participants(db, section_id)
    by_id = {p.id: p for p in parts}
    ordered = [by_id[i] for i in data.ids if i in by_id]
    ordered += [p for p in parts if p not in ordered]
    for i, p in enumerate(ordered, start=1):
        p.order_index = i
    db.commit()
    return [participant_out(p) for p in ordered]


@router.post("/sections/{section_id}/merge", response_model=StaffSectionOut)
def create_merged(section_id: int, _: CurrentSuperuser, db: DB):
    sec = get_section_or_404(db, section_id)
    parts = [p for p in section_participants(db, section_id) if p.file_path and Path(p.file_path).exists()]
    if not parts:
        raise HTTPException(400, "В секции нет загруженных презентаций")
    site = get_site_settings(db)
    items = [MergeItem(Path(p.file_path), p.full_name or p.email, p.grade or "") for p in parts]
    branding = Branding(site.site_title, site.event_name, sec.name, site.primary_color)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out = get_settings().merged_dir / f"section{sec.id}-{stamp}.pptx"
    try:
        result = merge_presentations(items, branding, out)
    except Exception as e:  # noqa: BLE001
        out.unlink(missing_ok=True)
        raise HTTPException(500, f"Не удалось объединить презентации: {e}") from e

    for old in list(sec.merged):
        remove_file(old.file_path)
        db.delete(old)
    m = MergedPresentation(
        section_id=sec.id, file_path=str(out), file_size=out.stat().st_size,
        participants_count=result.participants_count, slides_count=result.slides_count,
        warnings=json.dumps(result.warnings, ensure_ascii=False) if result.warnings else None,
        snapshot=merge_snapshot(parts),
    )
    db.add(m)
    db.commit()
    db.refresh(sec)
    return section_summary(db, sec)


@router.delete("/sections/{section_id}/merge", response_model=StaffSectionOut)
def delete_merged(section_id: int, _: CurrentSuperuser, db: DB):
    sec = get_section_or_404(db, section_id)
    for old in list(sec.merged):
        remove_file(old.file_path)
        db.delete(old)
    db.commit()
    db.refresh(sec)
    return section_summary(db, sec)


@router.get("/merged", response_model=list[MergedOut])
def list_merged(_: CurrentSuperuser, db: DB):
    return [merged_out(m) for m in db.scalars(select(MergedPresentation).order_by(MergedPresentation.created_at.desc()))]


# ----------------------------------------------------------- participants ---


def _get_participant(db, pid: int) -> Participant:
    p = db.get(Participant, pid)
    if p is None:
        raise HTTPException(404, "Участник не найден")
    return p


@router.get("/participants", response_model=list[ParticipantOut])
def list_participants(_: CurrentSuperuser, db: DB, q: str | None = None, section_id: int | None = None):
    query = select(Participant).order_by(Participant.section_id.is_(None), Participant.section_id,
                                         Participant.order_index, Participant.id)
    if section_id is not None:
        query = query.where(Participant.section_id == section_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Participant.full_name.ilike(like), Participant.email.ilike(like)))
    return [participant_out(p) for p in db.scalars(query)]


@router.put("/participants/{pid}", response_model=ParticipantOut)
def update_participant(pid: int, data: AdminParticipantUpdate, _: CurrentSuperuser, db: DB):
    p = _get_participant(db, pid)
    if data.email is not None:
        email = data.email.lower()
        clash = db.scalar(select(Participant).where(func.lower(Participant.email) == email, Participant.id != pid))
        if clash:
            raise HTTPException(409, "Эта почта уже занята")
        p.email = email
    if data.full_name is not None:
        p.full_name = " ".join(data.full_name.split()) or None
    if data.grade_number is not None:
        p.grade_number = data.grade_number
    if data.grade_letter is not None:
        p.grade_letter = data.grade_letter
    if data.clear_section:
        set_participant_section(db, p, None)
    elif data.section_id is not None:
        set_participant_section(db, p, data.section_id)
    if data.password:
        p.password_hash = hash_password(data.password)
    db.commit()
    db.refresh(p)
    return participant_out(p)


@router.delete("/participants/{pid}")
def delete_participant(pid: int, _: CurrentSuperuser, db: DB):
    p = _get_participant(db, pid)
    remove_dir(get_settings().uploads_dir / str(p.id))
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/participants/{pid}/presentation", response_model=ParticipantOut)
async def admin_upload(pid: int, _: CurrentSuperuser, db: DB, file: UploadFile = File(...)):
    p = _get_participant(db, pid)
    path, size = await save_presentation_upload(file, p.id)
    old = p.file_path
    p.file_path = str(path)
    p.file_original_name = safe_filename(Path(file.filename or "presentation.pptx").name)
    p.file_size = size
    p.file_uploaded_at = datetime.now(timezone.utc)
    db.commit()
    if old and old != str(path):
        remove_file(old)
    return participant_out(p)


@router.delete("/participants/{pid}/presentation", response_model=ParticipantOut)
def admin_delete_file(pid: int, _: CurrentSuperuser, db: DB):
    p = _get_participant(db, pid)
    remove_file(p.file_path)
    p.file_path = p.file_original_name = p.file_size = p.file_uploaded_at = None
    db.commit()
    return participant_out(p)


# ------------------------------------------------------------------ staff ---


def _validate_staff_role(db, role: str, section_id: int | None) -> int | None:
    if role == ROLE_ORGANIZER:
        if section_id is None:
            raise HTTPException(400, "Организатору нужно назначить секцию")
        get_section_or_404(db, section_id)
        return section_id
    return None


@router.get("/staff", response_model=list[StaffOut])
def list_staff(_: CurrentSuperuser, db: DB):
    return [staff_out(s) for s in db.scalars(select(Staff).order_by(Staff.role.desc(), Staff.login))]


@router.post("/staff", response_model=StaffOut)
def create_staff(data: StaffCreate, _: CurrentSuperuser, db: DB):
    if db.scalar(select(Staff).where(Staff.login == data.login)):
        raise HTTPException(409, "Такой логин уже занят")
    st = Staff(
        login=data.login, password_hash=hash_password(data.password), full_name=(data.full_name or "").strip() or None,
        role=data.role, section_id=_validate_staff_role(db, data.role, data.section_id),
    )
    db.add(st)
    db.commit()
    db.refresh(st)
    return staff_out(st)


def _superusers_count(db) -> int:
    return db.scalar(select(func.count(Staff.id)).where(Staff.role == ROLE_SUPERUSER)) or 0


@router.put("/staff/{sid}", response_model=StaffOut)
def update_staff(sid: int, data: StaffUpdate, me: CurrentSuperuser, db: DB):
    st = db.get(Staff, sid)
    if st is None:
        raise HTTPException(404, "Организатор не найден")
    role = data.role or st.role
    if st.role == ROLE_SUPERUSER and role != ROLE_SUPERUSER:
        if st.id == me.id:
            raise HTTPException(400, "Нельзя снять права суперюзера с самого себя")
        if _superusers_count(db) <= 1:
            raise HTTPException(400, "Должен остаться хотя бы один суперюзер")
    section_id = data.section_id if data.section_id is not None else st.section_id
    st.section_id = _validate_staff_role(db, role, section_id)
    st.role = role
    if data.full_name is not None:
        st.full_name = data.full_name.strip() or None
    if data.password:
        st.password_hash = hash_password(data.password)
    db.commit()
    db.refresh(st)
    return staff_out(st)


@router.delete("/staff/{sid}")
def delete_staff(sid: int, me: CurrentSuperuser, db: DB):
    st = db.get(Staff, sid)
    if st is None:
        raise HTTPException(404, "Организатор не найден")
    if st.id == me.id:
        raise HTTPException(400, "Нельзя удалить самого себя")
    db.delete(st)
    db.commit()
    return {"ok": True}
