"""
Tests for RuleLoader.

TODO: Implement the following test cases:

    test_load_all_returns_valid_rules(tmp_path):
        Write a valid rule YAML to tmp_path.
        Assert load_all() returns a list containing the Rule.

    test_load_all_skips_invalid_yaml(tmp_path):
        Write a malformed YAML file to tmp_path.
        Assert load_all() returns [] (skips, does not raise).

    test_load_all_skips_invalid_schema(tmp_path):
        Write YAML that parses but fails Pydantic validation (e.g. unknown object type).
        Assert load_all() returns [] and logs an error.

    test_load_all_ignores_disabled_rules(tmp_path):
        Write a rule with enabled: false. Assert it is included in the returned list
        (loader returns all rules; evaluator filters disabled ones).

    test_watch_calls_on_change(tmp_path):
        Register on_change mock, create a new YAML file in tmp_path.
        Assert on_change() is called within 2 seconds (watchdog latency).
        Use threading.Event for synchronization.

Use pytest's tmp_path fixture for isolated rule directories.
"""
import pytest
