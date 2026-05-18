import type { Detection } from "./types";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function iou(a: Box, b: Box): number {
  const ax1 = a.x;
  const ay1 = a.y;
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);
  const iw = Math.max(0, interX2 - interX1);
  const ih = Math.max(0, interY2 - interY1);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * Class-aware NMS — only suppress overlapping boxes of the same class.
 * Boxes are expected in normalized [0..1] coords. Sorted by score desc.
 */
export function nms(
  detections: Detection[],
  iouThreshold: number,
): Detection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) {
    let suppressed = false;
    for (const k of kept) {
      if (k.classId !== d.classId) continue;
      if (iou(d, k) > iouThreshold) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) kept.push(d);
  }
  return kept;
}
