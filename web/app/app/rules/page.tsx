"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { SeverityBadge } from "@/components/SeverityBadge";
import {
  useRulesStore,
  type DemoRule,
  type DemoRuleConditionType,
} from "@/lib/stores/rules";
import { useCamerasStore } from "@/lib/stores/cameras";
import type { Severity } from "@/lib/api";

const CONDITION_LABELS: Record<DemoRuleConditionType, string> = {
  person_in_zone: "Person in zone",
  crowd: "Crowd (N+ people)",
  vehicle_in_pedestrian_zone: "Vehicle in pedestrian zone",
};

const CONDITION_DESCRIPTIONS: Record<DemoRuleConditionType, string> = {
  person_in_zone: "Triggers when any person is detected inside the zone.",
  crowd: "Triggers when ≥ min count people are inside the zone.",
  vehicle_in_pedestrian_zone:
    "Triggers when a car / truck / bus / motorcycle is in the zone.",
};

export default function RulesPage(): React.ReactElement {
  const rules = useRulesStore((s) => s.rules);
  const seed = useRulesStore((s) => s.seed);
  const removeRule = useRulesStore((s) => s.remove);
  const updateRule = useRulesStore((s) => s.update);
  const [editing, setEditing] = useState<DemoRule | "new" | null>(null);

  useEffect(() => {
    seed();
  }, [seed]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Detection rules</h1>
          <p className="mt-0.5 text-sm text-ink-400">
            Browser-side evaluator — rules execute in your tab against incoming
            detections, no backend required.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/configure"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-ink-200 hover:bg-white/5"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Build via chat
          </Link>
          <button
            onClick={() => {
              setEditing("new");
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400"
          >
            <Plus className="h-4 w-4" />
            New rule
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rules.map((rule) => (
          <article
            key={rule.id}
            className="surface flex flex-col rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  {rule.name}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-400">
                  {CONDITION_LABELS[rule.type]}
                </div>
              </div>
              <SeverityBadge severity={rule.severity} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-300">
              {rule.description || CONDITION_DESCRIPTIONS[rule.type]}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <Mini label="Min count" value={String(rule.minCount)} />
              <Mini label="Hold (s)" value={String(rule.durationSeconds)} />
              <Mini label="Cooldown (s)" value={String(rule.cooldownSeconds)} />
            </dl>
            <div className="mt-auto flex items-center justify-between pt-3">
              <Toggle
                enabled={rule.enabled}
                onToggle={() => {
                  updateRule(rule.id, { enabled: !rule.enabled });
                }}
              />
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditing(rule);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-ink-200 hover:bg-white/5"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete rule "${rule.name}"?`))
                      removeRule(rule.id);
                  }}
                  className="rounded-md border border-white/10 p-1 text-ink-400 hover:bg-severity-critical/10 hover:text-severity-critical"
                  aria-label="Delete rule"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </article>
        ))}
        {rules.length === 0 && (
          <div className="col-span-full grid place-items-center rounded-xl border border-dashed border-white/10 bg-ink-900/30 px-6 py-12 text-center">
            <AlertTriangle className="mb-3 h-7 w-7 text-ink-500" />
            <p className="text-sm text-ink-300">No rules configured yet.</p>
            <button
              onClick={() => {
                setEditing("new");
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-accent-400"
            >
              <Plus className="h-4 w-4" />
              Create a rule
            </button>
          </div>
        )}
      </div>

      {editing && (
        <RuleEditor
          initial={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Mini({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="rounded-md bg-white/5 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-ink-500">
        {label}
      </div>
      <div className="font-mono text-sm text-white">{value}</div>
    </div>
  );
}

function Toggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        enabled ? "bg-accent" : "bg-white/10"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function RuleEditor({
  initial,
  onClose,
}: {
  initial: DemoRule | null;
  onClose: () => void;
}): React.ReactElement {
  const add = useRulesStore((s) => s.add);
  const update = useRulesStore((s) => s.update);
  const cameras = useCamerasStore((s) => s.cameras);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<DemoRuleConditionType>(
    initial?.type ?? "person_in_zone",
  );
  const [cameraId, setCameraId] = useState<string | null>(
    initial?.cameraId ?? null,
  );
  const [zoneId, setZoneId] = useState<string | null>(initial?.zoneId ?? null);
  const [minCount, setMinCount] = useState(initial?.minCount ?? 1);
  const [durationSeconds, setDurationSeconds] = useState(
    initial?.durationSeconds ?? 1,
  );
  const [cooldownSeconds, setCooldownSeconds] = useState(
    initial?.cooldownSeconds ?? 10,
  );
  const [severity, setSeverity] = useState<Severity>(
    initial?.severity ?? "high",
  );

  const zonesForCamera = cameras.find((c) => c.id === cameraId)?.zones ?? [];

  const submit = (): void => {
    if (!name.trim()) return;
    const patch = {
      name: name.trim(),
      description: description.trim(),
      type,
      cameraId,
      zoneId,
      minCount: type === "crowd" ? Math.max(2, minCount) : 1,
      durationSeconds: Math.max(0, durationSeconds),
      cooldownSeconds: Math.max(0, cooldownSeconds),
      severity,
      enabled: initial?.enabled ?? true,
    };
    if (initial) {
      update(initial.id, patch);
    } else {
      add(patch);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="surface-raised w-full max-w-lg rounded-xl shadow-panel"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            {initial ? "Edit rule" : "New rule"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4 text-sm">
          <Label text="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className="w-full rounded-md surface-input px-2 py-1.5"
            />
          </Label>
          <Label text="Description (optional)">
            <textarea
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              className="w-full rounded-md surface-input px-2 py-1.5"
            />
          </Label>
          <Label text="Condition">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as DemoRuleConditionType);
              }}
              className="w-full rounded-md surface-input px-2 py-1.5"
            >
              {(
                Object.entries(CONDITION_LABELS) as [
                  DemoRuleConditionType,
                  string,
                ][]
              ).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-500">
              {CONDITION_DESCRIPTIONS[type]}
            </p>
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <Label text="Camera">
              <select
                value={cameraId ?? ""}
                onChange={(e) => {
                  setCameraId(e.target.value === "" ? null : e.target.value);
                }}
                className="w-full rounded-md surface-input px-2 py-1.5"
              >
                <option value="">All cameras</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Zone">
              <select
                value={zoneId ?? ""}
                onChange={(e) => {
                  setZoneId(e.target.value === "" ? null : e.target.value);
                }}
                disabled={!cameraId || zonesForCamera.length === 0}
                className="w-full rounded-md surface-input px-2 py-1.5 disabled:opacity-50"
              >
                <option value="">Whole frame</option>
                {zonesForCamera.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Label text="Min count">
              <input
                type="number"
                min={1}
                max={50}
                value={minCount}
                disabled={type !== "crowd"}
                onChange={(e) => {
                  setMinCount(Number(e.target.value));
                }}
                className="w-full rounded-md surface-input px-2 py-1.5 disabled:opacity-50"
              />
            </Label>
            <Label text="Hold (s)">
              <input
                type="number"
                min={0}
                max={60}
                value={durationSeconds}
                onChange={(e) => {
                  setDurationSeconds(Number(e.target.value));
                }}
                className="w-full rounded-md surface-input px-2 py-1.5"
              />
            </Label>
            <Label text="Cooldown (s)">
              <input
                type="number"
                min={0}
                max={3600}
                value={cooldownSeconds}
                onChange={(e) => {
                  setCooldownSeconds(Number(e.target.value));
                }}
                className="w-full rounded-md surface-input px-2 py-1.5"
              />
            </Label>
          </div>
          <Label text="Severity">
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value as Severity);
              }}
              className="w-full rounded-md surface-input px-2 py-1.5"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Label>
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-ink-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50"
          >
            {initial ? "Save changes" : "Create rule"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Label({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-ink-400">
        {text}
      </span>
      {children}
    </label>
  );
}
