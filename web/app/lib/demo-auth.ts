/**
 * Demo-mode authentication helpers.
 *
 * The session cookie format mirrors a JWT so existing middleware and
 * `getCurrentUser()` work unchanged. The signature is a fixed string; we never
 * verify it — this is a UX shim, not a security boundary.
 */

import { COOKIE_NAME, type AuthUser } from "./auth";

const ENCODER = new TextEncoder();

function base64UrlEncode(input: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(ENCODER.encode(input)).toString("base64url");
  }
  const b64 = btoa(input);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mint a pseudo-JWT with admin role, 30 day expiry, for demo mode. */
export function mintDemoToken(
  username = "demo",
  role: AuthUser["role"] = "admin",
): string {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    sub: username,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    demo: true,
  };
  return [
    base64UrlEncode(JSON.stringify(header)),
    base64UrlEncode(JSON.stringify(payload)),
    "demo",
  ].join(".");
}

export function startDemoSession(
  username = "demo",
  role: AuthUser["role"] = "admin",
): AuthUser {
  const token = mintDemoToken(username, role);
  // 30 days — matches the JWT exp.
  const maxAge = String(30 * 24 * 60 * 60);
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Lax; max-age=${maxAge}`;
  return { username, role };
}
