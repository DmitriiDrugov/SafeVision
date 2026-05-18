'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bot,
  CornerDownLeft,
  Loader2,
  Sparkles,
  User,
  WandSparkles,
} from 'lucide-react'
import jsYaml from 'js-yaml'
import { useRulesStore, type DemoRuleConditionType } from '@/lib/stores/rules'
import type { Severity } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  yaml?: string
}

const MAX_HISTORY = 10

const STARTER_PROMPTS = [
  'Alert if more than 3 people gather in the loading bay.',
  'Detect any vehicle inside the pedestrian corridor.',
  'Flag a person standing near the forklift zone for more than 5 seconds.',
]

interface BackendYamlRule {
  rule: {
    name?: string
    zone?: string
    enabled?: boolean
    condition?: {
      object?: string
      missing_ppe?: string
      min_count?: number
      duration_seconds?: number
    }
    action?: {
      severity?: Severity
    }
  }
}

/** Best-effort mapping from server-style YAML to a browser DemoRule. */
function ingestYaml(yaml: string):
  | {
      name: string
      type: DemoRuleConditionType
      minCount: number
      durationSeconds: number
      severity: Severity
    }
  | null {
  try {
    const parsed = jsYaml.load(yaml) as BackendYamlRule | null
    const r = parsed?.rule
    if (!r) return null
    const object = r.condition?.object ?? 'person'
    const min = Number(r.condition?.min_count ?? 1)
    let type: DemoRuleConditionType = 'person_in_zone'
    if (object === 'vehicle') type = 'vehicle_in_pedestrian_zone'
    else if (min >= 2) type = 'crowd'
    return {
      name: r.name ?? 'imported_rule',
      type,
      minCount: Math.max(1, min),
      durationSeconds: Number(r.condition?.duration_seconds ?? 1),
      severity: (r.action?.severity ?? 'medium'),
    }
  } catch {
    return null
  }
}

export default function ConfigurePage(): React.ReactElement {
  const router = useRouter()
  const addRule = useRulesStore((s) => s.add)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Describe a safety condition in plain language. I will draft a rule and you can install it with one click. Try one of the suggestions below or type your own.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingYaml, setPendingYaml] = useState<string | null>(null)
  const [llmError, setLlmError] = useState<string | null>(null)

  const send = async (textOverride?: string): Promise<void> => {
    const text = (textOverride ?? input).trim()
    if (!text || loading) return

    const history: Message[] = [
      ...messages,
      { role: 'user', content: text },
    ]
    setMessages(history)
    setInput('')
    setPendingYaml(null)
    setLlmError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/configure-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string
        }
        const errMessage = data.message ?? `LLM error (HTTP ${String(res.status)})`
        if (res.status === 503) {
          setLlmError(
            'Rule Builder is offline — OPENROUTER_API_KEY is not set on this deployment. Try the manual rule editor on the Rules page.',
          )
        } else {
          setLlmError(errMessage)
        }
        return
      }
      const data = (await res.json()) as {
        message: string
        yaml: string | null
        isRule: boolean
      }
      const reply: Message = {
        role: 'assistant',
        content: data.message || 'Generated rule:',
        yaml: data.yaml ?? undefined,
      }
      setMessages((prev) => [...prev, reply])
      if (data.isRule && data.yaml) setPendingYaml(data.yaml)
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const install = (): void => {
    if (!pendingYaml) return
    const parsed = ingestYaml(pendingYaml)
    if (!parsed) {
      setLlmError(
        'Could not parse the generated YAML for browser-side use. You can still copy and adapt it manually.',
      )
      return
    }
    addRule({
      name: parsed.name,
      type: parsed.type,
      minCount: parsed.minCount,
      durationSeconds: parsed.durationSeconds,
      severity: parsed.severity,
      description: `Imported from rule builder.`,
    })
    router.push('/rules')
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem-3rem)] grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <section className="surface flex min-h-0 flex-col rounded-xl">
        <header className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <WandSparkles className="h-4 w-4 text-accent" />
          <h1 className="text-sm font-semibold uppercase tracking-wider text-white">
            Rule builder
          </h1>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              Thinking…
            </div>
          )}
          {llmError && (
            <div className="rounded-md border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-xs text-severity-critical">
              {llmError}
            </div>
          )}
        </div>

        <footer className="border-t border-white/5 px-4 py-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {STARTER_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => void send(p)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-ink-300 hover:bg-white/5 hover:text-white"
              >
                <Sparkles className="h-3 w-3 text-accent" />
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={2}
              placeholder="Describe a safety rule…"
              className="flex-1 resize-none rounded-md surface-input px-3 py-2 text-sm"
            />
            <button
              onClick={() => void send()}
              disabled={!input.trim() || loading}
              className="inline-flex items-center gap-1.5 self-stretch rounded-md bg-accent px-3 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50"
            >
              <CornerDownLeft className="h-4 w-4" />
              Send
            </button>
          </div>
        </footer>
      </section>

      <aside className="surface flex min-h-0 flex-col rounded-xl">
        <header className="border-b border-white/5 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-white">
          YAML preview
        </header>
        <div className="flex-1 overflow-auto p-3">
          {pendingYaml ? (
            <pre className="whitespace-pre-wrap rounded-md bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-ink-100">
              {pendingYaml}
            </pre>
          ) : (
            <p className="text-xs text-ink-500">
              The generated YAML rule will appear here once ready.
            </p>
          )}
        </div>
        {pendingYaml && (
          <div className="border-t border-white/5 px-3 py-3">
            <button
              onClick={install}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-medium text-ink-950 hover:bg-accent-400"
            >
              <WandSparkles className="h-4 w-4" />
              Install rule
            </button>
            <p className="mt-2 text-[10px] text-ink-500">
              Rules install into the browser-side evaluator and start firing
              immediately on connected live feeds.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }): React.ReactElement {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${
          isUser ? 'bg-white/10 text-ink-200' : 'bg-accent/15 text-accent'
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-accent/15 text-ink-100'
            : 'bg-white/5 text-ink-100'
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        {message.yaml && (
          <pre className="mt-2 overflow-x-auto rounded-md bg-ink-950 p-2 font-mono text-[10px] leading-relaxed text-ink-200">
            {message.yaml}
          </pre>
        )}
      </div>
    </div>
  )
}
