import type { IncidentStatus } from '@/lib/api'

const colours: Record<IncidentStatus, string> = {
  open: 'bg-red-100 text-red-700',
  acknowledged: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  false_positive: 'bg-slate-100 text-slate-600',
}

const labels: Record<IncidentStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  false_positive: 'False Positive',
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colours[status]}`}
    >
      {labels[status]}
    </span>
  )
}
