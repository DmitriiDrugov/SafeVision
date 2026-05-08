# LLM Evaluation Suite

Evaluates the chat-based rule builder's accuracy at converting natural language
descriptions into valid YAML rules.

## Dataset

`test_cases.json` contains pairs of `{nl_prompt, expected_yaml}`. Grow this
to ≥50 cases before shipping M6.

## Running

```bash
# TODO: implement the harness
python -m tests.llm_eval.run \
  --model meta-llama/llama-3.1-8b-instruct:free \
  --cases tests/llm-eval/test_cases.json
```

## CI Gate

Nightly job runs the full eval. Fail CI if accuracy < 85%. Accuracy is defined
as: the LLM-produced YAML is valid against the Pydantic Rule schema AND
semantically equivalent to expected_yaml (object/zone/condition fields match;
severity and channel match).

## Adding Cases

Each new case must be reviewed by a domain expert (safety manager) for
realistic phrasing. Avoid AI-generated prompts — they produce a homogeneous
distribution.
