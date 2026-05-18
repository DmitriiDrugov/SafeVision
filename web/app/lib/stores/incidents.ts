'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type { Incident, IncidentStatus, Severity } from '@/lib/api'

/**
 * Browser-side incident — superset of the server `Incident` shape with an
 * extra `thumbnailKey` pointing at an IndexedDB blob to keep localStorage
 * lean (only metadata is persisted via zustand).
 */
export interface DemoIncident extends Omit<Incident, 'detection_payload'> {
  ruleName: string
  cameraName: string
  thumbnailKey: string | null
  classCounts: Record<string, number>
}

interface IncidentsState {
  incidents: DemoIncident[]
  add: (incident: DemoIncident, thumbnailBlob?: Blob) => Promise<void>
  setStatus: (
    id: string,
    status: IncidentStatus,
    actor?: string,
  ) => void
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
  loadThumbnail: (id: string) => Promise<string | null>
}

const THUMB_PREFIX = 'sv:incident-thumb:'

export const useIncidentsStore = create<IncidentsState>()(
  persist(
    (set, get) => ({
      incidents: [],
      add: async (incident, thumbnailBlob) => {
        let thumbnailKey: string | null = null
        if (thumbnailBlob) {
          thumbnailKey = `${THUMB_PREFIX}${incident.id}`
          try {
            await idbSet(thumbnailKey, thumbnailBlob)
          } catch {
            thumbnailKey = null
          }
        }
        set((s) => ({
          incidents: [{ ...incident, thumbnailKey }, ...s.incidents].slice(
            0,
            500,
          ),
        }))
      },
      setStatus: (id, status, actor) =>
        set((s) => ({
          incidents: s.incidents.map((i) => {
            if (i.id !== id) return i
            return {
              ...i,
              status,
              acknowledged_by:
                status === 'acknowledged'
                  ? (actor ?? i.acknowledged_by ?? 'operator')
                  : i.acknowledged_by,
              acknowledged_at:
                status === 'acknowledged'
                  ? new Date().toISOString()
                  : i.acknowledged_at,
            }
          }),
        })),
      remove: async (id) => {
        const inc = get().incidents.find((i) => i.id === id)
        if (inc?.thumbnailKey) {
          try {
            await idbDel(inc.thumbnailKey)
          } catch {
            // ignore
          }
        }
        set((s) => ({
          incidents: s.incidents.filter((i) => i.id !== id),
        }))
      },
      clear: async () => {
        const all = get().incidents
        await Promise.all(
          all.map(async (i) => {
            if (i.thumbnailKey) {
              try {
                await idbDel(i.thumbnailKey)
              } catch {
                // ignore
              }
            }
          }),
        )
        set({ incidents: [] })
      },
      loadThumbnail: async (id) => {
        const inc = get().incidents.find((i) => i.id === id)
        if (!inc?.thumbnailKey) return null
        try {
          const blob = await idbGet<Blob>(inc.thumbnailKey)
          if (!blob) return null
          return URL.createObjectURL(blob)
        } catch {
          return null
        }
      },
    }),
    {
      name: 'sv:incidents',
      storage: createJSONStorage(() => localStorage),
      // Skip in-flight blob URLs — they're per-session.
      partialize: (s) => ({ incidents: s.incidents }),
    },
  ),
)

export function severityOrder(sev: Severity): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[sev]
}
