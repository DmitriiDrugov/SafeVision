// Chat-based rule builder
//
// TODO: Implement:
//   - Chat thread UI (last 10 turns capped per spec)
//   - Input box: user describes rule in natural language
//   - Server action POST /api/configure-rule (proxies to OpenRouter Llama 3.1 8B)
//     Returns { yaml: string | null, message: string, isRule: boolean }
//   - When isRule: render YAML preview with syntax highlighting
//   - "Activate" button → POST /api/v1/rules with the YAML
//   - Server validates YAML against Pydantic Rule model. On failure:
//     show validation error inline, prompt LLM to retry.

export default function ConfigurePage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Configure Rule</h1>
      <p className="mt-2 text-slate-600">
        TODO: Implement chat UI + YAML preview + activate flow.
      </p>
    </div>
  )
}
