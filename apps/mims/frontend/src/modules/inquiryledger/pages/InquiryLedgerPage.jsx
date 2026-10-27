/**
 * InquiryLedgerPage — MIPM-223: every open inquiry from every channel, its stage,
 * how long it has waited, and a light against its limit (Rohith, 27 Oct 2026).
 * Reddest and oldest first. A reader who may view only their own cases sees only
 * those. Styles shared with the Response Log.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../../responselog/responselog.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'
const STAGE_LABEL = { waiting_owner: 'Waiting for an owner', with_owner: 'With an owner', answered: 'Answered or handed off' }
const LIGHT = {
  red:   { text: 'Past limit', bg: '#fee2e2', fg: '#991b1b' },
  amber: { text: 'Near limit', bg: '#fef3c7', fg: '#92400e' },
  green: { text: 'Within limit', bg: '#dcfce7', fg: '#166534' },
  none:  { text: 'Waiting to close', bg: '#f1f5f9', fg: '#475569' },
}

function age(minutes) {
  const m = Math.max(0, Math.round(minutes))
  if (m < 120) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} days`
}

export default function InquiryLedgerPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const channel = params.get('channel') || ''
  const stage = params.get('stage') || ''
  const light = params.get('light') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const setFilter = (name, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value); else next.delete(name)
    if (name !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const q = new URLSearchParams({ page })
      if (channel) q.set('channel', channel)
      if (stage) q.set('stage', stage)
      if (light) q.set('light', light)
      const res = await httpFetch(`${API}/cases/ledger?${q}`, { headers })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || `Could not load the Inquiry Ledger (error ${res.status}).`); return }
      setData(d)
    } catch { setError('Network error.') }
    finally { setLoading(false) }
  }, [channel, headers, light, page, stage])

  useEffect(() => { load() }, [load])

  const t = data?.tiles
  const L = data?.limits
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>
      <div className="rl-page">
        <div className="rl-header">
          <div>
            <h1 className="rl-title">Inquiry Ledger</h1>
            <span className="rl-subtitle">
              Every open case from every channel, by how long it has waited.{data?.own_only ? ' You see the cases you own or created.' : ''}
            </span>
          </div>
          <button className="rl-refresh-btn" onClick={load} disabled={loading}>Refresh</button>
        </div>

        {t && (
          <>
            <div className="rl-stats">
              <Tile value={t.open_total} label="Open" onClick={() => { const next = new URLSearchParams(params); next.delete('stage'); next.delete('light'); next.delete('page'); setParams(next, { replace: true }) }} />
              <Tile value={t.waiting_owner} label="Waiting for an owner" onClick={() => setFilter('stage', 'waiting_owner')} />
              <Tile value={t.with_owner} label="With an owner" onClick={() => setFilter('stage', 'with_owner')} />
              <Tile value={t.answered} label="Answered or handed off" onClick={() => setFilter('stage', 'answered')} />
              <Tile value={t.amber} label="Near limit" color="#92400e" onClick={() => setFilter('light', 'amber')} />
              <Tile value={t.red} label="Past limit" color="#991b1b" onClick={() => setFilter('light', 'red')} />
            </div>
            <div style={{ fontSize: 13, color: '#475569' }}>
              Received in the last 24 hours: {t.received_24h.map(r => `${r.label} ${r.n}`).join(' · ')}
            </div>
            {L && (
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Limits, from when MIMS received the case: waiting for an owner — near at {age(L.waiting_owner.amber)}, past at {age(L.waiting_owner.red)} (a serious side effect: {age(L.waiting_owner_serious.amber)} and {age(L.waiting_owner_serious.red)});
                with an owner and no answer or hand-off — near at {age(L.with_owner.amber)}, past at {age(L.with_owner.red)}. A case newly past its limit is notified once to its owner, or to the case supervisors when nobody owns it.
              </div>
            )}
          </>
        )}

        <div className="rl-filters">
          <select className="rl-filter-select" aria-label="Channel" value={channel} onChange={e => setFilter('channel', e.target.value)}>
            <option value="">All channels</option>
            <option value="portal">Connected portal</option>
            <option value="email">Email</option>
            <option value="hand">Entered by hand</option>
            <option value="other">Other</option>
          </select>
          <select className="rl-filter-select" aria-label="Stage" value={stage} onChange={e => setFilter('stage', e.target.value)}>
            <option value="">All stages</option>
            {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="rl-filter-select" aria-label="Light" value={light} onChange={e => setFilter('light', e.target.value)}>
            <option value="">All lights</option>
            {Object.entries(LIGHT).map(([k, v]) => <option key={k} value={k}>{v.text}</option>)}
          </select>
          {(channel || stage || light) && <button className="rl-clear-btn" onClick={() => setParams({}, { replace: true })}>✕ Clear</button>}
        </div>

        {error && <div className="rl-error">{error}</div>}
        <div className="rl-table-wrap">
          <table className="rl-table">
            <thead>
              <tr><th>Case</th><th>Type</th><th>From</th><th>Stage</th><th>Owner</th><th>Waited</th><th>Light</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="rl-loading-row">Loading…</td></tr>}
              {!loading && data && data.rows.length === 0 && <tr><td colSpan={7} className="rl-empty-row">No open cases{channel || stage || light ? ' match these filters' : ''}.</td></tr>}
              {!loading && data?.rows.map(r => (
                <tr key={r.id} className="rl-row">
                  <td><button className="rl-case-link" onClick={() => navigate(`/cases/${r.id}`)}>{r.case_number || `#${r.id}`}</button></td>
                  <td><span className="rl-type-tag">{r.case_type}</span>{r.serious && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#991b1b' }}>Serious</span>}</td>
                  <td>{r.channel_label}</td>
                  <td>{STAGE_LABEL[r.stage]}</td>
                  <td>{r.owner_name || '—'}</td>
                  <td title={r.received_at ? new Date(r.received_at).toLocaleString() : ''}>{age(r.age_minutes)}</td>
                  <td><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: LIGHT[r.light].bg, color: LIGHT[r.light].fg }}>{LIGHT[r.light].text}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.total > data.page_size && (
          <div className="rl-pagination">
            <button className="rl-page-btn" disabled={page === 1} onClick={() => setFilter('page', String(page - 1))}>Prev</button>
            <span className="rl-page-info">Page {page} of {totalPages} · {data.total} cases</span>
            <button className="rl-page-btn" disabled={page >= totalPages} onClick={() => setFilter('page', String(page + 1))}>Next</button>
          </div>
        )}
      </div>
    </MIMSLayout>
  )
}

function Tile({ value, label, color, onClick }) {
  return (
    <button type="button" className="rl-stat" onClick={onClick} style={{ cursor: 'pointer' }}>
      <span className="rl-stat-val" style={color ? { color } : undefined}>{value}</span>
      <span className="rl-stat-label">{label}</span>
    </button>
  )
}
