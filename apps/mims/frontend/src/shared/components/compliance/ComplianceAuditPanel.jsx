/**
 * ComplianceAuditPanel — Theme 9 (Wave 5) inspector-ready audit reader.
 *
 * Tabs:
 *   1. E-signatures (with hash chain verification)
 *   2. Masked reveals
 *   3. Field-value changes (powered by Wave 0 #2 field_value_history)
 *
 * Lives in the case detail drawer or under System > AI QA Engine for
 * cross-case reads. Admin-gated; exports CSV via the compliance route.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function ComplianceAuditPanel({ caseId = null }) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme9_compliance')
  const [tab, setTab] = useState('esign')
  const [esigns,  setESigns]  = useState([])
  const [reveals, setReveals] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const H = { Authorization: `Bearer ${token}` }
    try {
      const promises = [
        httpFetch(`/api/admin/esign?case_id=${caseId || ''}`, { headers: H }).then(r => r.json()),
        httpFetch(`/api/admin/masked-reveal-log?${caseId ? `entity_type=case&entity_id=${caseId}` : ''}`, { headers: H }).then(r => r.json()),
        caseId
          ? httpFetch(`/api/field-history?entity_type=case&entity_id=${caseId}&limit=500`, { headers: H }).then(r => r.json())
          : Promise.resolve({ history: [] }),
      ]
      const [a, b, c] = await Promise.all(promises)
      setESigns(a.events || []); setReveals(b.reveals || []); setHistory(c.history || [])
    } catch { /* tolerate */ } finally { setLoading(false) }
  }, [token, caseId])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  if (!enabled) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        Compliance audit requires <strong>cf.theme9_compliance</strong>.
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--surface,#fff)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        <Tab active={tab==='esign'} onClick={() => setTab('esign')}    label={`E-signatures (${esigns.length})`} />
        <Tab active={tab==='reveal'} onClick={() => setTab('reveal')}  label={`Masked reveals (${reveals.length})`} />
        <Tab active={tab==='history'} onClick={() => setTab('history')} label={`Field changes (${history.length})`} />
        <span style={{ flex: 1 }} />
        <a href={`/api/compliance/audit-export.csv${caseId ? `?case_id=${caseId}` : ''}`}
           target="_blank" rel="noreferrer"
           style={{ alignSelf: 'center', marginRight: 12, fontSize: 12, fontWeight: 600, color: '#1a4f9c', textDecoration: 'none' }}>
          ↓ Export CSV
        </a>
      </div>
      <div style={{ maxHeight: 460, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 14, color: 'var(--text-muted)' }}>Loading…</div>}
        {!loading && tab === 'esign'   && <ESignTable rows={esigns} />}
        {!loading && tab === 'reveal'  && <RevealTable rows={reveals} />}
        {!loading && tab === 'history' && <HistoryTable rows={history} />}
      </div>
    </div>
  )
}

function Tab({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      background: active ? 'var(--surface,#fff)' : 'var(--surface-alt,#fafafa)',
      border: 'none',
      borderBottom: `2px solid ${active ? 'var(--accent,#1a4f9c)' : 'transparent'}`,
      color: active ? 'var(--accent,#1a4f9c)' : 'var(--text-secondary)',
    }}>{label}</button>
  )
}

function ESignTable({ rows }) {
  if (!rows.length) return <Empty msg="No e-signatures yet." />
  return (
    <table style={tbl}>
      <thead><tr style={trH}><th style={th}>When</th><th style={th}>Case</th><th style={th}>Transition</th>
        <th style={th}>Signed by</th><th style={th}>Meaning / Reason</th><th style={th}>Hash chain</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={trB}>
            <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
            <td style={td}>#{r.case_id}</td>
            <td style={td}><strong>{r.transition}</strong> {r.from_status && `${r.from_status}→${r.to_status || ''}`}</td>
            <td style={td}>{r.signed_by_name || r.signed_name || `User ${r.signed_by}`}</td>
            <td style={{ ...td, maxWidth: 280 }}>
              <div>{r.meaning}</div>
              {r.reason && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>{r.reason}</div>}
            </td>
            <td style={{ ...td, fontFamily: 'monospace', fontSize: 10 }}>{(r.hash_chain || '').slice(0, 14)}…</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RevealTable({ rows }) {
  if (!rows.length) return <Empty msg="No masked reveals logged." />
  return (
    <table style={tbl}>
      <thead><tr style={trH}><th style={th}>When</th><th style={th}>By</th><th style={th}>Entity</th>
        <th style={th}>Field</th><th style={th}>Reason</th><th style={th}>IP</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={trB}>
            <td style={td}>{new Date(r.revealed_at).toLocaleString()}</td>
            <td style={td}>{r.revealed_by_name || r.revealed_by_email || `User ${r.revealed_by}`}</td>
            <td style={td}>{r.entity_type} #{r.entity_id}</td>
            <td style={td}>{r.section_name ? `${r.section_name}/` : ''}{r.field_name}</td>
            <td style={{ ...td, maxWidth: 280 }}>{r.reason || '–'}</td>
            <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{r.ip_address || '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function HistoryTable({ rows }) {
  if (!rows.length) return <Empty msg="No field changes recorded." />
  return (
    <table style={tbl}>
      <thead><tr style={trH}><th style={th}>When</th><th style={th}>By</th><th style={th}>Field</th>
        <th style={th}>Old → New</th><th style={th}>Reason</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={trB}>
            <td style={td}>{new Date(r.changed_at).toLocaleString()}</td>
            <td style={td}>{r.changed_by_name || `User ${r.changed_by ?? '—'}`}</td>
            <td style={td}>{r.section_name ? `${r.section_name}/` : ''}{r.field_name}</td>
            <td style={td}>
              <span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{r.old_value || '∅'}</span>
              {' → '}
              <span style={{ color: '#1a7a3f' }}>{r.new_value || '∅'}</span>
            </td>
            <td style={{ ...td, maxWidth: 280, fontStyle: r.reason ? 'normal' : 'italic',
              color: r.reason ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {r.reason || '(none)'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Empty({ msg }) {
  return <div style={{ padding: 22, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{msg}</div>
}

const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const trH = { background: 'var(--surface-alt,#fafafa)', textAlign: 'left' }
const trB = { borderTop: '1px solid var(--border)' }
const th  = { padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }
const td  = { padding: '6px 10px', verticalAlign: 'top' }
