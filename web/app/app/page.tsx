'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { SeverityBadge } from '@/components/SeverityBadge'
import { getIncidents, type Incident, type Severity, type ViolationEvent } from '@/lib/api'
import { IncidentSocket } from '@/lib/websocket'

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']

const severityCardColours: Record<Severity, string> = {
  critical: 'border-red-400 bg-red-50',
  high: 'border-orange-400 bg-orange-50',
  medium: 'border-yellow-400 bg-yellow-50',
  low: 'border-sky-400 bg-sky-50',
}

export default function DashboardPage() {
  const [openCounts, setOpenCounts] = useState<Record<Severity, number>>({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  })
  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([])
  const [liveEvents, setLiveEvents] = useState<ViolationEvent[]>([])
  const [loading, setLoading] = useState(true)
  const socketRef = useRef<IncidentSocket | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const all = await getIncidents({ status: 'open', limit: 50 })
        const counts: Record<Severity, number> = {
          critical: 0, high: 0, medium: 0, low: 0,
        }
        for (const inc of all) counts[inc.severity] = (counts[inc.severity] ?? 0) + 1
        setOpenCounts(counts)

        const recent = await getIncidents({ limit: 20 })
        setRecentIncidents(recent)
      } finally {
        setLoading(false)
      }
    })()

    socketRef.current = new IncidentSocket()
    const unsub = socketRef.current.subscribe((ev) => {
      setLiveEvents((prev) => [ev, ...prev].slice(0, 20))
      setOpenCounts((prev) => ({
        ...prev,
        [ev.severity]: (prev[ev.severity] ?? 0) + 1,
      }))
    })

    return () => {
      unsub()
      socketRef.current?.close()
    }
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>

      {/* Severity count cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {SEVERITIES.map((sev) => (
          <div
            key={sev}
            className={`rounded-lg border-2 p-4 ${severityCardColours[sev]}`}
          >
            <p className="text-sm font-medium capitalize text-slate-600">{sev}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {loading ? '—' : openCounts[sev]}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">open incidents</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Live violation feed */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-700">
            Live Violations
          </h2>
          <div className="h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {liveEvents.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">
                Waiting for violations…
              </p>
            ) : (
              <ul>
                {liveEvents.map((ev) => (
                  <li
                    key={ev.event_id}
                    className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 last:border-0"
                  >
                    <SeverityBadge severity={ev.severity} />
                    <span className="flex-1 truncate text-sm text-slate-700">
                      {ev.rule_name}
                    </span>
                    <span className="text-xs text-slate-400">{ev.camera_id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Recent incidents */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-700">
              Recent Incidents
            </h2>
            <Link
              href="/incidents"
              className="text-xs text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {loading ? (
              <p className="p-4 text-sm text-slate-400">Loading…</p>
            ) : recentIncidents.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">No incidents yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Rule</th>
                    <th className="px-4 py-2 text-left">Camera</th>
                    <th className="px-4 py-2 text-left">Severity</th>
                    <th className="px-4 py-2 text-left">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentIncidents.map((inc) => (
                    <tr
                      key={inc.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-4 py-2 font-medium">{inc.rule_id}</td>
                      <td className="px-4 py-2 text-slate-500">{inc.camera_id}</td>
                      <td className="px-4 py-2">
                        <SeverityBadge severity={inc.severity} />
                      </td>
                      <td className="px-4 py-2 text-slate-400">
                        {new Date(inc.detected_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
