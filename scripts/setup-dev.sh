#!/usr/bin/env bash
# SafeVision dev environment first-boot setup.
#
# Run once from the repo root before `docker compose up`.
# Safe to re-run — skips steps that are already done.
#
# Usage:
#   ./scripts/setup-dev.sh [--cam-url rtsp://192.168.x.x/stream]
#
# Options:
#   --cam-url URL   RTSP URL for your camera (default: uses MediaMTX test stream)
#   --no-stream     Skip launching the test pattern stream

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$REPO_ROOT/infra/docker-compose"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
ENV_FILE="$COMPOSE_DIR/.env"
ENV_EXAMPLE="$COMPOSE_DIR/.env.example"
RULES_DIR="$COMPOSE_DIR/rules"

CAM_URL=""
NO_STREAM=false

# ── argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --cam-url) CAM_URL="$2"; shift 2 ;;
        --no-stream) NO_STREAM=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── helpers ───────────────────────────────────────────────────────────────────
info()  { echo "  [setup] $*"; }
ok()    { echo "  [setup] ✓ $*"; }
warn()  { echo "  [setup] ⚠ $*"; }
fail()  { echo "  [setup] ✗ $*" >&2; exit 1; }

require_cmd() { command -v "$1" &>/dev/null || fail "$1 is required but not installed."; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   SafeVision — Dev Environment Setup         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── prerequisites ─────────────────────────────────────────────────────────────
require_cmd docker
docker compose version &>/dev/null || fail "Docker Compose v2 is required (got 'docker compose version' error)."
require_cmd python3
ok "Prerequisites satisfied"

# ── .env file ─────────────────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
    ok ".env already exists — skipping creation"
else
    info "Creating $ENV_FILE from example..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"

    # Generate a cryptographically random SECRET_KEY
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    # Replace the placeholder on any OS (sed -i differs between Linux and macOS)
    python3 -c "
import re, pathlib
path = pathlib.Path('$ENV_FILE')
content = re.sub(
    r'^SECRET_KEY=.*$',
    'SECRET_KEY=$SECRET',
    path.read_text(),
    flags=re.MULTILINE,
)
path.write_text(content)
"
    ok ".env created with generated SECRET_KEY"
    warn "Review $ENV_FILE and change all 'changeme_*' passwords before exposing to a network."
fi

# ── override camera URL if provided ──────────────────────────────────────────
if [[ -n "$CAM_URL" ]]; then
    python3 -c "
import re, pathlib
path = pathlib.Path('$ENV_FILE')
content = re.sub(
    r'^CAM01_RTSP_URL=.*\$',
    'CAM01_RTSP_URL=$CAM_URL',
    path.read_text(),
    flags=re.MULTILINE,
)
path.write_text(content)
"
    ok "CAM01_RTSP_URL set to $CAM_URL"
fi

# ── rules directory ───────────────────────────────────────────────────────────
if [[ -d "$RULES_DIR" ]] && compgen -G "$RULES_DIR/*.yaml" > /dev/null 2>&1; then
    ok "Rules directory already has YAML files — skipping"
else
    info "Rules directory is empty or missing — starter rules are included in the repo."
    ok "Rules at $RULES_DIR ($(ls "$RULES_DIR"/*.yaml 2>/dev/null | wc -l | tr -d ' ') files)"
fi

# ── start postgres + redis + minio ────────────────────────────────────────────
info "Starting database services (postgres, redis, minio)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    up -d postgres redis minio

info "Waiting for postgres to be healthy (up to 60s)..."
for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
           exec -T postgres pg_isready -U safevision -d safevision &>/dev/null; then
        ok "Postgres is healthy"
        break
    fi
    if [[ $i -eq 30 ]]; then
        fail "Postgres did not become healthy in 60s. Check: docker compose logs postgres"
    fi
    sleep 2
done

# ── n8n database ──────────────────────────────────────────────────────────────
POSTGRES_USER=$(grep '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2)
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
       exec -T postgres psql -U "$POSTGRES_USER" -lqt | cut -d\| -f1 | grep -qw n8n; then
    ok "n8n database already exists — skipping"
else
    info "Creating n8n database..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        exec -T postgres createdb -U "$POSTGRES_USER" n8n
    ok "n8n database created"
fi

# ── start all services ────────────────────────────────────────────────────────
info "Starting all services (this may take a minute on first boot)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# ── test pattern stream ───────────────────────────────────────────────────────
if [[ -z "$CAM_URL" ]] && [[ "$NO_STREAM" == "false" ]]; then
    if command -v ffmpeg &>/dev/null; then
        info "Launching test pattern stream in the background (Ctrl-C won't stop it)..."
        nohup "$REPO_ROOT/scripts/push-test-stream.sh" cam01 localhost \
            > /tmp/safevision-stream.log 2>&1 &
        STREAM_PID=$!
        ok "Test stream started (PID $STREAM_PID) → rtsp://localhost:8554/cam01"
        info "To stop: kill $STREAM_PID"
        info "Logs: tail -f /tmp/safevision-stream.log"
    else
        warn "ffmpeg not found — skipping test stream."
        warn "Install ffmpeg or push your own stream to rtsp://localhost:8554/cam01"
        warn "Or re-run with: ./scripts/setup-dev.sh --cam-url rtsp://your-camera/stream"
    fi
fi

# ── wait for web UI ───────────────────────────────────────────────────────────
info "Waiting for Config UI to be ready (up to 120s — inference model downloads on first boot)..."
for i in $(seq 1 40); do
    if curl -sf http://localhost:3000 &>/dev/null; then
        ok "Config UI is up"
        break
    fi
    if [[ $i -eq 40 ]]; then
        warn "UI not ready yet — inference may still be downloading the model."
        warn "Check progress: docker compose -f $COMPOSE_FILE logs --follow inference"
        break
    fi
    sleep 3
done

# ── print credentials ─────────────────────────────────────────────────────────
AUTH_USERS=$(grep '^AUTH_USERS=' "$ENV_FILE" | cut -d= -f2)
FIRST_USER=$(echo "$AUTH_USERS" | cut -d, -f1 | cut -d: -f1)
FIRST_PASS=$(echo "$AUTH_USERS" | cut -d, -f1 | cut -d: -f2)

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   SafeVision is ready                        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Config UI      →  http://localhost:3000"
echo "  Login           →  $FIRST_USER / $FIRST_PASS"
echo "  Grafana         →  http://localhost:3001  (admin / see .env)"
echo "  n8n             →  http://localhost:5678"
echo "  MinIO console   →  http://localhost:9001"
echo "  Prometheus      →  http://localhost:9090"
echo ""
echo "  Incident API    →  http://localhost:8004/docs"
echo "  Rule Engine API →  http://localhost:8003/docs"
echo ""
echo "  Loaded rules    →  $(ls "$RULES_DIR"/*.yaml 2>/dev/null | wc -l | tr -d ' ') file(s) in $RULES_DIR"
echo ""
if [[ -z "$CAM_URL" ]] && [[ "$NO_STREAM" == "false" ]]; then
    echo "  Push test video →  ./scripts/push-test-stream.sh cam01 localhost"
    echo ""
fi
echo "  Service logs    →  docker compose -f $COMPOSE_FILE logs --follow"
echo "  Stop everything →  docker compose -f $COMPOSE_FILE down"
echo ""
