import io
import zipfile
from datetime import datetime, timedelta, timezone

from pptx import Presentation

from .conftest import make_pptx

PPTX_CT = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def staff_token(client, login, password):
    r = client.post("/api/auth/staff/login", json={"login": login, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_full_flow(client):
    root = auth(staff_token(client, "root", "rootpass"))

    # секции
    phys = client.post("/api/admin/sections", json={"name": "Физика"}, headers=root).json()
    chem = client.post("/api/admin/sections", json={"name": "Химия"}, headers=root).json()
    assert client.post("/api/admin/sections", json={"name": "Физика"}, headers=root).status_code == 409

    pub = client.get("/api/public/settings").json()
    assert [s["name"] for s in pub["sections"]] == ["Физика", "Химия"]

    # регистрация
    bad = client.post("/api/auth/register", json={"email": "a@x.ru", "password": "123456", "code": "nope"})
    assert bad.status_code == 400
    tokens = {}
    for email, name in [("a@x.ru", "Иванов Иван"), ("b@x.ru", "Петрова Анна"), ("c@x.ru", "Сидоров Пётр")]:
        r = client.post("/api/auth/register", json={"email": email, "password": "123456", "code": "secret"})
        assert r.status_code == 200, r.text
        tokens[email] = auth(r.json()["access_token"])
        r = client.put("/api/me/profile", headers=tokens[email],
                       json={"full_name": name, "grade_number": 10, "grade_letter": "а", "section_id": phys["id"]})
        assert r.status_code == 200, r.text
        assert r.json()["participant"]["grade"] == "10А"
    assert client.post("/api/auth/register", json={"email": "A@x.ru", "password": "123456", "code": "secret"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "A@X.RU", "password": "123456"}).status_code == 200

    # загрузка
    r = client.post("/api/me/presentation", headers=tokens["a@x.ru"], files={"file": ("doc.pdf", b"x", "application/pdf")})
    assert r.status_code == 400
    r = client.post("/api/me/presentation", headers=tokens["a@x.ru"], files={"file": ("fake.pptx", b"not a zip", PPTX_CT)})
    assert r.status_code == 400
    for email in ("a@x.ru", "b@x.ru"):
        r = client.post("/api/me/presentation", headers=tokens[email], files={"file": ("Моя работа.pptx", make_pptx(email), PPTX_CT)})
        assert r.status_code == 200, r.text
        assert r.json()["participant"]["file"]["original_name"] == "Моя работа.pptx"
    assert client.get("/api/me/presentation", headers=tokens["a@x.ru"]).status_code == 200

    # организатор секции
    r = client.post("/api/admin/staff", headers=root, json={"login": "phys", "password": "physpass-123", "role": "organizer", "section_id": phys["id"]})
    assert r.status_code == 200, r.text
    org = auth(staff_token(client, "phys", "physpass-123"))
    secs = client.get("/api/staff/sections", headers=org).json()
    assert [s["id"] for s in secs] == [phys["id"]] and secs[0]["uploaded_count"] == 2
    assert client.get(f"/api/staff/sections/{chem['id']}/participants", headers=org).status_code == 403
    assert client.get("/api/admin/stats", headers=org).status_code == 403

    # порядок
    plist = client.get(f"/api/staff/sections/{phys['id']}/participants", headers=org).json()
    ids = [p["id"] for p in plist]
    r = client.put(f"/api/admin/sections/{phys['id']}/order", headers=root, json={"ids": ids[::-1]})
    assert [p["full_name"] for p in r.json()] == ["Сидоров Пётр", "Петрова Анна", "Иванов Иван"]

    # zip
    r = client.get(f"/api/staff/sections/{phys['id']}/zip", headers=org)
    assert r.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert names == ["02. Петрова Анна (10А).pptx", "03. Иванов Иван (10А).pptx"]

    # merge
    assert client.get(f"/api/staff/sections/{phys['id']}/merged", headers=org).status_code == 404
    r = client.post(f"/api/admin/sections/{phys['id']}/merge", headers=root)
    assert r.status_code == 200, r.text
    assert r.json()["merged"]["slides_count"] == 1 + 2 * (1 + 2)
    r = client.get(f"/api/staff/sections/{phys['id']}/merged", headers=org)
    assert r.status_code == 200
    prs = Presentation(io.BytesIO(r.content))
    assert len(prs.slides) == 7
    sec = client.get("/api/staff/sections", headers=org).json()[0]
    assert sec["merged"]["outdated"] is False
    client.put(f"/api/admin/sections/{phys['id']}/order", headers=root, json={"ids": ids})
    sec = client.get("/api/staff/sections", headers=org).json()[0]
    assert sec["merged"]["outdated"] is True

    # дедлайн
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    s = client.get("/api/admin/settings", headers=root).json()
    s.update(deadline=past, primary_color="#FF0000", site_title="Конференция")
    r = client.put("/api/admin/settings", headers=root, json=s)
    assert r.status_code == 200, r.text
    me = client.get("/api/me", headers=tokens["c@x.ru"]).json()
    assert me["deadline_passed"] is True
    r = client.post("/api/me/presentation", headers=tokens["c@x.ru"], files={"file": ("x.pptx", make_pptx("c"), PPTX_CT)})
    assert r.status_code == 403
    # суперюзер может загрузить за участника и после дедлайна
    cid = me["participant"]["id"]
    r = client.post(f"/api/admin/participants/{cid}/presentation", headers=root, files={"file": ("x.pptx", make_pptx("c"), PPTX_CT)})
    assert r.status_code == 200

    # смена секции участника
    r = client.put(f"/api/admin/participants/{cid}", headers=root, json={"section_id": chem["id"]})
    assert r.json()["section_name"] == "Химия"
    assert len(client.get(f"/api/staff/sections/{phys['id']}/participants", headers=org).json()) == 2

    # нельзя удалить себя / последнего суперюзера
    staff = client.get("/api/admin/staff", headers=root).json()
    me_id = next(x["id"] for x in staff if x["login"] == "root")
    assert client.delete(f"/api/admin/staff/{me_id}", headers=root).status_code == 400


def _register(client, email):
    r = client.post("/api/auth/register", json={"email": email, "password": "123456", "code": "secret"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_password_change_revokes_old_tokens(client):
    old = auth(_register(client, "rev@x.ru"))
    other_session = auth(client.post("/api/auth/login", json={"email": "rev@x.ru", "password": "123456"}).json()["access_token"])
    r = client.put("/api/me/password", headers=old, json={"old_password": "123456", "new_password": "654321"})
    assert r.status_code == 200, r.text
    new = auth(r.json()["access_token"])
    assert client.get("/api/me", headers=new).status_code == 200
    assert client.get("/api/me", headers=old).status_code == 401
    assert client.get("/api/me", headers=other_session).status_code == 401


def test_login_rate_limit(client):
    from app import ratelimit

    ratelimit.login_account.clear()
    ratelimit.login_ip.clear()
    _register(client, "rl@x.ru")
    for _ in range(ratelimit.login_account.max_failures):
        assert client.post("/api/auth/login", json={"email": "rl@x.ru", "password": "wrong"}).status_code == 401
    # даже верный пароль не пускает, пока аккаунт заблокирован
    r = client.post("/api/auth/login", json={"email": "rl@x.ru", "password": "123456"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    ratelimit.login_account.clear()
    ratelimit.login_ip.clear()
    assert client.post("/api/auth/login", json={"email": "rl@x.ru", "password": "123456"}).status_code == 200


def test_zip_bomb_rejected(client):
    from app.config import get_settings

    tok = auth(_register(client, "bomb@x.ru"))
    secs = client.get("/api/public/settings").json()["sections"]
    client.put("/api/me/profile", headers=tok, json={"full_name": "Бомб Бомбов", "grade_number": 9, "grade_letter": "А", "section_id": secs[0]["id"]})
    # сбрасываем дедлайн, выставленный в test_full_flow
    root = auth(staff_token(client, "root", "rootpass"))
    s = client.get("/api/admin/settings", headers=root).json()
    s["deadline"] = None
    client.put("/api/admin/settings", headers=root, json=s)

    limit = get_settings().max_unpacked_mb * 1024 * 1024
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", "presentationml.presentation.main+xml")
        zf.writestr("ppt/presentation.xml", "<x/>")
        chunk = b"\0" * (64 * 1024 * 1024)
        with zf.open("ppt/media/bomb.bin", "w", force_zip64=True) as f:
            for _ in range(limit // len(chunk) + 1):
                f.write(chunk)
    r = client.post("/api/me/presentation", headers=tok, files={"file": ("b.pptx", buf.getvalue(), PPTX_CT)})
    assert r.status_code == 400
    assert "распакованном" in r.json()["detail"]


def test_security_headers_and_docs(client):
    r = client.get("/api/public/settings")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    assert client.get("/api/docs").status_code == 404
    assert client.get("/api/openapi.json").status_code == 404


def test_staff_password_min_length(client):
    root = auth(staff_token(client, "root", "rootpass"))
    r = client.post("/api/admin/staff", headers=root, json={"login": "shortpw", "password": "123456", "role": "superuser"})
    assert r.status_code == 422
