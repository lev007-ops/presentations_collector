import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _norm_letter(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip().upper()
    if not v:
        return None
    if not re.fullmatch(r"[A-ZА-ЯЁ]{1,2}", v):
        raise ValueError("Буква класса должна быть буквой")
    return v


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    code: str = Field(max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class StaffLoginIn(BaseModel):
    login: str = Field(max_length=100)
    password: str = Field(max_length=128)


class SectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    position: int


class PublicSettings(BaseModel):
    site_title: str
    site_subtitle: str | None
    event_name: str | None
    footer_text: str | None
    primary_color: str
    logo_url: str | None
    deadline: datetime | None
    registration_open: bool
    sections: list[SectionOut]


class FileInfo(BaseModel):
    original_name: str
    size: int
    uploaded_at: datetime


class ParticipantOut(BaseModel):
    id: int
    email: str
    full_name: str | None
    grade_number: int | None
    grade_letter: str | None
    grade: str | None
    section_id: int | None
    section_name: str | None
    order_index: int
    profile_complete: bool
    file: FileInfo | None
    created_at: datetime


class ProfileIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=300)
    grade_number: int = Field(ge=1, le=11)
    grade_letter: str
    section_id: int

    @field_validator("grade_letter")
    @classmethod
    def _letter(cls, v: str) -> str:
        v = _norm_letter(v)
        if not v:
            raise ValueError("Укажите букву класса")
        return v

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        return " ".join(v.split())


class PasswordChangeIn(BaseModel):
    old_password: str = Field(max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class ParticipantMe(BaseModel):
    participant: ParticipantOut
    deadline: datetime | None
    deadline_passed: bool
    max_upload_mb: int


class AdminParticipantUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    grade_number: int | None = Field(default=None, ge=1, le=11)
    grade_letter: str | None = None
    section_id: int | None = None
    clear_section: bool = False
    password: str | None = Field(default=None, min_length=6, max_length=128)

    @field_validator("grade_letter")
    @classmethod
    def _letter(cls, v: str | None) -> str | None:
        return _norm_letter(v)


class StaffOut(BaseModel):
    id: int
    login: str
    full_name: str | None
    role: str
    section_id: int | None
    section_name: str | None


STAFF_PASSWORD_MIN = 10


class StaffCreate(BaseModel):
    login: str = Field(min_length=3, max_length=100, pattern=r"^[A-Za-z0-9_.\-]+$")
    password: str = Field(min_length=STAFF_PASSWORD_MIN, max_length=128)
    full_name: str | None = None
    role: str = Field(pattern=r"^(superuser|organizer)$")
    section_id: int | None = None


class StaffUpdate(BaseModel):
    full_name: str | None = None
    password: str | None = Field(default=None, min_length=STAFF_PASSWORD_MIN, max_length=128)
    role: str | None = Field(default=None, pattern=r"^(superuser|organizer)$")
    section_id: int | None = None


class SectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Название не может быть пустым")
        return v


class IdList(BaseModel):
    ids: list[int]


class MergedOut(BaseModel):
    id: int
    section_id: int
    file_size: int
    participants_count: int
    slides_count: int
    warnings: list[str]
    outdated: bool = False
    created_at: datetime


class StaffSectionOut(BaseModel):
    id: int
    name: str
    position: int
    participants_count: int
    uploaded_count: int
    merged: MergedOut | None


class AdminSettings(BaseModel):
    site_title: str
    site_subtitle: str | None
    event_name: str | None
    footer_text: str | None
    primary_color: str
    logo_url: str | None
    registration_code: str
    registration_open: bool
    deadline: datetime | None


class AdminSettingsIn(BaseModel):
    site_title: str = Field(min_length=1, max_length=200)
    site_subtitle: str | None = None
    event_name: str | None = None
    footer_text: str | None = None
    primary_color: str
    registration_code: str = Field(max_length=200)
    registration_open: bool = True
    deadline: datetime | None = None

    @field_validator("primary_color")
    @classmethod
    def _color(cls, v: str) -> str:
        if not HEX_RE.match(v):
            raise ValueError("Цвет должен быть в формате #RRGGBB")
        return v.lower()


class Stats(BaseModel):
    participants: int
    with_file: int
    without_section: int
    sections: int
    organizers: int
