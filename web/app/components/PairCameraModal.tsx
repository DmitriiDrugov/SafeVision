'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, QrCode, RefreshCw, ScanLine, X } from 'lucide-react'
import QRCode from 'qrcode'
import {
  buildPublishUrl,
  createPeer,
  type MediaConnection,
  type PeerType,
} from '@/lib/webrtc/peer'
import { useCamerasStore, type DemoCamera } from '@/lib/stores/cameras'
import { nanoid } from 'nanoid'

interface Props {
  open: boolean
  onClose: () => void
}

type PairingPhase = 'form' | 'awaiting' | 'connected' | 'error'

export default function PairCameraModal({
  open,
  onClose,
}: Props): React.ReactElement | null {
  const router = useRouter()
  const addCamera = useCamerasStore((s) => s.add)
  const updateCamera = useCamerasStore((s) => s.update)
  const setStatus = useCamerasStore((s) => s.setStatus)
  const removeCamera = useCamerasStore((s) => s.remove)

  const [phase, setPhase] = useState<PairingPhase>('form')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [peerId, setPeerId] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [publishUrl, setPublishUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const peerRef = useRef<PeerType | null>(null)
  const cameraRef = useRef<DemoCamera | null>(null)
  const callRef = useRef<MediaConnection | null>(null)

  useEffect(() => {
    if (!open) {
      cleanup()
      setPhase('form')
      setName('')
      setError(null)
      setQrDataUrl('')
      setPublishUrl('')
      setPeerId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const cleanup = (): void => {
    callRef.current?.close()
    callRef.current = null
    peerRef.current?.destroy()
    peerRef.current = null
  }

  useEffect(
    () => () => {
      cleanup()
    },
    [],
  )

  const startPairing = async (): Promise<void> => {
    setError(null)
    const trimmed = name.trim() || `Camera ${new Date().toLocaleTimeString()}`
    const id = `sv-${nanoid(10)}`
    setPeerId(id)
    setPhase('awaiting')

    const cam = addCamera({ name: trimmed, peerId: id })
    cameraRef.current = cam

    const url = buildPublishUrl(id)
    setPublishUrl(url)
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 240,
        color: { dark: '#00D4FF', light: '#00000000' },
      })
      setQrDataUrl(dataUrl)
    } catch {
      // Non-fatal — user can still copy the URL.
    }

    try {
      const peer = await createPeer(id)
      peerRef.current = peer

      peer.on('call', (call) => {
        callRef.current = call
        // Answer without sending any media back — viewer is receive-only.
        call.answer()
        call.on('stream', () => {
          if (cameraRef.current) {
            setStatus(cameraRef.current.id, 'live')
            setPhase('connected')
          }
        })
        call.on('close', () => {
          if (cameraRef.current) {
            setStatus(cameraRef.current.id, 'offline')
          }
        })
      })

      peer.on('error', (err) => {
        const cam = cameraRef.current
        if (cam) {
          updateCamera(cam.id, { status: 'offline' })
        }
        setError(err.message)
        setPhase('error')
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      removeCamera(cam.id)
      cameraRef.current = null
      setError(message)
      setPhase('error')
    }
  }

  const finishAndOpen = (): void => {
    const cam = cameraRef.current
    cleanup()
    if (cam) {
      router.push(`/cameras/${encodeURIComponent(cam.id)}/live`)
    } else {
      onClose()
    }
  }

  const copyUrl = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(publishUrl)
      setCopied(true)
      setTimeout(() => { setCopied(false); }, 1500)
    } catch {
      // ignore
    }
  }

  const cancel = (): void => {
    if (cameraRef.current && phase !== 'connected') {
      removeCamera(cameraRef.current.id)
    }
    cleanup()
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md surface-raised rounded-xl shadow-panel">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
              Pair a Camera
            </h2>
          </div>
          <button
            onClick={cancel}
            className="rounded p-1 text-ink-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {phase === 'form' && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void startPairing()
              }}
              className="space-y-4"
            >
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-300">
                  Camera name
                </span>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); }}
                  placeholder="Line A — front gate"
                  className="mt-1.5 w-full rounded-md surface-input px-3 py-2 text-sm"
                />
              </label>
              <div className="text-xs leading-relaxed text-ink-400">
                A QR code will appear next. Scan it with your phone&apos;s
                camera, allow camera access, and the live stream will pair
                automatically over WebRTC.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-ink-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-accent-400"
                >
                  Generate QR
                </button>
              </div>
            </form>
          )}

          {(phase === 'awaiting' || phase === 'connected') && (
            <div className="flex flex-col items-center text-center">
              <div className="relative grid h-60 w-60 place-items-center rounded-lg border border-white/10 bg-ink-950 p-4">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="Pairing QR code"
                    className="h-full w-full"
                  />
                ) : (
                  <div className="text-xs text-ink-400">
                    Generating QR…
                  </div>
                )}
                {phase === 'awaiting' && (
                  <div className="pointer-events-none absolute inset-x-4 top-4 bottom-4 overflow-hidden rounded">
                    <div className="absolute inset-x-0 h-px animate-scan bg-accent/70 shadow-glow" />
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-ink-300">
                <ScanLine className="h-3.5 w-3.5 text-accent" />
                <span className="truncate">{publishUrl}</span>
                <button
                  onClick={() => void copyUrl()}
                  className="rounded p-1 text-ink-400 hover:bg-white/5 hover:text-white"
                  title="Copy URL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {copied && (
                  <span className="text-emerald-400">copied</span>
                )}
              </div>

              <div className="mt-3 text-xs text-ink-400">
                Peer ID:{' '}
                <span className="font-mono text-ink-200">{peerId}</span>
              </div>

              {phase === 'awaiting' && (
                <p className="mt-4 max-w-[18rem] text-xs text-ink-400">
                  Waiting for phone to connect… Scan with the default Camera
                  app or any QR reader.
                </p>
              )}
              {phase === 'connected' && (
                <p className="mt-4 max-w-[18rem] text-xs text-emerald-400">
                  Connected! Stream incoming.
                </p>
              )}

              <div className="mt-5 flex w-full justify-end gap-2">
                <button
                  onClick={cancel}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-ink-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                {phase === 'connected' && (
                  <button
                    onClick={finishAndOpen}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-accent-400"
                  >
                    Open live view →
                  </button>
                )}
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center text-center">
              <p className="mb-3 text-sm text-severity-critical">
                {error ?? 'Pairing failed.'}
              </p>
              <button
                onClick={() => {
                  setPhase('form')
                  setError(null)
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
