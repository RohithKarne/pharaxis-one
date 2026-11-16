/**
 * EmergencySafetyAdmin.jsx — Emergency Safety Physician Directory
 *
 * Manages 24/7 on-call medical safety contacts for expedited serious AE handoffs
 * and high-priority pharmacovigilance escalation (Ticket 6, Clinical Governance).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

const shell = { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface,#fff)' }
const box = { background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', padding: 16, marginBottom: 14 }
const th = { padding: '8px 12px', borderBottom: '1px solid var(--border,#e5e7eb)', fontWeight: 600, color: 'var(--text-secondary,#374151)' }
const td = { padding: '8px 12px', borderBottom: '1px solid var(--border,#e5e7eb)' }
const ipt = { padding: '6px 10px', border: '1px solid var(--border,#d1d5db)', borderRadius: 2, fontSize: 13, width: '100%' }
const primaryBtn = { background: 'var(--primary,#1e40af)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 2, cursor: 'pointer', fontWeight: 600, fontSize: 13 }
const miniBtn = (color = '#374151') => ({ background: 'none', border: '1px solid var(--border,#d1d5db)', color, padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontSize: 11, marginLeft: 4 })

export default function EmergencySafetyAdmin() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [contacts, setContacts] = useState([])
  const [edit, setEdit] = useState(null)
  const [flash, setFlash] = useState(null)
  const [loading, setLoading] = useState(false)

  function showFlash(text, type = 'success') {
    setFlash({ text, type })
    setTimeout(() => setFlash(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpFetch('/api/admin/emergency-safety-contacts', { headers: H })
      const data = await res.json()
      setContacts(data.contacts || [])
    } catch (err) {
      showFlash(err.message || 'Failed to load safety contacts', 'error')
    } finally {
      setLoading(false)
    }
  }, [H])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!edit?.physician_name || !edit?.email || !edit?.phone_24h) {
      showFlash('Physician name, email, and 24h phone are required', 'error')
      return
    }
    try {
      const path = edit.id ? `/api/admin/emergency-safety-contacts/${edit.id}` : '/api/admin/emergency-safety-contacts'
      const method = edit.id ? 'PUT' : 'POST'
      const res = await httpFetch(path, { method, headers: H, body: JSON.stringify(edit) })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Save failed')
      }
      showFlash(edit.id ? 'Contact updated' : 'Safety physician added')
      setEdit(null)
      load()
    } catch (err) {
      showFlash(err.message, 'error')
    }
  }

  async function makePrimary(id) {
    try {
      const res = await httpFetch(`/api/admin/emergency-safety-contacts/${id}`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({ is_primary: 1 })
      })
      if (!res.ok) throw new Error('Failed to set primary')
      showFlash('Designated as primary safety contact')
      load()
    } catch (err) {
      showFlash(err.message, 'error')
    }
  }

  async function remove(id) {
    if (!confirm('Are you sure you want to remove this physician from the emergency safety directory?')) return
    try {
      const res = await httpFetch(`/api/admin/emergency-safety-contacts/${id}`, { method: 'DELETE', headers: H })
      if (!res.ok) throw new Error('Delete failed')
      showFlash('Contact removed')
      load()
    } catch (err) {
      showFlash(err.message, 'error')
    }
  }

  return (
    <div style={shell} data-testid="emergency-safety-admin">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border,#e5e7eb)' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 18 }}>Emergency Safety Physician Directory</h1>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted,#6b7280)' }}>
          24/7 on-call medical safety physicians for expedited serious AE handoffs and immediate pharmacovigilance escalation.
        </p>
      </div>

      {flash && (
        <div className={`alert alert-${flash.type === 'error' ? 'error' : 'success'}`} style={{ margin: '12px 20px' }}>
          {flash.text}
        </div>
      )}

      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() =>
            setEdit({
              physician_name: '',
              medical_title: 'Medical Safety Officer',
              email: '',
              phone_24h: '',
              time_zone: 'UTC',
              is_primary: 0,
              is_active: 1
            })
          }
          style={primaryBtn}
        >
          + Add Safety Physician
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-alt,#f9fafb)', textAlign: 'left' }}>
              <th style={th}>Physician Name</th>
              <th style={th}>Medical Title</th>
              <th style={th}>Email</th>
              <th style={th}>24/7 Phone</th>
              <th style={th}>Timezone</th>
              <th style={th}>Primary</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading contacts...
                </td>
              </tr>
            )}
            {!loading && contacts.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No emergency safety contacts registered.
                </td>
              </tr>
            )}
            {!loading &&
              contacts.map(c => (
                <tr key={c.id}>
                  <td style={td}>
                    <strong>{c.physician_name}</strong>
                  </td>
                  <td style={td}>{c.medical_title}</td>
                  <td style={td}>
                    <a href={`mailto:${c.email}`} style={{ color: 'var(--primary,#1e40af)' }}>
                      {c.email}
                    </a>
                  </td>
                  <td style={td}>
                    <code>{c.phone_24h}</code>
                  </td>
                  <td style={td}>{c.time_zone}</td>
                  <td style={td}>
                    {c.is_primary ? (
                      <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                        PRIMARY
                      </span>
                    ) : (
                      <button onClick={() => makePrimary(c.id)} style={miniBtn('#166534')}>
                        Set Primary
                      </button>
                    )}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#fff',
                        background: c.is_active ? '#15803d' : '#6b7280'
                      }}
                    >
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => setEdit({ ...c })} style={miniBtn()}>
                      Edit
                    </button>
                    <button onClick={() => remove(c.id)} style={miniBtn('#dc2626')}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000
          }}
        >
          <div style={{ ...box, width: 460 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{edit.id ? 'Edit Safety Physician' : 'Add Safety Physician'}</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Physician Name (with credentials)
                <input
                  style={{ ...ipt, marginTop: 4 }}
                  value={edit.physician_name || ''}
                  placeholder="e.g. Dr. Aris Thorne, MD"
                  onChange={e => setEdit({ ...edit, physician_name: e.target.value })}
                />
              </label>

              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Medical / Safety Title
                <input
                  style={{ ...ipt, marginTop: 4 }}
                  value={edit.medical_title || ''}
                  placeholder="e.g. Global Safety Medical Director"
                  onChange={e => setEdit({ ...edit, medical_title: e.target.value })}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Email
                  <input
                    type="email"
                    style={{ ...ipt, marginTop: 4 }}
                    value={edit.email || ''}
                    placeholder="safety@calderpharma.local"
                    onChange={e => setEdit({ ...edit, email: e.target.value })}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  24/7 Emergency Phone
                  <input
                    style={{ ...ipt, marginTop: 4 }}
                    value={edit.phone_24h || ''}
                    placeholder="+1-800-555-0199"
                    onChange={e => setEdit({ ...edit, phone_24h: e.target.value })}
                  />
                </label>
              </div>

              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Time Zone
                <input
                  style={{ ...ipt, marginTop: 4 }}
                  value={edit.time_zone || ''}
                  placeholder="America/New_York or Europe/Zurich"
                  onChange={e => setEdit({ ...edit, time_zone: e.target.value })}
                />
              </label>

              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!!edit.is_primary}
                    onChange={e => setEdit({ ...edit, is_primary: e.target.checked ? 1 : 0 })}
                  />
                  Designate as Primary Contact
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!!edit.is_active}
                    onChange={e => setEdit({ ...edit, is_active: e.target.checked ? 1 : 0 })}
                  />
                  Active for On-Call Rotation
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEdit(null)} style={miniBtn()}>
                Cancel
              </button>
              <button onClick={save} style={primaryBtn}>
                Save Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
