from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import get_settings
from ..deps import DB, CurrentParticipant, get_site_settings
from ..schemas import ParticipantMe, PasswordChangeIn, ProfileIn
from ..security import hash_password, verify_password
from ..services.common import deadline_passed, set_participant_section
from ..services.files import file_response, remove_file, safe_filename, save_presentation_upload
from ..services.serializers import participant_out

router = APIRouter(prefix="/api/me", tags=["participant"])


def _me(db, user) -> ParticipantMe:
    s = get_site_settings(db)
    return ParticipantMe(
        participant=participant_out(user),
        deadline=s.deadline,
        deadline_passed=deadline_passed(s),
        max_upload_mb=get_settings().max_upload_mb,
    )


@router.get("", response_model=ParticipantMe)
def me(user: CurrentParticipant, db: DB):
    return _me(db, user)


@router.put("/profile", response_model=ParticipantMe)
def update_profile(data: ProfileIn, user: CurrentParticipant, db: DB):
    user.full_name = data.full_name
    user.grade_number = data.grade_number
    user.grade_letter = data.grade_letter
    set_participant_section(db, user, data.section_id)
    db.commit()
    db.refresh(user)
    return _me(db, user)


@router.put("/password")
def change_password(data: PasswordChangeIn, user: CurrentParticipant, db: DB):
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(400, "Текущий пароль указан неверно")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"ok": True}


def _ensure_can_edit_file(db, user) -> None:
    if deadline_passed(get_site_settings(db)):
        raise HTTPException(403, "Дедлайн прошёл — изменить презентацию уже нельзя")
    if not user.profile_complete:
        raise HTTPException(400, "Сначала заполните профиль: ФИО, класс и секцию")


@router.post("/presentation", response_model=ParticipantMe)
async def upload_presentation(user: CurrentParticipant, db: DB, file: UploadFile = File(...)):
    _ensure_can_edit_file(db, user)
    path, size = await save_presentation_upload(file, user.id)
    old = user.file_path
    user.file_path = str(path)
    user.file_original_name = safe_filename(Path(file.filename or "presentation.pptx").name)
    user.file_size = size
    user.file_uploaded_at = datetime.now(timezone.utc)
    db.commit()
    if old and old != str(path):
        remove_file(old)
    return _me(db, user)


@router.delete("/presentation", response_model=ParticipantMe)
def delete_presentation(user: CurrentParticipant, db: DB):
    _ensure_can_edit_file(db, user)
    remove_file(user.file_path)
    user.file_path = user.file_original_name = user.file_size = user.file_uploaded_at = None
    db.commit()
    return _me(db, user)


@router.get("/presentation")
def download_presentation(user: CurrentParticipant):
    if not user.file_path:
        raise HTTPException(404, "Презентация ещё не загружена")
    return file_response(Path(user.file_path), user.file_original_name or "presentation.pptx")
