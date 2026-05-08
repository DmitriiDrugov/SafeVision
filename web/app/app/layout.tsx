import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import NavBar from '../components/NavBar'

export const metadata: Metadata = {
  title: 'SafeVision',
  description: 'Industrial Computer Vision Safety Platform',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <NavBar />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
