from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Хранит наивное UTC-время в SQLite, отдаёт aware-datetime в UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):  # noqa: ANN001
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):  # noqa: ANN001
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


ROLE_SUPERUSER = "superuser"
ROLE_ORGANIZER = "organizer"


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    participants: Mapped[list["Participant"]] = relationship(back_populates="section")
    merged: Mapped[list["MergedPresentation"]] = relationship(
        back_populates="section", cascade="all, delete-orphan", order_by="MergedPresentation.created_at.desc()"
    )


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    full_name: Mapped[str | None] = mapped_column(String(300))
    grade_number: Mapped[int | None] = mapped_column(Integer)
    grade_letter: Mapped[str | None] = mapped_column(String(4))
    section_id: Mapped[int | None] = mapped_column(ForeignKey("sections.id", ondelete="SET NULL"), index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    file_path: Mapped[str | None] = mapped_column(String(500))
    file_original_name: Mapped[str | None] = mapped_column(String(300))
    file_size: Mapped[int | None] = mapped_column(Integer)
    file_uploaded_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    section: Mapped[Section | None] = relationship(back_populates="participants")

    @property
    def grade(self) -> str | None:
        if self.grade_number is None:
            return None
        return f"{self.grade_number}{self.grade_letter or ''}"

    @property
    def profile_complete(self) -> bool:
        return bool(self.full_name and self.grade_number and self.grade_letter and self.section_id)


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    full_name: Mapped[str | None] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default=ROLE_ORGANIZER)
    section_id: Mapped[int | None] = mapped_column(ForeignKey("sections.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    section: Mapped[Section | None] = relationship()


class SiteSettings(Base):
    __tablename__ = "site_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_title: Mapped[str] = mapped_column(String(200), default="Сбор презентаций")
    site_subtitle: Mapped[str | None] = mapped_column(Text)
    event_name: Mapped[str | None] = mapped_column(String(300))
    footer_text: Mapped[str | None] = mapped_column(Text)
    primary_color: Mapped[str] = mapped_column(String(7), default="#4f46e5")
    logo_path: Mapped[str | None] = mapped_column(String(500))
    registration_code: Mapped[str] = mapped_column(String(200), default="")
    registration_open: Mapped[bool] = mapped_column(default=True)
    deadline: Mapped[datetime | None] = mapped_column(UTCDateTime)


class MergedPresentation(Base):
    __tablename__ = "merged_presentations"

    id: Mapped[int] = mapped_column(primary_key=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"), index=True)
    file_path: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    participants_count: Mapped[int] = mapped_column(Integer, default=0)
    slides_count: Mapped[int] = mapped_column(Integer, default=0)
    warnings: Mapped[str | None] = mapped_column(Text)
    # Снимок состава (порядок, файлы, ФИО, класс) — чтобы понять, что сборка устарела
    snapshot: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    section: Mapped[Section] = relationship(back_populates="merged")
