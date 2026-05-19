"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { customAlphabet, nanoid } from "nanoid";
import type { Zone } from "@/lib/api";

export type CameraStatus = "pairing" | "live" | "offline";

export interface DemoCamera {
  id: string;
  name: string;
  /** PeerJS peer id used to pair with the publisher. */
  peerId: string;
  status: CameraStatus;
  enabled: boolean;
  zones: Zone[];
  createdAt: string;
  lastSeenAt: string | null;
  /** Optional cached thumbnail data URL — small JPEG of the latest frame. */
  thumbnail: string | null;
}

/**
 * PeerJS rejects IDs that don't match
 * `/^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/` — consecutive separators
 * (`--`, `__`, ` -`, ...) are invalid. nanoid's default alphabet
 * includes `-` and `_`, which makes consecutive separators possible.
 * Use an alphanumeric-only alphabet so the ID is *always* valid.
 */
const PEER_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const peerNanoid = customAlphabet(PEER_ALPHABET, 12);

const PEER_ID_RE = /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/;

export function generatePeerId(): string {
  return `sv${peerNanoid()}`;
}

export function isPeerIdValid(id: string): boolean {
  return typeof id === "string" && id.length > 0 && PEER_ID_RE.test(id);
}

interface CamerasState {
  cameras: DemoCamera[];
  add: (input: { name: string; peerId?: string }) => DemoCamera;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<DemoCamera>) => void;
  setStatus: (id: string, status: CameraStatus) => void;
  setThumbnail: (id: string, dataUrl: string) => void;
  setZones: (id: string, zones: Zone[]) => void;
  /** Tear down all pairings — used when the user clicks 'Reset demo' in Settings. */
  reset: () => void;
}

export const useCamerasStore = create<CamerasState>()(
  persist(
    (set) => ({
      cameras: [],
      add: ({ name, peerId }) => {
        const safePeerId =
          peerId && isPeerIdValid(peerId) ? peerId : generatePeerId();
        const cam: DemoCamera = {
          id: nanoid(8),
          name: name.trim() || "Camera",
          peerId: safePeerId,
          status: "pairing",
          enabled: true,
          zones: [],
          createdAt: new Date().toISOString(),
          lastSeenAt: null,
          thumbnail: null,
        };
        set((s) => ({ cameras: [...s.cameras, cam] }));
        return cam;
      },
      remove: (id) =>
        set((s) => ({ cameras: s.cameras.filter((c) => c.id !== id) })),
      update: (id, patch) =>
        set((s) => ({
          cameras: s.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      setStatus: (id, status) =>
        set((s) => ({
          cameras: s.cameras.map((c) =>
            c.id === id
              ? {
                  ...c,
                  status,
                  lastSeenAt:
                    status === "live" ? new Date().toISOString() : c.lastSeenAt,
                }
              : c,
          ),
        })),
      setThumbnail: (id, dataUrl) =>
        set((s) => ({
          cameras: s.cameras.map((c) =>
            c.id === id ? { ...c, thumbnail: dataUrl } : c,
          ),
        })),
      setZones: (id, zones) =>
        set((s) => ({
          cameras: s.cameras.map((c) => (c.id === id ? { ...c, zones } : c)),
        })),
      reset: () => set({ cameras: [] }),
    }),
    {
      name: "sv:cameras",
      // Bump when changing how cameras are stored so old browsers re-migrate.
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Thumbnails can balloon localStorage — exclude them from persistence.
      partialize: (s) => ({
        cameras: s.cameras.map((c) => ({ ...c, thumbnail: null })),
      }),
      migrate: (persistedState, version) => {
        // v1 → v2: nanoid's default alphabet can produce PeerJS-invalid IDs
        // (e.g. `sv-7i-uS--Pkk`). Regenerate any cached peerIds that fail
        // validation and force their cameras back to `offline` so the
        // operator re-pairs the phone.
        const state = (persistedState ?? {}) as Partial<CamerasState>;
        const cameras = Array.isArray(state.cameras) ? state.cameras : [];
        if (version < 2) {
          return {
            cameras: cameras.map((c) =>
              isPeerIdValid(c.peerId)
                ? c
                : {
                    ...c,
                    peerId: generatePeerId(),
                    status: "offline" as CameraStatus,
                  },
            ),
          };
        }
        return state;
      },
    },
  ),
);
