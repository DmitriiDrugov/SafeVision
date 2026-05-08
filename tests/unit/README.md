# Unit Tests

Cross-service unit tests for `shared/schemas` and `shared/proto`.

Per-service unit tests live alongside each service: `services/<name>/tests/`.

Run all unit tests:

```bash
pytest tests/unit services/*/tests
```

Coverage target: ≥80% line coverage on `services/rule-engine` (highest-risk
business logic) and on `shared/schemas`.
