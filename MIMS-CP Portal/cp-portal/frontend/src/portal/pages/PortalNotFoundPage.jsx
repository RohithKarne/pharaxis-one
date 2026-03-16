import { Link, useParams } from 'react-router-dom'

export default function PortalNotFoundPage() {
  const { clientCode } = useParams()
  return (
    <div className="pp-container pp-page-content pp-not-found">
      <div className="pp-empty-state">
        <span style={{ fontSize: 64 }}>404</span>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist.</p>
        <Link to={`/portal/${clientCode}`} className="pp-btn pp-btn-primary">Back to Home</Link>
      </div>
    </div>
  )
}
