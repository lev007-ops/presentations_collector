# --- сборка фронтенда ---
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- бэкенд + статика ---
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/data \
    STATIC_DIR=/app/static

RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY --from=frontend /frontend/dist ./static

VOLUME ["/data"]
EXPOSE 8000

# Стартуем от root только чтобы поправить владельца тома /data (в старых томах файлы
# принадлежат root), затем сбрасываем привилегии: приложение работает от пользователя app.
# SQLite — поэтому один воркер.
CMD ["sh", "-c", "chown -R app:app /data && exec setpriv --reuid=app --regid=app --init-groups sh -c \"alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'\""]
