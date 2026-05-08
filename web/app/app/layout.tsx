import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'SafeVision',
  description: 'Industrial Computer Vision Safety Platform',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {/* TODO: Top navigation with links to /, /incidents, /rules, /configure */}
        <main>{children}</main>
      </body>
    </html>
  )
}
