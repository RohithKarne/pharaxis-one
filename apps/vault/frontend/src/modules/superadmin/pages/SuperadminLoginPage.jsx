import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1a1a2e' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '8px', width: '380px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <h2 style={{ marginBottom: '8px', color: '#1a1a2e' }}>Pharaxis Vault</h2>
        <p style={{ color: '#666', marginBottom: '32px', fontSize: '14px' }}>SuperAdmin Portal</p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>Email</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} required
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>Password</label>
            <input name="password" type="password" value={form.password} onChange={handleChange} required
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
          </div>
          {error && <div style={{ color: '#d32f2f', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
