"""
Tests for RuleEvaluator.

TODO: Implement the following test cases (these are the highest-value unit tests
in the codebase — Rule Engine logic must be exhaustively tested):

    test_no_violation_when_no_matching_objects:
        DetectionEvent with only "forklift" objects.
        Rule condition: object=person. Expect [] violations.

    test_violation_when_person_missing_helmet:
        DetectionEvent with a person having attributes={"ppe": "no_helmet"}.
        Rule condition: object=person, missing_ppe=helmet. Expect 1 violation.

    test_no_violation_when_ppe_present:
        Person with attributes={"ppe": "helmet"}. Same rule. Expect [] violations.

    test_duration_not_met:
        Rule with duration_seconds=5. Person present for 3 seconds.
        Expect [] violations.

    test_duration_met:
        Rule with duration_seconds=5. Person present for 6 seconds (mocked state).
        Expect 1 violation.

    test_min_count_not_met:
        Rule with min_count=3. Only 2 matching persons in frame. Expect [] violations.

    test_min_count_met:
        Rule with min_count=3. 3 matching persons in frame. Expect 1 violation.

    test_disabled_rule_not_evaluated:
        Rule with enabled=False. Matching person in frame. Expect [] violations.

    test_violation_event_fields:
        Verify ViolationEvent has correct rule_name, camera_id, zone_id, severity.

Use factories/fixtures for DetectionStreamEvent and Rule construction.
"""
import pytest
