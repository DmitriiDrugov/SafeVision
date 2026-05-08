"""SafeVision load tests — Locust scenarios.

Run against a live stack:
    locust -f tests/load/locustfile.py \
        --host http://localhost:8004 \
        --users 50 --spawn-rate 5 --run-time 60s --headless

Environment variables:
    RULES_HOST   Rule Engine base URL (default: http://localhost:8003)
    INCIDENT_HOST  Incident Service base URL (default: http://localhost:8004)
"""
from __future__ import annotations

import json
import os
import random
from datetime import datetime, timezone

from locust import HttpUser, TaskSet, between, constant, events, task

_RULES_HOST = os.environ.get("RULES_HOST", "http://localhost:8003")
_INCIDENT_HOST = os.environ.get("INCIDENT_HOST", "http://localhost:8004")

_SEVERITIES = ["low", "medium", "high", "critical"]
_CAMERAS = ["cam01", "cam02", "cam03"]
_ZONES = ["forklift_zone", "pedestrian_corridor", "loading_dock", "welding_bay"]

_SAMPLE_RULE_YAML = """\
rule:
  name: load_test_rule_{n}
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


# ── Incident Service scenarios ─────────────────────────────────────────────

class IncidentTasks(TaskSet):
    """Simulate operator workflows against the Incident Service REST API."""

    def on_start(self) -> None:
        self._incident_ids: list[str] = []

    @task(5)
    def list_incidents(self) -> None:
        severity = random.choice([None, "high", "critical"])
        params = {}
        if severity:
            params["severity"] = severity
        self.client.get(
            "/api/v1/incidents",
            params=params,
            name="/api/v1/incidents[filtered]",
        )

    @task(3)
    def list_incidents_paginated(self) -> None:
        page = random.randint(1, 3)
        self.client.get(
            "/api/v1/incidents",
            params={"page": page, "page_size": 50},
            name="/api/v1/incidents[paginated]",
        )

    @task(1)
    def get_single_incident(self) -> None:
        if not self._incident_ids:
            return
        iid = random.choice(self._incident_ids)
        self.client.get(
            f"/api/v1/incidents/{iid}",
            name="/api/v1/incidents/{id}",
        )

    @task(1)
    def acknowledge_incident(self) -> None:
        if not self._incident_ids:
            return
        iid = random.choice(self._incident_ids)
        self.client.post(
            f"/api/v1/incidents/{iid}/acknowledge",
            json={"actor": "load-test-operator"},
            name="/api/v1/incidents/{id}/acknowledge",
        )

    @task(1)
    def health_check(self) -> None:
        self.client.get("/health", name="/health")

    def on_stop(self) -> None:
        pass


class IncidentOperator(HttpUser):
    """Simulates a security operator monitoring the dashboard."""

    host = _INCIDENT_HOST
    tasks = [IncidentTasks]
    wait_time = between(0.5, 2.0)


# ── Rule Engine scenarios ──────────────────────────────────────────────────

class RuleCrudTasks(TaskSet):
    """Simulate Config UI interactions against the Rule Engine REST API."""

    def on_start(self) -> None:
        self._created_rules: list[str] = []
        self._counter = random.randint(1000, 9999)

    @task(8)
    def list_rules(self) -> None:
        self.client.get("/api/v1/rules", name="/api/v1/rules[list]")

    @task(2)
    def create_then_delete_rule(self) -> None:
        n = self._counter
        self._counter += 1
        yaml_text = _SAMPLE_RULE_YAML.format(n=n)

        # Create
        create_resp = self.client.post(
            "/api/v1/rules",
            json={"yaml_text": yaml_text},
            name="/api/v1/rules[create]",
        )
        if create_resp.status_code == 201:
            rule_name = f"load_test_rule_{n}"
            self._created_rules.append(rule_name)

        # Delete a previously created rule (if any)
        if self._created_rules:
            to_delete = self._created_rules.pop(0)
            self.client.delete(
                f"/api/v1/rules/{to_delete}",
                name="/api/v1/rules/{name}[delete]",
            )

    @task(3)
    def toggle_rule(self) -> None:
        list_resp = self.client.get(
            "/api/v1/rules", name="/api/v1/rules[list-for-toggle]"
        )
        if list_resp.status_code != 200:
            return
        rules = list_resp.json()
        if not rules:
            return
        rule = random.choice(rules)
        self.client.patch(
            f"/api/v1/rules/{rule['name']}",
            json={"enabled": not rule["enabled"]},
            name="/api/v1/rules/{name}[toggle]",
        )

    @task(1)
    def health_check(self) -> None:
        self.client.get("/health", name="/health")


class RuleEngineCrudUser(HttpUser):
    """Simulates a plant engineer managing rules via the Config UI."""

    host = _RULES_HOST
    tasks = [RuleCrudTasks]
    wait_time = between(1.0, 4.0)


# ── Mixed scenario ─────────────────────────────────────────────────────────

class MixedWorkloadUser(HttpUser):
    """
    Weighted mix that approximates realistic production traffic:
    - 80 % incident reads (dashboards polling)
    - 20 % rule operations (occasional config changes)
    """

    host = _INCIDENT_HOST
    wait_time = constant(1)

    @task(8)
    def incident_list(self) -> None:
        self.client.get(
            "/api/v1/incidents",
            params={"page": 1, "page_size": 50},
            name="/api/v1/incidents",
        )

    @task(2)
    def health(self) -> None:
        self.client.get("/health", name="/health")
