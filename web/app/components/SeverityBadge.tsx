import type { Severity } from '@/lib/api'

const colours: Record<Severity, string> = {
  low: 'bg-sky-100 text-sky-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colours[severity]}`}
    >
      {severity}
    </span>
  )
}
