import { useState, useEffect } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { SectionHeader } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const CASE_TYPES = ['ALL', 'MI', 'AE', 'PC']

export default function AdminCaseNumberingPanel({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [caseNumConfigs, setCaseNumConfigs] = useState([])
  const [caseNumLoading, setCaseNumLoading] = useState(false)
  const [caseNumSaving, setCaseNumSaving] = useState(false)
  const [caseNumOrgId, setCaseNumOrgId] = useState('')
  const [caseNumForm, setCaseNumForm] = useState({ case_type: 'ALL', prefix: 'CASE', separator: '-', include_year: true, include_month: false, seq_length: 5 })
  const [caseNumPreview, setCaseNumPreview] = useState('CASE-2026-00001')

  useEffect(() => { loadOrgs(); loadCaseNumConfigs() }, []) // eslint-disable-line

  async function loadOrgs() {
    try {
      const d = await httpFetch('/api/admin/orgs', { headers: H }).then(r => r.json())
      setOrgs(d.orgs || [])
    } catch { setOrgs([]) }
  }

  async function loadCaseNumConfigs() {
    setCaseNumLoading(true)
    try {
      const d = await httpFetch('/api/admin/case-number-config', { headers: H }).then(r => r.json())
      setCaseNumConfigs(d.configs || [])
    } catch { flash('Failed to load case number configs.', 'error') }
    finally { setCaseNumLoading(false) }
  }

  async function saveCaseNumConfig(e) {
    e.preventDefault()
    setCaseNumSaving(true)
    try {
      const payload = { ...caseNumForm, org_id: caseNumOrgId || null }
      const res = await httpFetch('/api/admin/case-number-config', { method: 'POST', headers: H, body: JSON.stringify(payload) })
      const d = await res.json()
      if (!res.ok) return flash(d.error, 'error')
      flash('Case number config saved.', 'success')
      loadCaseNumConfigs()
    } catch { flash('Save failed.', 'error') }
    finally { setCaseNumSaving(false) }
  }

  async function refreshCaseNumPreview() {
    const { prefix, separator, include_year, include_month, seq_length } = caseNumForm
    const params = new URLSearchParams({ prefix, separator, include_year: include_year ? 1 : 0, include_month: include_month ? 1 : 0, seq_length })
    try {
      const d = await httpFetch(`/api/admin/case-number-config/preview?${params}`, { headers: H }).then(r => r.json())
      setCaseNumPreview(d.preview || '')
    } catch { /* silent */ }
  }

  async function deleteCaseNumConfig(id) {
    if (!await confirm('Delete this configuration?')) return
    const res = await httpFetch(`/api/admin/case-number-config/${id}`, { method: 'DELETE', headers: H })
    if (res.ok) { flash('Deleted.', 'success'); loadCaseNumConfigs() }
    else { const d = await res.json(); flash(d.error, 'error') }
  }

  return (
    <>
      <SectionHeader title="Case Numbering Setup" desc="Configure auto-generated case number formats per organisation and case type." />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '0 0 400px', maxWidth: 440 }}>
          <div className="card-header"><h3>Configure Format</h3></div>
          <div className="card-body">
            <form onSubmit={saveCaseNumConfig}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Organisation (leave blank for global default)</label>
                <select className="form-control" value={caseNumOrgId} onChange={e => setCaseNumOrgId(e.target.value)}>
                  <option value="">— Global Default —</option>
                  {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Case Type</label>
                <select className="form-control" value={caseNumForm.case_type} onChange={e => setCaseNumForm(f => ({ ...f, case_type: e.target.value }))}>
                  {CASE_TYPES.map(t => <option key={t} value={t}>{t === 'ALL' ? 'All Case Types (Unified)' : t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Prefix *</label>
                  <input className="form-control" placeholder="e.g. CASE, MI, AE" value={caseNumForm.prefix} required
                    onChange={e => setCaseNumForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                    onBlur={refreshCaseNumPreview} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Separator</label>
                  <select className="form-control" value={caseNumForm.separator} onChange={e => { setCaseNumForm(f => ({ ...f, separator: e.target.value })); setTimeout(refreshCaseNumPreview, 50) }}>
                    <option value="-">Hyphen (-)</option>
                    <option value="/">Slash (/)</option>
                    <option value=".">Dot (.)</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Sequence Length</label>
                  <input className="form-control" type="number" min={3} max={10} value={caseNumForm.seq_length}
                    onChange={e => setCaseNumForm(f => ({ ...f, seq_length: parseInt(e.target.value, 10) }))}
                    onBlur={refreshCaseNumPreview} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={caseNumForm.include_year} onChange={e => { setCaseNumForm(f => ({ ...f, include_year: e.target.checked })); setTimeout(refreshCaseNumPreview, 50) }} />
                    Include Year
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={caseNumForm.include_month} onChange={e => { setCaseNumForm(f => ({ ...f, include_month: e.target.checked })); setTimeout(refreshCaseNumPreview, 50) }} />
                    Include Month
                  </label>
                </div>
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Preview:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: 'var(--primary)', letterSpacing: 1 }}>{caseNumPreview || '—'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={refreshCaseNumPreview}>Refresh Preview</button>
                <button type="submit" className="btn btn-primary" disabled={caseNumSaving}>{caseNumSaving ? 'Saving…' : 'Save Configuration'}</button>
              </div>
            </form>
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <div className="card-header"><h3>Saved Configurations ({caseNumConfigs.length})</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {caseNumLoading && <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
            {!caseNumLoading && caseNumConfigs.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No configurations yet. Global default will auto-generate as <code>CASE-YYYYMMDD-NNNNN</code>.
              </div>
            )}
            <table className="admin-table">
              <tbody>
                {caseNumConfigs.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.org_name || 'Global Default'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Case Type: {c.case_type}</div>
                    </td>
                    <td><code style={{ fontSize: 13, color: 'var(--primary)' }}>{c.preview}</code></td>
                    <td style={{ width: 80 }}>
                      {c.is_locked
                        ? <span className="badge" style={{ background: 'var(--warning-light)', color: 'var(--warning)', fontSize: 10 }}>Locked</span>
                        : <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => deleteCaseNumConfig(c.id)}>Delete</button>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
