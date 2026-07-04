import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

function formatTherapeuticAreas(val) {
  if (!val) return '—'
  try {
    const arr = typeof val === 'string' ? JSON.parse(val) : val
    return Array.isArray(arr) ? arr.join(', ') : String(val)
  } catch { return String(val) }
}

const STATUS_STYLES = {
  pending:   { background: '#FEF3C7', color: '#D97706' },
  confirmed: { background: '#DCFCE7', color: '#16A34A' },
  cancelled: { background: '#FEE2E2', color: '#DC2626' },
  completed: { background: '#DBEAFE', color: '#2563EB' },
}

export default function MSLPage() {
  const { clientId }  = useParams()
  const [tab, setTab] = useState('directory')

  // ── Directory state ──────────────────────────────────────────
  const [msls, setMSLs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ name: '', title: '', specialty: '', region: '', territory: '', email: '', phone: '' })
  const [saving, setSaving]   = useState(false)
  const [formError, setFormError] = useState('')
  const [editMSL, setEditMSL]   = useState(null)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({})

  // ── Slots state ──────────────────────────────────────────────
  const [slotMSL, setSlotMSL]   = useState(null)
  const [slots, setSlots]       = useState([])
  const [slotForm, setSlotForm] = useState({ starts_at: '', ends_at: '' })
  const [slotMsg, setSlotMsg]   = useState('')

  // ── Bookings state ───────────────────────────────────────────
  const [bookings, setBookings]       = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [editBooking, setEditBooking]   = useState(null)
  const [bookingNotes, setBookingNotes] = useState('')
  const [bookingStatus, setBookingStatus] = useState('')
  const [bookingMsg, setBookingMsg]     = useState('')
  const [bookingSaving, setBookingSaving] = useState(false)

  useEffect(() => { loadMSLs() }, [clientId])
  useEffect(() => { if (tab === 'bookings') loadBookings() }, [tab, clientId])

  async function loadMSLs() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/msls/${clientId}`, { headers: adminHeaders() })
      const d   = await res.json()
      setMSLs(d.msls || [])
    } catch { setMSLs([]) }
    finally { setLoading(false) }
  }

  async function loadBookings() {
    setBookingsLoading(true)
    try {
      const res = await fetch(`/api/admin/msls/${clientId}/bookings`, { headers: adminHeaders() })
      const d   = await res.json()
      setBookings(d.bookings || [])
    } catch { setBookings([]) }
    setBookingsLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setFormError('')
    try {
      const res = await fetch(`/api/admin/msls/${clientId}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(form) })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setFormError(d.error || `Could not create MSL (error ${res.status}).`)
        return
      }
      setShowAdd(false); setForm({ name: '', title: '', specialty: '', region: '', territory: '', email: '', phone: '' })
      loadMSLs()
    } catch {
      setFormError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(msl) {
    setEditMSL(msl)
    setFormError('')
    setEditForm({ name: msl.name || '', title: msl.title || '', specialty: msl.specialty || '', region: msl.region || '', territory: msl.territory || '', email: msl.email || '', phone: msl.phone || '' })
    setShowEdit(true)
  }

  async function handleEdit(e) {
    e.preventDefault(); setSaving(true); setFormError('')
    try {
      const res = await fetch(`/api/admin/msls/${clientId}/${editMSL.id}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(editForm) })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setFormError(d.error || `Could not save changes (error ${res.status}).`)
        return
      }
      setShowEdit(false); setEditMSL(null)
      loadMSLs()
    } catch {
      setFormError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(id) {
    if (!confirm('Remove this MSL from the directory?')) return
    try {
      const res = await fetch(`/api/admin/msls/${clientId}/${id}`, { method: 'DELETE', headers: adminHeaders() })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setFormError(d.error || `Could not remove MSL (error ${res.status}).`); return }
    } catch {
      setFormError('Network error — please try again.')
      return
    }
    loadMSLs()
  }

  async function openSlots(msl) {
    setSlotMSL(msl); setSlotForm({ starts_at: '', ends_at: '' }); setSlotMsg('')
    await loadSlots(msl.id)
  }
  async function loadSlots(mslId) {
    try {
      const res = await fetch(`/api/admin/msls/${clientId}/${mslId}/slots`, { headers: adminHeaders() })
      const d = await res.json(); setSlots(d.slots || [])
    } catch { setSlots([]) }
  }
  async function addSlot(e) {
    e.preventDefault(); setSlotMsg('')
    const fmt = v => v ? v.replace('T', ' ') + ':00' : v
    const res = await fetch(`/api/admin/msls/${clientId}/${slotMSL.id}/slots`, {
      method: 'POST', headers: adminHeaders(),
      body: JSON.stringify({ starts_at: fmt(slotForm.starts_at), ends_at: fmt(slotForm.ends_at) }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setSlotMsg(d.error || 'Failed to add slot.'); return }
    setSlotForm({ starts_at: '', ends_at: '' }); loadSlots(slotMSL.id)
  }
  async function deleteSlot(slotId) {
    const res = await fetch(`/api/admin/msls/${clientId}/slots/${slotId}`, { method: 'DELETE', headers: adminHeaders() })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setSlotMsg(d.error || 'Failed to delete slot.'); return }
    loadSlots(slotMSL.id)
  }

  function openEditBooking(b) {
    setEditBooking(b)
    setBookingStatus(b.status)
    setBookingNotes(b.admin_notes || '')
    setBookingMsg('')
  }

  async function saveBooking() {
    if (!editBooking) return
    setBookingMsg(''); setBookingSaving(true)
    try {
      const res = await fetch(`/api/admin/msls/${clientId}/bookings/${editBooking.id}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ status: bookingStatus, admin_notes: bookingNotes }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setBookingMsg(d.error || `Could not save booking (error ${res.status}).`); return }
      setEditBooking(null)
      loadBookings()
    } catch {
      setBookingMsg('Network error — please try again.')
    } finally {
      setBookingSaving(false)
    }
  }

  async function deleteBooking(id) {
    if (!confirm('Delete this booking request?')) return
    setBookingMsg('')
    try {
      const res = await fetch(`/api/admin/msls/${clientId}/bookings/${id}`, { method: 'DELETE', headers: adminHeaders() })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setBookingMsg(d.error || `Could not delete booking (error ${res.status}).`); return }
    } catch {
      setBookingMsg('Network error — please try again.')
      return
    }
    loadBookings()
  }

  const pendingCount = bookings.filter(b => b.status === 'pending').length

  return (
    <AdminLayout title="MSL Directory">
      <div className="cp-section-header">
        <h2>Medical Science Liaisons</h2>
        {tab === 'directory' && <button className="cp-btn cp-btn-primary" onClick={() => { setFormError(''); setShowAdd(true) }}>+ Add MSL</button>}
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--cp-border)' }}>
        {[
          { key: 'directory', label: 'MSL Directory' },
          { key: 'bookings',  label: `Meeting Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.key ? '2px solid #6B3FA0' : '2px solid transparent',
            marginBottom: -2, fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? '#6B3FA0' : '#6B7280', fontSize: 14,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Directory Tab ── */}
      {tab === 'directory' && (
        <>
          {showAdd && (
            <div className="cp-modal-overlay" onClick={() => setShowAdd(false)}>
              <div className="cp-modal" onClick={e => e.stopPropagation()}>
                <div className="cp-modal-header"><span>Add MSL</span><button className="cp-modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
                <form onSubmit={handleAdd} className="cp-modal-body">
                  <div className="cp-field-row">
                    <div className="cp-field"><label>Name *</label><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="cp-field"><label>Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Medical Science Liaison" /></div>
                  </div>
                  <div className="cp-field-row">
                    <div className="cp-field"><label>Specialty</label><input value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} /></div>
                    <div className="cp-field"><label>Region</label><input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="e.g. Northeast" /></div>
                    <div className="cp-field"><label>Territory</label><input value={form.territory} onChange={e => setForm(f => ({ ...f, territory: e.target.value }))} /></div>
                  </div>
                  <div className="cp-field-row">
                    <div className="cp-field"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                    <div className="cp-field"><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  </div>
                  {formError && <div className="cp-error" style={{ marginBottom: 10 }}>{formError}</div>}
                  <div className="cp-modal-footer">
                    <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add MSL'}</button>
                    <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showEdit && editMSL && (
            <div className="cp-modal-overlay" onClick={() => setShowEdit(false)}>
              <div className="cp-modal" onClick={e => e.stopPropagation()}>
                <div className="cp-modal-header"><span>Edit MSL</span><button className="cp-modal-close" onClick={() => setShowEdit(false)}>✕</button></div>
                <form onSubmit={handleEdit} className="cp-modal-body">
                  <div className="cp-field-row">
                    <div className="cp-field"><label>Name *</label><input required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="cp-field"><label>Title</label><input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
                  </div>
                  <div className="cp-field-row">
                    <div className="cp-field"><label>Specialty</label><input value={editForm.specialty} onChange={e => setEditForm(f => ({ ...f, specialty: e.target.value }))} /></div>
                    <div className="cp-field"><label>Region</label><input value={editForm.region} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))} /></div>
                    <div className="cp-field"><label>Territory</label><input value={editForm.territory} onChange={e => setEditForm(f => ({ ...f, territory: e.target.value }))} /></div>
                  </div>
                  <div className="cp-field-row">
                    <div className="cp-field"><label>Email</label><input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
                    <div className="cp-field"><label>Phone</label><input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  </div>
                  {formError && <div className="cp-error" style={{ marginBottom: 10 }}>{formError}</div>}
                  <div className="cp-modal-footer">
                    <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                    <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowEdit(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {slotMSL && (
            <div className="cp-modal-overlay" onClick={() => setSlotMSL(null)}>
              <div className="cp-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                <div className="cp-modal-header">
                  <span>Availability Slots — {slotMSL.name}</span>
                  <button className="cp-modal-close" onClick={() => setSlotMSL(null)}>✕</button>
                </div>
                <div className="cp-modal-body">
                  <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>Define bookable time slots. HCPs pick from these when requesting a meeting. (Google/Outlook calendar sync is a later phase.)</p>
                  <form onSubmit={addSlot} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
                    <div className="cp-field" style={{ margin: 0 }}><label>Start</label><input type="datetime-local" required value={slotForm.starts_at} onChange={e => setSlotForm(f => ({ ...f, starts_at: e.target.value }))} /></div>
                    <div className="cp-field" style={{ margin: 0 }}><label>End</label><input type="datetime-local" required value={slotForm.ends_at} onChange={e => setSlotForm(f => ({ ...f, ends_at: e.target.value }))} /></div>
                    <button type="submit" className="cp-btn cp-btn-primary cp-btn-sm">+ Add</button>
                  </form>
                  {slotMsg && <div className="cp-error" style={{ marginBottom: 10 }}>{slotMsg}</div>}
                  {slots.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#9CA3AF' }}>No slots defined yet.</p>
                  ) : (
                    <table className="cp-table">
                      <thead><tr><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {slots.map(s => (
                          <tr key={s.id}>
                            <td style={{ fontSize: 12 }}>{s.starts_at?.slice(0, 16).replace('T', ' ')}</td>
                            <td style={{ fontSize: 12 }}>{s.ends_at?.slice(0, 16).replace('T', ' ')}</td>
                            <td><span className={`cp-badge ${s.is_booked ? 'badge-inactive' : 'badge-active'}`}>{s.is_booked ? 'Booked' : 'Open'}</span></td>
                            <td>{!s.is_booked && <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => deleteSlot(s.id)}>Delete</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading ? <div className="cp-loading">Loading…</div> : msls.length === 0 ? (
            <div className="cp-empty"><div style={{ fontSize: 40 }}>👤</div><p>No MSLs added yet.</p></div>
          ) : (
            <table className="cp-table">
              <thead><tr><th>Name</th><th>Title</th><th>Region</th><th>Specialty</th><th>Therapeutic Areas</th><th>Email</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {msls.map(m => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.title || '—'}</td>
                    <td>{m.region || '—'}</td>
                    <td>{m.specialty || '—'}</td>
                    <td>{formatTherapeuticAreas(m.therapeutic_areas)}</td>
                    <td>{m.email || '—'}</td>
                    <td><span className={`cp-badge ${m.is_active ? 'badge-active' : 'badge-inactive'}`}>{m.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(m)}>Edit</button>
                      <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openSlots(m)}>Slots</button>
                      <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => deactivate(m.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* ── Bookings Tab ── */}
      {tab === 'bookings' && (
        <>
          {editBooking && (
            <div className="cp-modal-overlay" onClick={() => setEditBooking(null)}>
              <div className="cp-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                <div className="cp-modal-header">
                  <span>Update Booking — {editBooking.requester_name}</span>
                  <button className="cp-modal-close" onClick={() => setEditBooking(null)}>✕</button>
                </div>
                <div className="cp-modal-body">
                  <div className="cp-field">
                    <label>Status</label>
                    <select value={bookingStatus} onChange={e => setBookingStatus(e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="cp-field">
                    <label>Internal Notes</label>
                    <textarea rows={3} value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} placeholder="Notes visible to admin only…" />
                  </div>
                  {bookingMsg && <div className="cp-error" style={{ marginBottom: 10 }}>{bookingMsg}</div>}
                  <div className="cp-modal-footer">
                    <button className="cp-btn cp-btn-primary" onClick={saveBooking} disabled={bookingSaving}>{bookingSaving ? 'Saving…' : 'Save'}</button>
                    <button className="cp-btn cp-btn-outline" onClick={() => setEditBooking(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {bookingMsg && !editBooking && <div className="cp-error" style={{ marginBottom: 12 }}>{bookingMsg}</div>}
          {bookingsLoading ? <div className="cp-loading">Loading…</div> : bookings.length === 0 ? (
            <div className="cp-empty"><p>No meeting requests yet.</p></div>
          ) : (
            <div className="cp-card" style={{ padding: 0 }}>
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>MSL</th>
                    <th>Requester</th>
                    <th>Email</th>
                    <th>Preferred Date</th>
                    <th>Topic</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => (
                    <tr key={b.id}>
                      <td>{b.msl_name}{b.msl_title ? <div style={{ fontSize: 11, color: '#9CA3AF' }}>{b.msl_title}</div> : null}</td>
                      <td>{b.requester_name}</td>
                      <td>{b.requester_email}</td>
                      <td>{b.preferred_date ? b.preferred_date.slice(0, 10) : '—'}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.topic || '—'}</td>
                      <td>
                        <span style={{ ...STATUS_STYLES[b.status] || {}, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                          {b.status}
                        </span>
                      </td>
                      <td>{b.created_at ? b.created_at.slice(0, 10) : '—'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEditBooking(b)}>Update</button>
                        <button className="cp-btn cp-btn-sm cp-btn-outline" style={{ color: '#DC2626' }} onClick={() => deleteBooking(b.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  )
}
