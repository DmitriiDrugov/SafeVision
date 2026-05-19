"use client";

import type { Detection, WorkerInbound, WorkerOutbound } from "./types";

// Model is downloaded into `public/models/` at build time by
// `scripts/download-model.mjs` so we always fetch it from our own origin.
// `NEXT_PUBLIC_MODEL_URL` overrides this for testing.
const MODEL_URL = process.env.NEXT_PUBLIC_MODEL_URL ?? "/models/yolov8n.onnx";
// onnxruntime-web's WASM shards stay on a CDN — they're tiny and shared across
// all visitors of the public jsDelivr cache. The version is injected by
// next.config.ts from the installed npm package so the WASM ABI always matches
// the JS glue Webpack bundled into the worker.
const ORT_VERSION = process.env.NEXT_PUBLIC_ORT_VERSION ?? "1.20.0";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

type ProgressHandler = (loaded: number, total: number) => void;
type ReadyHandler = (info: { inputSize: number; backend: string }) => void;
type ResultHandler = (result: {
  ts: number;
  detections: Detection[];
  latencyMs: number;
}) => void;
type ErrorHandler = (err: Error) => void;

export interface InferenceClient {
  /** Submit a frame for inference. Drops the frame silently if the worker is busy. */
  submit: (bitmap: ImageBitmap, srcWidth: number, srcHeight: number) => void;
  /** Tear down the worker. */
  destroy: () => void;
  /** True once the model has been loaded and the session is ready. */
  isReady: () => boolean;
}

interface CreateOpts {
  onProgress?: ProgressHandler;
  onReady?: ReadyHandler;
  onResult: ResultHandler;
  onError?: ErrorHandler;
}

export function createInferenceClient(opts: CreateOpts): InferenceClient {
  let ready = false;

  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
    const msg = event.data;
    if (msg.type === "progress") {
      opts.onProgress?.(msg.loaded, msg.total);
    } else if (msg.type === "ready") {
      ready = true;
      opts.onReady?.({ inputSize: msg.inputSize, backend: msg.backend });
    } else if (msg.type === "result") {
      opts.onResult({
        ts: msg.ts,
        detections: msg.detections,
        latencyMs: msg.latencyMs,
      });
    } else {
      // narrowed: msg.type === 'error'
      opts.onError?.(new Error(msg.message));
    }
  };
  worker.onerror = (e): void => {
    opts.onError?.(new Error(e.message || "Inference worker crashed"));
  };

  const init: WorkerInbound = {
    type: "init",
    modelUrl: MODEL_URL,
    wasmPaths: WASM_BASE,
  };
  worker.postMessage(init);

  return {
    submit(bitmap, srcWidth, srcHeight) {
      if (!ready) {
        bitmap.close();
        return;
      }
      const msg: WorkerInbound = {
        type: "frame",
        bitmap,
        ts: performance.now(),
        srcWidth,
        srcHeight,
      };
      worker.postMessage(msg, [bitmap]);
    },
    destroy() {
      worker.terminate();
      ready = false;
    },
    isReady() {
      return ready;
    },
  };
}
