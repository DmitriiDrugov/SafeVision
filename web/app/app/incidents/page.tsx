// Incidents page
//
// TODO: Implement:
//   - Filter bar: date range, severity, status, camera
//   - Paginated table (50 per page) sorted by detected_at desc
//   - Row action: View detail, Acknowledge, Mark false positive, Resolve
//   - Detail drawer: full payload + evidence clip player (presigned MinIO URL)
//   - Audit log section showing prior actions on the incident

export default function IncidentsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Incidents</h1>
      <p className="mt-2 text-slate-600">TODO: Implement filter, table, detail.</p>
    </div>
  )
}
