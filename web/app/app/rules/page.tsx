// Rules page
//
// TODO: Implement:
//   - List of rules with: name, zone, condition summary, severity, channel, enabled toggle
//   - Last-triggered timestamp and count (from Incident Service stats endpoint)
//   - Edit (opens YAML editor) and Delete actions
//   - "New Rule" button → /configure (chat-based builder)

export default function RulesPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Rules</h1>
      <p className="mt-2 text-slate-600">TODO: Implement rule list + toggle.</p>
    </div>
  )
}
