"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CameraOff,
  CircleDot,
  Clock,
  Gauge,
  Plus,
  ShieldCheck,
  Video,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import PairCameraModal from "@/components/PairCameraModal";
import { useCamerasStore } from "@/lib/stores/cameras";
import { useIncidentsStore } from "@/lib/stores/incidents";
import { useRulesStore } from "@/lib/stores/rules";

export default function DashboardPage(): React.ReactElement {
  const cameras = useCamerasStore((s) => s.cameras);
  const incidents = useIncidentsStore((s) => s.incidents);
  const rules = useRulesStore((s) => s.rules);
  const seed = useRulesStore((s) => s.seed);

  const [pairOpen, setPairOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Pre-populate the rule library on first visit. Existing rules are kept.
    seed();
  }, [seed]);

  const stats = useMemo(() => {
    const liveCameras = cameras.filter((c) => c.status === "live").length;
    const openIncidents = incidents.filter((i) => i.status === "open").length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIncidents = incidents.filter(
      (i) => new Date(i.detected_at) >= today,
    ).length;
    const lastIncidentMin = incidents[0]
      ? Math.round(
          (Date.now() - new Date(incidents[0].detected_at).getTime()) / 60000,
        )
      : null;
    return {
      liveCameras,
      totalCameras: cameras.length,
      activeRules: rules.filter((r) => r.enabled).length,
      openIncidents,
      todayIncidents,
      lastIncidentMin,
    };
  }, [cameras, incidents, rules]);

  const recentIncidents = incidents.slice(0, 10);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Overview</h1>
          <p className="mt-0.5 text-sm text-ink-400">
            Live operational status across all paired cameras and active rules.
          </p>
        </div>
        <button
          onClick={() => {
            setPairOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400"
        >
          <Plus className="h-4 w-4" />
          Pair camera
        </button>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KPI
          icon={<Video className="h-3.5 w-3.5 text-accent" />}
          label="Cameras"
          value={`${String(stats.liveCameras)}/${String(stats.totalCameras)}`}
          hint={stats.liveCameras > 0 ? "live" : "no live feeds"}
        />
        <KPI
          icon={<ShieldCheck className="h-3.5 w-3.5 text-accent" />}
          label="Active rules"
          value={String(stats.activeRules)}
          hint={rules.length === 0 ? "none seeded" : "enabled"}
        />
        <KPI
          icon={
            <AlertTriangle className="h-3.5 w-3.5 text-severity-critical" />
          }
          label="Open incidents"
          value={String(stats.openIncidents)}
          hint={stats.openIncidents > 0 ? "needs review" : "all clear"}
          tone={stats.openIncidents > 0 ? "alert" : "ok"}
        />
        <KPI
          icon={<Activity className="h-3.5 w-3.5 text-accent" />}
          label="Detections today"
          value={String(stats.todayIncidents)}
          hint="all severities"
        />
        <KPI
          icon={<Clock className="h-3.5 w-3.5 text-accent" />}
          label="Last event"
          value={
            stats.lastIncidentMin === null
              ? "—"
              : `${String(stats.lastIncidentMin)}m`
          }
          hint={stats.lastIncidentMin === null ? "never" : "ago"}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* Live tiles */}
        <section className="surface rounded-xl p-4">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-300">
              Live feeds
            </h2>
            <Link
              href="/cameras"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              All cameras <ArrowRight className="h-3 w-3" />
            </Link>
          </header>
          {mounted && cameras.length === 0 ? (
            <div className="grid place-items-center rounded-lg border border-dashed border-white/10 bg-ink-900/30 px-6 py-12 text-center">
              <CameraOff className="mb-3 h-8 w-8 text-ink-500" />
              <p className="text-sm text-ink-300">No cameras paired yet.</p>
              <button
                onClick={() => {
                  setPairOpen(true);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-accent-400"
              >
                <Plus className="h-4 w-4" />
                Pair your first camera
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
              {cameras.slice(0, 4).map((cam) => (
                <Link
                  key={cam.id}
                  href={`/cameras/${encodeURIComponent(cam.id)}/live`}
                  className="group relative aspect-video overflow-hidden rounded-lg bg-black"
                >
                  {cam.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cam.thumbnail}
                      alt={cam.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-grid">
                      <Video className="h-7 w-7 text-ink-500" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/0" />
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-ink-900/70 px-1.5 py-0.5 text-[10px] uppercase tracking-widest">
                    <CircleDot
                      className={
                        cam.status === "live"
                          ? "h-2.5 w-2.5 animate-pulse text-emerald-400"
                          : "h-2.5 w-2.5 text-ink-500"
                      }
                    />
                    <span
                      className={
                        cam.status === "live"
                          ? "text-emerald-300"
                          : "text-ink-400"
                      }
                    >
                      {cam.status}
                    </span>
                  </div>
                  <div className="absolute inset-x-2 bottom-2 truncate text-xs font-medium text-white">
                    {cam.name}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Live feed (recent incidents stream) */}
        <section className="surface rounded-xl p-4">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-300">
              Activity stream
            </h2>
            <Link
              href="/incidents"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              All incidents <ArrowRight className="h-3 w-3" />
            </Link>
          </header>
          {recentIncidents.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/10 bg-ink-900/30 px-3 py-6 text-center text-sm text-ink-400">
              No incidents yet — they appear here in real-time as detection
              rules fire.
            </p>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {recentIncidents.map((inc) => (
                  <motion.li
                    key={inc.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2 text-xs"
                  >
                    <SeverityBadge severity={inc.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-white">
                        {inc.ruleName}
                      </div>
                      <div className="truncate text-[10px] text-ink-400">
                        {inc.cameraName}
                        {inc.zone_id ? ` · ${inc.zone_id}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={inc.status} />
                    <span className="font-mono text-[10px] text-ink-400">
                      {new Date(inc.detected_at).toLocaleTimeString()}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>

      <PairCameraModal
        open={pairOpen}
        onClose={() => {
          setPairOpen(false);
        }}
      />
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "alert" | "ok";
}): React.ReactElement {
  const toneCls =
    tone === "alert"
      ? "border-severity-critical/30 bg-severity-critical/5"
      : tone === "ok"
        ? "border-emerald-400/20 bg-emerald-400/5"
        : "surface";
  return (
    <div className={`rounded-lg p-3 ${toneCls}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-ink-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <Gauge className="hidden h-3 w-3 text-ink-600" aria-hidden />
        <div className="font-mono text-2xl font-semibold text-white">
          {value}
        </div>
        {hint && (
          <div className="text-[10px] uppercase tracking-wider text-ink-500">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
