'use client'

import { useEffect, useState } from 'react'
import { Bell, CircleDot, Cpu, Search } from 'lucide-react'
import cn from 'clsx'
import { useIncidentsStore } from '@/lib/stores/incidents'
import { useCamerasStore } from '@/lib/stores/cameras'
import { isDemoMode } from '@/lib/env'

export default function TopBar() {
  const openIncidents = useIncidentsStore((s) =>
    s.incidents.filter((i) => i.status === 'open').length,
  )
  const liveCameras = useCamerasStore((s) =>
    s.cameras.filter((c) => c.status === 'live').length,
  )
  const [now, setNow] = useState<string>('')

  useEffect(() => {
    const tick = (): void =>
      { setNow(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      ); }
    tick()
    const id = setInterval(tick, 1000)
    return () => { clearInterval(id); }
  }, [])

  const demo = isDemoMode()

  return (
    <header className="flex h-14 items-center gap-4 border-b border-white/5 bg-ink-900/80 px-6 backdrop-blur">
      {/* Search (cosmetic for MVP — wired in later) */}
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input
          type="text"
          placeholder="Search cameras, rules, incidents…"
          className="w-full rounded-md surface-input py-1.5 pl-9 pr-3 text-sm placeholder:text-ink-500"
          aria-label="Global search"
        />
      </div>

      <div className="ml-auto flex items-center gap-6 text-xs text-ink-300">
        <Stat
          icon={<CircleDot className="h-3.5 w-3.5 text-emerald-400" />}
          label="Live cameras"
          value={String(liveCameras)}
        />
        <Stat
          icon={<Cpu className="h-3.5 w-3.5 text-accent" />}
          label="Mode"
          value={demo ? 'Browser inference' : 'Server inference'}
        />
        <Stat
          icon={
            <Bell
              className={cn(
                'h-3.5 w-3.5',
                openIncidents > 0
                  ? 'text-severity-critical animate-pulse'
                  : 'text-ink-400',
              )}
            />
          }
          label="Open incidents"
          value={String(openIncidents)}
        />
        <div className="ml-3 hidden font-mono text-[11px] tabular-nums text-ink-400 md:block">
          {now}
        </div>
      </div>
    </header>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-ink-500">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  )
}
