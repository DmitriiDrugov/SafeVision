"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
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
        const cam: DemoCamera = {
          id: nanoid(8),
          name: name.trim() || "Camera",
          peerId: peerId ?? `sv-${nanoid(10)}`,
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
      storage: createJSONStorage(() => localStorage),
      // Thumbnails can balloon localStorage — exclude them from persistence.
      partialize: (s) => ({
        cameras: s.cameras.map((c) => ({ ...c, thumbnail: null })),
      }),
    },
  ),
);
