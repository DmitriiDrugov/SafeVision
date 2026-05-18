import { VEHICLE_CLASSES } from "@/lib/inference/classes";
import type { Detection } from "@/lib/inference/types";
import type { DemoRule } from "@/lib/stores/rules";
import type { Zone } from "@/lib/api";

export interface EvaluationContext {
  cameraId: string;
  zones: Zone[];
  /** Detections produced by the inference worker for the current frame. */
  detections: Detection[];
  /** Wall clock now (ms). */
  now: number;
}

export interface ConditionMatch {
  /** Rule that fired. */
  ruleId: string;
  /** Zone that the condition matched in — or '' if rule has no zone. */
  zoneId: string;
  zoneName: string;
  /** Detections that participated in the match. */
  detections: Detection[];
  /** Counts per class (for incident metadata). */
  classCounts: Record<string, number>;
}

/**
 * Stateful evaluator — tracks per-rule streaks so the `durationSeconds`
 * threshold and `cooldownSeconds` can be enforced across frames.
 */
export class RuleEvaluator {
  /** rule.id → first match timestamp in the current streak. */
  private streaks = new Map<string, number>();
  /** rule.id → most recent fire timestamp (for cooldown). */
  private lastFire = new Map<string, number>();

  constructor(private readonly getRules: () => DemoRule[]) {}

  /**
   * Evaluate all enabled rules against the current frame. Returns matches
   * whose duration threshold has been met AND whose cooldown has elapsed.
   */
  evaluate(ctx: EvaluationContext): ConditionMatch[] {
    const out: ConditionMatch[] = [];
    const rules = this.getRules().filter((r) => r.enabled);

    for (const rule of rules) {
      if (rule.cameraId && rule.cameraId !== ctx.cameraId) continue;
      const match = this.evalRule(rule, ctx);
      if (!match) {
        this.streaks.delete(rule.id);
        continue;
      }
      const streakStart = this.streaks.get(rule.id) ?? ctx.now;
      if (!this.streaks.has(rule.id)) {
        this.streaks.set(rule.id, ctx.now);
      }
      const heldFor = (ctx.now - streakStart) / 1000;
      if (heldFor < rule.durationSeconds) continue;

      // Default to -Infinity so a rule that has never fired bypasses the
      // cooldown gate (cooldown applies *between* fires, not before the first).
      const last = this.lastFire.get(rule.id) ?? Number.NEGATIVE_INFINITY;
      if ((ctx.now - last) / 1000 < rule.cooldownSeconds) continue;
      this.lastFire.set(rule.id, ctx.now);
      out.push(match);
    }
    return out;
  }

  /** Reset all streaks — useful when switching cameras. */
  reset(): void {
    this.streaks.clear();
    this.lastFire.clear();
  }

  private evalRule(
    rule: DemoRule,
    ctx: EvaluationContext,
  ): ConditionMatch | null {
    const zone =
      rule.zoneId !== null
        ? ctx.zones.find((z) => z.id === rule.zoneId)
        : undefined;

    let detections: Detection[] = ctx.detections;
    if (rule.type === "person_in_zone" || rule.type === "crowd") {
      detections = detections.filter((d) => d.className === "person");
    } else {
      // narrowed: rule.type === 'vehicle_in_pedestrian_zone'
      detections = detections.filter((d) => VEHICLE_CLASSES.has(d.className));
    }
    if (zone) {
      detections = detections.filter((d) =>
        pointInPolygon(centerOf(d), zone.polygon),
      );
    }

    const minCount = rule.type === "crowd" ? Math.max(1, rule.minCount) : 1;
    if (detections.length < minCount) return null;

    const classCounts: Record<string, number> = {};
    for (const d of detections) {
      classCounts[d.className] = (classCounts[d.className] ?? 0) + 1;
    }
    return {
      ruleId: rule.id,
      zoneId: zone?.id ?? "",
      zoneName: zone?.name ?? "whole frame",
      detections,
      classCounts,
    };
  }
}

function centerOf(d: Detection): [number, number] {
  return [d.x + d.w / 2, d.y + d.h / 2];
}

export function pointInPolygon(
  [px, py]: [number, number],
  polygon: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
