import { Link } from 'react-router-dom'

export default function AuthShell({
  panelTitle,
  panelSubtitle,
  modeLabel,
  introTitle,
  introCopy,
  points,
  alternateLinkPath,
  alternateLinkText,
  children
}) {
  return (
    <div className="auth-page">
      <div className="auth-grid">
        <aside className="auth-intro">
          <div>
            <span className="intro-label">{modeLabel}</span>
            <h1 className="intro-title">{introTitle}</h1>
            <p className="intro-copy">{introCopy}</p>
            <div className="intro-point-list">
              {points.map(point => (
                <div className="intro-point" key={point}>
                  {point}
                </div>
              ))}
            </div>
          </div>
          <div className="intro-copy">Pharaxis Vault Platform</div>
        </aside>

        <section className="auth-panel">
          <h2>{panelTitle}</h2>
          <p className="auth-subtitle">{panelSubtitle}</p>
          {children}
          <Link className="auth-footer-link" to={alternateLinkPath}>
            {alternateLinkText}
          </Link>
        </section>
      </div>
    </div>
  )
}
