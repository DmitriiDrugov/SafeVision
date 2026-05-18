'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

/**
 * Top-level chrome: sidebar + topbar. We bypass the shell on routes that own
 * their full viewport (login, mobile publisher).
 */
const CHROMELESS_PREFIXES = ['/login', '/publish']

export default function AppShell({
  children,
}: {
  children: ReactNode
}): React.ReactElement {
  const pathname = usePathname()
  const chromeless = CHROMELESS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  if (chromeless) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-ink-950 px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
