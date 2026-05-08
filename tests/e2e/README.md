# End-to-End Tests

Full-stack tests with real video input.

## Fixtures

A pre-recorded factory clip with known violations is required. It must be hosted
externally (large binary, not committed) — download via:

```bash
# TODO: provide download URL once fixture is recorded
make e2e-fixtures
```

## TODO Test Cases

- `test_pre_recorded_clip_produces_expected_incidents`: stream `factory_clip.mp4`
  to a local RTSP simulator (mediamtx), run the full pipeline, assert the
  resulting Incident table contains exactly the 12 expected violations
  (annotation manifest stored alongside the clip).
- `test_p95_latency_under_5s`: measure timestamp delta between violation
  detected_at and notification webhook delivered. Assert p95 < 5s.
