'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  acknowledgeIncident,
  getAuditLog,
  getEvidenceUrl,
  getIncidents,
  markFalsePositive,
  resolveIncident,
  type AuditLogEntry,
  type Incident,
  type IncidentListParams,
  type IncidentStatus,
  type Severity,
} from '@/lib/api'
import { SeverityBadge } from '@/components/SeverityBadge'
import { StatusBadge } from '@/components/StatusBadge'

const PAGE_SIZE = 50

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
  { value: 'false_positive', label: 'False Positive' },
]

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [filterSeverity, setFilterSeverity] = useState<Severity | ''>('')
  const [filterStatus, setFilterStatus] = useState<IncidentStatus | ''>('')
  const [filterCamera, setFilterCamera] = useState('')
  const [selected, setSelected] = useState<Incident | null>(null)
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null)
  const [actorName, setActorName] = useState('operator')

  const loadIncidents = useCallback(async () => {
    setLoading(true)
    try {
      const params: IncidentListParams = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }
      if (filterSeverity) params.severity = filterSeverity
      if (filterStatus) params.status = filterStatus
      if (filterCamera) params.camera_id = filterCamera
      setIncidents(await getIncidents(params))
    } finally {
      setLoading(false)
    }
  }, [page, filterSeverity, filterStatus, filterCamera])

  useEffect(() => {
    void loadIncidents()
  }, [loadIncidents])

  const openDetail = async (inc: Incident) => {
    setSelected(inc)
    setEvidenceUrl(null)
    setAuditLog([])
    const [log, ev] = await Promise.allSettled([
      getAuditLog(inc.id),
      inc.clip_url ? getEvidenceUrl(inc.id) : Promise.resolve(null),
    ])
    if (log.status === 'fulfilled') setAuditLog(log.value)
    if (ev.status === 'fulfilled' && ev.value) setEvidenceUrl(ev.value.url)
  }

  const act = async (
    fn: () => Promise<Incident>,
  ) => {
    const updated = await fn()
    setIncidents((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i)),
    )
    setSelected(updated)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Incidents</h1>

      {/* Filter bar */}
      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={filterSeverity}
          onChange={(e) => {
            setFilterSeverity(e.target.value as Severity | '')
            setPage(0)
          }}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value as IncidentStatus | '')
            setPage(0)
          }}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Camera ID"
          value={filterCamera}
          onChange={(e) => {
            setFilterCamera(e.target.value)
            setPage(0)
          }}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => void loadIncidents()}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Rule</th>
              <th className="px-4 py-3 text-left">Camera</th>
              <th className="px-4 py-3 text-left">Zone</th>
              <th className="px-4 py-3 text-left">Severity</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Detected</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : incidents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No incidents found.
                </td>
              </tr>
            ) : (
              incidents.map((inc) => (
                <tr
                  key={inc.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-medium">{inc.rule_id}</td>
                  <td className="px-4 py-2 text-slate-600">{inc.camera_id}</td>
                  <td className="px-4 py-2 text-slate-500">{inc.zone_id}</td>
                  <td className="px-4 py-2">
                    <SeverityBadge severity={inc.severity} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={inc.status} />
                  </td>
                  <td className="px-4 py-2 text-slate-400">
                    {new Date(inc.detected_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => void openDetail(inc)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Detail
                      </button>
                      {inc.status === 'open' && (
                        <>
                          <button
                            onClick={() =>
                              void act(() =>
                                acknowledgeIncident(inc.id, actorName),
                              )
                            }
                            className="text-xs text-yellow-600 hover:underline"
                          >
                            Ack
                          </button>
                          <button
                            onClick={() =>
                              void act(() => markFalsePositive(inc.id))
                            }
                            className="text-xs text-slate-500 hover:underline"
                          >
                            FP
                          </button>
                        </>
                      )}
                      {inc.status === 'acknowledged' && (
                        <button
                          onClick={() =>
                            void act(() => resolveIncident(inc.id, actorName))
                          }
                          className="text-xs text-green-600 hover:underline"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center gap-4">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-slate-600">Page {page + 1}</span>
        <button
          disabled={incidents.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>

      {/* Detail drawer */}
      {selected !== null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSelected(null)}
          />
          <div className="flex w-full max-w-lg flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Incident Detail</h2>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Rule</p>
                  <p className="font-medium">{selected.rule_id}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Camera / Zone</p>
                  <p className="font-medium">
                    {selected.camera_id} / {selected.zone_id}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Severity</p>
                  <SeverityBadge severity={selected.severity} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500">Detected At</p>
                  <p>{new Date(selected.detected_at).toLocaleString()}</p>
                </div>
              </div>

              {evidenceUrl && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">
                    Evidence Clip
                  </p>
                  <video
                    src={evidenceUrl}
                    controls
                    className="w-full rounded border"
                  />
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">Actor</p>
                <input
                  type="text"
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>

              <div className="flex gap-2">
                {selected.status === 'open' && (
                  <>
                    <button
                      onClick={() =>
                        void act(() =>
                          acknowledgeIncident(selected.id, actorName),
                        )
                      }
                      className="rounded bg-yellow-500 px-3 py-1.5 text-sm text-white hover:bg-yellow-600"
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() =>
                        void act(() => markFalsePositive(selected.id))
                      }
                      className="rounded bg-slate-200 px-3 py-1.5 text-sm hover:bg-slate-300"
                    >
                      False Positive
                    </button>
                  </>
                )}
                {selected.status === 'acknowledged' && (
                  <button
                    onClick={() =>
                      void act(() => resolveIncident(selected.id, actorName))
                    }
                    className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                  >
                    Resolve
                  </button>
                )}
              </div>

              {auditLog.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">
                    Audit Log
                  </p>
                  <ul className="space-y-1">
                    {auditLog.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded bg-slate-50 px-3 py-2 text-xs"
                      >
                        <span className="font-medium">{entry.action}</span> by{' '}
                        {entry.actor} —{' '}
                        {new Date(entry.created_at).toLocaleString()}
                        {entry.note && (
                          <p className="mt-0.5 text-slate-500">{entry.note}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
