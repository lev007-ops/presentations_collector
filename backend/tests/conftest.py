import io
import os
import shutil
import tempfile
from pathlib import Path

import pytest

_DATA = Path(tempfile.mkdtemp(prefix="pc-test-"))
os.environ["DATA_DIR"] = str(_DATA)
os.environ["SECRET_KEY"] = "test-secret-key-0123456789abcdef0123456789"
os.environ["MAX_UNPACKED_MB"] = "50"
os.environ["ADMIN_LOGIN"] = "root"
os.environ["ADMIN_PASSWORD"] = "rootpass"
os.environ["REGISTRATION_CODE"] = "secret"

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def client():
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")
    from app.main import app

    with TestClient(app) as c:
        yield c
    shutil.rmtree(_DATA, ignore_errors=True)


def make_pptx(title: str, slides: int = 2) -> bytes:
    from pptx import Presentation

    p = Presentation()
    for i in range(slides):
        s = p.slides.add_slide(p.slide_layouts[0])
        s.shapes.title.text = f"{title} {i + 1}"
    buf = io.BytesIO()
    p.save(buf)
    return buf.getvalue()
