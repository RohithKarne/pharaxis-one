import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { confirm } from '../../../../shared/utils/confirm'
import { isPlatformAdmin } from '../../../../shared/utils/adminScope.js'

function formatDate(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return String(value)
  return dt.toLocaleString()
}

// An organisation grants Pharaxis support access to its cases for a set time,
// with a reason; a platform admin reads its cases only while a grant is active,
// and each case they open is listed here (Rohith's decision, 2026-10-04).
export default function SupportAccess() {
  const { token, user } = useAuth()
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )
  const canGrant = !isPlatformAdmin(user) && user?.role === 'admin'

  const [grants, setGrants] = useState([])
  const [views, setViews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [days, setDays] = useState(7)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await httpFetch('/api/admin/support-access', { headers })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load support access.')
      setGrants(Array.isArray(payload.grants) ? payload.grants : [])
      setViews(Array.isArray(payload.views) ? payload.views : [])
    } catch (err) {
      setError(err.message || 'Unable to load support access.')
    } finally {
      setLoading(false)
    }
  }, [headers, token])

  useEffect(() => { load() }, [load])

  const active = grants.find(g => g.is_active) || null

  async function grant() {
    if (!reason.trim()) { setError('Say why support access is being granted.'); return }
    setSaving(true)
    setError('')
    try {
      const response = await httpFetch('/api/admin/support-access', {
        method: 'POST', headers, body: JSON.stringify({ reason: reason.trim(), days }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to grant support access.')
      setReason('')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to grant support access.')
    } finally {
      setSaving(false)
    }
  }

  async function revoke(id) {
    if (!await confirm('Revoke support access now? Pharaxis staff will no longer be able to open this organisation\'s cases.')) return
    setError('')
    try {
      const response = await httpFetch(`/api/admin/support-access/${id}`, { method: 'DELETE', headers })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to revoke support access.')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to revoke support access.')
    }
  }

  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e2e8f0' }
  const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#0f172a' }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Support Access</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
          Pharaxis support staff can open this organisation's cases only while a grant below is active. Every case they open is recorded here.
        </p>
      </div>

      {error && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>{error}</div>}

      <div style={{ padding: '12px 14px', borderRadius: 8, marginBottom: 18, background: active ? '#ecfdf5' : '#f8fafc', border: `1px solid ${active ? '#a7f3d0' : '#e2e8f0'}`, fontSize: 13 }}>
        {loading ? 'Loading…' : active
          ? <>Support access is <strong>active</strong> until {formatDate(active.expires_at)} — granted by {active.granted_by_name || '—'}: “{active.reason}”.</>
          : <>No support access is granted. Pharaxis staff cannot open this organisation's cases.</>}
      </div>

      {canGrant && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155', flex: '1 1 320px' }}>
            Reason
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. ticket SUP-42 — case numbering investigation"
              style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
            For
            <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <button onClick={grant} disabled={saving} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {saving ? 'Granting…' : 'Grant support access'}
          </button>
        </div>
      )}

      <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#0f172a' }}>Grants</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead><tr><th style={th}>Granted</th><th style={th}>By</th><th style={th}>Reason</th><th style={th}>Until</th><th style={th}>Status</th><th style={th}></th></tr></thead>
        <tbody>
          {grants.length === 0 && !loading && <tr><td style={td} colSpan={6}>No grants yet.</td></tr>}
          {grants.map(g => (
            <tr key={g.id}>
              <td style={td}>{formatDate(g.created_at)}</td>
              <td style={td}>{g.granted_by_name || '—'}</td>
              <td style={td}>{g.reason}</td>
              <td style={td}>{formatDate(g.expires_at)}</td>
              <td style={td}>{g.is_active ? 'Active' : g.revoked_at ? `Revoked ${formatDate(g.revoked_at)} by ${g.revoked_by_name || '—'}` : 'Expired'}</td>
              <td style={td}>{canGrant && g.is_active && <button onClick={() => revoke(g.id)} style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 4, background: 'none', cursor: 'pointer', color: '#b91c1c' }}>Revoke</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#0f172a' }}>Cases opened by support staff</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>When</th><th style={th}>Who</th><th style={th}>Case</th></tr></thead>
        <tbody>
          {views.length === 0 && !loading && <tr><td style={td} colSpan={3}>No case has been opened under support access.</td></tr>}
          {views.map((v, i) => (
            <tr key={i}><td style={td}>{formatDate(v.created_at)}</td><td style={td}>{v.user_name}</td><td style={td}>{v.case_number || `#${v.case_id}`}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
