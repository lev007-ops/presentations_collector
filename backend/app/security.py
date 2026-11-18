import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from .config import get_settings

_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, digest = stored.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations))
    return hmac.compare_digest(dk.hex(), digest)


# Хеш случайного пароля: сверяемся с ним, когда пользователь не найден,
# чтобы время ответа не выдавало, существует ли логин/почта.
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def verify_password_or_dummy(password: str, stored: str | None) -> bool:
    if stored is None:
        verify_password(password, _DUMMY_HASH)
        return False
    return verify_password(password, stored)


def create_token(subject_id: int, kind: str, version: int = 0) -> str:
    """version — token_version пользователя; при смене пароля он растёт и старые токены перестают работать."""
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject_id), "kind": kind, "ver": version,
        "iat": now, "exp": now + timedelta(hours=s.token_ttl_hours),
    }
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
