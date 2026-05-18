'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertOctagon,
  Cpu,
  Loader2,
  QrCode,
  ShieldAlert,
  Signal,
  VideoOff,
} from 'lucide-react'
import cn from 'clsx'
import { createInferenceClient, type InferenceClient } from '@/lib/inference/client'
import { drawDetections } from '@/lib/inference/overlay'
import type { Detection } from '@/lib/inference/types'
import { startReceiver } from '@/lib/webrtc/receiver'
import { RuleEvaluator } from '@/lib/rules/evaluator'
import { recordIncident, snapshotDataUrl } from '@/lib/rules/recorder'
import { useCamerasStore, type DemoCamera } from '@/lib/stores/cameras'
import { useRulesStore } from '@/lib/stores/rules'
import { useIncidentsStore } from '@/lib/stores/incidents'
import { SeverityBadge } from './SeverityBadge'

type ConnState = 'pairing' | 'connecting' | 'live' | 'offline'

interface Props {
  camera: DemoCamera
}

export default function LiveCameraView({ camera }: Props): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const captureRef = useRef<HTMLCanvasElement>(null) // hidden, for ImageBitmap
  const inferenceRef = useRef<InferenceClient | null>(null)
  const evaluatorRef = useRef<RuleEvaluator | null>(null)
  const rafRef = useRef<number | null>(null)
  const fpsWindowRef = useRef<number[]>([])
  // Mirrors of state used inside the requestAnimationFrame loop — refs avoid
  // stale-closure reads of the React state set elsewhere in this component.
  const detectionsRef = useRef<Detection[]>([])
  const statsRef = useRef<{ fps: number; latencyMs: number }>({
    fps: 0,
    latencyMs: 0,
  })
  const zonesRef = useRef(camera.zones)

  const setStatus = useCamerasStore((s) => s.setStatus)
  const setThumbnail = useCamerasStore((s) => s.setThumbnail)
  const recentIncidents = useIncidentsStore((s) =>
    s.incidents.filter((i) => i.camera_id === camera.id).slice(0, 8),
  )
  const rules = useRulesStore((s) => s.rules)

  const [connState, setConnState] = useState<ConnState>('pairing')
  const [modelStatus, setModelStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'loading'; loaded: number; total: number }
    | { kind: 'ready'; backend: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })
  const [detections, setDetections] = useState<Detection[]>([])
  const [stats, setStats] = useState<{ fps: number; latencyMs: number }>({
    fps: 0,
    latencyMs: 0,
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    detectionsRef.current = detections
  }, [detections])
  useEffect(() => {
    statsRef.current = stats
  }, [stats])
  useEffect(() => {
    zonesRef.current = camera.zones
  }, [camera.zones])

  useEffect(() => {
    let teardown: (() => void) | null = null
    setConnState('pairing')
    setError(null)
    setStatus(camera.id, 'pairing')

    void startReceiver(camera.peerId, {
      onStream: (stream) => {
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.play().catch(() => undefined)
        setConnState('live')
        setStatus(camera.id, 'live')
        startInference()
      },
      onClose: () => {
        setConnState('offline')
        setStatus(camera.id, 'offline')
      },
      onError: (err) => {
        setError(err.message)
        setConnState('offline')
      },
    }).then((fn) => {
      teardown = fn
    })

    return () => {
      teardown?.()
      stopInference()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.id, camera.peerId])

  function startInference(): void {
    if (inferenceRef.current) return
    evaluatorRef.current = new RuleEvaluator(() => useRulesStore.getState().rules)
    setModelStatus({ kind: 'loading', loaded: 0, total: 0 })
    inferenceRef.current = createInferenceClient({
      onProgress: (loaded, total) =>
        { setModelStatus({ kind: 'loading', loaded, total }); },
      onReady: ({ backend }) => {
        setModelStatus({ kind: 'ready', backend })
        runLoop()
      },
      onResult: ({ detections: dets, latencyMs }) => {
        setDetections(dets)

        // FPS sliding window (last 30 results)
        const w = fpsWindowRef.current
        w.push(performance.now())
        while (w.length > 30) w.shift()
        const span = w.length > 1 ? (w[w.length - 1] - w[0]) / 1000 : 0
        const fps = span > 0 ? (w.length - 1) / span : 0
        setStats({ fps, latencyMs })

        const video = videoRef.current
        if (video) {
          const evalCtx = {
            cameraId: camera.id,
            zones: zonesRef.current,
            detections: dets,
            now: performance.now(),
          }
          const matches = evaluatorRef.current?.evaluate(evalCtx) ?? []
          for (const match of matches) {
            void recordIncident(match, camera.id, {
              source: video,
              width: video.videoWidth,
              height: video.videoHeight,
            })
          }
        }
      },
      onError: (err) =>
        { setModelStatus({ kind: 'error', message: err.message }); },
    })
  }

  function stopInference(): void {
    inferenceRef.current?.destroy()
    inferenceRef.current = null
    evaluatorRef.current?.reset()
    evaluatorRef.current = null
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  function runLoop(): void {
    const video = videoRef.current
    const cap = captureRef.current
    const overlay = overlayRef.current
    const client = inferenceRef.current
    if (!video || !cap || !overlay || !client) return

    let lastSubmitted = 0
    let lastThumbnail = 0
    const TARGET_INTERVAL_MS = 200 // ~5 fps inference

    const tick = (): void => {
      const now = performance.now()
      const w = video.videoWidth
      const h = video.videoHeight
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // Resize the overlay/capture canvases to match the *displayed* video
      // bounding box so coordinates align cleanly without extra math.
      const rect = video.getBoundingClientRect()
      if (overlay.width !== rect.width || overlay.height !== rect.height) {
        overlay.width = Math.max(1, Math.floor(rect.width))
        overlay.height = Math.max(1, Math.floor(rect.height))
      }
      // Inference capture uses a 480×360 buffer — plenty for COCO yolov8n
      // at our display resolutions, and ~6× faster than a full 720p frame.
      const targetW = 480
      const targetH = Math.round((targetW * h) / w)
      if (cap.width !== targetW || cap.height !== targetH) {
        cap.width = targetW
        cap.height = targetH
      }

      if (now - lastSubmitted >= TARGET_INTERVAL_MS && client.isReady()) {
        const ctx = cap.getContext('2d', { willReadFrequently: false })
        if (ctx) {
          ctx.drawImage(video, 0, 0, targetW, targetH)
          createImageBitmap(cap)
            .then((bmp) => { client.submit(bmp, targetW, targetH); })
            .catch(() => undefined)
        }
        lastSubmitted = now
      }

      // Thumbnail every 2s for the camera grid.
      if (now - lastThumbnail >= 2000) {
        lastThumbnail = now
        snapshotDataUrl({ source: video, width: w, height: h }, 320, 180, 0.6)
          .then((url) => {
            if (url) setThumbnail(camera.id, url)
          })
          .catch(() => undefined)
      }

      // Render overlay every animation frame from the most recent detections.
      const octx = overlay.getContext('2d')
      if (octx) {
        drawDetections(
          octx,
          overlay.width,
          overlay.height,
          detectionsRef.current,
          {
            zones: zonesRef.current,
            fps: statsRef.current.fps,
            latencyMs: statsRef.current.latencyMs,
          },
        )
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const isLoading =
    modelStatus.kind === 'loading' || (connState === 'live' && modelStatus.kind === 'idle')
  const loadPct =
    modelStatus.kind === 'loading' && modelStatus.total > 0
      ? Math.round((modelStatus.loaded / modelStatus.total) * 100)
      : null

  return (
    <div className="grid h-[calc(100vh-3.5rem-3rem)] grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      {/* Live tile */}
      <div className="relative overflow-hidden rounded-xl border border-white/5 bg-black shadow-panel">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
        />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <canvas ref={captureRef} className="hidden" />

        <div className="absolute left-3 top-3 flex items-center gap-2">
          <StatePill state={connState} />
          {modelStatus.kind === 'ready' && (
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-ink-900/70 px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-200">
              <Cpu className="h-3 w-3 text-accent" />
              {modelStatus.backend}
            </span>
          )}
        </div>

        {connState === 'pairing' && (
          <CenterPanel
            icon={<QrCode className="h-8 w-8 text-accent" />}
            title="Waiting for phone to pair"
            body={
              <>
                Open <span className="font-mono text-accent">Cameras</span> on
                the desktop, click the camera <strong>{camera.name}</strong>{' '}
                tile, and scan the QR again to reconnect.
              </>
            }
          />
        )}
        {connState === 'offline' && (
          <CenterPanel
            icon={<VideoOff className="h-8 w-8 text-ink-400" />}
            title="Stream offline"
            body={error ?? 'The publisher disconnected.'}
          />
        )}
        {isLoading && connState === 'live' && (
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-md border border-white/10 bg-ink-900/80 px-3 py-2 text-xs text-ink-200 backdrop-blur">
            <div className="mb-1 flex items-center gap-2 text-accent">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Loading detection model…</span>
              {loadPct !== null && (
                <span className="ml-auto font-mono text-ink-300">
                  {loadPct}%
                </span>
              )}
            </div>
            <div className="h-1 w-full overflow-hidden rounded bg-white/5">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: `${String(loadPct ?? 0)}%` }}
              />
            </div>
          </div>
        )}
        {modelStatus.kind === 'error' && (
          <CenterPanel
            icon={<AlertOctagon className="h-8 w-8 text-severity-critical" />}
            title="Inference failed"
            body={modelStatus.message}
          />
        )}
      </div>

      {/* Sidecar */}
      <aside className="flex min-h-0 flex-col gap-3">
        <SectionCard
          title="Active rules"
          icon={<ShieldAlert className="h-3.5 w-3.5 text-accent" />}
        >
          <ul className="space-y-1.5 text-xs">
            {rules.filter((r) => r.enabled).length === 0 && (
              <li className="text-ink-500">
                No rules enabled. Open Rules to configure.
              </li>
            )}
            {rules
              .filter((r) => r.enabled)
              .map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1.5"
                >
                  <span className="truncate text-ink-100">{r.name}</span>
                  <SeverityBadge severity={r.severity} />
                </li>
              ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Recent incidents"
          icon={<AlertOctagon className="h-3.5 w-3.5 text-severity-critical" />}
        >
          <ul className="space-y-1.5 text-xs">
            {recentIncidents.length === 0 && (
              <li className="text-ink-500">
                No incidents on this camera yet. The first detection that
                matches an enabled rule will appear here.
              </li>
            )}
            {recentIncidents.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-2 rounded-md bg-white/5 px-2 py-2"
              >
                <SeverityBadge severity={i.severity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ink-100">{i.ruleName}</div>
                  <div className="font-mono text-[10px] text-ink-400">
                    {new Date(i.detected_at).toLocaleTimeString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Capture stats"
          icon={<Signal className="h-3.5 w-3.5 text-accent" />}
        >
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Inference FPS" value={stats.fps.toFixed(1)} />
            <Stat
              label="Latency"
              value={`${stats.latencyMs.toFixed(0)} ms`}
            />
            <Stat label="Detections" value={detections.length.toString()} />
            <Stat label="Zones" value={camera.zones.length.toString()} />
          </dl>
        </SectionCard>
      </aside>
    </div>
  )
}

function StatePill({ state }: { state: ConnState }): React.ReactElement {
  const map: Record<ConnState, { label: string; tone: string }> = {
    pairing: {
      label: 'Pairing',
      tone: 'border-accent/40 bg-accent/10 text-accent',
    },
    connecting: {
      label: 'Connecting',
      tone: 'border-accent/40 bg-accent/10 text-accent',
    },
    live: {
      label: 'Live',
      tone: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
    },
    offline: {
      label: 'Offline',
      tone: 'border-white/10 bg-white/5 text-ink-400',
    },
  }
  const { label, tone } = map[state]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest',
        tone,
      )}
    >
      {state === 'live' && (
        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      )}
      {label}
    </span>
  )
}

function CenterPanel({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
}): React.ReactElement {
  return (
    <div className="absolute inset-0 grid place-items-center bg-ink-950/70 backdrop-blur-sm">
      <div className="max-w-[24rem] rounded-lg border border-white/5 bg-ink-900/80 px-6 py-6 text-center">
        <div className="mb-3 flex justify-center">{icon}</div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <p className="mt-1.5 text-xs text-ink-300">{body}</p>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="surface rounded-lg p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
        {icon}
        {title}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-md bg-white/5 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </dt>
      <dd className="font-mono text-sm font-medium text-white">{value}</dd>
    </div>
  )
}
