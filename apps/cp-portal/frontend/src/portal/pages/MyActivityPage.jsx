import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'
import Icon from '../../shared/components/Icon'
import { formatDateTime } from '../../shared/utils/datetime'
import { statusLabel } from '../utils/submissionStatus'


export default function MyActivityPage() {
  const { clientCode, user, portalHeaders } = usePortal()
  const navigate = useNavigate()
  const base = `/portal/${clientCode}`
  const [stats, setStats]     = useState(null)
  const [follows, setFollows] = useState([])
  const [letters, setLetters] = useState(null) // CPPM-145
  const [loading, setLoading] = useState(true)

  usePageTitle('My Activity')

  useEffect(() => {
    if (!user) { navigate(`${base}/login`); return }
    Promise.all([
      fetch(`/api/portal/personal/activity?clientCode=${clientCode}`, { headers: portalHeaders() }).then(r => r.ok ? r.json() : null),
      fetch(`/api/portal/personal/follows?clientCode=${clientCode}`, { headers: portalHeaders() }).then(r => r.ok ? r.json() : null),
      fetch(`/api/portal/safety/${clientCode}/my-letters`, { headers: portalHeaders() }).then(r => r.ok ? r.json() : null),
    ]).then(([a, f, l]) => { setStats(a); setFollows(f?.follows || []); setLetters(l); setLoading(false) }).catch(() => setLoading(false))
  }, [user, clientCode])

  const fmtDate = (str) => formatDateTime(str)

  if (loading) return <div className="pp-container pp-page-content"><div className="pp-loading">Loading…</div></div>

  const stat = [
    { icon: 'inbox', label: 'Submissions', value: stats?.submissions?.total ?? 0, to: `${base}/my-submissions` },
    { icon: 'grid',  label: 'Following',   value: stats?.following ?? 0 },
    { icon: 'book',  label: 'Saved items', value: stats?.saved ?? 0, to: `${base}/saved` },
  ]

  return (
    <div className="pp-container pp-page-content" style={{ maxWidth: 820 }}>
      <div className="pp-page-header">
        <h1>My Activity</h1>
        <p>Your submissions, saved items, safety letters, and the topics you follow.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 26 }}>
        {stat.map(s => (
          <div key={s.label} onClick={() => s.to && navigate(s.to)}
            style={{ background: '#fff', border: '1px solid var(--pp-border)', borderRadius: 12, padding: '18px 20px', cursor: s.to ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--pp-text-muted)', fontSize: 13 }}>
              <Icon name={s.icon} size={16} /> {s.label}
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {stats?.submissions?.by_status?.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Submissions by status</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* CPPM-91: the same plain words as My Submissions; the four internal
                states all count as "In progress", so they are added together. */}
            {Object.entries(stats.submissions.by_status.reduce((acc, s) => {
              const label = statusLabel(s.status)
              acc[label] = (acc[label] || 0) + Number(s.c)
              return acc
            }, {})).map(([label, c]) => (
              <span key={label} className="pp-sev-chip" style={{ cursor: 'default' }}>
                {label}: <strong>{c}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CPPM-145: the doctor's own record of the safety letters they confirmed. */}
      {letters && (
        <div style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Safety letters</h2>
          {letters.waiting.length === 0 && letters.confirmed.length === 0 ? (
            <p style={{ color: 'var(--pp-text-muted)', fontSize: 14 }}>No safety letter has asked you to confirm you have read it.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {letters.waiting.map(l => (
                <Link key={`w${l.id}`} to={`${base}/safety#alert-${l.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '12px 16px', textDecoration: 'none', color: 'inherit' }}>
                  <Icon name="shield" size={18} />
                  <span style={{ fontWeight: 600, flex: 1 }}>{l.title}</span>
                  <span style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>Waiting — read and confirm</span>
                </Link>
              ))}
              {letters.confirmed.map(l => (
                <Link key={`c${l.id}`} to={`${base}/safety#alert-${l.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--pp-border)', borderRadius: 10, padding: '12px 16px', textDecoration: 'none', color: 'inherit' }}>
                  <Icon name="shield" size={18} />
                  <span style={{ fontWeight: 600, flex: 1 }}>{l.title}</span>
                  <span style={{ fontSize: 13, color: 'var(--pp-text-muted)' }}>Confirmed {fmtDate(l.acknowledged_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Topics you follow</h2>
        {follows.length === 0 ? (
          <p style={{ color: 'var(--pp-text-muted)', fontSize: 14 }}>
            You are not following any topics. Follow a therapeutic area to see its updates on your home page.{' '}
            <Link to={`${base}/therapeutic-areas`} style={{ color: 'var(--pp-primary)' }}>Browse topics</Link>
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {follows.map(f => (
              <Link key={f.id} to={`${base}/therapeutic-areas`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--pp-border)', borderRadius: 10, padding: '12px 16px', textDecoration: 'none', color: 'inherit' }}>
                <Icon name="beaker" size={18} />
                <span style={{ fontWeight: 600 }}>{f.detail?.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 26, fontSize: 12, color: 'var(--pp-text-muted)' }}>
        Member since {fmtDate(stats?.member_since)}{stats?.specialty ? ` · ${stats.specialty}` : ''}
      </div>
    </div>
  )
}
