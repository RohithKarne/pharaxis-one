import { usePortal } from '../context/PortalContext'

export default function ContactPage() {
  const { portalConfig } = usePortal()
  const client = portalConfig?.client || {}
  const branding = portalConfig?.branding || {}

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>Contact Us</h1>
        <p>Get in touch with our medical affairs and support teams.</p>
      </div>
      <div className="pp-contact-layout">
        <div className="pp-contact-card">
          <div className="pp-contact-icon">🏥</div>
          <h3>Medical Information</h3>
          <p>For medical information requests and clinical inquiries, please use our submission portal.</p>
          {client.contact_email && (
            <a href={`mailto:${client.contact_email}`} className="pp-contact-link">{client.contact_email}</a>
          )}
        </div>
        <div className="pp-contact-card">
          <div className="pp-contact-icon">📞</div>
          <h3>Phone Support</h3>
          <p>Our medical affairs team is available Monday through Friday, 9 AM – 5 PM EST.</p>
        </div>
        <div className="pp-contact-card">
          <div className="pp-contact-icon">⚠️</div>
          <h3>Adverse Events</h3>
          <p>To report a suspected adverse event or side effect, please use our secure reporting form.</p>
        </div>
      </div>
      {branding.footer_text_content && (
        <div className="pp-legal-note">
          <p>{branding.footer_text_content}</p>
        </div>
      )}
    </div>
  )
}
