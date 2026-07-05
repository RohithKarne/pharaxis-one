import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'

export default function EventsPage() {
  const { clientCode } = usePortal()
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('upcoming')

  usePageTitle('Events')

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/events`)
      .then(r => r.json()).then(d => {
        const items = d.items || []
        // LOW-12: sort — upcoming soonest first, past most-recent first
        const now = new Date()
        const sorted = [...items].sort((a, b) => {
          const da = new Date(getEventDate(a))
          const db_ = new Date(getEventDate(b))
          const aIsPast = da < now
          const bIsPast = db_ < now
          if (aIsPast !== bIsPast) return aIsPast ? 1 : -1
          return aIsPast ? db_ - da : da - db_
        })
        setEvents(sorted)
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [clientCode])

  function getEventDate(e) { return e.start_date || e.event_date }

  const now       = new Date()
  const filtered  = events.filter(e => {
    const d = new Date(getEventDate(e))
    return filter === 'upcoming' ? d >= now : d < now
  })

  function formatDate(str) {
    if (!str) return '—'
    return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>Events & Webinars</h1>
        <p>Stay up to date with upcoming medical education events and symposia.</p>
      </div>

      <div className="pp-tab-bar">
        <button className={`pp-tab ${filter === 'upcoming' ? 'pp-tab-active' : ''}`} aria-pressed={filter === 'upcoming'} onClick={() => setFilter('upcoming')}>Upcoming</button>
        <button className={`pp-tab ${filter === 'past'     ? 'pp-tab-active' : ''}`} aria-pressed={filter === 'past'}     onClick={() => setFilter('past')}>Past Events</button>
      </div>

      {loading ? <div className="pp-loading">Loading…</div> : filtered.length === 0 ? (
        <div className="pp-empty-state"><span>📅</span><p>No {filter} events found.</p></div>
      ) : (
        <div className="pp-event-list">
          {filtered.map(ev => {
            const isPast = new Date(getEventDate(ev)) < now
            return (
            <div key={ev.id} className={`pp-event-card ${isPast ? 'pp-event-past' : ''}`}>
              {isPast && <span className="pp-badge pp-badge-past">Past Event</span>}
              <div className="pp-event-date-badge">
                <div className="pp-event-month">{formatDate(ev.start_date).split(' ')[0]}</div>
                <div className="pp-event-day">{ev.start_date ? new Date(ev.start_date).getDate() : '—'}</div>
              </div>
              <div className="pp-event-body">
                <div className="pp-event-type-tag">{ev.event_type || 'Event'}</div>
                <h3 className="pp-event-title">{ev.title}</h3>
                {ev.description && <p className="pp-event-desc">{ev.description}</p>}
                <div className="pp-event-meta">
                  {(ev.city || ev.country) && <span>📍 {[ev.venue, ev.city, ev.country].filter(Boolean).join(', ')}</span>}
                  {ev.start_date && <span>🗓 {formatDate(ev.start_date)}</span>}
                  {ev.event_type === 'webinar' && <span className="pp-virtual-tag">Virtual</span>}
                </div>
                {ev.registration_url && (
                  <a href={ev.registration_url} target="_blank" rel="noopener noreferrer" className="pp-btn pp-btn-sm pp-btn-primary">
                    Register →
                  </a>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
