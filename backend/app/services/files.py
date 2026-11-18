import re
import shutil
import uuid
import zipfile
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from ..config import get_settings

PPTX_EXT = ".pptx"
PPTX_MEDIA = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
_CHUNK = 1024 * 1024


def safe_filename(name: str, max_len: int = 120) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", name)
    name = " ".join(name.split()).strip(" .")
    return (name or "file")[:max_len]


def content_disposition(filename: str) -> str:
    ascii_fallback = filename.encode("ascii", "ignore").decode() or "download"
    ascii_fallback = ascii_fallback.replace('"', "")
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


def file_response(path: Path, filename: str, media_type: str = PPTX_MEDIA, cleanup: bool = False) -> FileResponse:
    if not path.exists():
        raise HTTPException(404, "Файл не найден на сервере")
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Content-Disposition": content_disposition(filename)},
        background=BackgroundTask(path.unlink, missing_ok=True) if cleanup else None,
    )


_MAX_ZIP_ENTRIES = 20_000
_MAX_CONTENT_TYPES = 1024 * 1024


def _check_pptx(path: Path) -> None:
    """Проверяем, что это настоящий .pptx (OOXML-презентация) и не zip-бомба.

    Объявленные в заголовках размеры zipfile соблюдает при распаковке (читает не больше
    file_size и сверяет CRC), поэтому ограничение по ним надёжно.
    """
    max_unpacked = get_settings().max_unpacked_mb * 1024 * 1024
    try:
        with zipfile.ZipFile(path) as zf:
            infos = zf.infolist()
            if len(infos) > _MAX_ZIP_ENTRIES:
                raise HTTPException(400, "Слишком много файлов внутри презентации")
            if sum(i.file_size for i in infos) > max_unpacked:
                raise HTTPException(400, "Презентация слишком большая в распакованном виде")
            names = {i.filename: i for i in infos}
            if "[Content_Types].xml" not in names or "ppt/presentation.xml" not in names:
                raise ValueError
            if names["[Content_Types].xml"].file_size > _MAX_CONTENT_TYPES:
                raise ValueError
            ct = zf.read("[Content_Types].xml").decode("utf-8", "ignore")
            if "presentationml.presentation.main+xml" not in ct:
                raise ValueError
    except (zipfile.BadZipFile, ValueError, KeyError, EOFError, NotImplementedError):
        raise HTTPException(400, "Файл не является презентацией PowerPoint (.pptx)")


async def save_presentation_upload(upload: UploadFile, owner_id: int) -> tuple[Path, int]:
    s = get_settings()
    original = upload.filename or "presentation.pptx"
    if Path(original).suffix.lower() != PPTX_EXT:
        raise HTTPException(400, "Поддерживается только формат PowerPoint (.pptx)")

    limit = s.max_upload_mb * 1024 * 1024
    dest_dir = s.uploads_dir / str(owner_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{uuid.uuid4().hex}{PPTX_EXT}"
    size = 0
    try:
        with dest.open("wb") as out:
            while chunk := await upload.read(_CHUNK):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Файл больше {s.max_upload_mb} МБ")
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "Пустой файл")
        _check_pptx(dest)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    return dest, size


def remove_file(path: str | None) -> None:
    if path:
        Path(path).unlink(missing_ok=True)


def remove_dir(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)
