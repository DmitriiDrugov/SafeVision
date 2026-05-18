import { describe, expect, it } from 'vitest'
import { pointInPolygon, RuleEvaluator } from '@/lib/rules/evaluator'
import type { DemoRule } from '@/lib/stores/rules'
import type { Detection } from '@/lib/inference/types'

function det(
  className: string,
  cx: number,
  cy: number,
  w = 0.05,
  h = 0.1,
): Detection {
  return {
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    classId: 0,
    className,
    score: 0.9,
  }
}

function rule(patch: Partial<DemoRule>): DemoRule {
  return {
    id: patch.id ?? 'r1',
    name: 'test',
    description: '',
    cameraId: null,
    zoneId: null,
    type: 'person_in_zone',
    minCount: 1,
    durationSeconds: 0,
    severity: 'high',
    enabled: true,
    cooldownSeconds: 0,
    createdAt: new Date().toISOString(),
    ...patch,
  }
}

describe('pointInPolygon', () => {
  const square: [number, number][] = [
    [0.2, 0.2],
    [0.6, 0.2],
    [0.6, 0.6],
    [0.2, 0.6],
  ]

  it('returns true for an interior point', () => {
    expect(pointInPolygon([0.4, 0.4], square)).toBe(true)
  })
  it('returns false for an exterior point', () => {
    expect(pointInPolygon([0.7, 0.4], square)).toBe(false)
    expect(pointInPolygon([0.4, 0.7], square)).toBe(false)
  })
  it('handles concave polygons', () => {
    const concave: [number, number][] = [
      [0, 0],
      [0.4, 0],
      [0.4, 0.4],
      [0.6, 0.4],
      [0.6, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    expect(pointInPolygon([0.5, 0.2], concave)).toBe(false)
    expect(pointInPolygon([0.5, 0.7], concave)).toBe(true)
  })
})

describe('RuleEvaluator', () => {
  it('fires person_in_zone when a person is anywhere in frame', () => {
    const r = rule({ type: 'person_in_zone', minCount: 1 })
    const evaluator = new RuleEvaluator(() => [r])
    const out = evaluator.evaluate({
      cameraId: 'cam01',
      zones: [],
      detections: [det('person', 0.5, 0.5)],
      now: 1000,
    })
    expect(out).toHaveLength(1)
    expect(out[0].ruleId).toBe(r.id)
    expect(out[0].classCounts.person).toBe(1)
  })

  it('does not fire person_in_zone when only a car is present', () => {
    const r = rule({ type: 'person_in_zone' })
    const evaluator = new RuleEvaluator(() => [r])
    const out = evaluator.evaluate({
      cameraId: 'cam01',
      zones: [],
      detections: [det('car', 0.5, 0.5)],
      now: 1000,
    })
    expect(out).toEqual([])
  })

  it('respects zone polygon — fires only when detection center is inside', () => {
    const r = rule({ type: 'person_in_zone', zoneId: 'z1' })
    const zones = [
      {
        id: 'z1',
        name: 'restricted',
        polygon: [
          [0.0, 0.0],
          [0.5, 0.0],
          [0.5, 0.5],
          [0.0, 0.5],
        ] as [number, number][],
      },
    ]
    const evaluator = new RuleEvaluator(() => [r])
    const inside = evaluator.evaluate({
      cameraId: 'cam01',
      zones,
      detections: [det('person', 0.2, 0.2)],
      now: 1000,
    })
    const outside = evaluator.evaluate({
      cameraId: 'cam01',
      zones,
      detections: [det('person', 0.8, 0.8)],
      now: 2000,
    })
    expect(inside).toHaveLength(1)
    expect(outside).toEqual([])
  })

  it('crowd rule needs min_count people', () => {
    const r = rule({ type: 'crowd', minCount: 3 })
    const evaluator = new RuleEvaluator(() => [r])
    const not_enough = evaluator.evaluate({
      cameraId: 'cam01',
      zones: [],
      detections: [det('person', 0.1, 0.1), det('person', 0.2, 0.2)],
      now: 1000,
    })
    const enough = evaluator.evaluate({
      cameraId: 'cam01',
      zones: [],
      detections: [
        det('person', 0.1, 0.1),
        det('person', 0.2, 0.2),
        det('person', 0.3, 0.3),
      ],
      now: 2000,
    })
    expect(not_enough).toEqual([])
    expect(enough).toHaveLength(1)
  })

  it('vehicle_in_pedestrian_zone fires only for vehicle classes', () => {
    const r = rule({ type: 'vehicle_in_pedestrian_zone' })
    const evaluator = new RuleEvaluator(() => [r])
    const person = evaluator.evaluate({
      cameraId: 'cam01',
      zones: [],
      detections: [det('person', 0.5, 0.5)],
      now: 1000,
    })
    const car = evaluator.evaluate({
      cameraId: 'cam01',
      zones: [],
      detections: [det('car', 0.5, 0.5)],
      now: 2000,
    })
    expect(person).toEqual([])
    expect(car).toHaveLength(1)
  })

  it('enforces duration threshold across frames', () => {
    const r = rule({
      type: 'person_in_zone',
      durationSeconds: 1,
      cooldownSeconds: 0,
    })
    const evaluator = new RuleEvaluator(() => [r])
    // First frame at t=0 — match observed but not held long enough yet.
    expect(
      evaluator.evaluate({
        cameraId: 'cam01',
        zones: [],
        detections: [det('person', 0.5, 0.5)],
        now: 0,
      }),
    ).toEqual([])
    // 1.1s later — streak now exceeds 1s threshold.
    expect(
      evaluator.evaluate({
        cameraId: 'cam01',
        zones: [],
        detections: [det('person', 0.5, 0.5)],
        now: 1100,
      }),
    ).toHaveLength(1)
  })

  it('enforces cooldown after a fire', () => {
    const r = rule({
      type: 'person_in_zone',
      durationSeconds: 0,
      cooldownSeconds: 5,
    })
    const evaluator = new RuleEvaluator(() => [r])
    expect(
      evaluator.evaluate({
        cameraId: 'cam01',
        zones: [],
        detections: [det('person', 0.5, 0.5)],
        now: 0,
      }),
    ).toHaveLength(1)
    // 2s later — still cooling down.
    expect(
      evaluator.evaluate({
        cameraId: 'cam01',
        zones: [],
        detections: [det('person', 0.5, 0.5)],
        now: 2000,
      }),
    ).toEqual([])
    // 6s later — cooldown elapsed, fires again.
    expect(
      evaluator.evaluate({
        cameraId: 'cam01',
        zones: [],
        detections: [det('person', 0.5, 0.5)],
        now: 6100,
      }),
    ).toHaveLength(1)
  })

  it('respects rule.cameraId scoping', () => {
    const r = rule({ type: 'person_in_zone', cameraId: 'cam01' })
    const evaluator = new RuleEvaluator(() => [r])
    const wrong_cam = evaluator.evaluate({
      cameraId: 'cam02',
      zones: [],
      detections: [det('person', 0.5, 0.5)],
      now: 0,
    })
    expect(wrong_cam).toEqual([])
  })

  it('skips disabled rules entirely', () => {
    const r = rule({ type: 'person_in_zone', enabled: false })
    const evaluator = new RuleEvaluator(() => [r])
    expect(
      evaluator.evaluate({
        cameraId: 'cam01',
        zones: [],
        detections: [det('person', 0.5, 0.5)],
        now: 0,
      }),
    ).toEqual([])
  })
})
