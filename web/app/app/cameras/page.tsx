'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getCameras,
  createCamera,
  updateCamera,
  deleteCamera,
  type Camera,
} from '@/lib/api'

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  async function load() {
    try {
      const data = await getCameras()
      setCameras(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cameras')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleToggle(cam: Camera) {
    try {
      const updated = await updateCamera(cam.id, { enabled: !cam.enabled })
      setCameras((prev) => prev.map((c) => (c.id === cam.id ? updated : c)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete camera "${id}"?`)) return
    try {
      await deleteCamera(id)
      setCameras((prev) => prev.filter((c) => c.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (loading) return <p className="text-slate-500">Loading cameras…</p>
  if (error) return <p className="text-red-600">{error}</p>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cameras</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add camera
        </button>
      </div>

      {cameras.length === 0 ? (
        <p className="text-slate-500">No cameras configured.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">RTSP URL</th>
              <th className="py-2 pr-4">Zones</th>
              <th className="py-2 pr-4">Enabled</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {cameras.map((cam) => (
              <tr
                key={cam.id}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="py-2 pr-4 font-mono text-xs">{cam.id}</td>
                <td className="py-2 pr-4">{cam.name}</td>
                <td className="max-w-xs truncate py-2 pr-4 font-mono text-xs text-slate-500">
                  {cam.rtsp_url}
                </td>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {cam.zones.length} zone{cam.zones.length !== 1 ? 's' : ''}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <button
                    onClick={() => handleToggle(cam)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      cam.enabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {cam.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </td>
                <td className="flex gap-2 py-2">
                  <Link
                    href={`/cameras/${encodeURIComponent(cam.id)}/zones`}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                  >
                    Edit zones
                  </Link>
                  <button
                    onClick={() => handleDelete(cam.id)}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddModal && (
        <AddCameraModal
          onClose={() => setShowAddModal(false)}
          onCreated={(cam) => {
            setCameras((prev) => [...prev, cam])
            setShowAddModal(false)
          }}
        />
      )}
    </div>
  )
}

// ── Add Camera modal ──────────────────────────────────────────────────────

function AddCameraModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (cam: Camera) => void
}) {
  const [form, setForm] = useState({ id: '', name: '', rtsp_url: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const cam = await createCamera({
        id: form.id.trim(),
        name: form.name.trim(),
        rtsp_url: form.rtsp_url.trim(),
      })
      onCreated(cam)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Add Camera</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">Camera ID</span>
            <input
              value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              placeholder="cam01"
              required
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Line A"
              required
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">RTSP URL</span>
            <input
              value={form.rtsp_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, rtsp_url: e.target.value }))
              }
              placeholder="rtsp://192.168.10.100:554/stream1"
              required
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
            />
          </label>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add camera'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
