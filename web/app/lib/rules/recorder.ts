'use client'

import { nanoid } from 'nanoid'
import { useCamerasStore } from '@/lib/stores/cameras'
import { useIncidentsStore, type DemoIncident } from '@/lib/stores/incidents'
import { useRulesStore } from '@/lib/stores/rules'
import type { ConditionMatch } from './evaluator'

interface CaptureSource {
  /** Video element or any canvas-drawable source. Used for the thumbnail. */
  source: CanvasImageSource
  /** Source dimensions (so we can scale the thumbnail correctly). */
  width: number
  height: number
}

/**
 * Persist a rule match as an `Incident` plus a 320×180 JPEG thumbnail.
 *
 * Designed to be called from inside an inference frame loop — all I/O is
 * fire-and-forget so we never block frame processing.
 */
export async function recordIncident(
  match: ConditionMatch,
  cameraId: string,
  capture: CaptureSource,
): Promise<void> {
  const rule = useRulesStore.getState().rules.find((r) => r.id === match.ruleId)
  const camera = useCamerasStore
    .getState()
    .cameras.find((c) => c.id === cameraId)
  if (!rule || !camera) return

  const thumbnail = await snapshotJpeg(capture, 320, 180, 0.7)
  const incident: DemoIncident = {
    id: nanoid(12),
    rule_id: rule.id,
    ruleName: rule.name,
    camera_id: cameraId,
    cameraName: camera.name,
    zone_id: match.zoneId,
    detected_at: new Date().toISOString(),
    severity: rule.severity,
    status: 'open',
    acknowledged_by: null,
    acknowledged_at: null,
    clip_url: null,
    thumbnailKey: null,
    classCounts: match.classCounts,
  }
  await useIncidentsStore.getState().add(incident, thumbnail ?? undefined)
}

async function snapshotJpeg(
  capture: CaptureSource,
  outW: number,
  outH: number,
  quality: number,
): Promise<Blob | null> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Letterbox: maintain aspect ratio of source within outW×outH.
    const srcRatio = capture.width / capture.height
    const dstRatio = outW / outH
    let drawW = outW
    let drawH = outH
    let drawX = 0
    let drawY = 0
    if (srcRatio > dstRatio) {
      drawH = Math.round(outW / srcRatio)
      drawY = Math.floor((outH - drawH) / 2)
    } else {
      drawW = Math.round(outH * srcRatio)
      drawX = Math.floor((outW - drawW) / 2)
    }
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, outW, outH)
    ctx.drawImage(capture.source, drawX, drawY, drawW, drawH)

    return await new Promise<Blob | null>((resolve) =>
      { canvas.toBlob((b) => { resolve(b); }, 'image/jpeg', quality); },
    )
  } catch {
    return null
  }
}

export async function snapshotDataUrl(
  capture: CaptureSource,
  outW: number,
  outH: number,
  quality = 0.6,
): Promise<string | null> {
  const blob = await snapshotJpeg(capture, outW, outH, quality)
  if (!blob) return null
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => { resolve(reader.result as string); }
    reader.onerror = () => { resolve(null); }
    reader.readAsDataURL(blob)
  })
}
