import hmac

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from ..deps import DB, get_site_settings
from ..models import Participant, Staff
from ..schemas import LoginIn, RegisterIn, StaffLoginIn, Token
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=Token)
def register(data: RegisterIn, db: DB):
    s = get_site_settings(db)
    if not s.registration_open:
        raise HTTPException(403, "Регистрация закрыта")
    if not s.registration_code or not hmac.compare_digest(data.code.strip(), s.registration_code):
        raise HTTPException(400, "Неверный код регистрации")
    email = data.email.lower()
    if db.scalar(select(Participant).where(func.lower(Participant.email) == email)):
        raise HTTPException(409, "Пользователь с такой почтой уже зарегистрирован")
    p = Participant(email=email, password_hash=hash_password(data.password))
    db.add(p)
    db.commit()
    return Token(access_token=create_token(p.id, "participant"))


@router.post("/login", response_model=Token)
def login(data: LoginIn, db: DB):
    p = db.scalar(select(Participant).where(func.lower(Participant.email) == data.email.lower()))
    if p is None or not verify_password(data.password, p.password_hash):
        raise HTTPException(401, "Неверная почта или пароль")
    return Token(access_token=create_token(p.id, "participant"))


@router.post("/staff/login", response_model=Token)
def staff_login(data: StaffLoginIn, db: DB):
    st = db.scalar(select(Staff).where(Staff.login == data.login.strip()))
    if st is None or not verify_password(data.password, st.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")
    return Token(access_token=create_token(st.id, "staff"))
