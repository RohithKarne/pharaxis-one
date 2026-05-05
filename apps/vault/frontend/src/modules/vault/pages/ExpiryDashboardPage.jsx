import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { apiJson, authHeaders, getOrgToken, lifecycleBadgeClass } from '../../common/utils/session'
import VaultPageHeader from '../components/VaultPageHeader'

function ExpiryColumn({ title, items }) {
  return (
    <section className="panel expiry-column">
      <h3>{title}</h3>
      <ul className="simple-list expiry-list">
        {items.map(item => (
          <li key={item.content_id} className="expiry-card">
            <div>
              <strong>{item.doc_number}</strong>
              <p>{item.title}</p>
              <p>Owner: {item.owner?.name || item.owner?.email || '-'}</p>
              <p>Expiry: {String(item.expiry_date || '').slice(0, 10)}</p>
              <p>Days remaining: {item.days_remaining}</p>
            </div>
            <div className="detail-actions">
              <span className={lifecycleBadgeClass(item.lifecycle_state)}>{item.lifecycle_state}</span>
              <Link className="btn-secondary link-button" to={`/vault/content/${item.content_id}`}>
                Open
              </Link>
            </div>
          </li>
        ))}
        {!items.length ? (
          <li>
            <span>No records</span>
          </li>
        ) : null}
      </ul>
    </section>
  )
}

export default function ExpiryDashboardPage() {
  const token = getOrgToken()
  const [data, setData] = useState({
    expiring_30: [],
    expiring_60: [],
    expiring_90: [],
    expired: []
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadExpiryData() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload = await apiJson('/api/content/expiry-dashboard', {
        headers: authHeaders(token)
      })
      setData({
        expiring_30: payload.expiring_30 || [],
        expiring_60: payload.expiring_60 || [],
        expiring_90: payload.expiring_90 || [],
        expired: payload.expired || []
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpiryData()
  }, [])

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Risk & Partners / Expiry"
          title="Expiry Intelligence"
          note="Documents approaching expiry windows and archived risk view."
          statusLabel="Monitoring"
          dateLabel={`${(data.expiring_30?.length || 0) + (data.expiring_60?.length || 0) + (data.expiring_90?.length || 0)} active`}
        />

        <section className="panel span-12">
          <div className="detail-actions">
            <button className="btn-secondary" onClick={loadExpiryData}>Refresh</button>
            <Link className="btn-secondary link-button" to="/vault">Back to Vault</Link>
          </div>
        </section>
      </main>

      <main className="dashboard-grid expiry-grid">
        {error ? <div className="auth-error span-12">{error}</div> : null}
        {loading ? <p className="panel-note span-12">Loading expiry dashboard...</p> : null}

        {!loading ? (
          <>
            <ExpiryColumn title="Expiring in 30 Days" items={data.expiring_30} />
            <ExpiryColumn title="Expiring in 60 Days" items={data.expiring_60} />
            <ExpiryColumn title="Expiring in 90 Days" items={data.expiring_90} />
            <ExpiryColumn title="Expired" items={data.expired} />
          </>
        ) : null}
      </main>
    </div>
  )
}
