from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import ROLE_SUPERUSER, Participant, SiteSettings, Staff
from .security import decode_token

bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


_EXPIRED = "Сессия истекла, войдите снова"


def _payload(creds: HTTPAuthorizationCredentials | None, kind: str) -> tuple[int, int]:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется вход")
    data = decode_token(creds.credentials)
    if not data or data.get("kind") != kind:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _EXPIRED)
    try:
        return int(data["sub"]), int(data.get("ver", 0))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _EXPIRED) from None


def current_participant(
    db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> Participant:
    uid, ver = _payload(creds, "participant")
    user = db.get(Participant, uid)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")
    if user.token_version != ver:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _EXPIRED)
    return user


def current_staff(db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> Staff:
    sid, ver = _payload(creds, "staff")
    staff = db.get(Staff, sid)
    if staff is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")
    if staff.token_version != ver:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _EXPIRED)
    return staff


def current_superuser(staff: Annotated[Staff, Depends(current_staff)]) -> Staff:
    if staff.role != ROLE_SUPERUSER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав")
    return staff


def get_site_settings(db: Session) -> SiteSettings:
    s = db.get(SiteSettings, 1)
    if s is None:
        s = SiteSettings(id=1)
        db.add(s)
        db.commit()
    return s


CurrentParticipant = Annotated[Participant, Depends(current_participant)]
CurrentStaff = Annotated[Staff, Depends(current_staff)]
CurrentSuperuser = Annotated[Staff, Depends(current_superuser)]
