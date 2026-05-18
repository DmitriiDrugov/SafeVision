'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  ImageOff,
  Trash2,
  X,
} from 'lucide-react'
import cn from 'clsx'
import { SeverityBadge } from '@/components/SeverityBadge'
import { StatusBadge } from '@/components/StatusBadge'
import {
  useIncidentsStore,
  type DemoIncident,
} from '@/lib/stores/incidents'
import type { IncidentStatus, Severity } from '@/lib/api'

const PAGE_SIZE = 25

const SEVERITIES: Array<{ value: Severity | ''; label: string }> = [
  { value: '', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const STATUSES: Array<{ value: IncidentStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'false_positive', label: 'False positive' },
]

export default function IncidentsPage(): React.ReactElement {
  const incidents = useIncidentsStore((s) => s.incidents)
  const setStatus = useIncidentsStore((s) => s.setStatus)
  const remove = useIncidentsStore((s) => s.remove)
  const loadThumbnail = useIncidentsStore((s) => s.loadThumbnail)
  const clear = useIncidentsStore((s) => s.clear)

  const [filterSeverity, setFilterSeverity] = useState<Severity | ''>('')
  const [filterStatus, setFilterStatus] = useState<IncidentStatus | ''>('')
  const [filterCamera, setFilterCamera] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<DemoIncident | null>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  useEffect(() => {
    setPage(0)
  }, [filterSeverity, filterStatus, filterCamera])

  useEffect(() => {
    setThumbUrl(null)
    if (!selected) return
    let revoke: string | null = null
    void loadThumbnail(selected.id).then((url) => {
      if (url) {
        revoke = url
        setThumbUrl(url)
      }
    })
    return (): void => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [selected, loadThumbnail])

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      if (filterSeverity && i.severity !== filterSeverity) return false
      if (filterStatus && i.status !== filterStatus) return false
      if (
        filterCamera &&
        !`${i.camera_id} ${i.cameraName}`
          .toLowerCase()
          .includes(filterCamera.toLowerCase())
      )
        return false
      return true
    })
  }, [incidents, filterSeverity, filterStatus, filterCamera])

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Incidents</h1>
          <p className="mt-0.5 text-sm text-ink-400">
            {filtered.length} of {incidents.length} matches. Detection events
            are stored locally in your browser.
          </p>
        </div>
        {incidents.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Delete all incidents from this browser?'))
                void clear()
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-ink-300 hover:bg-white/5 hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </header>

      {/* Filter bar */}
      <div className="surface flex flex-wrap items-center gap-3 rounded-lg p-3">
        <Filter className="h-3.5 w-3.5 text-ink-500" />
        <select
          value={filterSeverity}
          onChange={(e) => { setFilterSeverity(e.target.value as Severity | ''); }}
          className="surface-input rounded-md px-2 py-1 text-xs"
        >
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) =>
            { setFilterStatus(e.target.value as IncidentStatus | ''); }
          }
          className="surface-input rounded-md px-2 py-1 text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Camera name or ID"
          value={filterCamera}
          onChange={(e) => { setFilterCamera(e.target.value); }}
          className="surface-input rounded-md px-2 py-1 text-xs"
        />
      </div>

      {/* Table */}
      <div className="surface overflow-x-auto rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-widest text-ink-500">
              <th className="px-3 py-2.5">Rule</th>
              <th className="px-3 py-2.5">Camera</th>
              <th className="px-3 py-2.5">Zone</th>
              <th className="px-3 py-2.5">Severity</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Detected</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-ink-400"
                >
                  No incidents matching filters.
                </td>
              </tr>
            ) : (
              pageRows.map((inc) => (
                <tr
                  key={inc.id}
                  className="border-t border-white/5 transition-colors hover:bg-white/5"
                >
                  <td className="px-3 py-2 font-medium text-white">
                    {inc.ruleName}
                  </td>
                  <td className="px-3 py-2 text-ink-300">{inc.cameraName}</td>
                  <td className="px-3 py-2 text-ink-400 font-mono text-xs">
                    {inc.zone_id || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <SeverityBadge severity={inc.severity} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={inc.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-400">
                    {new Date(inc.detected_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => { setSelected(inc); }}
                      className="text-xs text-accent hover:underline"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-ink-400">
        <div>
          Page {page + 1} of {totalPages}
        </div>
        <div className="flex gap-1">
          <button
            disabled={page === 0}
            onClick={() => { setPage((p) => p - 1); }}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1',
              page === 0
                ? 'opacity-40'
                : 'hover:bg-white/5 hover:text-white',
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => { setPage((p) => p + 1); }}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1',
              page >= totalPages - 1
                ? 'opacity-40'
                : 'hover:bg-white/5 hover:text-white',
            )}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => { setSelected(null); }}
        >
          <div className="flex-1 bg-ink-950/70 backdrop-blur-sm" />
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-ink-900 shadow-panel"
            onClick={(e) => { e.stopPropagation(); }}
          >
            <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {selected.ruleName}
                </div>
                <div className="font-mono text-[10px] text-ink-500">
                  {selected.id}
                </div>
              </div>
              <button
                onClick={() => { setSelected(null); }}
                className="rounded p-1 text-ink-400 hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="aspect-video overflow-hidden rounded-md bg-black">
                {thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl}
                    alt="Incident snapshot"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-ink-500">
                    <ImageOff className="h-7 w-7" />
                  </div>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <Field label="Camera" value={selected.cameraName} />
                <Field label="Zone" value={selected.zone_id || '—'} />
                <Field
                  label="Severity"
                  value={<SeverityBadge severity={selected.severity} />}
                />
                <Field
                  label="Status"
                  value={<StatusBadge status={selected.status} />}
                />
                <Field
                  label="Detected"
                  value={new Date(selected.detected_at).toLocaleString()}
                />
                <Field
                  label="Acked by"
                  value={selected.acknowledged_by ?? '—'}
                />
              </dl>

              <section className="mt-4">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                  Detected classes
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {Object.entries(selected.classCounts).length === 0 && (
                    <span className="text-ink-500">none recorded</span>
                  )}
                  {Object.entries(selected.classCounts).map(([cls, n]) => (
                    <span
                      key={cls}
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono"
                    >
                      {cls} × {n}
                    </span>
                  ))}
                </div>
              </section>
            </div>

            <footer className="flex flex-wrap gap-2 border-t border-white/5 px-5 py-3">
              {selected.status === 'open' && (
                <>
                  <button
                    onClick={() => {
                      setStatus(selected.id, 'acknowledged', 'operator')
                      setSelected((s) =>
                        s
                          ? {
                              ...s,
                              status: 'acknowledged',
                              acknowledged_by: 'operator',
                              acknowledged_at: new Date().toISOString(),
                            }
                          : s,
                      )
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-severity-medium/15 px-3 py-1.5 text-xs font-medium text-severity-medium hover:bg-severity-medium/25"
                  >
                    Acknowledge
                  </button>
                  <button
                    onClick={() => {
                      setStatus(selected.id, 'false_positive')
                      setSelected((s) =>
                        s ? { ...s, status: 'false_positive' } : s,
                      )
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-ink-200 hover:bg-white/5"
                  >
                    False positive
                  </button>
                </>
              )}
              {selected.status === 'acknowledged' && (
                <button
                  onClick={() => {
                    setStatus(selected.id, 'resolved')
                    setSelected((s) =>
                      s ? { ...s, status: 'resolved' } : s,
                    )
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-400/20"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Resolve
                </button>
              )}
              <div className="ml-auto" />
              <button
                onClick={() => {
                  void remove(selected.id)
                  setSelected(null)
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-severity-critical/30 px-3 py-1.5 text-xs text-severity-critical hover:bg-severity-critical/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}): React.ReactElement {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-ink-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-white">{value}</dd>
    </div>
  )
}
