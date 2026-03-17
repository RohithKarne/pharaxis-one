import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'

export default function ContactPage() {
  const { portalConfig, clientCode, isFeatureEnabled, user, config } = usePortal()
  const client   = portalConfig?.client   || {}
  const branding = portalConfig?.branding || {}

  // LOW-05: set document title
  useEffect(() => { document.title = 'Contact Us | CP Portal'; return () => { document.title = 'CP Portal'; }; }, [])

  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status,  setStatus]  = useState(null) // null | 'submitting' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    try {
      const token = localStorage.getItem('cp_portal_token')
      const res = await fetch(`/api/portal/submit/${clientCode}/other_inquiry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          submitter_name:  name,
          submitter_email: email,
          form_data: { name, email, subject, message },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Submission failed. Please try again.')
        setStatus('error')
      } else {
        setStatus('success')
      }
    } catch {
      setErrorMsg('Unable to send your message. Please try again later.')
      setStatus('error')
    }
  }

  const contactEnabled = isFeatureEnabled('other_inquiry')

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
          {/* LOW-22: use config contact_email, fall back to client.contact_email */}
          {(config?.contact_email || client.contact_email) && (
            <a href={`mailto:${config?.contact_email || client.contact_email}`} className="pp-contact-link">
              {config?.contact_email || client.contact_email}
            </a>
          )}
          {!(config?.contact_email || client.contact_email) && (
            <a href="mailto:contact@example.com" className="pp-contact-link">contact@example.com</a>
          )}
        </div>
        <div className="pp-contact-card">
          <div className="pp-contact-icon">📞</div>
          <h3>Phone Support</h3>
          <p>Our medical affairs team is available Monday through Friday, 9 AM – 5 PM EST.</p>
          {/* LOW-22: use config contact_phone */}
          {config?.contact_phone && (
            <p className="pp-contact-phone">{config.contact_phone}</p>
          )}
        </div>
        <div className="pp-contact-card">
          <div className="pp-contact-icon">⚠️</div>
          <h3>Adverse Events</h3>
          <p>To report a suspected adverse event or side effect, please use our secure reporting form.</p>
        </div>
      </div>

      <div className="pp-contact-form-section" style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Send Us a Message</h2>

        {!contactEnabled ? (
          <div className="pp-info-state">
            <p>Contact form submissions are not currently available for this portal.</p>
          </div>
        ) : status === 'success' ? (
          <div className="pp-success-state">
            <p>Your message has been received. We will be in touch shortly.</p>
          </div>
        ) : (
          <form className="pp-contact-form" onSubmit={handleSubmit} noValidate>
            {status === 'error' && (
              <div className="pp-error-state" style={{ marginBottom: 16 }}>{errorMsg}</div>
            )}
            <div className="pp-form-row">
              <label className="pp-label" htmlFor="contact-name">Name <span aria-hidden="true">*</span></label>
              <input
                id="contact-name"
                className="pp-input"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                disabled={status === 'submitting'}
              />
            </div>
            <div className="pp-form-row">
              <label className="pp-label" htmlFor="contact-email">Email <span aria-hidden="true">*</span></label>
              <input
                id="contact-email"
                className="pp-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={status === 'submitting'}
              />
            </div>
            <div className="pp-form-row">
              <label className="pp-label" htmlFor="contact-subject">Subject</label>
              <input
                id="contact-subject"
                className="pp-input"
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                disabled={status === 'submitting'}
              />
            </div>
            <div className="pp-form-row">
              <label className="pp-label" htmlFor="contact-message">Message <span aria-hidden="true">*</span></label>
              <textarea
                id="contact-message"
                className="pp-input pp-textarea"
                rows={5}
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
                disabled={status === 'submitting'}
              />
            </div>
            <button
              type="submit"
              className="pp-btn pp-btn-primary"
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Sending…' : 'Send Message'}
            </button>
          </form>
        )}
      </div>

      {branding.footer_text_content && (
        <div className="pp-legal-note">
          <p>{branding.footer_text_content}</p>
        </div>
      )}
    </div>
  )
}
