"""
Rule Engine entry point.

TODO: Implement startup sequence:
    1. Initialize RuleLoader(RULES_DIR) and call load_all()
    2. Start watchdog observer for hot-reload
    3. Initialize RuleState()
    4. Connect to Redis, create consumer group 'rule-engine-cg' on 'detections.frame'
    5. Start Prometheus metrics server on METRICS_PORT
    6. Initialize OpenTelemetry tracer (propagate trace_id from stream message headers)
    7. Main loop:
       a. XREADGROUP from 'detections.frame'
       b. Deserialize DetectionStreamEvent
       c. For each enabled rule: evaluator.evaluate(event)
       d. For each ViolationEvent returned: publish to 'events.violation'
       e. XACK processed message
    8. Graceful shutdown: stop watchdog, XACK pending, close Redis

Hot-reload design:
    RuleLoader.watch() runs in a background thread (watchdog uses threads).
    The main loop reads rules from a threading.RLock-protected list.
    On file change: acquire lock, load_all(), update list, release lock.
    No messages are dropped during reload (lock held only during list swap).
"""
