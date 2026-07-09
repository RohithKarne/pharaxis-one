import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const LOGIN_MODES = [
  { value: 'local_only',    label: 'Password only',        desc: 'Users sign in with email + password. SSO buttons hidden.' },
  { value: 'local_and_sso', label: 'Password and SSO',     desc: 'Both options offered on the login page.' },
  { value: 'sso_only',      label: 'SSO only',             desc: 'Only single sign-on is offered. Password login hidden.' },
]

export default function SsoConfigPage() {
  const { clientId } = useParams()
  const [loginMode, setLoginMode] = useState('local_only')
  const [providers, setProviders] = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [saved, setSaved]         = useState(false)
  const [copied, setCopied]       = useState('')

  useEffect(() => {
    fetch(`/api/admin/sso/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => {
        setLoginMode(d.login_mode || 'local_only')
        // client_secret is intentionally blank in the form; masked hint shown separately.
        setProviders((d.providers || []).map(p => ({ ...p, client_secret: '' })))
      })
      .catch(() => setError('Could not load SSO configuration.'))
      .finally(() => setLoading(false))
  }, [clientId])

  function updateProvider(key, patch) {
    setProviders(prev => prev.map(p => (p.provider_key === key ? { ...p, ...patch } : p)))
    setSaved(false)
  }

  async function copy(text, tag) {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1500) } catch { /* clipboard blocked */ }
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch(`/api/admin/sso/${clientId}`, {
        method: 'PUT', headers: adminHeaders(),
        body: JSON.stringify({
          login_mode: loginMode,
          providers: providers.map(p => ({
            provider_key: p.provider_key,
            oidc_client_id: p.oidc_client_id,
            client_secret: p.client_secret, // blank => keep stored secret
            tenant_id: p.tenant_id,
            allowed_domains: p.allowed_domains,
            is_active: p.is_active,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Save failed.'); return }
      setSaved(true)
      // Reflect the now-stored secret as masked + clear the input.
      setProviders(prev => prev.map(p => ({
        ...p,
        client_secret: '',
        configured: !!(p.oidc_client_id && (p.client_secret || p.configured)),
        client_secret_masked: p.client_secret ? '••••' + p.client_secret.slice(-4) : p.client_secret_masked,
      })))
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <AdminLayout title="Single Sign-On"><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout title="Single Sign-On">
      <div style={{ maxWidth: 820 }}>
        <p style={{ color: 'var(--cp-text-muted, #6b7280)', marginBottom: 20, lineHeight: 1.6 }}>
          Let this portal's users sign in with their organisation's identity provider (OIDC).
          SSO signs users into an <strong>existing, admin-provisioned account</strong> matched by
          verified email — it never creates new accounts. Register the redirect URI shown below with
          your identity provider, then paste the app's Client ID and secret.
        </p>

        {error && <div className="cp-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
        {saved && <div className="cp-success" role="status" style={{ marginBottom: 16 }}>SSO configuration saved.</div>}

        {/* ── Login mode ──────────────────────────────────────────── */}
        <div className="cp-card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Login method</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {LOGIN_MODES.map(m => (
              <label key={m.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: 10, border: `1px solid ${loginMode === m.value ? 'var(--cp-primary, #5B2FA0)' : 'var(--cp-border, #e5e7eb)'}`, borderRadius: 8 }}>
                <input type="radio" name="login_mode" checked={loginMode === m.value} onChange={() => { setLoginMode(m.value); setSaved(false) }} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontWeight: 600, display: 'block' }}>{m.label}</span>
                  <span style={{ fontSize: 13, color: 'var(--cp-text-muted, #6b7280)' }}>{m.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* ── Providers ───────────────────────────────────────────── */}
        {providers.map(p => (
          <div key={p.provider_key} className="cp-card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>
                {p.label}
                {p.configured && <span className="cp-badge" style={{ marginLeft: 10, background: '#DCFCE7', color: '#16A34A' }}>Configured</span>}
              </h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!p.is_active} onChange={e => updateProvider(p.provider_key, { is_active: e.target.checked })} />
                Enabled
              </label>
            </div>

            <div className="cp-field" style={{ marginBottom: 14 }}>
              <label>Redirect URI <span style={{ color: 'var(--cp-text-muted, #9ca3af)', fontWeight: 400 }}>— register this with {p.label}</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" readOnly value={p.redirect_uri} onFocus={e => e.target.select()} style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
                <button type="button" className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => copy(p.redirect_uri, p.provider_key)}>
                  {copied === p.provider_key ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="cp-field" style={{ marginBottom: 14 }}>
              <label>Client ID (Application ID)</label>
              <input type="text" value={p.oidc_client_id} onChange={e => updateProvider(p.provider_key, { oidc_client_id: e.target.value })} placeholder="e.g. 11111111-2222-3333-4444-555555555555" />
            </div>

            <div className="cp-field" style={{ marginBottom: 14 }}>
              <label>Client Secret</label>
              <input type="password" value={p.client_secret} onChange={e => updateProvider(p.provider_key, { client_secret: e.target.value })}
                placeholder={p.client_secret_masked ? `Stored: ${p.client_secret_masked} — leave blank to keep` : 'Paste the client secret'} autoComplete="new-password" />
            </div>

            {p.tenant_required && (
              <div className="cp-field" style={{ marginBottom: 14 }}>
                <label>Directory (Tenant) ID</label>
                <input type="text" value={p.tenant_id} onChange={e => updateProvider(p.provider_key, { tenant_id: e.target.value })} placeholder="common, or your Entra tenant ID" />
                <small style={{ color: 'var(--cp-text-muted, #6b7280)' }}>Use <code>common</code> for multi-tenant, or a specific tenant ID to restrict to one organisation.</small>
              </div>
            )}

            <div className="cp-field">
              <label>Allowed email domains <span style={{ color: 'var(--cp-text-muted, #9ca3af)', fontWeight: 400 }}>— optional</span></label>
              <input type="text" value={p.allowed_domains} onChange={e => updateProvider(p.provider_key, { allowed_domains: e.target.value })} placeholder="e.g. novartis.com, example.org" />
              <small style={{ color: 'var(--cp-text-muted, #6b7280)' }}>Comma-separated. Leave blank to allow any domain the provider returns.</small>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="cp-btn cp-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save SSO settings'}
          </button>
          {saved && <span style={{ color: '#16A34A', fontSize: 13 }}>✓ Saved</span>}
        </div>
      </div>
    </AdminLayout>
  )
}
