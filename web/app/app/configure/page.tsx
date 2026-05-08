'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRule } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  yaml?: string
}

const MAX_HISTORY = 10

export default function ConfigurePage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Describe a safety rule in plain language. For example: "Alert when a person enters the forklift zone without a helmet."',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingYaml, setPendingYaml] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)
  const [activateError, setActivateError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: text },
    ]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setPendingYaml(null)
    setActivateError(null)

    // Keep last MAX_HISTORY turns for context
    const history = newMessages.slice(-MAX_HISTORY)

    try {
      const res = await fetch('/api/configure-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      const data = (await res.json()) as {
        message: string
        yaml: string | null
        isRule: boolean
        validationError?: string
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.validationError
          ? `The generated rule has a validation error: ${data.validationError}. Let me refine it.`
          : data.message,
        yaml: data.yaml ?? undefined,
      }
      setMessages((prev) => [...prev, assistantMsg])
      if (data.isRule && data.yaml) {
        setPendingYaml(data.yaml)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const activateRule = async () => {
    if (!pendingYaml) return
    setActivating(true)
    setActivateError(null)
    try {
      await createRule(pendingYaml)
      router.push('/rules')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setActivateError(msg)
      // Feed the error back into the chat so the LLM can retry
      const retryMsg: Message = {
        role: 'user',
        content: `The rule failed to activate with this error: ${msg}. Please fix the YAML.`,
      }
      setMessages((prev) => [...prev, retryMsg])
      setActivating(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-88px)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">
          Configure Rule
        </h1>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Chat panel */}
        <div className="flex flex-1 flex-col rounded-lg border border-slate-200 bg-white">
          {/* Message list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-500">
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendMessage()
                  }
                }}
                placeholder="Describe a safety rule…"
                rows={2}
                className="flex-1 resize-none rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => void sendMessage()}
                disabled={loading || !input.trim()}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* YAML preview panel */}
        <div className="flex w-80 flex-col rounded-lg border border-slate-200 bg-white">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-slate-700">YAML Preview</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {pendingYaml ? (
              <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs font-mono text-slate-700">
                {pendingYaml}
              </pre>
            ) : (
              <p className="text-sm text-slate-400">
                The generated YAML rule will appear here once ready.
              </p>
            )}
          </div>
          {pendingYaml && (
            <div className="border-t p-4">
              {activateError && (
                <p className="mb-2 text-xs text-red-600">{activateError}</p>
              )}
              <button
                onClick={() => void activateRule()}
                disabled={activating}
                className="w-full rounded bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {activating ? 'Activating…' : 'Activate Rule'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
