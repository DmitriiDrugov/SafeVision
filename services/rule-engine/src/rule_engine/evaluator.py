"""
Rule Evaluator — evaluates rules against a DetectionStreamEvent.

TODO: Implement RuleEvaluator class:

    class RuleEvaluator:
        def __init__(self, state: RuleState) -> None:
            ...

        def evaluate(
            self,
            rules: list[Rule],
            event: DetectionStreamEvent,
        ) -> list[ViolationEvent]:
            '''
            For each rule in rules where rule.enabled is True:
                1. Filter event.payload.objects by rule.condition.object (label match)
                2. Apply _check_ppe(rule, obj) if rule.condition.missing_ppe is set
                3. Apply _check_action(rule, obj) if rule.condition.action is set
                4. Apply _check_duration(rule, obj, event) if duration_seconds is set
                5. Apply _check_min_count(rule, matching_objs)
                6. If all conditions pass: create ViolationEvent and append
            Return list of ViolationEvents.
            '''

        def _check_ppe(self, rule: Rule, obj: TrackedObject) -> bool:
            '''
            True if the object is MISSING the required PPE.
            Checks obj.attributes.get("ppe") == "no_{rule.condition.missing_ppe.value}"
            '''

        def _check_duration(
            self,
            rule: Rule,
            obj: TrackedObject,
            event: DetectionStreamEvent,
        ) -> bool:
            '''
            True if obj has been continuously present in rule.zone for >= duration_seconds.
            Uses state.get_presence_duration() for the check.
            Calls state.record_presence() for all matching objects on every frame.
            '''

        def _check_min_count(self, rule: Rule, matching: list[TrackedObject]) -> bool:
            '''True if len(matching) >= rule.condition.min_count (or min_count is None).'''
"""
