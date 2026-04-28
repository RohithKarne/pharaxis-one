import { useState, useEffect, useCallback } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import './DPPRPage.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const ACTION_OPTIONS = ['None', 'Anonymize', 'Delete']
const CONTACT_TYPES  = ['all', 'HCP', 'Patient', 'Other']
const CONSENT_TYPES  = ['all', 'Explicit', 'Implied', 'None']

const ACTION_RANK = { None: 0, Anonymize: 1, Delete: 2 }

const BLANK_RULE = {
  rule_name: '', domain: '', contact_type: 'all', consent_type: 'all',
  action: 'None', retention_days: 365, is_active: 1,
}

function actionBadge(action) {
  const cls = { None: 'dp-badge-none', Anonymize: 'dp-badge-anonymize', Delete: 'dp-badge-delete' }
  return <span className={`dp-badge ${cls[action] || 'dp-badge-none'}`}>{action}</span>
}

function statusBadge(status) {
  const cls = { success: 'dp-badge-success', failed: 'dp-badge-failed', partial: 'dp-badge-partial' }
  return <span className={`dp-badge ${cls[status] || 'dp-badge-none'}`}>{status}</span>
}

function fmtDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

export default function DPPRPage() {
  const { token, user } = useAuth()
  const H = { Authorization: `Bearer ${token}` }
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  const [tab, setTab]               = useState('rules')
  const [rules, setRules]           = useState([])
  const [domains, setDomains]       = useState([])
  const [execLog, setExecLog]       = useState([])
  const [total, setTotal]           = useState(0)
  const [logTotal, setLogTotal]     = useState(0)
  const [page, setPage]             = useState(1)
  const [logPage, setLogPage]       = useState(1)
  const [loading, setLoading]       = useState(false)
  const [modal, setModal]           = useState(null)   // null | 'add' | 'edit'
  const [editing, setEditing]       = useState(null)
  const [form, setForm]             = useState(BLANK_RULE)
  const [saving, setSaving]         = useState(false)
  const [running, setRunning]       = useState(false)
  const [runResult, setRunResult]   = useState(null)
  const [error, setError]           = useState(null)
  const LIMIT = 20

  const fetchDomains = useCallback(async () => {
    try {
      const data = await httpFetch('/api/admin/dppr/domains', { headers: H }).then(r => r.json())
      setDomains(data.domains || [])
    } catch (_) {}
  }, [token])

  const fetchRules = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const data = await httpFetch(`/api/admin/dppr?page=${p}&limit=${LIMIT}`, { headers: H }).then(r => r.json())
      setRules(data.rules || [])
      setTotal(data.total || 0)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [token, page])

  const fetchLog = useCallback(async (p = logPage) => {
    try {
      const data = await httpFetch(`/api/admin/dppr/execution-log?page=${p}&limit=${LIMIT}`, { headers: H }).then(r => r.json())
      setExecLog(data.logs || [])
      setLogTotal(data.total || 0)
    } catch (_) {}
  }, [token, logPage])

  useEffect(() => { fetchDomains() }, [fetchDomains])
  useEffect(() => { fetchRules(page) }, [page])
  useEffect(() => { if (tab === 'log') fetchLog(logPage) }, [tab, logPage])

  function openAdd() {
    setForm(BLANK_RULE)
    setEditing(null)
    setModal('add')
    setError(null)
  }

  function openEdit(rule) {
    setForm({
      rule_name: rule.rule_name, domain: rule.domain,
      contact_type: rule.contact_type, consent_type: rule.consent_type,
      action: rule.action, retention_days: rule.retention_days, is_active: rule.is_active,
    })
    setEditing(rule)
    setModal('edit')
    setError(null)
  }

  async function saveRule() {
    if (!form.rule_name.trim()) { setError('Rule name is required.'); return }
    if (!form.domain)           { setError('Data domain is required.'); return }
    setSaving(true); setError(null)
    try {
      const url    = editing ? `/api/admin/dppr/${editing.id}` : '/api/admin/dppr'
      const method = editing ? 'PUT' : 'POST'
      const res    = await httpFetch(url, {
        method, headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed.'); return }
      setModal(null)
      fetchRules(1)
      setPage(1)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function toggleRule(rule) {
    try {
      await httpFetch(`/api/admin/dppr/${rule.id}/toggle`, { method: 'PATCH', headers: H })
      fetchRules(page)
    } catch (_) {}
  }

  async function deleteRule(rule) {
    if (!await confirm(`Deactivate rule "${rule.rule_name}"?`)) return
    await httpFetch(`/api/admin/dppr/${rule.id}`, { method: 'DELETE', headers: H })
    fetchRules(page)
  }

  async function runNow() {
    setRunning(true); setRunResult(null); setError(null)
    try {
      const res  = await httpFetch('/api/admin/dppr/run-now', {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Run failed.'); return }
      setRunResult(data.results || [])
      fetchRules(page)
      if (tab === 'log') fetchLog(1)
    } catch (e) { setError(e.message) }
    finally { setRunning(false) }
  }

  const activeRules   = rules.filter(r => r.is_active)
  const deleteRules   = rules.filter(r => r.action === 'Delete' && r.is_active)
  const anonRules     = rules.filter(r => r.action === 'Anonymize' && r.is_active)

  return (
    <MIMSLayout showStatStrip={false}>
    <div className="dp-page">
      {/* Header */}
      <div className="dp-header">
        <div>
          <h1 className="dp-title">Data Protection &amp; Privacy Rules</h1>
          <p className="dp-subtitle">
            Define retention and anonymisation policies for personal data across case records.
            Rules run automatically every day at 02:00 UTC and can be triggered manually.
          </p>
        </div>
        {isAdmin && (
          <div className="dp-header-actions">
            <button className="dp-btn-run" onClick={runNow} disabled={running}>
              {running ? '⏳ Running…' : '▶ Run Now'}
            </button>
            <button className="dp-btn-primary" onClick={openAdd}>+ Add Rule</button>
          </div>
        )}
      </div>

      {error && <div style={{ padding:'10px 14px', background:'#fee2e2', color:'#dc2626', borderRadius:8, fontSize:13 }}>{error}</div>}

      {/* Run result */}
      {runResult && (
        <div className="dp-run-result">
          <div className="dp-run-result-title">✅ DPPR Run Complete — {runResult.length} rule(s) processed</div>
          {runResult.map((r, i) => (
            <div key={i} className="dp-run-result-row">
              {r.rule_name} ({r.domain}) — {r.action}: scanned {r.scanned}, affected {r.affected} — {r.status}
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="dp-stats">
        <div className="dp-stat-card">
          <div className="dp-stat-label">Total Rules</div>
          <div className="dp-stat-val">{total}</div>
        </div>
        <div className="dp-stat-card">
          <div className="dp-stat-label">Active</div>
          <div className={`dp-stat-val ${activeRules.length > 0 ? 'green' : ''}`}>{activeRules.length}</div>
        </div>
        <div className="dp-stat-card">
          <div className="dp-stat-label">Delete Rules</div>
          <div className={`dp-stat-val ${deleteRules.length > 0 ? 'red' : ''}`}>{deleteRules.length}</div>
        </div>
        <div className="dp-stat-card">
          <div className="dp-stat-label">Anonymize Rules</div>
          <div className={`dp-stat-val ${anonRules.length > 0 ? 'amber' : ''}`}>{anonRules.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="dp-tabs">
        <button className={`dp-tab${tab === 'rules' ? ' active' : ''}`} onClick={() => setTab('rules')}>Privacy Rules</button>
        <button className={`dp-tab${tab === 'log' ? ' active' : ''}`} onClick={() => setTab('log')}>Execution History</button>
      </div>

      {/* Rules tab */}
      {tab === 'rules' && (
        <div className="dp-card">
          <div className="dp-card-header">
            <span className="dp-card-title">Privacy Rules ({total})</span>
          </div>
          {loading ? (
            <div className="dp-empty">Loading…</div>
          ) : rules.length === 0 ? (
            <div className="dp-empty">No rules defined yet. Click <strong>+ Add Rule</strong> to create the first privacy rule.</div>
          ) : (
            <>
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Rule Name</th>
                    <th>Domain</th>
                    <th>Contact Type</th>
                    <th>Consent Type</th>
                    <th>Action</th>
                    <th>Retention (days)</th>
                    <th>Status</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.rule_name}</td>
                      <td>
                        <span style={{ fontSize:12, color:'#6366f1', fontWeight:600 }}>
                          {domains.find(d => d.key === r.domain)?.label || r.domain}
                        </span>
                      </td>
                      <td>{r.contact_type}</td>
                      <td>{r.consent_type}</td>
                      <td>{actionBadge(r.action)}</td>
                      <td style={{ fontWeight:600 }}>{r.retention_days}d</td>
                      <td>
                        <span className={`dp-badge ${r.is_active ? 'dp-badge-active' : 'dp-badge-inactive'}`}>
                          {r.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <div className="dp-row-actions">
                            <button className="dp-icon-btn primary" onClick={() => openEdit(r)} title="Edit">✏</button>
                            <button
                              className={`dp-icon-btn ${r.is_active ? 'dp-toggle-on' : 'dp-toggle-off'}`}
                              onClick={() => toggleRule(r)}
                              title={r.is_active ? 'Disable' : 'Enable'}
                            >{r.is_active ? '◉' : '○'}</button>
                            <button className="dp-icon-btn danger" onClick={() => deleteRule(r)} title="Deactivate">✕</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {total > LIMIT && (
                <div className="dp-pagination">
                  <span>Page {page} of {Math.ceil(total / LIMIT)}</span>
                  <div className="dp-pg-btns">
                    <button className="dp-pg-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                    <button className="dp-pg-btn" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Execution Log tab */}
      {tab === 'log' && (
        <div className="dp-card">
          <div className="dp-card-header">
            <span className="dp-card-title">Execution History ({logTotal})</span>
            <button className="dp-btn-secondary" style={{ fontSize:12, padding:'6px 12px' }}
              onClick={() => fetchLog(logPage)}>↺ Refresh</button>
          </div>
          {execLog.length === 0 ? (
            <div className="dp-empty">No execution history yet. Rules run daily at 02:00 UTC or use <strong>Run Now</strong>.</div>
          ) : (
            <>
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Executed At</th>
                    <th>Rule</th>
                    <th>Action</th>
                    <th>Triggered By</th>
                    <th>Scanned</th>
                    <th>Affected</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {execLog.map(l => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace:'nowrap', color:'#64748b' }}>{fmtDate(l.executed_at)}</td>
                      <td style={{ fontWeight:600 }}>{l.rule_name || `Rule #${l.rule_id}`}</td>
                      <td>{actionBadge(l.action_taken)}</td>
                      <td>
                        <span className={`dp-badge ${l.triggered_by === 'manual' ? 'dp-badge-anonymize' : 'dp-badge-none'}`}>
                          {l.triggered_by}
                        </span>
                      </td>
                      <td>{l.records_scanned}</td>
                      <td style={{ fontWeight: l.records_affected > 0 ? 700 : 400,
                                   color: l.records_affected > 0 ? '#6366f1' : '#94a3b8' }}>
                        {l.records_affected}
                      </td>
                      <td style={{ color:'#94a3b8' }}>{l.duration_ms ? `${l.duration_ms}ms` : '—'}</td>
                      <td>{statusBadge(l.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logTotal > LIMIT && (
                <div className="dp-pagination">
                  <span>Page {logPage} of {Math.ceil(logTotal / LIMIT)}</span>
                  <div className="dp-pg-btns">
                    <button className="dp-pg-btn" disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)}>← Prev</button>
                    <button className="dp-pg-btn" disabled={logPage >= Math.ceil(logTotal / LIMIT)} onClick={() => setLogPage(p => p + 1)}>Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div className="dp-modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="dp-modal">
            <div className="dp-modal-title">{modal === 'add' ? 'Add Privacy Rule' : 'Edit Privacy Rule'}</div>

            <div className="dp-info-box">
              Rules define what happens to personal data once the retention period expires.
              <strong> None</strong> = no action (passive).
              <strong> Anonymize</strong> = replaces PII fields with [ANONYMIZED].
              <strong> Delete</strong> = nulls out PII fields permanently.
            </div>

            {error && <div style={{ padding:'10px 14px', background:'#fee2e2', color:'#dc2626', borderRadius:8, fontSize:13, marginBottom:14 }}>{error}</div>}

            <div className="dp-form-row">
              <label className="dp-label">Rule Name *</label>
              <input className="dp-input" value={form.rule_name}
                onChange={e => setForm(f => ({ ...f, rule_name: e.target.value }))}
                placeholder="e.g. GDPR Contact Anonymisation — EU" />
            </div>

            <div className="dp-form-row">
              <label className="dp-label">Data Domain *</label>
              <select className="dp-select" value={form.domain}
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}>
                <option value="">— Select domain —</option>
                {domains.map(d => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
              {form.domain && domains.find(d => d.key === form.domain) && (
                <div className="dp-hint">{domains.find(d => d.key === form.domain).description}</div>
              )}
            </div>

            <div className="dp-form-grid">
              <div className="dp-form-row">
                <label className="dp-label">Contact Type</label>
                <select className="dp-select" value={form.contact_type}
                  onChange={e => setForm(f => ({ ...f, contact_type: e.target.value }))}>
                  {CONTACT_TYPES.map(t => <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>)}
                </select>
              </div>
              <div className="dp-form-row">
                <label className="dp-label">Consent Type</label>
                <select className="dp-select" value={form.consent_type}
                  onChange={e => setForm(f => ({ ...f, consent_type: e.target.value }))}>
                  {CONSENT_TYPES.map(t => <option key={t} value={t}>{t === 'all' ? 'All consent types' : t}</option>)}
                </select>
              </div>
            </div>

            <div className="dp-form-grid">
              <div className="dp-form-row">
                <label className="dp-label">Action *</label>
                <select className="dp-select" value={form.action}
                  onChange={e => setForm(f => ({ ...f, action: e.target.value }))}>
                  {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="dp-form-row">
                <label className="dp-label">Retention (days) *</label>
                <input className="dp-input" type="number" min="1" value={form.retention_days}
                  onChange={e => setForm(f => ({ ...f, retention_days: parseInt(e.target.value, 10) || 365 }))} />
                <div className="dp-hint">Data older than this will be processed.</div>
              </div>
            </div>

            {form.action === 'Delete' && (
              <div className="dp-warn-box" style={{ marginBottom:14 }}>
                ⚠ <strong>Delete</strong> action permanently nulls out all PII fields in the selected domain.
                This cannot be undone. Ensure your legal/compliance team has approved this rule.
              </div>
            )}

            <div className="dp-modal-actions">
              <button className="dp-btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="dp-btn-primary" onClick={saveRule} disabled={saving}>
                {saving ? 'Saving…' : modal === 'add' ? 'Create Rule' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </MIMSLayout>
  )
}
