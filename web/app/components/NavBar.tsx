'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getCurrentUser, logout, type AuthUser } from '@/lib/auth'

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/incidents', label: 'Incidents' },
  { href: '/cameras', label: 'Cameras' },
  { href: '/rules', label: 'Rules' },
  { href: '/configure', label: 'Configure' },
]

export default function NavBar() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    setUser(getCurrentUser())
  }, [])

  function handleLogout() {
    logout()
    router.push('/login')
  }

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
        <span className="mr-4 text-lg font-bold tracking-tight text-slate-800">
          SafeVision
        </span>

        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            {label}
          </Link>
        ))}

        <div className="ml-auto flex items-center gap-3">
          {user && (
            <>
              <span className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">{user.username}</span>
                <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-400">
                  {user.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
