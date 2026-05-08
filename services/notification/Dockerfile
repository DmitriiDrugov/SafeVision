# Build context: repo root (docker build -f services/notification/Dockerfile .)
FROM python:3.11-slim

RUN useradd -m -u 1001 appuser
WORKDIR /app

COPY shared/schemas /app/shared/schemas
COPY shared/proto /app/shared/proto
RUN pip install --no-cache-dir -e /app/shared/schemas && \
    pip install --no-cache-dir -e /app/shared/proto

COPY services/notification/pyproject.toml /app/services/notification/pyproject.toml
RUN pip install --no-cache-dir -e "/app/services/notification"

COPY services/notification/src /app/services/notification/src

ENV PYTHONPATH=/app/services/notification/src
EXPOSE 8005

USER appuser

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8005/health')"

CMD ["uvicorn", "notification.main:app", "--host", "0.0.0.0", "--port", "8005"]
