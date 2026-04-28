import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'

import { apiClient, tokenFromH } from '../../../shared/api/apiClient'

const __apiClientToResponse = (ok, status, payload) => ({
  ok,
  status,
  json: async () => payload,
  text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})),
  blob: async () => new Blob([typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})], { type: 'application/json' }),
})

const __apiClientParseBody = (body) => {
  if (typeof body !== 'string') return body
  try { return JSON.parse(body) } catch (_) { return body }
}

async function apiFetch(url, options = {}) {
  const method = String(options?.method || 'GET').toUpperCase()
  const headers = options?.headers || {}
  const headerToken = typeof headers?.get === 'function'
    ? tokenFromH({ Authorization: headers.get('Authorization') })
    : tokenFromH(headers)
  const token = headerToken || (typeof localStorage !== 'undefined' ? (localStorage.getItem('token') || '') : '')
  const api = apiClient(token)
  const rawBody = options?.body
  const body = __apiClientParseBody(rawBody)

  try {
    let data
    if (rawBody instanceof FormData) {
      data = await api.upload(url, rawBody)
    } else if (method === 'GET') {
      data = await api.get(url)
    } else if (method === 'POST') {
      data = await api.post(url, body)
    } else if (method === 'PUT') {
      data = await api.put(url, body)
    } else if (method === 'PATCH') {
      data = await api.patch(url, body)
    } else if (method === 'DELETE') {
      data = await api.del(url)
    } else {
      data = await api.get(url)
    }
    return __apiClientToResponse(true, 200, data ?? {})
  } catch (err) {
    return __apiClientToResponse(false, err?.status || 500, err?.data || { message: err?.message || 'Request failed' })
  }
}

const API = import.meta.env.VITE_API_URL || '/api'

const SEVERITY_COLORS = {
  critical: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  warning:  { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
}

const STATUS_COLORS = {
  queued:     { bg: '#f3f4f6', color: '#374151' },
  processing: { bg: '#dbeafe', color: '#1e40af' },
  complete:   { bg: '#d1fae5', color: '#065f46' },
  failed:     { bg: '#fee2e2', color: '#991b1b' },
}

function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d)) return s
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ScoreBadge({ score }) {
  const color = score >= 80 ? '#065f46' : score >= 60 ? '#92400e' : '#991b1b'
  const bg    = score >= 80 ? '#d1fae5' : score >= 60 ? '#fef3c7' : '#fee2e2'
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 10, fontWeight: 600, fontSize: 12 }}>
      {score}/100
    </span>
  )
}

// ─── Retrospective QA Reports Panel ──────────────────────────────────────────
function QAReportsPanel({ H }) {
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [reports,      setReports]      = useState([])
  const [loading,      setLoading]      = useState(false)
  const [creating,     setCreating]     = useState(false)
  const [form,         setForm]         = useState({ report_name: '', date_range_start: '', date_range_end: '', case_type_filter: '' })
  const [selectedReport, setSelectedReport] = useState(null)
  const [reportDetail,   setReportDetail]   = useState(null)
  const [detailLoading,  setDetailLoading]  = useState(false)
  const [msg,          setMsg]          = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await apiFetch(`${API}/admin/qa/reports`, { headers })
      const data = await res.json()
      setReports(data.reports || [])
    } catch { setReports([]) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  // Poll every 5s while any report is queued or processing
  useEffect(() => {
    const hasActive = reports.some(r => r.status === 'queued' || r.status === 'processing')
    if (!hasActive) return
    const timer = setInterval(() => load(), 5000)
    return () => clearInterval(timer)
  }, [reports, load])

  async function createReport() {
    if (!form.report_name.trim()) { setMsg('Report name required.'); return }
    setCreating(true)
    try {
      const res  = await apiFetch(`${API}/admin/qa/reports`, { method: 'POST', headers, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg('Report queued. Processing in background.')
      setForm({ report_name: '', date_range_start: '', date_range_end: '', case_type_filter: '' })
      setTimeout(() => { setMsg(''); load() }, 2000)
    } catch (err) {
      setMsg(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function openReport(report) {
    setSelectedReport(report)
    setDetailLoading(true)
    try {
      const res  = await apiFetch(`${API}/admin/qa/reports/${report.id}`, { headers })
      const data = await res.json()
      setReportDetail(data)
    } catch { setReportDetail(null) }
    finally { setDetailLoading(false) }
  }

  if (selectedReport) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setSelectedReport(null); setReportDetail(null) }}>
            ← Back to Reports
          </button>
          <h3 style={{ margin: 0, fontSize: 16 }}>{selectedReport.report_name}</h3>
          <span style={{ ...STATUS_COLORS[selectedReport.status], padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
            {selectedReport.status}
          </span>
        </div>

        {detailLoading ? (
          <div style={{ color: 'var(--text-secondary)', padding: 20 }}>Loading report…</div>
        ) : reportDetail ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total Cases', value: reportDetail.report.case_count },
                { label: 'Flagged Cases', value: reportDetail.report.flagged_count },
                { label: 'Avg Quality Score', value: reportDetail.report.avg_quality_score ? `${Number(reportDetail.report.avg_quality_score).toFixed(1)}/100` : '—' },
                { label: 'Completed', value: fmtDate(reportDetail.report.completed_at) },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)' }}>
                  {['Case Number', 'Type', 'Date Received', 'Quality Score', 'Flags', 'Critical', 'Warnings'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(reportDetail.items || []).map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{item.case_number || `#${item.case_id}`}</td>
                    <td style={{ padding: '8px 12px' }}>{item.case_type || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{item.date_received || '—'}</td>
                    <td style={{ padding: '8px 12px' }}><ScoreBadge score={item.quality_score} /></td>
                    <td style={{ padding: '8px 12px' }}>{item.flags_count}</td>
                    <td style={{ padding: '8px 12px', color: item.critical_count > 0 ? '#991b1b' : 'var(--text-secondary)' }}>{item.critical_count}</td>
                    <td style={{ padding: '8px 12px', color: item.warning_count > 0 ? '#92400e' : 'var(--text-secondary)' }}>{item.warning_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div style={{ color: 'var(--text-secondary)' }}>Failed to load report detail.</div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Create new report */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Run Retrospective QA</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Report Name *</label>
            <input
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
              value={form.report_name}
              onChange={e => setForm(p => ({ ...p, report_name: e.target.value }))}
              placeholder="e.g. Q1 2026 AE Review"
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>From Date</label>
            <input type="date" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
              value={form.date_range_start} onChange={e => setForm(p => ({ ...p, date_range_start: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>To Date</label>
            <input type="date" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
              value={form.date_range_end} onChange={e => setForm(p => ({ ...p, date_range_end: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Case Type</label>
            <select style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
              value={form.case_type_filter} onChange={e => setForm(p => ({ ...p, case_type_filter: e.target.value }))}>
              <option value="">All Types</option>
              <option value="AE">Adverse Event (AE)</option>
              <option value="MI">Medical Information (MI)</option>
              <option value="PC">Product Complaint (PC)</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={createReport} disabled={creating} style={{ whiteSpace: 'nowrap' }}>
            {creating ? 'Queuing…' : '▶ Run Report'}
          </button>
        </div>
        {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.includes('queued') ? '#065f46' : '#991b1b' }}>{msg}</div>}
      </div>

      {/* Reports list */}
      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: 16 }}>Loading reports…</div>
      ) : reports.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', padding: 16 }}>No reports yet. Run your first retrospective QA above.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)' }}>
              {['Report Name', 'Case Type', 'Date Range', 'Cases', 'Flagged', 'Avg Score', 'Status', 'Created', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{r.report_name}</td>
                <td style={{ padding: '8px 12px' }}>{r.case_type_filter || 'All'}</td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {r.date_range_start ? `${r.date_range_start} → ${r.date_range_end || '…'}` : 'All dates'}
                </td>
                <td style={{ padding: '8px 12px' }}>{r.case_count}</td>
                <td style={{ padding: '8px 12px' }}>{r.flagged_count}</td>
                <td style={{ padding: '8px 12px' }}>{r.avg_quality_score ? <ScoreBadge score={Math.round(r.avg_quality_score)} /> : '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ ...STATUS_COLORS[r.status], padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(r.created_at)}</td>
                <td style={{ padding: '8px 12px' }}>
                  {r.status === 'complete' && (
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => openReport(r)}>
                      View
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── QA Rules Config Panel ────────────────────────────────────────────────────
function QARulesPanel({ H }) {
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [rules,   setRules]   = useState([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState({})
  const [msg,     setMsg]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await apiFetch(`${API}/admin/qa/rules`, { headers })
      const data = await res.json()
      setRules(data.rules || [])
    } catch { setRules([]) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  async function toggleRule(rule) {
    setSaving(p => ({ ...p, [rule.id]: true }))
    try {
      await apiFetch(`${API}/admin/qa/rules/${rule.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ is_active: rule.is_active ? 0 : 1 }),
      })
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: r.is_active ? 0 : 1 } : r))
    } catch (err) {
      setMsg('Failed to update rule.')
    } finally {
      setSaving(p => ({ ...p, [rule.id]: false }))
    }
  }

  async function resetRules() {
    if (!confirm('Reset all rules to system defaults? Your customisations will be lost.')) return
    try {
      await apiFetch(`${API}/admin/qa/rules/reset`, { method: 'POST', headers })
      setMsg('Rules reset to defaults.')
      load()
      setTimeout(() => setMsg(''), 2500)
    } catch { setMsg('Reset failed.') }
  }

  const grouped = rules.reduce((acc, r) => {
    const key = r.rule_type
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  const ruleTypeLabels = {
    field_check:       'Field Completeness',
    narrative_check:   'Narrative Quality',
    timeliness_check:  'Timeliness',
    regulatory_flag:   'Regulatory Compliance',
    duplicate_signal:  'Duplicate Detection',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Configure which QA rules apply for your organisation. Toggle rules on/off. Thresholds are adjustable.
        </p>
        <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={resetRules}>↺ Reset to Defaults</button>
      </div>
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: msg.includes('Failed') ? '#991b1b' : '#065f46' }}>{msg}</div>}
      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: 16 }}>Loading rules…</div>
      ) : (
        Object.entries(grouped).map(([type, typeRules]) => (
          <div key={type} style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              {ruleTypeLabels[type] || type}
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)' }}>
                  {['Rule Name', 'Case Types', 'Severity', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {typeRules.map(rule => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid var(--border)', opacity: rule.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{rule.rule_name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{rule.case_types}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ ...SEVERITY_COLORS[rule.severity], padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: `1px solid ${SEVERITY_COLORS[rule.severity].border}` }}>
                        {rule.severity}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ color: rule.is_active ? '#065f46' : '#9ca3af', fontWeight: 500 }}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={() => toggleRule(rule)}
                        disabled={!!saving[rule.id]}
                      >
                        {saving[rule.id] ? '…' : rule.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}

// ─── Manager Override Dashboard Panel ────────────────────────────────────────
function QAOverridesPanel({ H }) {
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [overrides, setOverrides] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [filter,    setFilter]    = useState({ from_date: '', to_date: '' })
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 50 })
      if (filter.from_date) params.append('from_date', filter.from_date)
      if (filter.to_date)   params.append('to_date',   filter.to_date)
      const res  = await apiFetch(`${API}/admin/qa/overrides?${params}`, { headers })
      const data = await res.json()
      setOverrides(data.overrides || [])
      setTotal(data.total || 0)
    } catch { setOverrides([]) }
    finally { setLoading(false) }
  }, [token, page, filter])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>From</label>
          <input type="date" style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
            value={filter.from_date} onChange={e => setFilter(p => ({ ...p, from_date: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>To</label>
          <input type="date" style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
            value={filter.to_date} onChange={e => setFilter(p => ({ ...p, to_date: e.target.value }))} />
        </div>
        <button className="btn btn-primary" onClick={() => { setPage(1); load() }}>Filter</button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {total} override{total !== 1 ? 's' : ''} found
        </span>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: 16 }}>Loading overrides…</div>
      ) : overrides.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', padding: 16 }}>No overrides found for selected period.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)' }}>
              {['Case', 'Type', 'Overridden By', 'Critical Flags', 'Quality Score', 'Reason Provided', 'Override Time'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overrides.map(o => (
              <tr key={o.id} style={{ borderBottom: '1px solid var(--border)', background: !o.override_reason && o.critical_count > 0 ? '#fff7f7' : 'transparent' }}>
                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{o.case_number || `#${o.case_id}`}</td>
                <td style={{ padding: '8px 12px' }}>{o.case_type || '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ fontWeight: 500 }}>{o.override_by_name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{o.override_by_email}</div>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {o.critical_count > 0
                    ? <span style={{ color: '#991b1b', fontWeight: 600 }}>{o.critical_count} critical</span>
                    : <span style={{ color: 'var(--text-secondary)' }}>{o.warning_count} warnings</span>}
                </td>
                <td style={{ padding: '8px 12px' }}><ScoreBadge score={o.quality_score} /></td>
                <td style={{ padding: '8px 12px' }}>
                  {o.override_reason
                    ? <span style={{ color: '#374151' }}>{o.override_reason}</span>
                    : <span style={{ color: '#ef4444', fontWeight: 500 }}>⚠ No reason given</span>}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(o.override_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function AdminQASection({ contentSection, H }) {
  const tabMap = {
    'qa-reports':   { label: 'Retrospective QA Reports', Component: QAReportsPanel },
    'qa-rules':     { label: 'QA Rules Configuration',   Component: QARulesPanel   },
    'qa-overrides': { label: 'Override Dashboard',        Component: QAOverridesPanel },
  }

  const active = tabMap[contentSection]
  if (!active) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Section not found.</div>

  const { label, Component } = active

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{label}</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          {contentSection === 'qa-reports'   && 'Run batch QA audits on historical cases. View quality scores per case.'}
          {contentSection === 'qa-rules'     && 'Configure QA rules for your organisation. Rules apply to all real-time and retrospective evaluations.'}
          {contentSection === 'qa-overrides' && 'View all QA flag overrides by users. Critical overrides without reasons are highlighted.'}
        </p>
      </div>
      <Component H={H} />
    </div>
  )
}
