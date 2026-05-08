#!/usr/bin/env python3
"""LLM evaluation harness — NL → YAML rule accuracy.

Usage:
    python tests/llm-eval/run.py [options]

Options:
    --model MODEL       OpenRouter model ID (default: meta-llama/llama-3.1-8b-instruct:free)
    --cases FILE        Path to test_cases.json (default: tests/llm-eval/test_cases.json)
    --api-key KEY       OpenRouter API key (default: $OPENROUTER_API_KEY)
    --threshold FLOAT   Minimum accuracy to pass (default: 0.85)
    --dry-run           Skip API calls; mark every case as SKIP (for CI smoke tests)
    -v, --verbose       Print full LLM output and mismatches for each case

Exit codes:
    0   accuracy >= threshold (or dry-run)
    1   accuracy < threshold
    2   configuration error (missing API key, bad JSON, etc.)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import textwrap
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

# Add repo root and this directory to sys.path so imports work when run as a
# plain script (python tests/llm-eval/run.py) — the dir name has a hyphen so
# Python cannot treat it as a package.
_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parents[1]
sys.path.insert(0, str(_REPO_ROOT / "shared" / "schemas"))
sys.path.insert(0, str(_REPO_ROOT / "shared" / "proto"))
sys.path.insert(0, str(_HERE))

from schemas.rule import Rule  # noqa: E402  (after sys.path manipulation)

from evaluate import rules_equivalent  # noqa: E402
from prompts import SYSTEM_PROMPT  # noqa: E402

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free"
_DEFAULT_CASES = Path(__file__).parent / "test_cases.json"
_DEFAULT_THRESHOLD = 0.85
_MAX_RETRIES = 3
_RETRY_DELAY = 2.0


# ── Data types ─────────────────────────────────────────────────────────────


@dataclass
class TestCase:
    id: str
    nl_prompt: str
    expected_yaml: str
    expected_rule: Rule = field(init=False)

    def __post_init__(self) -> None:
        data = yaml.safe_load(self.expected_yaml)
        self.expected_rule = Rule.model_validate(data["rule"])


@dataclass
class CaseResult:
    case_id: str
    nl_prompt: str
    passed: bool
    skipped: bool = False
    raw_output: str = ""
    parsed_rule: Rule | None = None
    mismatches: list[str] = field(default_factory=list)
    error: str = ""


# ── LLM interaction ────────────────────────────────────────────────────────


def _call_openrouter(prompt: str, model: str, api_key: str) -> str:
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.0,
        "max_tokens": 512,
    }).encode()

    req = urllib.request.Request(
        _OPENROUTER_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://github.com/dmitriidrugov/safevision",
            "X-Title": "SafeVision LLM Eval",
        },
        method="POST",
    )

    for attempt in range(_MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read())
                return body["choices"][0]["message"]["content"].strip()
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY * (2 ** attempt))
                continue
            raise
    return ""  # unreachable


def _extract_yaml(text: str) -> str:
    """Extract YAML from LLM output — handles fenced blocks and bare text."""
    # Try fenced code block first (```yaml ... ``` or ``` ... ```)
    fence = re.search(r"```(?:yaml)?\n([\s\S]+?)```", text)
    if fence:
        return fence.group(1).strip()

    # Try to find the start of the rule key
    match = re.search(r"^rule:", text, re.MULTILINE)
    if match:
        return text[match.start():].strip()

    return text.strip()


def _parse_rule(yaml_text: str) -> tuple[Rule | None, str]:
    """Return (Rule, "") on success, (None, error_message) on failure."""
    try:
        data = yaml.safe_load(yaml_text)
    except yaml.YAMLError as exc:
        return None, f"YAML parse error: {exc}"

    if not isinstance(data, dict) or "rule" not in data:
        return None, "Missing top-level 'rule' key"

    try:
        return Rule.model_validate(data["rule"]), ""
    except ValidationError as exc:
        return None, f"Schema validation failed: {exc}"


# ── Test runner ────────────────────────────────────────────────────────────


def run_case(case: TestCase, model: str, api_key: str, dry_run: bool) -> CaseResult:
    if dry_run:
        return CaseResult(
            case_id=case.id,
            nl_prompt=case.nl_prompt,
            passed=False,
            skipped=True,
        )

    try:
        raw = _call_openrouter(case.nl_prompt, model, api_key)
    except Exception as exc:
        return CaseResult(
            case_id=case.id,
            nl_prompt=case.nl_prompt,
            passed=False,
            error=f"API call failed: {exc}",
        )

    yaml_text = _extract_yaml(raw)
    parsed, err = _parse_rule(yaml_text)

    if parsed is None:
        return CaseResult(
            case_id=case.id,
            nl_prompt=case.nl_prompt,
            passed=False,
            raw_output=raw,
            error=err,
        )

    equivalent, mismatches = rules_equivalent(parsed, case.expected_rule)
    return CaseResult(
        case_id=case.id,
        nl_prompt=case.nl_prompt,
        passed=equivalent,
        raw_output=raw,
        parsed_rule=parsed,
        mismatches=mismatches,
    )


# ── Reporting ──────────────────────────────────────────────────────────────


def _print_result(result: CaseResult, verbose: bool) -> None:
    if result.skipped:
        status = "SKIP"
    elif result.passed:
        status = "PASS"
    else:
        status = "FAIL"

    icon = {"PASS": "✓", "FAIL": "✗", "SKIP": "–"}[status]
    print(f"  {icon} [{result.case_id}] {result.nl_prompt[:72]}")

    if not result.passed and not result.skipped:
        if result.error:
            print(f"      ERROR: {result.error}")
        for m in result.mismatches:
            print(f"      MISMATCH: {m}")

    if verbose and result.raw_output:
        indented = textwrap.indent(result.raw_output, "      ")
        print(f"      LLM output:\n{indented}")


# ── Entry point ────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--model", default=_DEFAULT_MODEL)
    parser.add_argument("--cases", default=str(_DEFAULT_CASES), type=Path)
    parser.add_argument("--api-key", default=os.environ.get("OPENROUTER_API_KEY", ""))
    parser.add_argument("--threshold", default=_DEFAULT_THRESHOLD, type=float)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    if not args.dry_run and not args.api_key:
        print("ERROR: OPENROUTER_API_KEY not set. Pass --api-key or set the env var.")
        print("       Use --dry-run to skip API calls.")
        return 2

    try:
        raw_cases: list[dict[str, Any]] = json.loads(args.cases.read_text())
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"ERROR loading {args.cases}: {exc}")
        return 2

    try:
        cases = [TestCase(**c) for c in raw_cases]
    except Exception as exc:
        print(f"ERROR parsing test cases: {exc}")
        return 2

    print(f"\nSafeVision LLM Eval — {len(cases)} cases")
    print(f"Model : {args.model}")
    print(f"Threshold : {args.threshold:.0%}")
    if args.dry_run:
        print("Mode  : dry-run (API calls skipped)")
    print()

    results: list[CaseResult] = []
    for case in cases:
        result = run_case(case, args.model, args.api_key, args.dry_run)
        results.append(result)
        _print_result(result, args.verbose)

    total = len(results)
    skipped = sum(1 for r in results if r.skipped)
    evaluated = total - skipped
    passed = sum(1 for r in results if r.passed)
    accuracy = passed / evaluated if evaluated > 0 else 0.0

    print()
    print("─" * 60)
    if skipped:
        print(f"Results : {passed}/{evaluated} passed ({skipped} skipped)")
    else:
        print(f"Results : {passed}/{evaluated} passed")
    print(f"Accuracy: {accuracy:.1%}  (threshold {args.threshold:.0%})")

    if args.dry_run:
        print("Status  : SKIP (dry-run)")
        return 0

    if accuracy >= args.threshold:
        print("Status  : PASS")
        return 0
    else:
        print("Status  : FAIL")
        return 1


if __name__ == "__main__":
    sys.exit(main())
