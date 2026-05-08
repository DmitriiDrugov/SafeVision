#!/usr/bin/env bash
# Generate a new Alembic migration for the Incident Service.
#
# Usage:
#   ./scripts/new-migration.sh "add clip_duration column to incidents"
#
# Requires DATABASE_URL to be set (or a running Postgres accessible at the default URL).
set -euo pipefail

MESSAGE="${1:?Usage: $0 \"describe your schema change\"}"

cd "$(git rev-parse --show-toplevel)/services/incident"

DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://safevision:changeme@localhost:5432/safevision}" \
  alembic revision --autogenerate -m "$MESSAGE"

echo ""
echo "Review the generated file in src/incident/db/migrations/versions/"
echo "Edit if needed, then: git add ... && git commit"
