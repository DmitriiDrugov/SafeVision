"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import LiveCameraView from "@/components/LiveCameraView";
import { useCamerasStore } from "@/lib/stores/cameras";

export default function CameraLivePage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const cameras = useCamerasStore((s) => s.cameras);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const camera = useMemo(
    () => cameras.find((c) => c.id === id) ?? null,
    [cameras, id],
  );

  if (!mounted) {
    return (
      <div className="grid h-[60vh] place-items-center text-sm text-ink-400">
        Loading…
      </div>
    );
  }

  if (!camera) {
    return (
      <div className="space-y-3">
        <Link
          href="/cameras"
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to cameras
        </Link>
        <div className="rounded-md surface px-4 py-6 text-sm text-ink-300">
          Camera not found. It may have been removed — pair a new one from the
          Cameras page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/cameras"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs text-ink-300 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Cameras
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-white">{camera.name}</h1>
            <div className="text-[11px] uppercase tracking-wider text-ink-500">
              ID <span className="font-mono text-ink-300">{camera.id}</span> ·
              Peer{" "}
              <span className="font-mono text-ink-300">
                {camera.peerId.slice(0, 18)}…
              </span>
            </div>
          </div>
        </div>
        <Link
          href={`/cameras/${camera.id}/zones`}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-ink-200 hover:bg-white/5 hover:text-white"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit zones
        </Link>
      </header>

      <LiveCameraView camera={camera} />
    </div>
  );
}
