import { useAuth } from '../context/AuthContext'

export default function ModuleAccessGuard({ moduleKey, moduleKeys, children }) {
  const { hasModuleAccess, logout } = useAuth()
  const allowedModules = Array.isArray(moduleKeys)
    ? moduleKeys.filter(Boolean)
    : (moduleKey ? [moduleKey] : [])
  const canAccess = allowedModules.length === 0 || allowedModules.some(hasModuleAccess)

  if (!canAccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, fontFamily: 'sans-serif' }}>
        <h2 style={{ margin: 0 }}>Access Denied</h2>
        <p style={{ margin: 0, color: '#666' }}>You don't have permission to access this module.</p>
        {/* Signing out was the only way off this page (MIPM-152). */}
        <button
          onClick={() => window.history.back()}
          style={{ marginTop: 8, padding: '8px 20px', background: 'var(--surface,#fff)', color: 'var(--text-primary,#111)', border: '1px solid var(--border,#ccc)', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Go back
        </button>
        <button
          onClick={() => { logout().then(() => { window.location.href = '/mims/login' }) }}
          style={{ marginTop: 8, padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Log out
        </button>
      </div>
    )
  }
  return children
}
