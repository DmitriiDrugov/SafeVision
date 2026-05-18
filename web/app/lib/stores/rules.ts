'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Severity } from '@/lib/api'

/**
 * Browser-side rule shape. Intentionally simpler than the Pydantic schema in
 * `shared/schemas/rule.py` — we only need conditions that a YOLOv8n COCO model
 * can satisfy.
 */
export type DemoRuleConditionType =
  | 'person_in_zone' // any person inside zone
  | 'crowd' // >= min_count persons inside zone
  | 'vehicle_in_pedestrian_zone' // car/truck/bus/motorcycle in pedestrian zone

export interface DemoRule {
  id: string
  name: string
  description: string
  cameraId: string | null // null = applies to all cameras
  zoneId: string | null // null = applies to whole frame
  type: DemoRuleConditionType
  /** Used by `crowd` only. */
  minCount: number
  /** Min seconds the condition must hold continuously before firing. */
  durationSeconds: number
  severity: Severity
  enabled: boolean
  /** Cooldown — minimum seconds between incidents from the same rule. */
  cooldownSeconds: number
  createdAt: string
}

const DEFAULTS: Omit<DemoRule, 'id' | 'createdAt'>[] = [
  {
    name: 'Person in restricted zone',
    description:
      'Fires when at least one person is detected inside the configured zone.',
    cameraId: null,
    zoneId: null,
    type: 'person_in_zone',
    minCount: 1,
    durationSeconds: 1,
    severity: 'high',
    enabled: true,
    cooldownSeconds: 8,
  },
  {
    name: 'Crowding (3+ people)',
    description:
      'Fires when three or more persons are inside the same zone simultaneously.',
    cameraId: null,
    zoneId: null,
    type: 'crowd',
    minCount: 3,
    durationSeconds: 2,
    severity: 'medium',
    enabled: true,
    cooldownSeconds: 15,
  },
  {
    name: 'Vehicle in pedestrian corridor',
    description:
      'Fires when a car, truck, bus, or motorcycle enters a pedestrian zone.',
    cameraId: null,
    zoneId: null,
    type: 'vehicle_in_pedestrian_zone',
    minCount: 1,
    durationSeconds: 1,
    severity: 'critical',
    enabled: true,
    cooldownSeconds: 8,
  },
]

interface RulesState {
  rules: DemoRule[]
  add: (input: Partial<DemoRule>) => DemoRule
  update: (id: string, patch: Partial<DemoRule>) => void
  remove: (id: string) => void
  seed: () => void
  reset: () => void
}

function makeRule(input: Partial<DemoRule>): DemoRule {
  return {
    id: input.id ?? crypto.randomUUID(),
    name: input.name ?? 'Untitled rule',
    description: input.description ?? '',
    cameraId: input.cameraId ?? null,
    zoneId: input.zoneId ?? null,
    type: input.type ?? 'person_in_zone',
    minCount: input.minCount ?? 1,
    durationSeconds: input.durationSeconds ?? 1,
    severity: input.severity ?? 'medium',
    enabled: input.enabled ?? true,
    cooldownSeconds: input.cooldownSeconds ?? 10,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

export const useRulesStore = create<RulesState>()(
  persist(
    (set, get) => ({
      rules: [],
      add: (input) => {
        const r = makeRule(input)
        set((s) => ({ rules: [...s.rules, r] }))
        return r
      },
      update: (id, patch) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),
      remove: (id) =>
        set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      seed: () => {
        if (get().rules.length > 0) return
        set({ rules: DEFAULTS.map((d) => makeRule(d)) })
      },
      reset: () => set({ rules: DEFAULTS.map((d) => makeRule(d)) }),
    }),
    {
      name: 'sv:rules',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
