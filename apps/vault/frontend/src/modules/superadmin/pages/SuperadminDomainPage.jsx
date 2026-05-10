import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SuperadminTabs from '../components/SuperadminTabs'
import SuperadminTopbar from '../components/SuperadminTopbar'
import { authHeaders, getSuperadminToken } from '../../common/utils/session'

const VAULT_BASE = import.meta.env.VITE_VAULT_URL || 'http://localhost:5176'

export default function SuperadminDomainPage() {
  const { id: orgId } = useParams()
  const token = getSuperadminToken()
  const headers = authHeaders(token, { 'Content-Type': 'application/json' })

  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/superadmin/orgs/${orgId}/users`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setOrg(data.org) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [orgId])

  const tenantUrl = org ? `${VAULT_BASE}?org=${org.slug}` : ''

  function copyUrl() {
    navigator.clipboard.writeText(tenantUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="app-shell">
      <SuperadminTopbar
        title={org ? `${org.name} — Tenant URL` : 'Tenant URL'}
        subtitle="Share this URL with your client to access their vault"
      />

      <main className="dashboard-grid">
        <section className="panel span-12">
          <SuperadminTabs active="orgs" />
          <div className="detail-actions">
            <Link className="btn-secondary link-button" to={`/orgs/${orgId}`}>
              ← Back to {org?.name || 'Organization'}
            </Link>
          </div>
        </section>

        {!loading && org && (
          <section className="panel span-8">
            <h3>Client Access URL</h3>
            <p className="panel-note">
              Share this URL with <strong>{org.name}</strong>. No DNS setup required — works immediately.
            </p>

            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              background: '#f8fafc', border: '1.5px solid #e2e8f0',
              borderRadius: 8, padding: '0.85rem 1rem', margin: '1.25rem 0'
            }}>
              <code style={{
                flex: 1, fontSize: '1rem', fontWeight: 600,
                color: '#1e293b', wordBreak: 'break-all'
              }}>
                {tenantUrl}
              </code>
              <button
                className="btn-primary"
                style={{ flexShrink: 0, minWidth: 80 }}
                onClick={copyUrl}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 8, padding: '0.75rem 1rem'
            }}>
              <div style={{ fontWeight: 600, color: '#15803d', fontSize: '0.85rem', marginBottom: 4 }}>
                How it works
              </div>
              <ul className="simple-list" style={{ margin: 0, paddingLeft: '1.2rem', color: '#166534', fontSize: '0.85rem' }}>
                <li>Client opens the URL in their browser</li>
                <li>The vault loads with <strong>{org.name}</strong> branding and settings</li>
                <li>Users sign in with their org credentials</li>
              </ul>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <div className="panel-note" style={{ marginBottom: '0.5rem' }}>
                Org slug: <code style={{ background: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: 4 }}>{org.slug}</code>
                &nbsp;· Status: <span className={org.status === 'active' ? 'status-chip success' : 'status-chip pending'}>{org.status}</span>
              </div>
            </div>
          </section>
        )}

        {!loading && org && (
          <section className="panel span-4">
            <h3>Quick Info</h3>
            <ul className="simple-list detail-list">
              <li><span>Org Name</span><strong>{org.name}</strong></li>
              <li><span>Slug</span><strong>{org.slug}</strong></li>
              <li><span>Status</span>
                <span className={org.status === 'active' ? 'status-chip success' : 'status-chip pending'}>
                  {org.status}
                </span>
              </li>
            </ul>
            <div className="detail-actions" style={{ marginTop: '1rem' }}>
              <Link className="btn-secondary link-button" to={`/orgs/${orgId}`}>
                Manage Users
              </Link>
            </div>
          </section>
        )}

        {loading && (
          <section className="panel span-12">
            <p className="panel-note">Loading...</p>
          </section>
        )}
      </main>
    </div>
  )
}
