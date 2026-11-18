import hmac

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import func, select

from ..deps import DB, get_site_settings
from ..models import Participant, Staff
from ..ratelimit import client_ip, login_account, login_ip, register_code
from ..schemas import LoginIn, RegisterIn, StaffLoginIn, Token
from ..security import create_token, hash_password, verify_password_or_dummy

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=Token)
def register(data: RegisterIn, request: Request, db: DB):
    s = get_site_settings(db)
    if not s.registration_open:
        raise HTTPException(403, "Регистрация закрыта")
    ip_key = f"ip:{client_ip(request)}"
    register_code.check(ip_key)
    if not s.registration_code or not hmac.compare_digest(data.code.strip().encode(), s.registration_code.encode()):
        register_code.fail(ip_key)
        raise HTTPException(400, "Неверный код регистрации")
    email = data.email.lower()
    if db.scalar(select(Participant).where(func.lower(Participant.email) == email)):
        raise HTTPException(409, "Пользователь с такой почтой уже зарегистрирован")
    p = Participant(email=email, password_hash=hash_password(data.password))
    db.add(p)
    db.commit()
    return Token(access_token=create_token(p.id, "participant", p.token_version))


def _guarded_login(request: Request, account_key: str, check) -> bool:  # noqa: ANN001
    """Проверка пароля с лимитом неудачных попыток по IP и по аккаунту."""
    ip_key = f"ip:{client_ip(request)}"
    login_ip.check(ip_key)
    login_account.check(account_key)
    if not check():
        login_ip.fail(ip_key)
        login_account.fail(account_key)
        return False
    login_account.reset(account_key)
    return True


@router.post("/login", response_model=Token)
def login(data: LoginIn, request: Request, db: DB):
    email = data.email.lower()
    p = db.scalar(select(Participant).where(func.lower(Participant.email) == email))
    ok = _guarded_login(request, f"p:{email}",
                        lambda: verify_password_or_dummy(data.password, p.password_hash if p else None))
    if not ok:
        raise HTTPException(401, "Неверная почта или пароль")
    return Token(access_token=create_token(p.id, "participant", p.token_version))


@router.post("/staff/login", response_model=Token)
def staff_login(data: StaffLoginIn, request: Request, db: DB):
    login_ = data.login.strip()
    st = db.scalar(select(Staff).where(Staff.login == login_))
    ok = _guarded_login(request, f"s:{login_.lower()}",
                        lambda: verify_password_or_dummy(data.password, st.password_hash if st else None))
    if not ok:
        raise HTTPException(401, "Неверный логин или пароль")
    return Token(access_token=create_token(st.id, "staff", st.token_version))
