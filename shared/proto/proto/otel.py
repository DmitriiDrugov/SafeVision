"""OpenTelemetry initialisation helper — used by all Python services."""
from __future__ import annotations

import os

import structlog

logger = structlog.get_logger(__name__)

_TRACER_NAME = "safevision"


def setup_otel(service_name: str) -> None:
    """Initialise OTLP tracing when OTEL_EXPORTER_OTLP_ENDPOINT is set.

    No-op if the env var is absent so services run normally without a
    collector in development.
    """
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if not endpoint:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({"service.name": service_name})
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        logger.info("otel.tracing_enabled", service=service_name, endpoint=endpoint)
    except Exception as exc:
        logger.warning("otel.setup_failed", error=str(exc))


def get_tracer() -> "trace.Tracer":  # type: ignore[name-defined]
    from opentelemetry import trace

    return trace.get_tracer(_TRACER_NAME)
