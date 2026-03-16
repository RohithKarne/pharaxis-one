import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

export default function PortalHomePage() {
  const { portalConfig, isFeatureEnabled, clientCode } = usePortal()
  const navigate  = useNavigate()
  const branding  = portalConfig?.branding || {}
  const client    = portalConfig?.client   || {}
  const base      = `/portal/${clientCode}`

  const featureCards = [
    {
      key:   'therapeutic_areas',
      icon:  '🧬',
      title: 'Therapeutic Areas',
      desc:  'Explore our focus areas across diseases and treatment categories.',
      path:  'therapeutic-areas',
    },
    {
      key:   'medical_inquiry',
      icon:  '📋',
      title: 'Submit an Inquiry',
      desc:  'Submit a medical information request, adverse event report, or product complaint.',
      path:  'submit',
      highlight: true,
    },
    {
      key:   'events',
      icon:  '📅',
      title: 'Events & Webinars',
      desc:  'Find upcoming medical education events, symposia, and webinars.',
      path:  'events',
    },
    {
      key:   'find_msl',
      icon:  '👨‍⚕️',
      title: 'Find an MSL',
      desc:  'Connect with our Medical Science Liaison team in your region.',
      path:  'find-msl',
    },
    {
      key:   'resources',
      icon:  '📚',
      title: 'Resources',
      desc:  'Access publications, clinical data, and approved materials.',
      path:  'resources',
    },
    {
      key:   'drug_information',
      icon:  '💊',
      title: 'Drug Information',
      desc:  'Review approved prescribing information and clinical summaries.',
      path:  'drug-info',
    },
  ].filter(c => isFeatureEnabled(c.key))

  const heroTitle    = `Welcome to ${branding.portal_name || client.name || 'the Medical Portal'}`
  const heroSubtitle = branding.tagline || 'Your trusted source for medical information, resources, and support.'

  return (
    <div className="pp-home">
      <section className="pp-hero">
        <div className="pp-hero-inner">
          <h1 className="pp-hero-title">{heroTitle}</h1>
          <p className="pp-hero-subtitle">{heroSubtitle}</p>
          {isFeatureEnabled('medical_inquiry') && (
            <div className="pp-hero-actions">
              <button className="pp-btn pp-btn-primary pp-btn-lg" onClick={() => navigate(`${base}/submit`)}>
                Submit an Inquiry
              </button>
              <button className="pp-btn pp-btn-outline pp-btn-lg" onClick={() => navigate(`${base}/therapeutic-areas`)}>
                Learn More
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="pp-features-section">
        <div className="pp-container">
          <h2 className="pp-section-title">How Can We Help?</h2>
          <div className="pp-feature-grid">
            {featureCards.map(card => (
              <Link key={card.key} to={`${base}/${card.path}`}
                className={`pp-feature-card ${card.highlight ? 'pp-feature-card-highlight' : ''}`}>
                <div className="pp-feature-icon">{card.icon}</div>
                <h3 className="pp-feature-title">{card.title}</h3>
                <p className="pp-feature-desc">{card.desc}</p>
                <span className="pp-feature-link">Learn more →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {isFeatureEnabled('medical_inquiry') && (
        <section className="pp-cta-section">
          <div className="pp-container">
            <div className="pp-cta-card">
              <div className="pp-cta-text">
                <h2>Need Medical Information?</h2>
                <p>Our medical affairs team is ready to assist healthcare professionals and patients with accurate, evidence-based information.</p>
              </div>
              <button className="pp-btn pp-btn-primary pp-btn-lg" onClick={() => navigate(`${base}/submit`)}>
                Submit a Request
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
