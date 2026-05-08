/**
 * SafeVision REST API Client.
 *
 * TODO: Implement typed client for the Incident Service REST API.
 * All response types should mirror Pydantic models in shared/schemas/.
 *
 * Functions to implement:
 *   - getIncidents(params: IncidentListParams): Promise<Incident[]>
 *   - getIncident(id: string): Promise<Incident>
 *   - acknowledgeIncident(id: string, body: AckBody): Promise<Incident>
 *   - resolveIncident(id: string, body: AckBody): Promise<Incident>
 *   - markFalsePositive(id: string): Promise<Incident>
 *   - getEvidenceUrl(id: string): Promise<{ url: string; expiresAt: string }>
 *
 *   - getRules(): Promise<Rule[]>
 *   - createRule(yaml: string): Promise<Rule>
 *   - updateRule(name: string, body: { enabled?: boolean; yaml?: string }): Promise<Rule>
 *   - deleteRule(name: string): Promise<void>
 *
 *   - getCameras(): Promise<Camera[]>
 *
 * All functions throw an ApiError on non-2xx responses.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8004'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// TODO: implement typed fetch wrapper and the functions listed above.
