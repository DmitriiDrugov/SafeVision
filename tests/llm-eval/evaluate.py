"""Semantic equivalence check between two Rule objects.

Compares the fields that matter for correctness:
zone, condition (all sub-fields), action (type, severity).
Rule name is intentionally excluded — any valid snake_case name is accepted.
"""
from __future__ import annotations

from schemas.rule import Rule


def rules_equivalent(generated: Rule, expected: Rule) -> tuple[bool, list[str]]:
    """Return (is_equivalent, list_of_mismatch_descriptions)."""
    mismatches: list[str] = []

    if generated.zone != expected.zone:
        mismatches.append(f"zone: got {generated.zone!r}, expected {expected.zone!r}")

    gc = generated.condition
    ec = expected.condition

    if gc.object != ec.object:
        mismatches.append(f"condition.object: got {gc.object!r}, expected {ec.object!r}")

    if gc.missing_ppe != ec.missing_ppe:
        mismatches.append(
            f"condition.missing_ppe: got {gc.missing_ppe!r}, expected {ec.missing_ppe!r}"
        )

    if gc.action != ec.action:
        mismatches.append(f"condition.action: got {gc.action!r}, expected {ec.action!r}")

    if ec.duration_seconds is not None:
        if gc.duration_seconds is None or abs(gc.duration_seconds - ec.duration_seconds) > 0.5:
            mismatches.append(
                f"condition.duration_seconds: got {gc.duration_seconds!r}, "
                f"expected {ec.duration_seconds!r}"
            )
    elif gc.duration_seconds is not None:
        mismatches.append(
            f"condition.duration_seconds: got {gc.duration_seconds!r}, expected None"
        )

    if gc.min_count != ec.min_count:
        mismatches.append(
            f"condition.min_count: got {gc.min_count!r}, expected {ec.min_count!r}"
        )

    if generated.action.type != expected.action.type:
        mismatches.append(
            f"action.type: got {generated.action.type!r}, expected {expected.action.type!r}"
        )

    if generated.action.severity != expected.action.severity:
        mismatches.append(
            f"action.severity: got {generated.action.severity!r}, "
            f"expected {expected.action.severity!r}"
        )

    return len(mismatches) == 0, mismatches
