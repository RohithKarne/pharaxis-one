import { useNavigate } from 'react-router-dom'
import {
  authHeaders,
  clearSuperadminSession,
  getSuperadminToken
} from '../../common/utils/session'

export default function SuperadminTopbar({ title, subtitle }) {
  const navigate = useNavigate()

  async function logout() {
    const token = getSuperadminToken()
    try {
      await fetch('/api/superadmin/logout', {
        method: 'POST',
        headers: authHeaders(token)
      })
    } finally {
      clearSuperadminSession()
      navigate('/login')
    }
  }

  return (
    <header className="app-topbar">
      <div className="brand-block">
        <h1 className="brand-title">{title}</h1>
        <p className="brand-subtitle">{subtitle}</p>
      </div>
      <div className="topbar-actions">
        <span className="topbar-pill">Pharaxis Internal</span>
        <button className="workspace-logout" type="button" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  )
}
