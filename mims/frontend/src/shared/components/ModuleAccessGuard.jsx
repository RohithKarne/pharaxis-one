import { useAuth } from '../context/AuthContext'

export default function ModuleAccessGuard({ moduleKey, children }) {
  const { hasModuleAccess, logout } = useAuth()
  if (moduleKey && !hasModuleAccess(moduleKey)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <h2 style={{ margin: 0 }}>Access Denied</h2>
        <p style={{ margin: 0, color: '#666' }}>You don't have permission to access this module.</p>
        <button
          onClick={() => { logout().then(() => { window.location.href = '/login' }) }}
          style={{ marginTop: 8, padding: '8px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Log out
        </button>
      </div>
    )
  }
  return children
}
