# SafeVision — Claude Code Guide

## Repository Layout

```
services/          # Four Python microservices (ingestion, inference, rule-engine, incident)
web/app/           # Next.js 15 configuration UI + browser-side demo mode
shared/            # Pydantic schemas and Redis Stream proto models (imported by all Python services)
infra/             # docker-compose stack, Helm chart, Grafana dashboards, Prometheus rules
tests/             # unit, integration, e2e, load, llm-eval test suites
docs/              # ARCHITECTURE.md, RUNBOOK.md, RULE-AUTHORING.md
```

## Development Branch

Active development branch: `claude/safevision-architecture-3r9B9`

Always push to this branch. Never push directly to `main`.

## Running the Stack

```bash
# Full local stack (Postgres, Redis, MinIO, Prometheus, Grafana, Loki + Python services + web)
docker compose -f infra/docker-compose/docker-compose.yml --env-file infra/docker-compose/.env up -d
```

## Shared Package

`shared/` is a local Python package installed as a path dependency in each service. When editing
schemas in `shared/schemas/` or `shared/proto/`, all services pick up the changes automatically
in dev (editable install via `pip install -e`).

## Python Standards

- Python 3.11, Pydantic v2 everywhere for data models
- `structlog` for logging — no `print()` statements
- `ruff` (line length 100) + `mypy --strict` on `shared/`
- Run `ruff check .` from repo root before committing

## TypeScript Standards

- Strict mode, no `any`
- `eslint` with `@typescript-eslint/recommended-strict`
- Run `npm run lint` in `web/app/` before committing

## Commit Convention

`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:` prefixes required.
