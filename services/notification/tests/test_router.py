"""
Tests for NotificationRouter and WebhookChannel.

TODO: Implement the following test cases:

    test_route_to_whatsapp_channel:
        ViolationEvent with channel="whatsapp".
        Assert whatsapp channel.send() called once, email not called.

    test_route_to_all_channels:
        ViolationEvent with channel="all".
        Assert both whatsapp and email channel.send() called.

    test_webhook_retries_on_5xx(respx_mock):
        Mock webhook URL to return 500 twice, then 200.
        Assert WebhookChannel.send() returns True after 3 attempts.

    test_webhook_writes_to_dlq_after_max_retries(respx_mock):
        Mock webhook URL to always return 500.
        Assert WebhookChannel.send() returns False and LPUSH to 'notifications.dlq'.

    test_webhook_timeout_triggers_retry(respx_mock):
        Mock webhook URL to raise httpx.TimeoutException.
        Assert retry logic handles it (same as 5xx).

Use respx for mocking httpx calls. Use pytest-asyncio for async tests.
"""
import pytest
