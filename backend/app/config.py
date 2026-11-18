from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.uploads_dir, self.merged_dir, self.branding_dir, self.tmp_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
