import json

from ..models import MergedPresentation, Participant, Staff
from ..schemas import FileInfo, MergedOut, ParticipantOut, StaffOut


def participant_out(p: Participant) -> ParticipantOut:
    file = None
    if p.file_path and p.file_uploaded_at:
        file = FileInfo(original_name=p.file_original_name or "presentation.pptx", size=p.file_size or 0, uploaded_at=p.file_uploaded_at)
    return ParticipantOut(
        id=p.id,
        email=p.email,
        full_name=p.full_name,
        grade_number=p.grade_number,
        grade_letter=p.grade_letter,
        grade=p.grade,
        section_id=p.section_id,
        section_name=p.section.name if p.section else None,
        order_index=p.order_index,
        profile_complete=p.profile_complete,
        file=file,
        created_at=p.created_at,
    )


def staff_out(s: Staff) -> StaffOut:
    return StaffOut(
        id=s.id, login=s.login, full_name=s.full_name, role=s.role, section_id=s.section_id,
        section_name=s.section.name if s.section else None,
    )


def merge_snapshot(participants: list[Participant]) -> str:
    """Отпечаток того, что попадает в объединённую презентацию."""
    return json.dumps(
        [[p.id, p.file_path, p.full_name, p.grade] for p in participants if p.file_path], ensure_ascii=False
    )


def merged_out(m: MergedPresentation, current_snapshot: str | None = None) -> MergedOut:
    return MergedOut(
        outdated=current_snapshot is not None and m.snapshot is not None and current_snapshot != m.snapshot,
        id=m.id, section_id=m.section_id, file_size=m.file_size, participants_count=m.participants_count,
        slides_count=m.slides_count, warnings=json.loads(m.warnings) if m.warnings else [], created_at=m.created_at,
    )
