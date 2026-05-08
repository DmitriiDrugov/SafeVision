# Build context: repo root (docker build -f services/incident/Dockerfile .)
FROM python:3.11-slim

RUN useradd -m -u 1001 appuser
WORKDIR /app

COPY shared/schemas /app/shared/schemas
COPY shared/proto /app/shared/proto
RUN pip install --no-cache-dir -e /app/shared/schemas && \
    pip install --no-cache-dir -e /app/shared/proto

COPY services/incident/pyproject.toml /app/services/incident/pyproject.toml
RUN pip install --no-cache-dir -e "/app/services/incident"

COPY services/incident/src /app/services/incident/src

ENV PYTHONPATH=/app/services/incident/src
EXPOSE 8004

USER appuser

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8004/health')"

CMD ["uvicorn", "incident.main:app", "--host", "0.0.0.0", "--port", "8004"]
