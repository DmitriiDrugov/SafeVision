import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import AppShell from '../components/AppShell'

export const metadata: Metadata = {
  title: 'SafeVision · Industrial CV Safety',
  description:
    'Industrial computer-vision safety platform — real-time PPE and zone detection.',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}): React.ReactElement {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink-950 text-ink-100 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
