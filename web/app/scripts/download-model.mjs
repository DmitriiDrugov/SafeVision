#!/usr/bin/env node
/**
 * Download the YOLOv8n ONNX model into `public/models/` at build time so the
 * deployed app serves the weights from its own origin. Avoids depending on
 * third-party CDNs (HuggingFace Xenova mirror started returning 401 in late
 * 2025) and keeps the demo working offline-after-first-load thanks to
 * Vercel's static-asset caching.
 *
 * Run order:
 *   npm install --legacy-peer-deps
 *   node scripts/download-model.mjs   ← wired as `prebuild`
 *   next build
 *
 * Customize via env:
 *   MODEL_URL     override the source URL
 *   MODEL_OUTPUT  override the output path (default public/models/yolov8n.onnx)
 *   SKIP_MODEL=1  skip the download (CI doesn't always need it)
 */

import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MODEL_URL =
  process.env.MODEL_URL ??
  "https://raw.githubusercontent.com/Hyuto/yolov8-onnxruntime-web/master/public/model/yolov8n.onnx";
const OUTPUT = process.env.MODEL_OUTPUT
  ? resolve(process.env.MODEL_OUTPUT)
  : resolve(ROOT, "public/models/yolov8n.onnx");
// Reject anything smaller — protects against partial downloads / 404 HTML pages
// being saved as the model.
const MIN_BYTES = 1_000_000;

async function alreadyDownloaded() {
  try {
    const info = await stat(OUTPUT);
    if (info.size >= MIN_BYTES) {
      console.log(
        `[download-model] cache hit — ${OUTPUT} (${info.size.toLocaleString()} bytes)`,
      );
      return true;
    }
    console.warn(
      `[download-model] cache file too small (${info.size} bytes), refetching`,
    );
    return false;
  } catch {
    return false;
  }
}

async function download() {
  if (process.env.SKIP_MODEL === "1") {
    console.log("[download-model] SKIP_MODEL=1 — skipping");
    return;
  }
  if (await alreadyDownloaded()) return;

  console.log(`[download-model] fetching ${MODEL_URL}`);
  const response = await fetch(MODEL_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `Model download failed: HTTP ${response.status} ${response.statusText}`,
    );
  }
  if (!response.body) {
    throw new Error("Model download returned an empty body");
  }

  await mkdir(dirname(OUTPUT), { recursive: true });
  const writer = createWriteStream(OUTPUT);

  let written = 0;
  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    writer.write(value);
    written += value.byteLength;
  }
  await new Promise((resolveStream, reject) => {
    writer.end((err) => (err ? reject(err) : resolveStream()));
  });

  if (written < MIN_BYTES) {
    throw new Error(
      `Model download too small (${written} bytes) — refusing to use it`,
    );
  }
  console.log(
    `[download-model] saved ${written.toLocaleString()} bytes → ${OUTPUT}`,
  );
}

download().catch((err) => {
  console.error("[download-model]", err);
  process.exit(1);
});
