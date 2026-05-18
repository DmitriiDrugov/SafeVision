'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Camera as CameraIcon,
  CameraOff,
  Loader2,
  RefreshCw,
  Square,
  SwitchCamera,
} from 'lucide-react'
import {
  createAnonymousPeer,
  type MediaConnection,
  type PeerType,
} from '@/lib/webrtc/peer'

type Phase = 'idle' | 'requesting' | 'connecting' | 'streaming' | 'error'

type Facing = 'environment' | 'user'

export default function PublishPage(): React.ReactElement {
  const params = useParams<{ peer: string }>()
  const targetPeerId = params.peer

  const videoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<PeerType | null>(null)
  const callRef = useRef<MediaConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [facing, setFacing] = useState<Facing>('environment')
  const [stats, setStats] = useState<{ width: number; height: number; fps: number }>(
    { width: 0, height: 0, fps: 0 },
  )
  const [elapsed, setElapsed] = useState(0)

  const cleanup = (): void => {
    callRef.current?.close()
    callRef.current = null
    peerRef.current?.destroy()
    peerRef.current = null
    streamRef.current?.getTracks().forEach((t) => { t.stop(); })
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  useEffect(() => () => { cleanup(); }, [])

  // Stream uptime ticker
  useEffect(() => {
    if (phase !== 'streaming') {
      setElapsed(0)
      return
    }
    const id = setInterval(() => { setElapsed((s) => s + 1); }, 1000)
    return () => { clearInterval(id); }
  }, [phase])

  const startStream = async (overrideFacing?: Facing): Promise<void> => {
    setError(null)
    setPhase('requesting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: overrideFacing ?? facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }

      // Pull a snapshot of capture stats from the track settings.
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings()
      setStats({
        width: settings.width ?? 0,
        height: settings.height ?? 0,
        fps: settings.frameRate ?? 0,
      })

      setPhase('connecting')
      const peer = await createAnonymousPeer()
      peerRef.current = peer

      const call = peer.call(targetPeerId, stream)
      callRef.current = call

      call.on('stream', () => {
        // Receiver-side stream — not used.
      })
      call.on('close', () => {
        setPhase('idle')
        cleanup()
      })
      call.on('error', (err) => {
        setError(err.message)
        setPhase('error')
      })

      // We can't tell when the remote *fully* received the offer without
      // peeking at the underlying RTCPeerConnection; instead, wait for the
      // ICE connection state to become 'connected'.
      const pc = call.peerConnection
      const onIce = (): void => {
        if (
          pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed'
        ) {
          setPhase('streaming')
        } else if (
          pc.iceConnectionState === 'failed' ||
          pc.iceConnectionState === 'disconnected'
        ) {
          setError('Connection lost')
          setPhase('error')
        }
      }
      pc.addEventListener('iceconnectionstatechange', onIce)
      onIce()
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : 'Failed to access camera'
      setError(msg)
      setPhase('error')
      cleanup()
    }
  }

  const stopStream = (): void => {
    cleanup()
    setPhase('idle')
  }

  const flipCamera = async (): Promise<void> => {
    const next: Facing = facing === 'environment' ? 'user' : 'environment'
    setFacing(next)
    if (phase === 'streaming' || phase === 'connecting') {
      cleanup()
      await startStream(next)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink-950 text-white">
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent/15 text-accent">
            <CameraIcon className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">SafeVision Publisher</div>
            <div className="text-[10px] uppercase tracking-widest text-ink-400">
              Pairing → {targetPeerId.slice(0, 16)}…
            </div>
          </div>
        </div>
        <PhaseBadge phase={phase} />
      </header>

      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
        {phase === 'idle' && (
          <div className="absolute inset-0 grid place-items-center text-center text-sm text-ink-300">
            <div className="space-y-3 px-6">
              <CameraOff className="mx-auto h-10 w-10 text-ink-500" />
              <p>Camera not yet started.</p>
              <p className="text-xs text-ink-500">
                Tap “Start streaming” to grant access and begin pairing.
              </p>
            </div>
          </div>
        )}
        {phase === 'streaming' && (
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-[11px] uppercase tracking-wider text-emerald-300">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            LIVE · {formatElapsed(elapsed)}
          </div>
        )}
        {(phase === 'requesting' || phase === 'connecting') && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-ink-200">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              {phase === 'requesting'
                ? 'Requesting camera permission…'
                : 'Negotiating WebRTC…'}
            </div>
          </div>
        )}
        {phase === 'error' && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center text-sm text-severity-critical">
            <div className="space-y-3">
              <p>{error ?? 'Streaming failed.'}</p>
              <button
                onClick={() => void startStream()}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="grid grid-cols-2 gap-3 border-t border-white/5 px-5 py-4">
        {phase === 'streaming' && (
          <div className="col-span-2 -mt-1 flex items-center justify-between text-[11px] text-ink-400">
            <span className="font-mono">
              {stats.width}×{stats.height} · {Math.round(stats.fps)} fps
            </span>
            <span>Stream encrypted (DTLS-SRTP)</span>
          </div>
        )}
        {phase !== 'streaming' && phase !== 'connecting' ? (
          <button
            onClick={() => void startStream()}
            disabled={phase === 'requesting'}
            className="col-span-2 flex items-center justify-center gap-2 rounded-md bg-accent py-3 text-sm font-semibold text-ink-950 hover:bg-accent-400 disabled:opacity-50"
          >
            <CameraIcon className="h-4 w-4" />
            Start streaming
          </button>
        ) : (
          <>
            <button
              onClick={() => void flipCamera()}
              className="flex items-center justify-center gap-2 rounded-md border border-white/10 py-3 text-sm text-ink-100 hover:bg-white/5"
            >
              <SwitchCamera className="h-4 w-4" />
              Flip
            </button>
            <button
              onClick={stopStream}
              className="flex items-center justify-center gap-2 rounded-md border border-severity-critical/40 bg-severity-critical/10 py-3 text-sm text-severity-critical hover:bg-severity-critical/20"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          </>
        )}
      </footer>
    </div>
  )
}

function PhaseBadge({ phase }: { phase: Phase }): React.ReactElement {
  const map: Record<Phase, { label: string; tone: string }> = {
    idle: { label: 'Idle', tone: 'border-white/10 text-ink-400' },
    requesting: {
      label: 'Permission',
      tone: 'border-accent/40 text-accent',
    },
    connecting: {
      label: 'Connecting',
      tone: 'border-accent/40 text-accent',
    },
    streaming: {
      label: 'Live',
      tone: 'border-emerald-400/40 text-emerald-300',
    },
    error: {
      label: 'Error',
      tone: 'border-severity-critical/40 text-severity-critical',
    },
  }
  const { label, tone } = map[phase]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ${tone}`}
    >
      {label}
    </span>
  )
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const secs = (seconds % 60).toString().padStart(2, '0')
  return `${mins}:${secs}`
}
