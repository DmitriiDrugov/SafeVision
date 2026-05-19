import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cfgDir = dirname(fileURLToPath(import.meta.url));

// Inject the installed onnxruntime-web version so the WASM CDN URL in
// lib/inference/client.ts stays in lockstep with the JS glue bundled from
// node_modules. A mismatch (e.g. JS 1.26 + WASM 1.20) surfaces as a cryptic
// minified "r.getValue is not a function" inside the inference worker.
function resolveOrtVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(
        resolve(cfgDir, "node_modules/onnxruntime-web/package.json"),
        "utf8",
      ),
    ) as { version?: unknown };
    if (typeof pkg.version === "string") return pkg.version;
  } catch {
    // node_modules absent during certain CI steps — fall through.
  }
  return "1.20.0";
}

const nextConfig: NextConfig = {
  // Required for the multi-stage Docker build (server.js entry point).
  // Harmless on Vercel — they detect Next.js standalone automatically.
  output: "standalone",

  // Lint runs in CI; skipping it during `next build` keeps Docker builds fast
  // and prevents stylistic warnings from blocking image creation.
  eslint: { ignoreDuringBuilds: true },

  env: {
    NEXT_PUBLIC_ORT_VERSION: resolveOrtVersion(),
  },

  // onnxruntime-web ships .wasm and .mjs assets. Allowing the package to
  // bundle them is the simplest path for both Vercel and `next build`.
  // We load weights and WASM from a CDN at runtime (see lib/inference/model.ts),
  // so no special webpack copy step is needed here.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // onnxruntime-web tries to require `fs` and `path` for the Node backend
      // — stub them out so the browser bundle stays small.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },

  // Strict cross-origin isolation lets us use SharedArrayBuffer in workers,
  // which onnxruntime-web requires for multi-threaded WASM. Only applies to
  // pages that need it — set at runtime via headers() on the live page.
  async headers() {
    return [
      {
        source: "/cameras/:id/live",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        source: "/publish/:peer",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
