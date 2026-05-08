import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'SafeVision',
  description: 'Industrial Computer Vision Safety Platform',
}

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/incidents', label: 'Incidents' },
  { href: '/rules', label: 'Rules' },
  { href: '/configure', label: 'Configure' },
]

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <span className="mr-4 text-lg font-bold tracking-tight text-slate-800">
              SafeVision
            </span>
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
