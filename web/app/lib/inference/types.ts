/**
 * Wire types shared between the main thread and the inference Web Worker.
 *
 * Coordinates in `Detection` are normalized to the original (un-letterboxed)
 * source frame [0..1] so the overlay can scale them to whatever video element
 * is rendering the stream.
 */

export interface Detection {
  /** Top-left x, normalized [0..1]. */
  x: number
  /** Top-left y, normalized [0..1]. */
  y: number
  /** Width, normalized [0..1]. */
  w: number
  /** Height, normalized [0..1]. */
  h: number
  classId: number
  className: string
  score: number
}

export type WorkerInbound =
  | {
      type: 'init'
      modelUrl: string
      wasmPaths: string
    }
  | {
      type: 'frame'
      /** OffscreenCanvas with the current video frame already drawn into it. */
      bitmap: ImageBitmap
      /** Wall-clock timestamp of the capture (ms). */
      ts: number
      /** Source frame dimensions, used to back-project boxes. */
      srcWidth: number
      srcHeight: number
    }
  | {
      type: 'reset'
    }

export type WorkerOutbound =
  | {
      type: 'progress'
      loaded: number
      total: number
    }
  | {
      type: 'ready'
      inputSize: number
      backend: string
    }
  | {
      type: 'result'
      ts: number
      detections: Detection[]
      latencyMs: number
    }
  | {
      type: 'error'
      message: string
    }
