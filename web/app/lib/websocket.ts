import type { ViolationEvent } from './api'

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8005/ws/incidents'

type Handler = (event: ViolationEvent) => void

export class IncidentSocket {
  private ws: WebSocket | null = null
  private handlers = new Set<Handler>()
  private stopped = false
  private retryDelay = 1_000
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly url: string = WS_URL) {
    this._connect()
  }

  private _connect(): void {
    if (this.stopped) return
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.retryDelay = 1_000
    }

    this.ws.onmessage = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as ViolationEvent
        this.handlers.forEach((h) => h(data))
      } catch {
        // malformed message — ignore
      }
    }

    this.ws.onerror = () => {
      // onclose fires after onerror; reconnect there
    }

    this.ws.onclose = () => {
      if (this.stopped) return
      this.retryTimer = setTimeout(() => {
        this._connect()
      }, this.retryDelay)
      this.retryDelay = Math.min(this.retryDelay * 2, 30_000)
    }
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close(): void {
    this.stopped = true
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.handlers.clear()
  }
}
