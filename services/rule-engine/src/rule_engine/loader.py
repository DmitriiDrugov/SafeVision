"""Rule Loader — loads and hot-reloads YAML rule definitions from a directory.

Each YAML file must have a top-level 'rule' key whose value validates against
the Rule Pydantic schema.
"""
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import structlog
import yaml
from pydantic import ValidationError
from prometheus_client import Counter, Gauge

from schemas.rule import Rule

logger = structlog.get_logger(__name__)

_rules_loaded = Gauge("rule_engine_rules_loaded", "Number of valid rules currently loaded")
_rules_invalid_total = Counter(
    "rule_engine_rules_invalid_total",
    "Total rule files that failed validation",
)
_rules_reload_total = Counter(
    "rule_engine_rules_reload_total",
    "Total number of rule hot-reload events triggered by watchdog",
)


class RuleLoader:
    def __init__(self, rules_dir: Path) -> None:
        self._rules_dir = rules_dir
        self._log = logger.bind(rules_dir=str(rules_dir))

    def load_all(self) -> list[Rule]:
        """Glob rules_dir for *.yaml files, validate each, return valid rules.

        Invalid files are skipped with an error log — never raises.
        """
        rules: list[Rule] = []
        yaml_files = sorted(self._rules_dir.glob("*.yaml"))

        if not yaml_files:
            self._log.warning("loader.no_rules_found")

        for path in yaml_files:
            try:
                data = yaml.safe_load(path.read_text())
                if not isinstance(data, dict) or "rule" not in data:
                    raise ValueError("missing top-level 'rule' key")
                rule = Rule.model_validate(data["rule"])
                rules.append(rule)
                self._log.debug("loader.rule_loaded", name=rule.name, enabled=rule.enabled)
            except yaml.YAMLError as exc:
                _rules_invalid_total.inc()
                self._log.error("loader.invalid_yaml", path=str(path), error=str(exc))
            except (ValidationError, ValueError, TypeError) as exc:
                _rules_invalid_total.inc()
                self._log.error(
                    "loader.invalid_schema", path=str(path), error=str(exc)
                )

        _rules_loaded.set(len(rules))
        self._log.info("loader.loaded", count=len(rules))
        return rules

    def watch(self, on_change: Callable[[], None]) -> None:
        """Start a background watchdog observer; call on_change() on any *.yaml event."""
        from watchdog.events import FileSystemEventHandler
        from watchdog.observers import Observer

        loader_log = self._log

        class _Handler(FileSystemEventHandler):
            def on_any_event(self, event: object) -> None:
                if getattr(event, "is_directory", False):
                    return
                src = getattr(event, "src_path", "") or ""
                if src.endswith(".yaml"):
                    _rules_reload_total.inc()
                    loader_log.info("loader.change_detected", path=src)
                    on_change()

        observer = Observer()
        observer.schedule(_Handler(), str(self._rules_dir), recursive=False)
        observer.daemon = True
        observer.start()
        self._log.info("loader.watchdog_started", rules_dir=str(self._rules_dir))
