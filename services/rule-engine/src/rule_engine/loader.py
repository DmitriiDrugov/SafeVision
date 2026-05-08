"""
Rule Loader — loads, validates, and hot-reloads YAML rule definitions.

TODO: Implement RuleLoader class:

    class RuleLoader:
        def __init__(self, rules_dir: Path) -> None:
            ...

        def load_all(self) -> list[Rule]:
            '''
            Glob rules_dir for *.yaml files.
            For each file:
                1. yaml.safe_load(file_content)
                2. Extract top-level 'rule' key
                3. Rule.model_validate(data)
                4. Skip (log error) if ValidationError raised — do not crash
            Return list of valid, enabled rules.
            '''

        def watch(self, on_change: Callable[[], None]) -> None:
            '''
            Start a watchdog Observer on rules_dir.
            Call on_change() whenever a *.yaml file is created, modified, or deleted.
            Observer runs in a daemon thread so it stops with the process.
            '''

Prometheus metrics:
    - rules_loaded_total: Gauge (set to len(valid_rules) after each load)
    - rules_invalid_total: Counter (increment per ValidationError)
    - rules_reload_total: Counter (increment per watchdog trigger)
"""
