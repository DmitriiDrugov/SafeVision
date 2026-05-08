# Build context: repo root (docker build -f services/rule-engine/Dockerfile .)
FROM python:3.11-slim

RUN useradd -m -u 1001 appuser
WORKDIR /app

COPY shared/schemas /app/shared/schemas
COPY shared/proto /app/shared/proto
RUN pip install --no-cache-dir -e /app/shared/schemas && \
    pip install --no-cache-dir -e /app/shared/proto

COPY services/rule-engine/pyproject.toml /app/services/rule-engine/pyproject.toml
RUN pip install --no-cache-dir -e "/app/services/rule-engine"

COPY services/rule-engine/src /app/services/rule-engine/src

ENV PYTHONPATH=/app/services/rule-engine/src
ENV RULES_DIR=/etc/safevision/rules

USER appuser

EXPOSE 8003

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8003/health')"

CMD ["uvicorn", "rule_engine.main:app", "--host", "0.0.0.0", "--port", "8003"]
