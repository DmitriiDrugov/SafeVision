'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthUser } from '@/lib/auth'

/**
 * Demo-mode session state — entirely client-side. The cookie set by
 * `lib/auth.ts` is still used so Next.js middleware can gate routes; this
 * store mirrors the user shape for UI rendering.
 */
interface SessionState {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
    }),
    {
      name: 'sv:session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
