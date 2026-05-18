"use client";

import { buildPalette, type ClassPalette } from "./classes";
import type { Detection } from "./types";

const PALETTE: ClassPalette = buildPalette();

interface DrawOpts {
  /** When true, draws zone polygons under the boxes. */
  zones?: Array<{ id: string; name: string; polygon: [number, number][] }>;
  /** When true, draws an FPS overlay top-right. */
  fps?: number;
  /** Latency in ms to show near FPS. */
  latencyMs?: number;
}

/**
 * Render bounding boxes + labels + (optional) zones to the supplied canvas
 * context. Coordinates in `detections` are normalized [0..1].
 */
export function drawDetections(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  detections: Detection[],
  opts: DrawOpts = {},
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Zones first (under boxes).
  if (opts.zones?.length) {
    for (const z of opts.zones) {
      if (z.polygon.length < 3) continue;
      ctx.beginPath();
      for (let i = 0; i < z.polygon.length; i++) {
        const [nx, ny] = z.polygon[i];
        const x = nx * canvasWidth;
        const y = ny * canvasHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 212, 255, 0.08)";
      ctx.strokeStyle = "rgba(0, 212, 255, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      // Zone label.
      const [fx, fy] = z.polygon[0];
      ctx.font = "600 10px Inter, sans-serif";
      ctx.fillStyle = "#7CE3FF";
      ctx.fillText(
        z.name.toUpperCase(),
        fx * canvasWidth + 4,
        fy * canvasHeight + 12,
      );
    }
  }

  // Detection boxes + labels.
  ctx.lineWidth = 2;
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textBaseline = "top";
  for (const d of detections) {
    const x = d.x * canvasWidth;
    const y = d.y * canvasHeight;
    const w = d.w * canvasWidth;
    const h = d.h * canvasHeight;
    const color = PALETTE[d.className] ?? "#00D4FF";

    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);

    // Label pill.
    const label = `${d.className} ${(d.score * 100).toFixed(0)}%`;
    const metrics = ctx.measureText(label);
    const padX = 4;
    const padY = 2;
    const labelH = 14;
    const labelW = metrics.width + padX * 2;
    const labelY = Math.max(0, y - labelH);
    ctx.fillStyle = color;
    ctx.fillRect(x, labelY, labelW, labelH);
    ctx.fillStyle = "#06080d";
    ctx.fillText(label, x + padX, labelY + padY);
  }

  // FPS / latency badge.
  if (opts.fps !== undefined || opts.latencyMs !== undefined) {
    const text = [
      opts.fps !== undefined ? `${opts.fps.toFixed(1)} fps` : null,
      opts.latencyMs !== undefined ? `${opts.latencyMs.toFixed(0)} ms` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const padding = 6;
    ctx.font = "500 10px JetBrains Mono, monospace";
    const w = ctx.measureText(text).width + padding * 2;
    ctx.fillStyle = "rgba(6, 8, 13, 0.7)";
    ctx.fillRect(canvasWidth - w - 8, 8, w, 18);
    ctx.fillStyle = "#80e7ff";
    ctx.fillText(text, canvasWidth - w - 8 + padding, 13);
  }
}
