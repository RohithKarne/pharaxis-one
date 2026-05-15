import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

function formatDate(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return String(value)
  return dt.toLocaleString()
}

export default function LoggedInUsers() {
  const { token } = useAuth()
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busySessionId, setBusySessionId] = useState(null)

  const loadUsers = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await httpFetch('/api/admin/logged-in-users', { headers })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load logged in users.')
      setUsers(Array.isArray(payload.users) ? payload.users : [])
    } catch (err) {
      setError(err.message || 'Unable to load logged in users.')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [headers, token])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  async function signOutSession(sessionId) {
    if (!sessionId) return
    setBusySessionId(sessionId)
    setError('')
    try {
      const response = await httpFetch(`/api/admin/logged-in-users/${sessionId}/sign-out`, {
        method: 'POST',
        headers,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to sign out user.')
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to sign out user.')
    } finally {
      setBusySessionId(null)
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Logged In Users</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Active sessions currently signed in to MIMS or Admin.
          </p>
        </div>
        <button
          onClick={loadUsers}
          disabled={loading}
          style={{
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#334155',
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.65 : 1,
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={thStyle}>Sign out</th>
              <th style={thStyle}>Login date</th>
              <th style={thStyle}>User id</th>
              <th style={thStyle}>Full name</th>
              <th style={thStyle}>Application</th>
              <th style={thStyle}>Tenant</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>Loading logged in users…</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>No active logged-in users found.</td>
              </tr>
            ) : (
              users.map((row) => (
                <tr key={row.session_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={tdStyle}>
                    <button
                      onClick={() => signOutSession(row.session_id)}
                      disabled={busySessionId === row.session_id}
                      style={{
                        border: '1px solid #fecaca',
                        background: '#fff1f2',
                        color: '#be123c',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: busySessionId === row.session_id ? 'not-allowed' : 'pointer',
                        opacity: busySessionId === row.session_id ? 0.65 : 1,
                      }}
                    >
                      {busySessionId === row.session_id ? 'Signing out…' : 'Sign out'}
                    </button>
                  </td>
                  <td style={tdStyle}>{formatDate(row.login_date)}</td>
                  <td style={tdStyle}>{row.user_id}</td>
                  <td style={tdStyle}>{row.full_name || '—'}</td>
                  <td style={tdStyle}>{row.application || '—'}</td>
                  <td style={tdStyle}>{row.tenant || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 700,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
}

const tdStyle = {
  padding: '10px 12px',
  fontSize: 13,
  color: '#0f172a',
  verticalAlign: 'middle',
}

const emptyCellStyle = {
  padding: '20px 12px',
  textAlign: 'center',
  fontSize: 13,
  color: '#64748b',
}
