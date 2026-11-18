from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


INSECURE_SECRETS = {"change-me-please", "change-me", "secret", ""}
INSECURE_ADMIN_PASSWORDS = {"admin", "change-me-too", "change-me", "password", ""}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    data_dir: Path = Path("/data")
    secret_key: str = "change-me-please"
    token_ttl_hours: int = 72

    # Первый суперюзер создаётся при старте, если в базе нет ни одного суперюзера
    admin_login: str = "admin"
    admin_password: str = "admin"

    # Начальный код регистрации (потом меняется в админке)
    registration_code: str = "letmein"

    max_upload_mb: int = 300
    # Предел суммарного распакованного размера .pptx (защита от zip-бомб)
    max_unpacked_mb: int = 1024

    # Swagger UI на /api/docs (по умолчанию выключен)
    enable_docs: bool = False

    # Собранный фронтенд (в Docker-образе). Если папки нет — отдаётся только API.
    static_dir: Path | None = None

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'app.db'}"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def merged_dir(self) -> Path:
        return self.data_dir / "merged"

    @property
    def branding_dir(self) -> Path:
        return self.data_dir / "branding"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"

    def check_secrets(self) -> None:
        """Не даём стартовать с секретом по умолчанию — иначе любой подделает токен."""
        if self.secret_key in INSECURE_SECRETS or len(self.secret_key) < 32:
            raise RuntimeError(
                "SECRET_KEY не задан или слишком короткий (нужно ≥ 32 символов). "
                "Сгенерируйте: openssl rand -hex 32"
            )

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.uploads_dir, self.merged_dir, self.branding_dir, self.tmp_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
