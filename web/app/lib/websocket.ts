/**
 * WebSocket client for real-time incident streaming.
 *
 * TODO: Implement IncidentSocket class:
 *   - Connects to NEXT_PUBLIC_WS_URL (Notification Service /ws/incidents).
 *   - Auto-reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s).
 *   - subscribe(handler: (event: ViolationEvent) => void): unsubscribe fn.
 *   - close(): closes the underlying socket and stops reconnects.
 *
 * Use only browser WebSocket API; do not pull in a library.
 */

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8005/ws/incidents'

// TODO: export class IncidentSocket { ... }
