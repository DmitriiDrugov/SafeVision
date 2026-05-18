/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web'
import { COCO_CLASSES } from './classes'
import { nms } from './nms'
import type { Detection, WorkerInbound, WorkerOutbound } from './types'

declare const self: DedicatedWorkerGlobalScope

const INPUT_SIZE = 640
const CONF_THRESHOLD = 0.35
const IOU_THRESHOLD = 0.5

let session: ort.InferenceSession | null = null
let busy = false
/** Reusable buffer to avoid GC churn — 1×3×640×640 RGB float32. */
const inputData = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE)
let inputTensor: ort.Tensor | null = null
let offscreen: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null

function post(msg: WorkerOutbound): void {
  self.postMessage(msg)
}

async function loadModel(modelUrl: string, wasmPaths: string): Promise<void> {
  ort.env.wasm.wasmPaths = wasmPaths
  // SharedArrayBuffer (multi-threaded WASM) requires cross-origin isolation.
  // We set headers for /publish and /cameras/[id]/live in next.config.ts, but
  // be defensive: only spin up threads if SAB is actually available.
  const sabAvailable = typeof SharedArrayBuffer !== 'undefined'
  ort.env.wasm.numThreads = sabAvailable
    ? Math.min(4, self.navigator.hardwareConcurrency || 2)
    : 1

  const response = await fetch(modelUrl)
  if (!response.ok) {
    throw new Error(`Failed to download model: HTTP ${String(response.status)}`)
  }
  const total = Number(response.headers.get('Content-Length') ?? 0)
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Streaming download not supported by browser')
  }
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    post({ type: 'progress', loaded, total })
  }
  const buffer = new Uint8Array(loaded)
  let offset = 0
  for (const c of chunks) {
    buffer.set(c, offset)
    offset += c.byteLength
  }

  // Prefer WebGPU (fastest), fall back to WASM (SIMD + threads).
  const backendCandidates: ort.InferenceSession.SessionOptions[] = [
    { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' },
    {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: false,
    },
  ]
  let lastErr: Error | null = null
  for (const opts of backendCandidates) {
    try {
      session = await ort.InferenceSession.create(buffer, opts)
      inputTensor = new ort.Tensor('float32', inputData, [
        1,
        3,
        INPUT_SIZE,
        INPUT_SIZE,
      ])
      const backend = String(opts.executionProviders?.[0] ?? 'wasm')
      post({ type: 'ready', inputSize: INPUT_SIZE, backend })
      return
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('Failed to initialize ONNX session')
}

interface LetterboxMeta {
  scale: number
  padX: number
  padY: number
}

function letterboxToInput(
  bitmap: ImageBitmap,
  srcWidth: number,
  srcHeight: number,
): LetterboxMeta {
  if (!offscreen) {
    offscreen = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE)
    ctx = offscreen.getContext('2d', { willReadFrequently: true })
  }
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')

  const scale = Math.min(INPUT_SIZE / srcWidth, INPUT_SIZE / srcHeight)
  const drawW = srcWidth * scale
  const drawH = srcHeight * scale
  const padX = (INPUT_SIZE - drawW) / 2
  const padY = (INPUT_SIZE - drawH) / 2

  ctx.fillStyle = '#727272' // YOLO's standard letterbox grey
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
  ctx.drawImage(bitmap, padX, padY, drawW, drawH)

  // Pull pixels and pack into CHW float32 0..1.
  const img = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
  const px = img.data
  const plane = INPUT_SIZE * INPUT_SIZE
  for (let i = 0; i < plane; i++) {
    const r = px[i * 4]
    const g = px[i * 4 + 1]
    const b = px[i * 4 + 2]
    inputData[i] = r / 255
    inputData[i + plane] = g / 255
    inputData[i + plane * 2] = b / 255
  }
  return { scale, padX, padY }
}

function postprocess(
  output: ort.Tensor,
  meta: LetterboxMeta,
  srcWidth: number,
  srcHeight: number,
): Detection[] {
  // YOLOv8 ONNX export emits shape [1, 84, N] where 84 = 4 box coords + 80
  // class scores (no objectness term). We need to transpose-walk it.
  const data = output.data as Float32Array
  const dims = output.dims // [1, 84, N]
  const numClasses = COCO_CLASSES.length // 80
  if (dims.length !== 3 || dims[1] !== 4 + numClasses) {
    throw new Error(`Unexpected output shape: ${dims.join('x')}`)
  }
  const numBoxes = dims[2]
  const out: Detection[] = []

  for (let i = 0; i < numBoxes; i++) {
    // Find best class score for this box.
    let bestScore = 0
    let bestClass = -1
    for (let c = 0; c < numClasses; c++) {
      const score = data[(4 + c) * numBoxes + i]
      if (score > bestScore) {
        bestScore = score
        bestClass = c
      }
    }
    if (bestScore < CONF_THRESHOLD || bestClass < 0) continue

    const cx = data[0 * numBoxes + i]
    const cy = data[1 * numBoxes + i]
    const w = data[2 * numBoxes + i]
    const h = data[3 * numBoxes + i]

    // Convert from xywh in 640-space to xyxy in source-space then normalize.
    const x1px = (cx - w / 2 - meta.padX) / meta.scale
    const y1px = (cy - h / 2 - meta.padY) / meta.scale
    const wpx = w / meta.scale
    const hpx = h / meta.scale
    const x = Math.max(0, x1px / srcWidth)
    const y = Math.max(0, y1px / srcHeight)
    const ww = Math.min(1 - x, wpx / srcWidth)
    const hh = Math.min(1 - y, hpx / srcHeight)
    if (ww <= 0 || hh <= 0) continue

    out.push({
      x,
      y,
      w: ww,
      h: hh,
      classId: bestClass,
      className: COCO_CLASSES[bestClass],
      score: bestScore,
    })
  }
  return nms(out, IOU_THRESHOLD)
}

async function runInference(
  bitmap: ImageBitmap,
  srcWidth: number,
  srcHeight: number,
): Promise<Detection[]> {
  if (!session || !inputTensor) throw new Error('Session not initialized')
  const meta = letterboxToInput(bitmap, srcWidth, srcHeight)
  const feeds: Record<string, ort.Tensor> = {
    [session.inputNames[0]]: inputTensor,
  }
  const output = await session.run(feeds)
  const first = output[session.outputNames[0]]
  return postprocess(first, meta, srcWidth, srcHeight)
}

self.onmessage = async (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data
  try {
    if (msg.type === 'init') {
      await loadModel(msg.modelUrl, msg.wasmPaths)
      return
    }
    if (msg.type === 'reset') {
      busy = false
      return
    }
    // narrowed: msg.type === 'frame'
    if (busy || !session) {
      msg.bitmap.close()
      return
    }
    busy = true
    const t0 = performance.now()
    try {
      const detections = await runInference(
        msg.bitmap,
        msg.srcWidth,
        msg.srcHeight,
      )
      const latencyMs = performance.now() - t0
      post({
        type: 'result',
        ts: msg.ts,
        detections,
        latencyMs,
      })
    } finally {
      msg.bitmap.close()
      busy = false
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    post({ type: 'error', message })
  }
}

export {}
