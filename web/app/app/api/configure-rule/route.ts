import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'meta-llama/llama-3.1-8b-instruct'

const SYSTEM_PROMPT = `You are SafeVision Rule Assistant. Your job is to convert natural language safety rule descriptions into valid SafeVision YAML.

Matched rules surface as incidents in the SafeVision web UI — there is no
WhatsApp, email, or webhook channel; operators triage everything from the
dashboard.

The YAML schema is:
rule:
  name: <snake_case string>
  zone: <zone id string>
  enabled: true
  condition:
    object: person | forklift | vehicle
    missing_ppe: helmet | vest | gloves | mask   # optional
    action: entering | exiting | standing | moving  # optional
    duration_seconds: <float>   # optional – presence duration threshold
    min_count: <int>            # optional – minimum count in zone
  action:
    type: alert | log | block
    severity: low | medium | high | critical

Rules:
- Always respond with a brief explanation followed by the YAML block fenced with \`\`\`yaml ... \`\`\`
- The YAML must be complete and valid
- Do NOT include a "channel" field — incidents are observed only in the web UI
- If you cannot produce a rule from the description, explain why and ask for clarification
- name must be lowercase snake_case

Examples:
User: Alert when a person enters the forklift zone without a helmet
Assistant: Here is a rule for that scenario:
\`\`\`yaml
rule:
  name: person_no_helmet_forklift
  zone: forklift_zone
  enabled: true
  condition:
    object: person
    missing_ppe: helmet
  action:
    type: alert
    severity: high
\`\`\``

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function extractYaml(text: string): string | null {
  const match = /```yaml\s*([\s\S]*?)```/.exec(text)
  return match?.[1]?.trim() ?? null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { message: 'OPENROUTER_API_KEY not configured.', yaml: null, isRule: false },
      { status: 503 },
    )
  }

  const { messages } = (await req.json()) as { messages: ChatMessage[] }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://safevision.local',
      'X-Title': 'SafeVision Config UI',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.2,
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return NextResponse.json(
      { message: `LLM error: ${text}`, yaml: null, isRule: false },
      { status: 502 },
    )
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }

  const assistantText = data.choices[0]?.message.content ?? ''
  const yaml = extractYaml(assistantText)
  const humanMessage = yaml
    ? assistantText.replace(/```yaml[\s\S]*?```/, '').trim()
    : assistantText

  // Validate YAML against Rule Engine if possible (best-effort)
  let validationError: string | undefined
  if (yaml) {
    const rulesApiBase =
      process.env.NEXT_PUBLIC_RULES_API_URL ?? 'http://localhost:8003'
    try {
      const validateRes = await fetch(`${rulesApiBase}/api/v1/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml_text: yaml }),
        signal: AbortSignal.timeout(3000),
      })
      if (!validateRes.ok && validateRes.status === 422) {
        const errBody = await validateRes.text()
        validationError = errBody
      }
    } catch {
      // Rule Engine unreachable — skip server-side validation
    }
  }

  return NextResponse.json({
    message: humanMessage || (yaml ? 'Rule generated.' : assistantText),
    yaml,
    isRule: yaml !== null && !validationError,
    validationError,
  })
}
