import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const CONFIG_SECTIONS = [
  { path: 'branding',    icon: '🎨', label: 'Branding & Theme',    desc: 'Colors, fonts, logo, portal name' },
  { path: 'features',    icon: '⚙️', label: 'Features',            desc: 'Enable/disable portal sections' },
  { path: 'content',     icon: '📄', label: 'Content',             desc: 'Therapeutic areas, drugs, events, resources' },
  { path: 'forms',       icon: '📝', label: 'Form Configuration',  desc: 'Submission form fields per inquiry type' },
  { path: 'msls',        icon: '👤', label: 'MSL Directory',       desc: 'Medical Science Liaisons' },
  { path: 'integration', icon: '🔗', label: 'Integration',         desc: 'MIMS or third-party system connection' },
  { path: 'users',       icon: '👥', label: 'Portal Users',        desc: 'Manage registered portal users' },
  { path: 'chatbox',     icon: '🤖', label: 'Chatbox AI',          desc: 'AI chatbox provider and system prompt' },
]

export default function ClientDetailPage() {
  const { clientId } = useParams()
  const navigate     = useNavigate()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => setData(d))
      .catch(() => {}).finally(() => setLoading(false))
  }, [clientId])

  if (loading) return <AdminLayout title="Client"><div className="cp-loading">Loading…</div></AdminLayout>
  if (!data?.client) return <AdminLayout title="Client"><div className="cp-error">Client not found.</div></AdminLayout>

  const { client, branding, features } = data
  const enabledCount = features?.filter(f => f.is_enabled).length || 0

  return (
    <AdminLayout title={client.name}>
      <div className="cp-client-detail-header">
        <div>
          <h2>{client.name}</h2>
          <div className="cp-client-meta">
            <code>{client.code}</code>
            <span className={`cp-badge ${client.is_active ? 'badge-active' : 'badge-inactive'}`}>
              {client.is_active ? 'Active' : 'Inactive'}
            </span>
            {client.contact_email && <span>{client.contact_email}</span>}
          </div>
          {branding && <div className="cp-client-portal-name">Portal: "{branding.portal_name}"</div>}
        </div>
        <div className="cp-client-stats">
          <div className="cp-stat-pill">{enabledCount} features enabled</div>
        </div>
      </div>

      <div className="cp-config-grid">
        {CONFIG_SECTIONS.map(s => (
          <div key={s.path} className="cp-config-card"
            onClick={() => navigate(`/admin/clients/${clientId}/${s.path}`)}>
            <div className="cp-config-icon">{s.icon}</div>
            <div className="cp-config-label">{s.label}</div>
            <div className="cp-config-desc">{s.desc}</div>
            <div className="cp-config-arrow">→</div>
          </div>
        ))}
      </div>
    </AdminLayout>
  )
}
