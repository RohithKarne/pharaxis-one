import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const { hasModuleAccess } = useAuth()

  useEffect(() => {
    if (hasModuleAccess('reports')) {
      navigate('/reports', { replace: true })
    }
  }, [hasModuleAccess, navigate])

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>
      <div className="mims-analytics-state">
        <div className="mims-analytics-state-card">
          <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Analytics</h2>
          <p style={{ fontSize: 14 }}>
            {hasModuleAccess('reports')
              ? 'Opening Reports…'
              : 'Reports, charts and dashboards — coming in a future sprint'}
          </p>
        </div>
      </div>
    </MIMSLayout>
  )
}
