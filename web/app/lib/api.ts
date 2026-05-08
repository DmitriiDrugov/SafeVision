export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8004'
export const RULES_API_BASE =
  process.env.NEXT_PUBLIC_RULES_API_URL ?? 'http://localhost:8003'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Types (mirror shared/schemas Pydantic models) ──────────────────────────

export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type Channel = 'whatsapp' | 'email' | 'dashboard' | 'all'
export type IncidentStatus =
  | 'open'
  | 'acknowledged'
  | 'resolved'
  | 'false_positive'

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface TrackedObject {
  track_id: number
  class_name: string
  confidence: number
  bbox: BoundingBox
  zone_ids: string[]
  attributes: Record<string, string>
}

export interface DetectionPayload {
  camera_id: string
  frame_id: number
  timestamp: string
  objects: TrackedObject[]
}

export interface ViolationEvent {
  event_id: string
  rule_name: string
  camera_id: string
  zone_id: string
  severity: Severity
  channel: Channel
  detected_at: string
  detection_payload: DetectionPayload
  trace_id: string
}

export interface Incident {
  id: string
  rule_id: string
  camera_id: string
  zone_id: string
  detected_at: string
  severity: Severity
  status: IncidentStatus
  acknowledged_by: string | null
  acknowledged_at: string | null
  clip_url: string | null
  detection_payload: DetectionPayload | null
}

export interface AuditLogEntry {
  id: string
  incident_id: string
  action: string
  actor: string
  note: string | null
  created_at: string
}

export interface RuleCondition {
  object: string
  missing_ppe: string | null
  action: string | null
  duration_seconds: number | null
  min_count: number | null
}

export interface RuleAction {
  type: string
  severity: Severity
  channel: Channel
}

export interface Rule {
  name: string
  zone: string
  condition: RuleCondition
  action: RuleAction
  enabled: boolean
}

export interface Zone {
  id: string
  name: string
  polygon: [number, number][]
}

export interface Camera {
  id: string
  name: string
  rtsp_url: string
  zones: Zone[]
  enabled: boolean
}

export interface IncidentListParams {
  severity?: Severity
  status?: IncidentStatus
  camera_id?: string
  limit?: number
  offset?: number
}

// ── Internal fetch helper ──────────────────────────────────────────────────

async function apiFetch<T>(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(res.status, text)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

// ── Incident Service ───────────────────────────────────────────────────────

export async function getIncidents(
  params: IncidentListParams = {},
): Promise<Incident[]> {
  const qs = new URLSearchParams()
  if (params.severity) qs.set('severity', params.severity)
  if (params.status) qs.set('status', params.status)
  if (params.camera_id) qs.set('camera_id', params.camera_id)
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  const query = qs.toString() ? `?${qs.toString()}` : ''
  return apiFetch<Incident[]>(API_BASE, `/api/v1/incidents${query}`)
}

export async function getIncident(id: string): Promise<Incident> {
  return apiFetch<Incident>(API_BASE, `/api/v1/incidents/${id}`)
}

export async function acknowledgeIncident(
  id: string,
  actor: string,
  note?: string,
): Promise<Incident> {
  return apiFetch<Incident>(API_BASE, `/api/v1/incidents/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ actor, note }),
  })
}

export async function resolveIncident(
  id: string,
  actor: string,
  note?: string,
): Promise<Incident> {
  return apiFetch<Incident>(API_BASE, `/api/v1/incidents/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ actor, note }),
  })
}

export async function markFalsePositive(id: string): Promise<Incident> {
  return apiFetch<Incident>(
    API_BASE,
    `/api/v1/incidents/${id}/false-positive`,
    { method: 'POST' },
  )
}

export async function getEvidenceUrl(
  id: string,
): Promise<{ url: string; expires_at: string }> {
  return apiFetch<{ url: string; expires_at: string }>(
    API_BASE,
    `/api/v1/incidents/${id}/evidence`,
  )
}

export async function getAuditLog(id: string): Promise<AuditLogEntry[]> {
  return apiFetch<AuditLogEntry[]>(API_BASE, `/api/v1/incidents/${id}/audit`)
}

// ── Rule Engine ────────────────────────────────────────────────────────────

export async function getRules(): Promise<Rule[]> {
  return apiFetch<Rule[]>(RULES_API_BASE, '/api/v1/rules')
}

export async function createRule(yamlText: string): Promise<Rule> {
  return apiFetch<Rule>(RULES_API_BASE, '/api/v1/rules', {
    method: 'POST',
    body: JSON.stringify({ yaml_text: yamlText }),
  })
}

export async function updateRule(
  name: string,
  body: { enabled?: boolean; yaml_text?: string },
): Promise<Rule> {
  return apiFetch<Rule>(
    RULES_API_BASE,
    `/api/v1/rules/${encodeURIComponent(name)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  )
}

export async function deleteRule(name: string): Promise<void> {
  return apiFetch<void>(
    RULES_API_BASE,
    `/api/v1/rules/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  )
}

// ── Cameras (via Incident Service) ────────────────────────────────────────

export async function getCameras(): Promise<Camera[]> {
  return apiFetch<Camera[]>(API_BASE, '/api/v1/cameras')
}

export async function getCamera(id: string): Promise<Camera> {
  return apiFetch<Camera>(API_BASE, `/api/v1/cameras/${encodeURIComponent(id)}`)
}

export interface CameraIn {
  id: string
  name: string
  rtsp_url: string
  enabled?: boolean
  zones?: Zone[]
}

export async function createCamera(body: CameraIn): Promise<Camera> {
  return apiFetch<Camera>(API_BASE, '/api/v1/cameras', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateCamera(
  id: string,
  body: Partial<CameraIn>,
): Promise<Camera> {
  return apiFetch<Camera>(API_BASE, `/api/v1/cameras/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteCamera(id: string): Promise<void> {
  return apiFetch<void>(API_BASE, `/api/v1/cameras/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function updateCameraZones(
  id: string,
  zones: Zone[],
): Promise<Camera> {
  return apiFetch<Camera>(
    API_BASE,
    `/api/v1/cameras/${encodeURIComponent(id)}/zones`,
    {
      method: 'PUT',
      body: JSON.stringify(zones),
    },
  )
}
