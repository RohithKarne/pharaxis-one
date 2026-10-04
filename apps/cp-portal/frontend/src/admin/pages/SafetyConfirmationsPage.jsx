import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

// CPPM-127: who has confirmed each high and critical safety letter (CPPM-114).
// Reading only. "Addressed to" is every active doctor the letter's audience covers.

const fmt = (d) => d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : null

export default function SafetyConfirmationsPage() {
  const { clientId } = useParams()
  const [letters, setLetters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(null)   // the letter being looked at, with its doctors
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    setLoading(true); setOpen(null)
    fetch(`/api/admin/safety/${clientId}/confirmations`, { headers: adminHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setLetters(d.letters || []))
      .catch(() => setError('Could not load the safety letters. Reload the page to try again.'))
      .finally(() => setLoading(false))
  }, [clientId])

  async function show(id) {
    setMsg('')
    if (open?.id === id) { setOpen(null); return }
    const res = await fetch(`/api/admin/safety/${clientId}/confirmations/${id}`, { headers: adminHeaders() })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(d.error || 'Could not load this letter.'); return }
    setOpen(d.letter)
  }

  async function exportCsv() {
    setMsg('')
    try {
      const res = await fetch(`/api/admin/safety/${clientId}/confirmations/${open.id}/export`, { headers: adminHeaders() })
      if (!res.ok) throw new Error('Export failed.')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `safety-confirmations-${clientId}-${open.id}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setMsg(err.message)
    }
  }

  if (loading) return <AdminLayout><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="cp-section-header"><h2>Safety Confirmations</h2></div>
      <p style={{ fontSize: 13, color: '#4B5563', marginTop: 0 }}>
        High and critical safety letters ask each signed-in doctor to confirm they have read them.
        This shows who has, out of the active doctors each letter is addressed to.
      </p>
      {error && <div className="cp-error" role="alert">{error}</div>}
      {msg && <div className="cp-error" role="alert">{msg}</div>}

      {!error && letters.length === 0 ? (
        <div className="cp-empty">No high or critical safety letters yet.</div>
      ) : (
        <table className="cp-table">
          <thead>
            <tr><th>Letter</th><th>Severity</th><th>Status</th><th>Confirmed</th><th></th></tr>
          </thead>
          <tbody>
            {letters.map(l => (
              <tr key={l.id}>
                <td>{l.title}</td>
                <td style={{ textTransform: 'capitalize' }}>{l.severity}</td>
                <td style={{ textTransform: 'capitalize' }}>{l.status}</td>
                <td>{l.confirmed} of {l.addressed}{l.addressed ? ` (${Math.round(100 * l.confirmed / l.addressed)}%)` : ''}</td>
                <td><button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => show(l.id)} aria-expanded={open?.id === l.id}>
                  {open?.id === l.id ? 'Hide doctors' : 'Show doctors'}
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <section className="cp-card" style={{ marginTop: 16 }} aria-label={`Doctors for ${open.title}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{open.title}: {open.confirmed} of {open.addressed} confirmed</h3>
            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={exportCsv}>Export CSV</button>
          </div>
          {open.doctors.length === 0 ? (
            <p style={{ fontSize: 13 }}>No active doctor is addressed by this letter.</p>
          ) : (
            <table className="cp-table" style={{ marginTop: 12 }}>
              <thead><tr><th>Doctor</th><th>Email</th><th>Type</th><th>Confirmed</th></tr></thead>
              <tbody>
                {open.doctors.map(d => (
                  <tr key={d.id}>
                    <td>{d.first_name} {d.last_name}</td>
                    <td>{d.email}</td>
                    <td>{d.user_type || 'other'}</td>
                    <td>
                      {fmt(d.acknowledged_at) || <span style={{ color: '#B45309' }}>Not yet</span>}
                      {!d.addressed && <span style={{ color: '#4B5563' }}> · no longer active or addressed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </AdminLayout>
  )
}
