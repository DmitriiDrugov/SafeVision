/**
 * Runtime environment + capability flags.
 *
 * `isDemoMode()` is the single source of truth for "should we hit HTTP backend
 * or fall through to the client-side store?". A `true` here unlocks the
 * stand-alone Vercel showcase mode (no Python services running).
 */

export const ENV = {
  demoMode:
    (process.env.NEXT_PUBLIC_DEMO_MODE ?? "").toLowerCase() === "true" ||
    !process.env.NEXT_PUBLIC_API_URL,
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "SafeVision",
  peer: {
    host: process.env.NEXT_PUBLIC_PEER_HOST ?? "0.peerjs.com",
    port: Number(process.env.NEXT_PUBLIC_PEER_PORT ?? 443),
    secure:
      (process.env.NEXT_PUBLIC_PEER_SECURE ?? "true").toLowerCase() === "true",
  },
} as const;

export const isDemoMode = (): boolean => ENV.demoMode;
