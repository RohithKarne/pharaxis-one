import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'

const EMPTY_BOOKING = { requester_name: '', requester_email: '', preferred_date: '', topic: '', message: '' }

export default function FindMSLPage() {
  const { clientCode, user } = usePortal()
  const [msls, setMSLs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [region, setRegion]   = useState('')

  // Booking modal state
  const [bookingMSL,   setBookingMSL]   = useState(null)
  const [bookingForm,  setBookingForm]  = useState(EMPTY_BOOKING)
  const [bookingError, setBookingError] = useState('')
  const [bookingDone,  setBookingDone]  = useState(false)
  const [bookingBusy,  setBookingBusy]  = useState(false)
  const [availableSlots, setAvailableSlots] = useState([])
  const [selectedSlot, setSelectedSlot]     = useState('')

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/msls`)
      .then(r => r.json()).then(d => { setMSLs(d.items || []); setLoading(false) }).catch(() => setLoading(false))
  }, [clientCode])

  const regions  = [...new Set(msls.map(m => m.region).filter(Boolean))]
  const filtered = msls
    .filter(m => !region || m.region === region)
    .filter(m => !search  || (m.name || '').toLowerCase().includes(search.toLowerCase())
      || (m.specialty || '').toLowerCase().includes(search.toLowerCase())
      || (m.territory || '').toLowerCase().includes(search.toLowerCase()))

  function openBooking(msl) {
    setBookingMSL(msl)
    setBookingForm({
      ...EMPTY_BOOKING,
      requester_name:  user?.full_name || user?.name || '',
      requester_email: user?.email || '',
    })
    setBookingError('')
    setBookingDone(false)
    setSelectedSlot('')
    setAvailableSlots([])
    fetch(`/api/portal/bookings/${clientCode}/${msl.id}/slots`)
      .then(r => r.ok ? r.json() : { slots: [] })
      .then(d => setAvailableSlots(d.slots || []))
      .catch(() => setAvailableSlots([]))
  }

  async function handleBookingSubmit(e) {
    e.preventDefault()
    setBookingError(''); setBookingBusy(true)
    try {
      const res = await fetch(`/api/portal/bookings/${clientCode}/${bookingMSL.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bookingForm, slot_id: selectedSlot || undefined }),
      })
      const d = await res.json()
      if (!res.ok) { setBookingError(d.error || 'Submission failed.'); setBookingBusy(false); return }
      setBookingDone(true)
    } catch { setBookingError('Network error. Please try again.') }
    setBookingBusy(false)
  }

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>Find a Medical Science Liaison</h1>
        <p>Connect with our MSL team for scientific exchange and medical information support.</p>
      </div>

      <div className="pp-filter-bar">
        <input className="pp-search-input" placeholder="Search by name, specialty, or territory…" value={search} onChange={e => setSearch(e.target.value)} />
        {regions.length > 0 && (
          <select value={region} onChange={e => setRegion(e.target.value)}>
            <option value="">All Regions</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      {loading ? <div className="pp-loading">Loading…</div> : filtered.length === 0 ? (
        <div className="pp-empty-state"><span>👨‍⚕️</span><p>No MSLs found matching your search.</p></div>
      ) : (
        <div className="pp-msl-grid">
          {filtered.map(m => (
            <div key={m.id} className="pp-msl-card">
              <div className="pp-msl-avatar">{(m.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
              <div className="pp-msl-info">
                <div className="pp-msl-name">{m.name}</div>
                {m.title     && <div className="pp-msl-title">{m.title}</div>}
                {m.specialty && <div className="pp-msl-specialty">🔬 {m.specialty}</div>}
                {m.region    && <div className="pp-msl-region">📍 {m.region}{m.territory ? ` · ${m.territory}` : ''}</div>}
                {m.email     && <a href={`mailto:${m.email}`} className="pp-msl-email">✉️ {m.email}</a>}
                {m.phone     && <div className="pp-msl-phone">📞 {m.phone}</div>}
                <button
                  onClick={() => openBooking(m)}
                  style={{ marginTop: 10, padding: '6px 14px', background: '#6B3FA0', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                >
                  Request Meeting
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Booking Modal */}
      {bookingMSL && (
        <div className="cp-modal-overlay" onClick={() => setBookingMSL(null)}>
          <div className="cp-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Request Meeting with {bookingMSL.name}</span>
              <button className="cp-modal-close" onClick={() => setBookingMSL(null)}>✕</button>
            </div>
            {bookingDone ? (
              <div className="cp-modal-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: 17, color: '#1A1A2E', marginBottom: 8 }}>Meeting request sent!</div>
                <div style={{ color: '#6B7280', fontSize: 14, marginBottom: 24 }}>
                  Your request has been received. The MSL team will follow up with you shortly.
                </div>
                <button className="cp-btn cp-btn-primary" onClick={() => setBookingMSL(null)}>Close</button>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit} className="cp-modal-body">
                <div className="cp-field-row">
                  <div className="cp-field">
                    <label>Your Name *</label>
                    <input required value={bookingForm.requester_name} onChange={e => setBookingForm(f => ({ ...f, requester_name: e.target.value }))} placeholder="Full name" />
                  </div>
                  <div className="cp-field">
                    <label>Your Email *</label>
                    <input required type="email" value={bookingForm.requester_email} onChange={e => setBookingForm(f => ({ ...f, requester_email: e.target.value }))} placeholder="you@example.com" />
                  </div>
                </div>
                {availableSlots.length > 0 && (
                  <div className="cp-field">
                    <label>Available Time Slots</label>
                    <select value={selectedSlot} onChange={e => setSelectedSlot(e.target.value)}>
                      <option value="">— No specific slot (request general availability) —</option>
                      {availableSlots.map(s => {
                        const d = s.starts_at ? new Date(s.starts_at) : null
                        const label = d && !isNaN(d.getTime()) ? d.toLocaleString() : ''
                        return <option key={s.id} value={s.id}>{label}</option>
                      })}
                    </select>
                    <span style={{ fontSize: 11, color: '#6B7280' }}>Pick a slot for faster confirmation, or leave blank for general availability.</span>
                  </div>
                )}
                <div className="cp-field-row">
                  <div className="cp-field">
                    <label>Preferred Date{selectedSlot ? ' (using selected slot)' : ''}</label>
                    <input type="date" disabled={!!selectedSlot} value={bookingForm.preferred_date} onChange={e => setBookingForm(f => ({ ...f, preferred_date: e.target.value }))} min={new Date().toISOString().slice(0, 10)} />
                  </div>
                  <div className="cp-field">
                    <label>Topic / Area of Interest</label>
                    <input value={bookingForm.topic} onChange={e => setBookingForm(f => ({ ...f, topic: e.target.value }))} placeholder="e.g. Clinical data, pipeline product…" />
                  </div>
                </div>
                <div className="cp-field">
                  <label>Additional Message</label>
                  <textarea rows={3} value={bookingForm.message} onChange={e => setBookingForm(f => ({ ...f, message: e.target.value }))} placeholder="Any additional context or questions…" maxLength={500} />
                </div>
                {bookingError && <div className="cp-error">{bookingError}</div>}
                <div className="cp-modal-footer">
                  <button type="submit" className="cp-btn cp-btn-primary" disabled={bookingBusy}>
                    {bookingBusy ? 'Sending…' : 'Send Request'}
                  </button>
                  <button type="button" className="cp-btn cp-btn-outline" onClick={() => setBookingMSL(null)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
