import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the multi-stage Docker build (server.js entry point).
  // Harmless on Vercel — they detect Next.js standalone automatically.
  output: "standalone",

  // Lint runs in CI; skipping it during `next build` keeps Docker builds fast
  // and prevents stylistic warnings from blocking image creation.
  eslint: { ignoreDuringBuilds: true },

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
