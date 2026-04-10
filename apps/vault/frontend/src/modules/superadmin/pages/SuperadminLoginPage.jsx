import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../../common/components/AuthShell'

export default function SuperadminLoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); setLoading(false); return }
      localStorage.setItem('vault_superadmin_token', data.token)
      localStorage.setItem('vault_superadmin', JSON.stringify(data.superadmin))
      navigate('/superadmin/dashboard')
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <AuthShell
      panelTitle="SuperAdmin Console"
      panelSubtitle="Use your Pharaxis account to access global tenant controls."
      modeLabel="Internal Access"
      introTitle="Global platform control for enterprise vault operations."
      introCopy="Monitor organization health, manage onboarding, and maintain system-wide governance."
      points={[
        'Cross-organization dashboard and audit visibility',
        'Rapid org provisioning with quota controls',
        'Secure global admin pathway separated from org login'
      ]}
      alternateLinkPath="/"
      alternateLinkText="Back to Organization Sign In"
    >
      <form className="auth-form" onSubmit={handleSubmit}>
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
