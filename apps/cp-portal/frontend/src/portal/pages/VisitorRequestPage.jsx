import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import { SkeletonCards } from '../../shared/components/Skeleton'
import { RequestCard } from './MySubmissionsPage'

// The private link from a visitor's confirmation email (Rohith, 10 Oct 2026): the one
// request they sent without signing in, shown and answered exactly as My Submissions
// does for a signed-in person. The link is the only key, so the page tells them to
// keep it to themselves, and tells the browser not to pass it on to other sites.
export default function VisitorRequestPage() {
  const { clientCode, portalHeaders, t } = usePortal()
  const { token } = useParams()
  const [sub, setSub] = useState(null)
  const [screening, setScreening] = useState([])
  const [state, setState] = useState('loading') // loading | ready | gone | error
  const base = `/api/portal/submit/${clientCode}/request/${token}`

  function load() {
    return fetch(base, { headers: portalHeaders() })
      .then(r => {
        if (r.status === 404) { setState('gone'); return null }
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(d => { if (d) { setSub(d.submission); setScreening(d.reply_screening || []); setState('ready') } })
      .catch(() => setState('error'))
  }
  useEffect(() => { load() }, [clientCode, token])

  // A link on this page to another site must not carry this page's address with it.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>{t('Your request')}</h1>
        {state === 'ready' && <p>{t('This private link shows the request you sent. Anyone with the link can see it, so please do not share it.')}</p>}
      </div>
      {state === 'loading' ? <SkeletonCards count={1} /> : state === 'gone' ? (
        <div className="pp-empty-state" role="alert">
          <p>{t('This link is not valid or has expired.')}</p>
          <p style={{ fontSize: '0.9rem', color: '#475569' }}>{t('If you still need help with your request, contact us and give your reference number.')}</p>
          <Link to={`/portal/${clientCode}/contact`} className="pp-btn pp-btn-primary">{t('Contact us')}</Link>
        </div>
      ) : state === 'error' ? (
        <div className="pp-empty-state pp-load-error" role="alert">
          <p>{t('We could not load your request just now. Please try again.')}</p>
          <button type="button" className="pp-btn pp-btn-primary" onClick={() => { setState('loading'); load() }}>{t('Try again')}</button>
        </div>
      ) : (
        <RequestCard s={sub} screening={screening} base={base} portalHeaders={portalHeaders} onChanged={load} />
      )}
    </div>
  )
}
