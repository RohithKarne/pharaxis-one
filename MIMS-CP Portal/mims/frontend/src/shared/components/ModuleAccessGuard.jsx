import { useAuth } from '../context/AuthContext'

export default function ModuleAccessGuard({ moduleKey, children }) {
  const { hasModuleAccess } = useAuth()
  if (moduleKey && !hasModuleAccess(moduleKey)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <h2 style={{ margin: 0 }}>Access Denied</h2>
        <p style={{ margin: 0, color: '#666' }}>You don't have permission to access this module.</p>
      </div>
    )
  }
  return children
}
