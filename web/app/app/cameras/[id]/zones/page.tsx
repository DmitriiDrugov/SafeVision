'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getCamera, updateCameraZones, type Camera, type Zone } from '@/lib/api'

type Point = [number, number]

interface DraftZone {
  vertices: Point[]
  closed: boolean
}

const ZONE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
]

const CANVAS_W = 800
const CANVAS_H = 450

export default function ZoneEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [camera, setCamera] = useState<Camera | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [draft, setDraft] = useState<DraftZone | null>(null)
  const [draftName, setDraftName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Load camera on mount
  useEffect(() => {
    if (!id) return
    getCamera(decodeURIComponent(id))
      .then((cam) => {
        setCamera(cam)
        setZones(cam.zones)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [id])

  // Redraw canvas whenever zones or draft change
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // Draw background grid
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= CANVAS_W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke()
    }
    for (let y = 0; y <= CANVAS_H; y += 45) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke()
    }

    // Draw saved zones
    zones.forEach((zone, idx) => {
      const color = ZONE_COLORS[idx % ZONE_COLORS.length]
      const pts = zone.polygon.map(([nx, ny]) => [nx * CANVAS_W, ny * CANVAS_H] as Point)
      const first = pts[0]
      if (!first || pts.length < 2) return

      ctx.beginPath()
      ctx.moveTo(first[0], first[1])
      pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y))
      ctx.closePath()
      ctx.fillStyle = color + '33' // 20% opacity
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()

      // Label at centroid
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
      ctx.fillStyle = color
      ctx.font = 'bold 12px ui-sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(zone.name, cx, cy)

      // Vertex dots
      pts.forEach(([x, y]) => {
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      })
    })

    // Draw in-progress draft
    if (draft && draft.vertices.length > 0) {
      const pts = draft.vertices.map(([nx, ny]) => [nx * CANVAS_W, ny * CANVAS_H] as Point)
      const first = pts[0]
      if (!first) return
      ctx.beginPath()
      ctx.moveTo(first[0], first[1])
      pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y))
      ctx.strokeStyle = '#1d4ed8'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.stroke()
      ctx.setLineDash([])

      pts.forEach(([x, y], i) => {
        ctx.beginPath()
        ctx.arc(x, y, i === 0 ? 6 : 4, 0, Math.PI * 2)
        ctx.fillStyle = i === 0 ? '#1d4ed8' : '#3b82f6'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })
    }
  }, [zones, draft])

  useEffect(() => {
    redraw()
  }, [redraw])

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (draft?.closed) return

    const rect = canvasRef.current!.getBoundingClientRect()
    const px = (e.clientX - rect.left) * (CANVAS_W / rect.width)
    const py = (e.clientY - rect.top) * (CANVAS_H / rect.height)
    const nx = px / CANVAS_W
    const ny = py / CANVAS_H

    if (!draft) {
      setDraft({ vertices: [[nx, ny]], closed: false })
      return
    }

    // Click near first vertex → close polygon
    const first = draft.vertices[0]
    if (!first) return
    const [fx, fy] = first
    const distPx = Math.hypot((nx - fx) * CANVAS_W, (ny - fy) * CANVAS_H)
    if (draft.vertices.length >= 3 && distPx < 12) {
      setDraft((d) => d && { ...d, closed: true })
      return
    }

    setDraft((d) => d && { ...d, vertices: [...d.vertices, [nx, ny]] })
  }

  function handleDoubleClick() {
    if (draft && draft.vertices.length >= 3) {
      setDraft((d) => d && { ...d, closed: true })
    }
  }

  function commitDraft() {
    if (!draft || !draft.closed || !draftName.trim()) return
    const newZone: Zone = {
      id: draftName.trim().toLowerCase().replace(/\s+/g, '_'),
      name: draftName.trim(),
      polygon: draft.vertices,
    }
    setZones((prev) => [...prev, newZone])
    setDraft(null)
    setDraftName('')
  }

  function discardDraft() {
    setDraft(null)
    setDraftName('')
  }

  function removeZone(idx: number) {
    setZones((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await updateCameraZones(decodeURIComponent(id), zones)
      router.push('/cameras')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (error && !camera) return <p className="text-red-600">{error}</p>
  if (!camera) return <p className="text-slate-500">Loading…</p>

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => router.push('/cameras')}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Cameras
        </button>
        <h1 className="text-xl font-semibold">
          Zone editor — {camera.name}
        </h1>
      </div>

      <div className="flex gap-6">
        {/* Canvas */}
        <div className="flex-1">
          <p className="mb-2 text-xs text-slate-500">
            Click to add vertices. Click the first vertex (or double-click) to
            close the polygon.
          </p>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onClick={handleCanvasClick}
            onDoubleClick={handleDoubleClick}
            className="w-full cursor-crosshair rounded border border-slate-200 bg-slate-50"
            style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
          />
        </div>

        {/* Sidebar */}
        <div className="w-64 shrink-0 space-y-4">
          {/* In-progress draft */}
          <div className="rounded border border-blue-200 bg-blue-50 p-3">
            <p className="mb-2 text-xs font-semibold text-blue-800">
              New zone
              {draft
                ? draft.closed
                  ? ' — polygon closed'
                  : ` — ${draft.vertices.length} vertices`
                : ' — click canvas to start'}
            </p>
            {draft?.closed && (
              <div className="space-y-2">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Zone name"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={commitDraft}
                    disabled={!draftName.trim()}
                    className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    Add zone
                  </button>
                  <button
                    onClick={discardDraft}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
            {draft && !draft.closed && (
              <button
                onClick={discardDraft}
                className="text-xs text-blue-700 underline"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Existing zones list */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Zones ({zones.length})
            </p>
            {zones.length === 0 ? (
              <p className="text-xs text-slate-400">No zones yet.</p>
            ) : (
              <ul className="space-y-1">
                {zones.map((z, idx) => (
                  <li
                    key={z.id}
                    className="flex items-center justify-between rounded border border-slate-100 bg-white px-2 py-1"
                  >
                    <span className="flex items-center gap-1.5 text-sm">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: ZONE_COLORS[idx % ZONE_COLORS.length],
                        }}
                      />
                      {z.name}
                    </span>
                    <button
                      onClick={() => removeZone(idx)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save zones'}
          </button>
        </div>
      </div>
    </div>
  )
}
