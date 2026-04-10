import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../../common/components/AuthShell'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '', orgSlug: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); setLoading(false); return }
      localStorage.setItem('vault_token', data.token)
      localStorage.setItem('vault_user', JSON.stringify(data.user))
      navigate('/vault')
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <AuthShell
      panelTitle="Welcome back"
      panelSubtitle="Sign in with your organization credentials to continue."
      modeLabel="Org Access"
      introTitle="Regulated content management, built for velocity."
      introCopy="Manage controlled content, reviews, and lifecycle decisions in one trusted hub."
      points={[
        'Tenant-isolated workspace by organization',
        'Audit-first workflows for regulated teams',
        'Fast navigation across vault, search, and lifecycle'
      ]}
      alternateLinkPath="/superadmin"
      alternateLinkText="Sign in as Pharaxis SuperAdmin"
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="orgSlug">Organization Slug</label>
          <input
            id="orgSlug"
            name="orgSlug"
            value={form.orgSlug}
            onChange={handleChange}
            required
            placeholder="e.g. novartis"
          />
        </div>

        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
            autoComplete="email"
          />
        </div>

        <div className="form-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
            autoComplete="current-password"
          />
        </div>

        {error ? <div className="auth-error">{error}</div> : null}
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </AuthShell>
  )
}
