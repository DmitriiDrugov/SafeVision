"""
Tests for Incident Service REST API.

TODO: Implement the following test cases using FastAPI TestClient + httpx:

    test_health_returns_200:
        GET /health → 200 {"status": "ok"}

    test_list_incidents_empty:
        GET /api/v1/incidents with empty DB → 200 []

    test_list_incidents_pagination:
        Insert 55 incidents. GET /api/v1/incidents?page=1&page_size=50 → 50 items.
        GET /api/v1/incidents?page=2&page_size=50 → 5 items.

    test_acknowledge_incident:
        POST /api/v1/incidents/{id}/acknowledge {actor: "john", note: "checked camera"}
        → 200 Incident with status=acknowledged, acknowledged_by="john"

    test_acknowledge_nonexistent_incident:
        POST /api/v1/incidents/nonexistent/acknowledge → 404

    test_acknowledge_already_resolved:
        Attempt to acknowledge a resolved incident → 409 Conflict

Use pytest-asyncio + httpx.AsyncClient(app=app) for async test client.
Use an in-memory SQLite DB (or test PostgreSQL via docker) for test isolation.
"""
import pytest
