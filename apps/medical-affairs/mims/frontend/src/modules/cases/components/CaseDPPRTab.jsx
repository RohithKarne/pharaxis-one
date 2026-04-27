import { useState, useEffect } from 'react'
import { confirm } from '../../../shared/utils/confirm'

const API = import.meta.env.VITE_API_URL || '/api'

const DOMAINS = [
  { key: 'contact_pii',         label: 'Contact PII',          desc: 'Names, emails, phone numbers of reporters/contacts' },
  { key: 'medical_data',        label: 'Medical Data',         desc: 'Clinical findings, diagnoses, medical history' },
  { key: 'case_narrative',      label: 'Case Narrative',       desc: 'Free-text case descriptions and summaries' },
  { key: 'reporter_info',       label: 'Reporter Info',        desc: 'Reporter identity and contact details' },
  { key: 'patient_demographics',label: 'Patient Demographics', desc: 'Age, gender, weight and other patient identifiers' },
  { key: 'inquiry_content',     label: 'Inquiry Content',      desc: 'Full text of MI inquiries and responses' },
]

const ACTION_RANK = { None: 0, Anonymize: 1, Delete: 2 }

export default function CaseDPPRTab({ id, headers }) {
  const [dpprOverrides,   setDpprOverrides]   = useState([])
  const [dpprTenantRules, setDpprTenantRules] = useState([])
  const [dpprLoading,     setDpprLoading]     = useState(false)
  const [dpprSaving,      setDpprSaving]      = useState({})
  const [dpprForms,       setDpprForms]       = useState({})
  const [dpprMsg,         setDpprMsg]         = useState({})

  useEffect(() => { loadDpprOverrides() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDpprOverrides() {
    if (!id) return
    setDpprLoading(true)
    try {
      const res  = await fetch(`${API}/admin/dppr/cases/${id}/overrides`, { headers })
      const data = await res.json()
      if (!res.ok) return
      setDpprOverrides(data.overrides || [])
      setDpprTenantRules(data.tenant_rules || [])
      const forms = {}
      ;(data.overrides || []).forEach(o => {
        forms[o.domain] = { action: o.action, retention_days: o.retention_days, override_reason: o.override_reason || '' }
      })
      setDpprForms(forms)
    } catch {}
    finally { setDpprLoading(false) }
  }

  async function saveDpprOverride(domain) {
    const form = dpprForms[domain] || {}
    if (!form.action) return
    setDpprSaving(p => ({ ...p, [domain]: true }))
    setDpprMsg(p => ({ ...p, [domain]: '' }))
    try {
      const res  = await fetch(`${API}/admin/dppr/cases/${id}/overrides`, {
        method: 'PUT', headers,
        body: JSON.stringify({ domain, action: form.action, retention_days: parseInt(form.retention_days, 10) || 365, override_reason: form.override_reason || '' }),
      })
      const data = await res.json()
      if (!res.ok) { setDpprMsg(p => ({ ...p, [domain]: data.error || 'Error saving.' })); return }
      setDpprMsg(p => ({ ...p, [domain]: 'Saved.' }))
      loadDpprOverrides()
    } catch { setDpprMsg(p => ({ ...p, [domain]: 'Network error.' })) }
    finally { setDpprSaving(p => ({ ...p, [domain]: false })) }
  }

  async function removeDpprOverride(domain) {
    if (!await confirm(`Remove DPPR override for "${domain}"?`)) return
    try {
      await fetch(`${API}/admin/dppr/cases/${id}/overrides/${domain}`, { method: 'DELETE', headers })
      setDpprMsg(p => ({ ...p, [domain]: 'Override removed.' }))
      loadDpprOverrides()
    } catch {}
  }

  return (
    <div className="cf-tab-pane">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Case-Level Data Privacy Overrides</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Override the tenant-level DPPR rule for individual domains on this case.
          Overrides must be <strong>equal or more restrictive</strong> than the tenant rule (e.g. you cannot set None if the tenant rule is Delete).
        </div>
      </div>

      {dpprLoading && <div className="cf-empty-msg">Loading privacy settings…</div>}

      {!dpprLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DOMAINS.map(domain => {
            const override         = dpprOverrides.find(o => o.domain === domain.key)
            const tenantRules      = dpprTenantRules.filter(r => r.domain === domain.key)
            const maxTenantAction  = tenantRules.reduce((max, r) => ACTION_RANK[r.action] > ACTION_RANK[max] ? r.action : max, 'None')
            const minTenantRetention = tenantRules.length ? Math.min(...tenantRules.map(r => r.retention_days)) : 365
            const form   = dpprForms[domain.key] || { action: override?.action || maxTenantAction || 'None', retention_days: override?.retention_days ?? minTenantRetention, override_reason: override?.override_reason || '' }
            const msg    = dpprMsg[domain.key] || ''
            const saving = dpprSaving[domain.key]

            return (
              <div key={domain.key} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{domain.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{domain.desc}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Tenant Rule</div>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: maxTenantAction === 'Delete' ? '#fee2e2' : maxTenantAction === 'Anonymize' ? '#fef9c3' : '#f1f5f9',
                      color:      maxTenantAction === 'Delete' ? '#dc2626' : maxTenantAction === 'Anonymize' ? '#854d0e' : '#475569',
                    }}>
                      {tenantRules.length === 0 ? 'No Rule' : `${maxTenantAction} / ${minTenantRetention}d`}
                    </span>
                  </div>
                  {override && (
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8' }}>
                      Override Active
                    </span>
                  )}
                </div>

                <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', background: '#fff' }}>
                  <div className="cf-form-field" style={{ minWidth: 140, margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Action</label>
                    <select value={form.action} onChange={e => setDpprForms(p => ({ ...p, [domain.key]: { ...form, action: e.target.value } }))}>
                      {['None', 'Anonymize', 'Delete'].filter(a => ACTION_RANK[a] >= ACTION_RANK[maxTenantAction]).map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="cf-form-field" style={{ minWidth: 120, margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Retention (days)</label>
                    <input type="number" min={1} max={minTenantRetention} value={form.retention_days}
                      onChange={e => setDpprForms(p => ({ ...p, [domain.key]: { ...form, retention_days: e.target.value } }))} />
                  </div>
                  <div className="cf-form-field" style={{ flex: 1, minWidth: 180, margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Override Reason</label>
                    <input type="text" placeholder="Reason for this override…" value={form.override_reason}
                      onChange={e => setDpprForms(p => ({ ...p, [domain.key]: { ...form, override_reason: e.target.value } }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="cf-save-btn" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => saveDpprOverride(domain.key)} disabled={saving}>
                      {saving ? 'Saving…' : override ? 'Update' : 'Set Override'}
                    </button>
                    {override && (
                      <button className="cf-delete-btn" style={{ padding: '7px 14px', fontSize: 12, background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer' }}
                        onClick={() => removeDpprOverride(domain.key)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {msg && (
                  <div style={{ padding: '6px 16px 10px', fontSize: 12, color: msg.includes('error') || msg.includes('Error') || msg.includes('less restrictive') ? '#dc2626' : '#15803d' }}>
                    {msg}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
