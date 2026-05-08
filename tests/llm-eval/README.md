# LLM Evaluation Suite

Evaluates the chat-based rule builder's accuracy at converting natural language
descriptions into valid YAML rules.

## Dataset

`test_cases.json` contains 50 pairs of `{nl_prompt, expected_yaml}` covering:

- All PPE types: helmet, vest, gloves, mask
- All actions: entering, exiting, standing, moving
- All severities: low, medium, high, critical
- All channels: whatsapp, email, dashboard, all
- All object types: person, forklift, vehicle
- Duration-only, min_count-only, and combined constraints
- PPE + action combinations
- Varied natural-language phrasings for the same underlying rule

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
