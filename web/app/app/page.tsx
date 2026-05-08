// SafeVision Dashboard
//
// TODO: Implement live dashboard with:
//   - Open-incident counts grouped by severity (cards)
//   - Real-time violation feed (WebSocket subscription via lib/websocket.ts)
//   - Camera status grid (online/offline/lagging)
//   - Recent incidents table (last 50, ordered by detected_at desc)

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold">SafeVision Dashboard</h1>
      <p className="mt-2 text-slate-600">
        TODO: Replace with live incident dashboard.
      </p>
    </div>
  )
}
