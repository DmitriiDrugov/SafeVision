import type { IncidentStatus } from '@/lib/api'

const classes: Record<IncidentStatus, string> = {
  open: 'border-severity-critical/40 bg-severity-critical/10 text-severity-critical',
  acknowledged:
    'border-severity-medium/40 bg-severity-medium/10 text-severity-medium',
  resolved: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  false_positive: 'border-white/10 bg-white/5 text-ink-300',
}

const labels: Record<IncidentStatus, string> = {
  open: 'Open',
  acknowledged: 'Acked',
  resolved: 'Resolved',
  false_positive: 'False Pos',
}

export function StatusBadge({
  status,
}: {
  status: IncidentStatus
}): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${classes[status]}`}
    >
      {labels[status]}
    </span>
  )
}
