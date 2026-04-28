import { useNavigate } from 'react-router-dom'
import { useAuth } from '../shared/context/AuthContext'

export default function NoAccessPage() {
  const { logout } = useAuth()
  const navigate   = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg-primary)', gap: 16, padding: 24
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '40px 48px', textAlign: 'center', maxWidth: 440
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          No System Access
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.6 }}>
          Please contact admin regarding system access
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 24px', background: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}
        >
          Back to Login
        </button>
      </div>
    </div>
  )
}
