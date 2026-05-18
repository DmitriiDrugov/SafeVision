'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Loader2, Radio, ShieldCheck } from 'lucide-react'
import { login } from '@/lib/auth'
import { startDemoSession } from '@/lib/demo-auth'
import { isDemoMode } from '@/lib/env'

function LoginForm(): React.ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/'
  const demo = isDemoMode()

  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(form.username.trim(), form.password)
      router.push(next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const enterDemo = (): void => {
    startDemoSession('demo', 'admin')
    router.push(next)
    router.refresh()
  }

  return (
    <>
      {demo && (
        <button
          onClick={enterDemo}
          className="group mb-5 flex w-full items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-left transition-colors hover:bg-accent/15"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-accent">
              <ShieldCheck className="h-4 w-4" />
              Try the demo
            </div>
            <p className="mt-0.5 text-xs text-ink-300">
              Skip authentication and open the demo workspace — runs entirely
              in your browser.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-ink-400">
            Username
          </span>
          <input
            type="text"
            autoComplete="username"
            value={form.username}
            onChange={(e) =>
              { setForm((f) => ({ ...f, username: e.target.value })); }
            }
            required
            className="w-full rounded-md surface-input px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-ink-400">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) =>
              { setForm((f) => ({ ...f, password: e.target.value })); }
            }
            required
            className="w-full rounded-md surface-input px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <p className="rounded-md border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-xs text-severity-critical">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent py-2.5 text-sm font-semibold text-ink-950 hover:bg-accent-400 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  )
}

export default function LoginPage(): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 bg-grid px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/5 bg-ink-900/80 p-8 shadow-panel backdrop-blur">
        <div className="mb-7 flex items-center gap-3">
          <span className="relative grid h-10 w-10 place-items-center rounded-lg bg-accent/15 text-accent">
            <Radio className="h-5 w-5" />
            <span className="absolute inset-0 animate-pulseRing rounded-lg" />
          </span>
          <div>
            <div className="text-base font-semibold tracking-tight text-white">
              SafeVision
            </div>
            <div className="text-[10px] uppercase tracking-widest text-ink-400">
              Industrial Safety Platform
            </div>
          </div>
        </div>
        <Suspense fallback={<div className="h-48" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
