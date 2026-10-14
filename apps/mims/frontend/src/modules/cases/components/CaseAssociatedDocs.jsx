// The documents sent in answer to this MI, with the version each letter
// enclosed. It replaces "Linked Documents", which read a document link the MI
// never had, so it always said nothing was linked.
export default function CaseAssociatedDocs({ miTab, responses = [] }) {
  const tabId = miTab?.id
  const sent = responses.filter(r => r.response_status === 'SENT' && (!r.mi_tab_id || Number(r.mi_tab_id) === Number(tabId)))
  // One row per document and version, with how many letters enclosed it and when last.
  const byDoc = new Map()
  for (const r of sent) {
    let docs = r.source_document_snapshot
    try { docs = typeof docs === 'string' ? JSON.parse(docs) : docs } catch { docs = [] }
    const when = String(r.sent_at || r.responded_at || '').slice(0, 10)
    for (const d of Array.isArray(docs) ? docs : []) {
      const key = `${d.id}-${d.version}`
      const row = byDoc.get(key) || { key, name: d.name, version: d.version, type: d.doc_type, when: '', letters: 0 }
      row.letters += 1
      if (when > row.when) row.when = when
      byDoc.set(key, row)
    }
  }
  const rows = [...byDoc.values()]
  if (rows.length === 0) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No documents sent for this question yet.</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="mi-documents-sent">
      {rows.map(d => (
        <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
          <span style={{ flex: 1, fontWeight: 500 }}>{d.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.type ? `${d.type} · ` : ''}v{d.version}{d.when ? ` · sent ${d.when}` : ''}{d.letters > 1 ? ` · in ${d.letters} letters` : ''}</span>
        </div>
      ))}
    </div>
  )
}
