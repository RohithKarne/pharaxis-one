import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'
import Icon from '../../shared/components/Icon'
import { formatDateTime } from '../../shared/utils/datetime'

const STATUS_LABELS = { submitted: 'Submitted', pending_sync: 'Pending', synced: 'Synced', failed_sync: 'Failed', closed: 'Closed' }

export default function MyActivityPage() {
  const { clientCode, user, portalHeaders } = usePortal()
  const navigate = useNavigate()
  const base = `/portal/${clientCode}`
  const [stats, setStats]     = useState(null)
  const [follows, setFollows] = useState([])
  const [loading, setLoading] = useState(true)

  usePageTitle('My Activity')

  useEffect(() => {
    if (!user) { navigate(`${base}/login`); return }
    Promise.all([
      fetch(`/api/portal/personal/activity?clientCode=${clientCode}`, { headers: portalHeaders() }).then(r => r.ok ? r.json() : null),
      fetch(`/api/portal/personal/follows?clientCode=${clientCode}`, { headers: portalHeaders() }).then(r => r.ok ? r.json() : null),
    ]).then(([a, f]) => { setStats(a); setFollows(f?.follows || []); setLoading(false) }).catch(() => setLoading(false))
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
        <p>Your submissions, saved items, and the topics you follow.</p>
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
            {stats.submissions.by_status.map(s => (
              <span key={s.status} className="pp-sev-chip" style={{ cursor: 'default' }}>
                {STATUS_LABELS[s.status] || s.status}: <strong>{s.c}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Topics you follow</h2>
        {follows.length === 0 ? (
          <p style={{ color: 'var(--pp-text-muted)', fontSize: 14 }}>
            You're not following anything yet. Follow a therapeutic area to personalize your home feed.{' '}
            <Link to={`${base}/therapeutic-areas`} style={{ color: 'var(--pp-primary)' }}>Browse topics →</Link>
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
