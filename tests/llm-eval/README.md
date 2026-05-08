# LLM Evaluation Suite

Evaluates the chat-based rule builder's accuracy at converting natural language
descriptions into valid YAML rules.

## Dataset

`test_cases.json` contains pairs of `{nl_prompt, expected_yaml}`. Grow this
to ≥50 cases before shipping M6.

## Running

```bash
# From repo root — requires OPENROUTER_API_KEY
export OPENROUTER_API_KEY=<your-key>
PYTHONPATH=shared/schemas:shared/proto python tests/llm-eval/run.py \
  --model meta-llama/llama-3.1-8b-instruct:free \
  --cases tests/llm-eval/test_cases.json \
  --verbose

# Dry-run (no API key needed — smoke-tests parsing logic only)
PYTHONPATH=shared/schemas:shared/proto python tests/llm-eval/run.py --dry-run

# Override threshold
python tests/llm-eval/run.py --threshold 0.9
```

## CI Gate

Nightly workflow (`.github/workflows/llm-eval.yml`) runs the full eval at 03:00 UTC.
Fails if accuracy < 85%. Accuracy is defined as: the LLM-produced YAML is valid
against the Pydantic Rule schema AND semantically equivalent to expected_yaml
(zone, condition.*, action.type/severity/channel must match; rule name is ignored).

## Adding Cases

Each new case must be reviewed by a domain expert (safety manager) for
realistic phrasing. Avoid AI-generated prompts — they produce a homogeneous
distribution.
