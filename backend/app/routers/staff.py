import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..config import get_settings
from ..deps import DB, CurrentStaff
from ..models import ROLE_SUPERUSER, Participant, Section
from ..schemas import ParticipantOut, StaffOut, StaffSectionOut
from ..services.common import check_section_access, get_section_or_404, section_participants
from ..services.files import file_response, safe_filename
from ..services.serializers import merge_snapshot, merged_out, participant_out, staff_out

router = APIRouter(prefix="/api/staff", tags=["staff"])


@router.get("/me", response_model=StaffOut)
def me(staff: CurrentStaff):
    return staff_out(staff)


def section_summary(db, sec: Section) -> StaffSectionOut:
    parts = section_participants(db, sec.id)
    return StaffSectionOut(
        id=sec.id,
        name=sec.name,
        position=sec.position,
        participants_count=len(parts),
        uploaded_count=sum(1 for p in parts if p.file_path),
        merged=merged_out(sec.merged[0], merge_snapshot(parts)) if sec.merged else None,
    )


@router.get("/sections", response_model=list[StaffSectionOut])
def sections(staff: CurrentStaff, db: DB):
    q = select(Section).order_by(Section.position, Section.id)
    if staff.role != ROLE_SUPERUSER:
        if staff.section_id is None:
            return []
        q = q.where(Section.id == staff.section_id)
    return [section_summary(db, s) for s in db.scalars(q)]


@router.get("/sections/{section_id}/participants", response_model=list[ParticipantOut])
def participants(section_id: int, staff: CurrentStaff, db: DB):
    check_section_access(staff, section_id)
    get_section_or_404(db, section_id)
    return [participant_out(p) for p in section_participants(db, section_id)]


def participant_filename(position: int, p: Participant) -> str:
    name = p.full_name or p.email
    grade = f" ({p.grade})" if p.grade else ""
    return safe_filename(f"{position:02d}. {name}{grade}") + ".pptx"


@router.get("/participants/{participant_id}/presentation")
def download_participant(participant_id: int, staff: CurrentStaff, db: DB):
    p = db.get(Participant, participant_id)
    if p is None:
        raise HTTPException(404, "Участник не найден")
    if staff.role != ROLE_SUPERUSER:
        if p.section_id is None:
            raise HTTPException(403, "Нет доступа")
        check_section_access(staff, p.section_id)
    if not p.file_path:
        raise HTTPException(404, "Участник ещё не загрузил презентацию")
    position = None
    if p.section_id:
        ids = [x.id for x in section_participants(db, p.section_id)]
        position = ids.index(p.id) + 1
    name = participant_filename(position, p) if position else safe_filename(p.full_name or p.email) + ".pptx"
    return file_response(Path(p.file_path), name)


@router.get("/sections/{section_id}/zip")
def download_zip(section_id: int, staff: CurrentStaff, db: DB):
    check_section_access(staff, section_id)
    sec = get_section_or_404(db, section_id)
    parts = section_participants(db, section_id)
    files = [(i, p) for i, p in enumerate(parts, start=1) if p.file_path and Path(p.file_path).exists()]
    if not files:
        raise HTTPException(404, "В секции пока нет загруженных презентаций")
    s = get_settings()
    fd, tmp = tempfile.mkstemp(suffix=".zip", dir=s.tmp_dir)
    tmp_path = Path(tmp)
    with open(fd, "wb") as fh, zipfile.ZipFile(fh, "w", compression=zipfile.ZIP_STORED) as zf:
        for i, p in files:
            zf.write(p.file_path, arcname=participant_filename(i, p))
    return file_response(tmp_path, safe_filename(sec.name) + ".zip", media_type="application/zip", cleanup=True)


@router.get("/sections/{section_id}/merged")
def download_merged(section_id: int, staff: CurrentStaff, db: DB):
    check_section_access(staff, section_id)
    sec = get_section_or_404(db, section_id)
    if not sec.merged:
        raise HTTPException(404, "Объединённая презентация ещё не создана")
    m = sec.merged[0]
    return file_response(Path(m.file_path), safe_filename(f"{sec.name} — все выступления") + ".pptx")
