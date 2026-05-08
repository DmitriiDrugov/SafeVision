# Build context: repo root (docker build -f services/ingestion/Dockerfile .)
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 appuser
WORKDIR /app

# Install shared packages first (maximises layer cache hits)
COPY shared/schemas /app/shared/schemas
COPY shared/proto /app/shared/proto
RUN pip install --no-cache-dir -e /app/shared/schemas && \
    pip install --no-cache-dir -e /app/shared/proto

# Install service dependencies
COPY services/ingestion/pyproject.toml /app/services/ingestion/pyproject.toml
RUN pip install --no-cache-dir -e "/app/services/ingestion"

COPY services/ingestion/src /app/services/ingestion/src

ENV PYTHONPATH=/app/services/ingestion/src
USER appuser

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD python -c "import ingestion; print('ok')"

CMD ["python", "-m", "ingestion.main"]
