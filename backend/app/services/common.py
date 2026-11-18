from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import ROLE_SUPERUSER, Participant, Section, SiteSettings, Staff


def deadline_passed(settings: SiteSettings) -> bool:
    return settings.deadline is not None and datetime.now(timezone.utc) > settings.deadline


def next_order_index(db: Session, section_id: int) -> int:
    cur = db.scalar(select(func.max(Participant.order_index)).where(Participant.section_id == section_id))
    return (cur or 0) + 1


def get_section_or_404(db: Session, section_id: int) -> Section:
    sec = db.get(Section, section_id)
    if sec is None:
        raise HTTPException(404, "Секция не найдена")
    return sec


def section_participants(db: Session, section_id: int) -> list[Participant]:
    return list(
        db.scalars(
            select(Participant)
            .where(Participant.section_id == section_id)
            .order_by(Participant.order_index, Participant.id)
        )
    )


def check_section_access(staff: Staff, section_id: int) -> None:
    if staff.role != ROLE_SUPERUSER and staff.section_id != section_id:
        raise HTTPException(403, "Нет доступа к этой секции")


def set_participant_section(db: Session, p: Participant, section_id: int | None) -> None:
    if section_id == p.section_id:
        return
    if section_id is not None:
        get_section_or_404(db, section_id)
        p.order_index = next_order_index(db, section_id)
    p.section_id = section_id
