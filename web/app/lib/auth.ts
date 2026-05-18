/**
 * Client-side auth helpers.
 *
 * The JWT is stored in a browser cookie (`sv_session`) so Next.js middleware
 * can read it server-side to protect routes without an extra round-trip.
 */

import { API_BASE } from "./api";

export const COOKIE_NAME = "sv_session";

export interface AuthUser {
  username: string;
  role: "operator" | "supervisor" | "admin";
}

// ── Cookie helpers ────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function setToken(token: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Lax; max-age=86400`;
}

export function clearToken(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}

// ── JWT parsing (client-side, no signature verification) ─────────────────

interface JwtPayload {
  sub?: string;
  role?: AuthUser["role"];
  exp?: number;
}

export function parseUser(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as JwtPayload;
    if (!payload.sub || !payload.role) return null;
    const expMs = (payload.exp ?? 0) * 1000;
    if (Date.now() > expMs) return null;
    return { username: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export function getCurrentUser(): AuthUser | null {
  const token = getToken();
  return token ? parseUser(token) : null;
}

// ── Auth API calls ────────────────────────────────────────────────────────

export async function login(
  username: string,
  password: string,
): Promise<AuthUser> {
  const resp = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) {
    const body = (await resp
      .json()
      .catch(() => ({ detail: resp.statusText }))) as {
      detail?: string;
    };
    throw new Error(body.detail ?? "Login failed");
  }
  const data = (await resp.json()) as {
    access_token: string;
    username: string;
    role: string;
  };
  setToken(data.access_token);
  return { username: data.username, role: data.role as AuthUser["role"] };
}

export function logout(): void {
  clearToken();
}

// ── Auth header for API calls ─────────────────────────────────────────────

export function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
