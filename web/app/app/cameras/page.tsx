'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Camera as CameraIcon,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Trash2,
  Video as VideoIcon,
  WifiOff,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import cn from 'clsx'
import PairCameraModal from '@/components/PairCameraModal'
import {
  useCamerasStore,
  type CameraStatus,
  type DemoCamera,
} from '@/lib/stores/cameras'

const statusMap: Record<
  CameraStatus,
  { label: string; tone: string; dot: string }
> = {
  pairing: {
    label: 'Pairing',
    tone: 'border-accent/40 bg-accent/10 text-accent',
    dot: 'bg-accent',
  },
  live: {
    label: 'Live',
    tone: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  offline: {
    label: 'Offline',
    tone: 'border-white/10 bg-white/5 text-ink-400',
    dot: 'bg-ink-500',
  },
}

export default function CamerasPage(): React.ReactElement {
  const cameras = useCamerasStore((s) => s.cameras)
  const remove = useCamerasStore((s) => s.remove)
  const [pairOpen, setPairOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { setHydrated(true); }, [])

  const handleDelete = (cam: DemoCamera): void => {
    if (!confirm(`Remove camera "${cam.name}"?`)) return
    remove(cam.id)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Cameras</h1>
          <p className="mt-0.5 text-sm text-ink-400">
            Pair phones, IP cameras, or any WebRTC publisher. Live tiles refresh
            automatically when a publisher connects.
          </p>
        </div>
        <button
          onClick={() => { setPairOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400"
        >
          <Plus className="h-4 w-4" />
          Pair camera
        </button>
      </header>

      {hydrated && cameras.length === 0 ? (
        <EmptyState onAdd={() => { setPairOpen(true); }} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {cameras.map((cam) => (
              <motion.div
                key={cam.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
              >
                <CameraTile cam={cam} onDelete={() => { handleDelete(cam); }} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <PairCameraModal open={pairOpen} onClose={() => { setPairOpen(false); }} />
    </div>
  )
}

function CameraTile({
  cam,
  onDelete,
}: {
  cam: DemoCamera
  onDelete: () => void
}): React.ReactElement {
  const { label, tone, dot } = statusMap[cam.status]
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="group surface relative overflow-hidden rounded-xl">
      <Link
        href={`/cameras/${encodeURIComponent(cam.id)}/live`}
        className="block aspect-video w-full overflow-hidden bg-ink-950"
      >
        {cam.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cam.thumbnail}
            alt={cam.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-grid">
            {cam.status === 'offline' ? (
              <WifiOff className="h-10 w-10 text-ink-500" />
            ) : (
              <VideoIcon className="h-10 w-10 text-ink-400" />
            )}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/0" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest',
              tone,
            )}
          >
            <span
              className={cn(
                'mr-1.5 inline-block h-1.5 w-1.5 rounded-full',
                dot,
                cam.status === 'live' && 'animate-pulse',
              )}
            />
            {label}
          </span>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">
              {cam.name}
            </div>
            <div className="truncate font-mono text-[10px] text-ink-400">
              {cam.peerId}
            </div>
          </div>
          <div className="rounded-full bg-accent/20 p-2 text-accent">
            <Play className="h-3.5 w-3.5" />
          </div>
        </div>
      </Link>
      <button
        onClick={() => { setMenuOpen((o) => !o); }}
        className="absolute right-2 top-2 rounded-md border border-white/10 bg-ink-900/80 p-1 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
        aria-label="Camera menu"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {menuOpen && (
        <div className="absolute right-2 top-10 z-10 w-44 overflow-hidden rounded-md border border-white/10 bg-ink-900/95 text-xs shadow-panel">
          <Link
            href={`/cameras/${encodeURIComponent(cam.id)}/zones`}
            className="flex items-center gap-2 px-3 py-2 text-ink-200 hover:bg-white/5"
            onClick={() => { setMenuOpen(false); }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit zones
          </Link>
          <button
            onClick={() => {
              setMenuOpen(false)
              onDelete()
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-severity-critical hover:bg-severity-critical/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove camera
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }): React.ReactElement {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-white/10 bg-ink-900/30 px-6 py-16 text-center">
      <CameraIcon className="mb-4 h-10 w-10 text-ink-500" />
      <h2 className="text-base font-medium text-white">
        No cameras paired yet
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-ink-400">
        Pair your first camera in seconds — click below, scan the QR with your
        phone, and the live feed will appear here automatically. Detection runs
        in your browser; nothing is uploaded.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400"
      >
        <Plus className="h-4 w-4" />
        Pair your first camera
      </button>
    </div>
  )
}
