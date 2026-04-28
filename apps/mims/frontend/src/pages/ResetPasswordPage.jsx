import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../shared/context/AuthContext'
import { httpFetch } from '../shared/api/httpFetch.js'

export default function ResetPasswordPage() {
  const { token, logout } = useAuth()
  const navigate          = useNavigate()
  const [form, setForm]   = useState({ newPassword: '', confirm: '' })
  const [alert, setAlert] = useState({ show: false, type: 'error', msg: '' })
  const [loading, setLoading] = useState(false)

  function showAlert(msg, type = 'error') { setAlert({ show: true, type, msg }) }

  async function handleReset(e) {
    e.preventDefault()
    if (form.newPassword !== form.confirm)
      return showAlert('Passwords do not match.')
    if (form.newPassword.length < 8)
      return showAlert('Password must be at least 8 characters.')

    setLoading(true)
    try {
      const res = await httpFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: form.newPassword })
      })
      const data = await res.json()
      if (!res.ok) return showAlert(data.error || 'Reset failed.')
      showAlert('Password updated. Please log in again.', 'success')
      await logout()
      setTimeout(() => navigate('/login'), 1500)
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg-primary)', padding: 24
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '36px 40px', maxWidth: 400, width: '100%'
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Set New Password
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
          Your account requires a password reset before you can continue.
        </div>

        {alert.show && (
          <div className={`alert alert-${alert.type}`} style={{ marginBottom: 16 }}>{alert.msg}</div>
        )}

        <form onSubmit={handleReset}>
          <div className="form-group">
            <label>New Password</label>
            <input className="form-control" type="password" required minLength={8}
              placeholder="Min. 8 characters"
              value={form.newPassword}
              onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input className="form-control" type="password" required minLength={8}
              placeholder="Re-enter new password"
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-block mt-8" type="submit" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
