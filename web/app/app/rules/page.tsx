'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  deleteRule,
  getRules,
  updateRule,
  type Rule,
} from '@/lib/api'
import { SeverityBadge } from '@/components/SeverityBadge'

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [editYaml, setEditYaml] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRules = async () => {
    setLoading(true)
    try {
      setRules(await getRules())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRules()
  }, [])

  const toggleEnabled = async (rule: Rule) => {
    const updated = await updateRule(rule.name, { enabled: !rule.enabled })
    setRules((prev) => prev.map((r) => (r.name === updated.name ? updated : r)))
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete rule "${name}"?`)) return
    await deleteRule(name)
    setRules((prev) => prev.filter((r) => r.name !== name))
  }

  const openEdit = (rule: Rule) => {
    const yaml = [
      'rule:',
      `  name: ${rule.name}`,
      `  zone: ${rule.zone}`,
      `  enabled: ${rule.enabled}`,
      `  condition:`,
      `    object: ${rule.condition.object}`,
      rule.condition.missing_ppe
        ? `    missing_ppe: ${rule.condition.missing_ppe}`
        : null,
      rule.condition.action ? `    action: ${rule.condition.action}` : null,
      rule.condition.duration_seconds !== null
        ? `    duration_seconds: ${rule.condition.duration_seconds}`
        : null,
      rule.condition.min_count !== null
        ? `    min_count: ${rule.condition.min_count}`
        : null,
      `  action:`,
      `    type: ${rule.action.type}`,
      `    severity: ${rule.action.severity}`,
      `    channel: ${rule.action.channel}`,
    ]
      .filter(Boolean)
      .join('\n')
    setEditYaml(yaml)
    setEditing(rule)
    setError(null)
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateRule(editing.name, { yaml_text: editYaml })
      setRules((prev) =>
        prev.map((r) => (r.name === updated.name ? updated : r)),
      )
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Rules</h1>
        <Link
          href="/configure"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Rule
        </Link>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-slate-400">No rules configured yet.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Zone</th>
                <th className="px-4 py-3 text-left">Object / PPE</th>
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">Channel</th>
                <th className="px-4 py-3 text-left">Enabled</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr
                  key={rule.name}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium">{rule.name}</td>
                  <td className="px-4 py-3 text-slate-600">{rule.zone}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {rule.condition.object}
                    {rule.condition.missing_ppe && (
                      <span className="ml-1 text-slate-400">
                        / no {rule.condition.missing_ppe}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={rule.action.severity} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {rule.action.channel}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void toggleEnabled(rule)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        rule.enabled ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                      aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          rule.enabled ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => openEdit(rule)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(rule.name)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="font-semibold">Edit Rule — {editing.name}</h2>
              <button
                onClick={() => setEditing(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-4">
              <textarea
                value={editYaml}
                onChange={(e) => setEditYaml(e.target.value)}
                rows={16}
                className="w-full rounded border border-slate-300 font-mono text-xs p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && (
                <p className="mt-2 text-xs text-red-600">{error}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <button
                onClick={() => setEditing(null)}
                className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveEdit()}
                disabled={saving}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
