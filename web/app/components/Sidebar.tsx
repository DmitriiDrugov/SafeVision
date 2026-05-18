'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Radio,
  Settings2,
  ShieldCheck,
  Sliders,
  Video,
  type LucideIcon,
} from 'lucide-react'
import cn from 'clsx'
import { getCurrentUser, logout, type AuthUser } from '@/lib/auth'
import { ENV, isDemoMode } from '@/lib/env'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: Activity },
  { href: '/cameras', label: 'Cameras', icon: Video },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { href: '/rules', label: 'Rules', icon: ShieldCheck },
  { href: '/configure', label: 'Rule Builder', icon: Sliders },
]

const STORAGE_KEY = 'sv:sidebar:collapsed'

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setUser(getCurrentUser())
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      // ignore
    }
  }, [])

  const toggle = (): void => {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }

  const handleLogout = (): void => {
    logout()
    router.push('/login')
  }

  const demo = isDemoMode()

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-white/5 bg-ink-900 transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-[220px]',
      )}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center gap-2 border-b border-white/5 px-4 py-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <span className="relative grid h-8 w-8 place-items-center rounded-md bg-accent/15 text-accent">
          <Radio className="h-4 w-4" strokeWidth={2.5} />
          <span className="absolute inset-0 animate-pulseRing rounded-md" />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">{ENV.appName}</div>
            <div className="text-[10px] uppercase tracking-widest text-ink-400">
              {demo ? 'Demo Mode' : 'Connected'}
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent/10 text-accent shadow-glow'
                      : 'text-ink-300 hover:bg-white/5 hover:text-white',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/5 px-2 py-3">
        {mounted && user && !collapsed && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-xs">
            <div className="min-w-0">
              <div className="truncate font-medium text-white">
                {user.username}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-ink-400">
                {user.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded p-1 text-ink-400 hover:bg-white/5 hover:text-white"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <button
          onClick={toggle}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-ink-400 hover:bg-white/5 hover:text-white',
            collapsed && 'justify-center px-0',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <>
              <ChevronsLeft className="h-3.5 w-3.5" />
              <span>Collapse</span>
            </>
          )}
        </button>
        {!collapsed && (
          <Link
            href="/settings"
            className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-ink-500 hover:bg-white/5 hover:text-white"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>Settings</span>
          </Link>
        )}
      </div>
    </aside>
  )
}
