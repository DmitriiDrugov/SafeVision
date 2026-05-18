import type { Severity } from '@/lib/api'

const classes: Record<Severity, string> = {
  low: 'tint-low',
  medium: 'tint-medium',
  high: 'tint-high',
  critical: 'tint-critical',
}

export function SeverityBadge({
  severity,
}: {
  severity: Severity
}): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${classes[severity]}`}
    >
      {severity}
    </span>
  )
}
