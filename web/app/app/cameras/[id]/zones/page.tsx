"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, Trash2, X } from "lucide-react";
import type { Zone } from "@/lib/api";
import { useCamerasStore } from "@/lib/stores/cameras";
import { nanoid } from "nanoid";

type Point = [number, number];

interface DraftZone {
  vertices: Point[];
  closed: boolean;
}

const ZONE_COLORS = [
  "#00D4FF",
  "#10b981",
  "#facc15",
  "#f97316",
  "#ef4444",
  "#a78bfa",
];

const CANVAS_W = 800;
const CANVAS_H = 450;

export default function ZoneEditorPage(): React.ReactElement {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const camera = useCamerasStore((s) =>
    id ? (s.cameras.find((c) => c.id === id) ?? null) : null,
  );
  const setZonesPersisted = useCamerasStore((s) => s.setZones);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [draft, setDraft] = useState<DraftZone | null>(null);
  const [draftName, setDraftName] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (camera) setZones(camera.zones);
  }, [camera]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background reference: thumbnail of the camera if we have one, else grid.
    if (camera?.thumbnail) {
      const img = new Image();
      img.onload = (): void => {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        ctx.globalAlpha = 1;
        paintZones(ctx, zones, draft);
      };
      img.src = camera.thumbnail;
    } else {
      ctx.fillStyle = "#06080d";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= CANVAS_W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_H);
        ctx.stroke();
      }
      for (let y = 0; y <= CANVAS_H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_W, y);
        ctx.stroke();
      }
      paintZones(ctx, zones, draft);
    }
  }, [zones, draft, camera?.thumbnail]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (draft?.closed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) * (CANVAS_W / rect.width)) / CANVAS_W;
    const ny = ((e.clientY - rect.top) * (CANVAS_H / rect.height)) / CANVAS_H;
    if (!draft) {
      setDraft({ vertices: [[nx, ny]], closed: false });
      return;
    }
    const [fx, fy] = draft.vertices[0];
    const distPx = Math.hypot((nx - fx) * CANVAS_W, (ny - fy) * CANVAS_H);
    if (draft.vertices.length >= 3 && distPx < 14) {
      setDraft({ ...draft, closed: true });
      return;
    }
    setDraft({ ...draft, vertices: [...draft.vertices, [nx, ny]] });
  };

  const commitDraft = (): void => {
    if (!draft?.closed || !draftName.trim()) return;
    const slug = draftName.trim().toLowerCase().replace(/\s+/g, "_");
    const zone: Zone = {
      id: `${slug}-${nanoid(4)}`,
      name: draftName.trim(),
      polygon: draft.vertices,
    };
    setZones((prev) => [...prev, zone]);
    setDraft(null);
    setDraftName("");
  };

  const discardDraft = (): void => {
    setDraft(null);
    setDraftName("");
  };

  const removeZone = (idx: number): void => {
    setZones((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = (): void => {
    if (!id) return;
    setZonesPersisted(id, zones);
    router.push(`/cameras/${encodeURIComponent(id)}/live`);
  };

  if (!mounted) {
    return <div className="text-sm text-ink-400">Loading…</div>;
  }
  if (!camera) {
    return (
      <div className="space-y-3">
        <Link
          href="/cameras"
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to cameras
        </Link>
        <div className="rounded-md surface px-4 py-6 text-sm text-ink-300">
          Camera not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/cameras/${encodeURIComponent(camera.id)}/live`}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs text-ink-300 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Live view
          </Link>
          <h1 className="text-lg font-semibold text-white">
            Zone editor — {camera.name}
          </h1>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400"
        >
          <Check className="h-4 w-4" />
          Save zones
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="surface overflow-hidden rounded-xl">
          <p className="border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-wider text-ink-400">
            Click to add vertices · Click the first vertex (or anywhere near it)
            to close the polygon
          </p>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onClick={handleClick}
            className="w-full cursor-crosshair bg-black"
            style={{ aspectRatio: `${String(CANVAS_W)} / ${String(CANVAS_H)}` }}
          />
        </div>

        <aside className="space-y-3">
          <section className="surface rounded-lg p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
              New zone
            </div>
            {!draft && (
              <p className="text-xs text-ink-400">
                Click anywhere on the canvas to start drawing.
              </p>
            )}
            {draft && !draft.closed && (
              <div className="space-y-2 text-xs text-ink-200">
                <p>
                  {draft.vertices.length} vertices · click first dot to close.
                </p>
                <button
                  onClick={discardDraft}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-ink-300 hover:bg-white/5"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              </div>
            )}
            {draft?.closed && (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => {
                    setDraftName(e.target.value);
                  }}
                  placeholder="Zone name (e.g., loading_bay)"
                  className="w-full rounded-md surface-input px-2 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={commitDraft}
                    disabled={!draftName.trim()}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                    Add zone
                  </button>
                  <button
                    onClick={discardDraft}
                    className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-ink-300 hover:bg-white/5"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="surface rounded-lg p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                Zones
              </div>
              <span className="text-[10px] text-ink-500">{zones.length}</span>
            </div>
            {zones.length === 0 ? (
              <p className="text-xs text-ink-500">No zones yet.</p>
            ) : (
              <ul className="space-y-1">
                {zones.map((z, idx) => (
                  <li
                    key={z.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{
                          backgroundColor:
                            ZONE_COLORS[idx % ZONE_COLORS.length],
                        }}
                      />
                      <span className="truncate text-ink-100">{z.name}</span>
                    </span>
                    <button
                      onClick={() => {
                        removeZone(idx);
                      }}
                      className="rounded p-1 text-ink-400 hover:bg-severity-critical/15 hover:text-severity-critical"
                      aria-label={`Remove ${z.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function paintZones(
  ctx: CanvasRenderingContext2D,
  zones: Zone[],
  draft: DraftZone | null,
): void {
  zones.forEach((zone, idx) => {
    const color = ZONE_COLORS[idx % ZONE_COLORS.length];
    if (zone.polygon.length < 2) return;
    ctx.beginPath();
    zone.polygon.forEach(([nx, ny], i) => {
      const x = nx * CANVAS_W;
      const y = ny * CANVAS_H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = color + "22";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    const cx =
      (zone.polygon.reduce((s, [x]) => s + x, 0) / zone.polygon.length) *
      CANVAS_W;
    const cy =
      (zone.polygon.reduce((s, [, y]) => s + y, 0) / zone.polygon.length) *
      CANVAS_H;
    ctx.fillStyle = color;
    ctx.font = "600 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(zone.name, cx, cy);
  });

  if (draft && draft.vertices.length > 0) {
    ctx.beginPath();
    draft.vertices.forEach(([nx, ny], i) => {
      const x = nx * CANVAS_W;
      const y = ny * CANVAS_H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#00D4FF";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    draft.vertices.forEach(([nx, ny], i) => {
      const x = nx * CANVAS_W;
      const y = ny * CANVAS_H;
      ctx.beginPath();
      ctx.arc(x, y, i === 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#00D4FF" : "#80e7ff";
      ctx.fill();
      ctx.strokeStyle = "#06080d";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }
}
