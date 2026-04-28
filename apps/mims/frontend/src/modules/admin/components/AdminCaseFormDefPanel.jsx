import { useState, useEffect } from 'react'

function SectionHeader({ title, desc, msg }) {
  return (
    <div className="admin-section-header">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div><h2>{title}</h2>{desc && <p>{desc}</p>}</div>
      </div>
      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginTop: 8 }}>{msg.text}</div>}
    </div>
  )
}

const CASE_TYPE_LABELS = { MI: 'Medical Information (MI)', AE: 'Adverse Event (AE)', PC: 'Product Complaint (PC)' }

export default function AdminCaseFormDefPanel({ H }) {
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [orgs, setOrgs] = useState([])
  const [caseFormDefCaseType, setCaseFormDefCaseType] = useState('MI')
  const [caseFormDefOrgId, setCaseFormDefOrgId] = useState('')
  const [caseFormDefSections, setCaseFormDefSections] = useState([])
  const [caseFormDefLoading, setCaseFormDefLoading] = useState(false)
  const [caseFormDefSaving, setCaseFormDefSaving] = useState(false)

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 5000)
  }

  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    loadOrgs()
    loadCaseFormDef('MI', '')
  }, [])

  async function loadOrgs() {
    try {
      const d = await fetch('/api/admin/orgs', { headers: H }).then(r => r.json()).catch(() => ({ orgs: [] }))
      setOrgs(d.orgs || [])
    } catch { setOrgs([]) }
  }

  async function loadCaseFormDef(caseType, orgId) {
    setCaseFormDefLoading(true)
    try {
      const params = new URLSearchParams({ case_type: caseType, ...(orgId ? { org_id: orgId } : {}) })
      const d = await fetch(`/api/admin/case-form-definition?${params}`, { headers: H }).then(r => r.json())
      setCaseFormDefSections(d.sections || [])
    } catch { flash('Failed to load form definition.', 'error') } finally { setCaseFormDefLoading(false) }
  }

  async function saveCaseFormDef() {
    setCaseFormDefSaving(true)
    try {
      const res = await fetch('/api/admin/case-form-definition', {
        method: 'POST', headers: H,
        body: JSON.stringify({ case_type: caseFormDefCaseType, org_id: caseFormDefOrgId || null, sections: caseFormDefSections })
      })
      const d = await res.json()
      if (!res.ok) return flash(d.error, 'error')
      flash(`Saved ${d.saved} sections.`, 'success')
    } catch { flash('Save failed.', 'error') } finally { setCaseFormDefSaving(false) }
  }

  return (
    <>
      <SectionHeader title="Case Form Definition" desc="Configure which sections are visible on the Case Form per case type and organisation." msg={msg} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-control" style={{ maxWidth: 220 }} value={caseFormDefOrgId}
          onChange={e => { setCaseFormDefOrgId(e.target.value); loadCaseFormDef(caseFormDefCaseType, e.target.value) }}>
          <option value="">— Global Default —</option>
          {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {['MI', 'AE', 'PC'].map(ct => (
            <button key={ct} type="button"
              style={{ padding: '7px 20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: caseFormDefCaseType === ct ? 'var(--primary)' : 'var(--surface)', color: caseFormDefCaseType === ct ? '#fff' : 'var(--text-primary)', transition: 'all 0.15s' }}
              onClick={() => { setCaseFormDefCaseType(ct); loadCaseFormDef(ct, caseFormDefOrgId) }}>
              {ct}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{CASE_TYPE_LABELS[caseFormDefCaseType]}</span>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Sections — {caseFormDefCaseType} Form</h3>
          <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={caseFormDefSaving || caseFormDefLoading} onClick={saveCaseFormDef}>
            {caseFormDefSaving ? 'Saving…' : 'Save Definition'}
          </button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {caseFormDefLoading && <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
          {!caseFormDefLoading && (
            <table className="admin-table">
              <thead><tr><th style={{ width: 60 }}>Visible</th><th>Section Name</th><th style={{ width: 100 }}>Status</th></tr></thead>
              <tbody>
                {caseFormDefSections.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>No sections loaded. Select a case type above.</td></tr>
                )}
                {caseFormDefSections.map((s, idx) => (
                  <tr key={s.section_name} style={{ background: s.is_visible ? 'transparent' : 'var(--bg)' }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!s.is_visible}
                        onChange={e => setCaseFormDefSections(prev => prev.map((sec, i) => i === idx ? { ...sec, is_visible: e.target.checked ? 1 : 0 } : sec))} />
                    </td>
                    <td style={{ fontWeight: 500, fontSize: 13, color: s.is_visible ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {s.section_name}
                      {['Contact / Requestor', 'Case Information'].includes(s.section_name) && (
                        <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>Required</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 600, color: s.is_visible ? 'var(--success)' : 'var(--text-muted)' }}>
                        {s.is_visible ? '● Visible' : '○ Hidden'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Changes take effect on the next new case opened. Existing open cases are not affected. Contact / Requestor and Case Information sections cannot be hidden.
      </p>
    </>
  )
}
