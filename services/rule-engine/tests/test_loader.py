"""Unit tests for RuleLoader."""
from __future__ import annotations

import threading
import time
from pathlib import Path

import pytest

from rule_engine.loader import RuleLoader

_VALID_RULE_YAML = """\
rule:
  name: person_no_helmet
  zone: forklift_zone
  condition:
    object: person
    missing_ppe: helmet
  action:
    type: alert
    severity: high
    channel: dashboard
  enabled: true
"""

_INVALID_YAML = "rule: !!python/object/apply:os.system ['rm -rf /']"

_INVALID_SCHEMA_YAML = """\
rule:
  name: bad_rule
  zone: zone1
  condition:
    object: dragon   # not a valid ObjectType
  action:
    type: alert
    severity: high
    channel: dashboard
"""

_DISABLED_RULE_YAML = """\
rule:
  name: disabled_rule
  zone: zone1
  condition:
    object: person
  action:
    type: log
    severity: low
    channel: dashboard
  enabled: false
"""


class TestLoadAll:
    def test_returns_valid_rules(self, tmp_path: Path) -> None:
        (tmp_path / "rule1.yaml").write_text(_VALID_RULE_YAML)
        loader = RuleLoader(tmp_path)
        rules = loader.load_all()
        assert len(rules) == 1
        assert rules[0].name == "person_no_helmet"

    def test_skips_invalid_yaml(self, tmp_path: Path) -> None:
        (tmp_path / "bad.yaml").write_text(_INVALID_YAML)
        loader = RuleLoader(tmp_path)
        rules = loader.load_all()
        assert rules == []

    def test_skips_invalid_schema(self, tmp_path: Path) -> None:
        (tmp_path / "bad_schema.yaml").write_text(_INVALID_SCHEMA_YAML)
        loader = RuleLoader(tmp_path)
        rules = loader.load_all()
        assert rules == []

    def test_includes_disabled_rules(self, tmp_path: Path) -> None:
        """Loader returns all rules including disabled — evaluator filters them."""
        (tmp_path / "disabled.yaml").write_text(_DISABLED_RULE_YAML)
        loader = RuleLoader(tmp_path)
        rules = loader.load_all()
        assert len(rules) == 1
        assert rules[0].enabled is False

    def test_returns_empty_for_empty_directory(self, tmp_path: Path) -> None:
        loader = RuleLoader(tmp_path)
        assert loader.load_all() == []

    def test_skips_file_missing_rule_key(self, tmp_path: Path) -> None:
        (tmp_path / "no_key.yaml").write_text("name: orphan\n")
        loader = RuleLoader(tmp_path)
        assert loader.load_all() == []


class TestWatch:
    def test_on_change_called_when_yaml_created(self, tmp_path: Path) -> None:
        loader = RuleLoader(tmp_path)
        changed = threading.Event()
        loader.watch(lambda: changed.set())

        # Give watchdog a moment to start
        time.sleep(0.1)
        (tmp_path / "new_rule.yaml").write_text(_VALID_RULE_YAML)

        assert changed.wait(timeout=3.0), "on_change was not called within 3 seconds"

    def test_on_change_called_when_yaml_modified(self, tmp_path: Path) -> None:
        rule_file = tmp_path / "rule.yaml"
        rule_file.write_text(_VALID_RULE_YAML)
        loader = RuleLoader(tmp_path)
        changed = threading.Event()
        loader.watch(lambda: changed.set())

        time.sleep(0.1)
        rule_file.write_text(_VALID_RULE_YAML + "\n")  # touch

        assert changed.wait(timeout=3.0)
