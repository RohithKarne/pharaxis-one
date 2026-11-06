import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'
import { formatDateTime, formatLongDate } from '../../shared/utils/datetime'
import { buildIcs, downloadIcs } from '../../shared/utils/ics'
import { safeWebUrl } from '../utils/safeUrl'

// CPPM-117: each event has its own page — what, when, where, Register and Add to
// calendar. A past event says it has ended and offers neither.
export default function EventDetailPage() {
  const { clientCode, user, t } = usePortal()
  const { eventId } = useParams()
  const base = `/portal/${clientCode}`
  const [ev, setEv] = useState(null)
  const [error, setError] = useState('')
  // F2 (27 Oct review): registering here when the event has no outside link.
  const [registered, setRegistered] = useState(null)
  const [regBusy, setRegBusy] = useState(false)
  const [regError, setRegError] = useState('')

  usePageTitle(ev?.title || 'Event')

  useEffect(() => {
    setEv(null); setError('')
    fetch(`/api/portal/content/${clientCode}/events/${encodeURIComponent(eventId)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This event could not be loaded.'); return d })
      .then(d => setEv(d.event))
      .catch(e => setError(e.message || 'This event could not be loaded.'))
  }, [clientCode, eventId])

  useEffect(() => {
    if (!user) { setRegistered(null); return }
    fetch(`/api/portal/content/${clientCode}/events/${encodeURIComponent(eventId)}/registration`, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null).then(d => setRegistered(d ? d.registered : null)).catch(() => {})
  }, [clientCode, eventId, user])

  async function toggleRegistration() {
    setRegBusy(true); setRegError('')
    try {
      const r = await fetch(`/api/portal/content/${clientCode}/events/${encodeURIComponent(eventId)}/registration`,
        { method: registered ? 'DELETE' : 'POST', credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setRegError(d.error || 'That did not work. Please try again.'); return }
      setRegistered(d.registered)
    } catch { setRegError('Network error. Please check your connection and try again.') } finally { setRegBusy(false) }
  }

  if (error) return <div className="pp-container pp-page-content"><div className="pp-error-state">{error}</div><Link to={`${base}/events`}>{t('All events')}</Link></div>
  if (!ev) return <div className="pp-container pp-page-content"><div className="pp-loading">{t('Loading…')}</div></div>

  const ends = ev.end_date || ev.start_date
  const ended = ends ? new Date(ends) < new Date() : false
  const register = safeWebUrl(ev.registration_url)
  const where = [ev.venue, ev.city, ev.country].filter(Boolean).join(', ')

  function addToCalendar() {
    downloadIcs(`event-${ev.id}.ics`, buildIcs({
      title: ev.title,
      description: [ev.description, register && `Register: ${register}`].filter(Boolean).join('\n\n'),
      location: where || (ev.event_type === 'webinar' ? 'Online' : undefined),
      start: ev.start_date,
      end: ev.end_date || undefined,
      url: register || undefined,
      status: 'CONFIRMED',
    }))
  }

  return (
    <div className="pp-container pp-page-content pp-page-narrow">
      <Link to={`${base}/events`} className="pp-back-btn">{t('All events')}</Link>
      <div className="pp-event-type-tag" style={{ marginTop: 16 }}>{ev.event_type || 'Event'}</div>
      <h1 className="pp-page-title">{ev.title}</h1>
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', margin: '0 0 20px' }}>
        <dt style={{ fontWeight: 600 }}>{t('When')}</dt>
        <dd style={{ margin: 0 }}>
          {ev.start_date ? formatDateTime(ev.start_date) : 'Date to be announced'}
          {ev.end_date && ` to ${formatDateTime(ev.end_date)}`}
        </dd>
        {(where || ev.event_type === 'webinar') && (<>
          <dt style={{ fontWeight: 600 }}>{t('Where')}</dt>
          <dd style={{ margin: 0 }}>{where || 'Online'}</dd>
        </>)}
      </dl>
      {ended ? (
        <div className="pp-info-box" role="status">This event has ended{ends ? ` (${formatLongDate(ends)})` : ''}.</div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {register && <a href={register} target="_blank" rel="noopener noreferrer" className="pp-btn pp-btn-primary">{t('Register')}</a>}
          {!register && !user && <Link to={`${base}/login`} state={{ from: `${base}/events/${ev.id}` }} className="pp-btn pp-btn-primary">{t('Sign in to register')}</Link>}
          {!register && user && registered !== null && (
            <button type="button" className={`pp-btn ${registered ? 'pp-btn-outline' : 'pp-btn-primary'}`} onClick={toggleRegistration} disabled={regBusy}>
              {registered ? t('Cancel my registration') : t('Register')}
            </button>
          )}
          {ev.start_date && <button type="button" className="pp-btn pp-btn-outline" onClick={addToCalendar}>{t('Add to calendar')}</button>}
        </div>
      )}
      {registered && !ended && <div className="pp-success-msg" role="status">{t('You are registered for this event.')}</div>}
      {regError && <div className="pp-error-msg" role="alert">{regError}</div>}
      {ev.description && <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{ev.description}</p>}
    </div>
  )
}
