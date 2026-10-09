import { Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

export default function PortalNotFoundPage() {
  const { clientCode, t } = usePortal()
  return (
    <div className="pp-container pp-page-content pp-not-found">
      <div className="pp-empty-state">
        <span style={{ fontSize: 64 }}>404</span>
        <h2>{t('Page Not Found')}</h2>
        <p>{t('The page you\'re looking for doesn\'t exist.')}</p>
        <Link to={`/portal/${clientCode}`} className="pp-btn pp-btn-primary">{t('Go to Portal Home')}</Link>
      </div>
    </div>
  )
}
