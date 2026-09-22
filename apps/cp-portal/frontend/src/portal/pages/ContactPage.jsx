import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'

const MESSAGE_MAX = 2000

export default function ContactPage() {
  const { portalConfig, clientCode, isFeatureEnabled, user } = usePortal()
  const client   = portalConfig?.client   || {}
  const branding = portalConfig?.branding || {}
  const base     = `/portal/${clientCode}`

  usePageTitle('Contact Us')

  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  // Every submission is screened for a hidden adverse event (server rule, pd2-ae-screening).
  // The form never asked, so every message was rejected with a 400.
  const [aeAnswer, setAeAnswer] = useState('')
  const [aeDetail, setAeDetail] = useState('')
  const [status,  setStatus]  = useState(null) // null | 'submitting' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  const [reference, setReference] = useState('')

  // A signed-in visitor should not have to retype details we already hold.
  useEffect(() => {
    if (!user) return
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
    setName(n => n || fullName)
    setEmail(e => e || user.email || '')
  }, [user])

  async function handleSubmit(e) {
    e.preventDefault()
    // Subject is required: the contact form's server-side field list requires it (CPPM-7).
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim() || !aeAnswer) {
      setErrorMsg(!aeAnswer ? 'Please answer the question about whether anyone became unwell.' : 'Please fill in your name, email, subject and message.')
      setStatus('error')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Please enter a valid email address so we can reply.')
      setStatus('error')
      return
    }
    setStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/portal/submit/${clientCode}/other_inquiry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submitter_name:  name,
          submitter_email: email,
          form_data: {
            name, email, subject, message,
            ae_screen_answer: aeAnswer,
            ...(aeAnswer === 'Yes' && aeDetail.trim() ? { ae_screen_detail: aeDetail.trim() } : {}),
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Submission failed. Please try again.')
        setStatus('error')
      } else {
        setReference(data.reference || '')
        setStatus('success')
      }
    } catch {
      setErrorMsg('Unable to send your message. Please try again later.')
      setStatus('error')
    }
  }

  function startAnother() {
    setSubject('')
    setMessage('')
    setAeAnswer('')
    setAeDetail('')
    setReference('')
    setStatus(null)
  }

  const contactEnabled = isFeatureEnabled('other_inquiry')
  const busy = status === 'submitting'

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
          <p>For medical information requests and clinical inquiries, use our submission portal.</p>
          <Link to={`${base}/submit`} className="pp-contact-action">Submit a medical inquiry →</Link>
          {/* Contact details come from the client record; render only if present. */}
          {client.contact_email && (
            <a href={`mailto:${client.contact_email}`} className="pp-contact-link">{client.contact_email}</a>
          )}
        </div>
        <div className="pp-contact-card">
          <div className="pp-contact-icon">📞</div>
          <h3>Phone Support</h3>
          <p>Our medical affairs team is available Monday to Friday during business hours.</p>
          {client.contact_phone
            ? <a href={`tel:${client.contact_phone.replace(/\s+/g, '')}`} className="pp-contact-link">{client.contact_phone}</a>
            : <p className="pp-contact-muted">Prefer writing? Use the form below and we will reply by email.</p>}
        </div>
        <div className="pp-contact-card pp-contact-card-alert">
          <div className="pp-contact-icon">⚠️</div>
          <h3>Adverse Events</h3>
          <p>To report a suspected adverse event or side effect, please use our secure reporting form.</p>
          <Link to={`${base}/submit?type=adverse_event`} className="pp-contact-action pp-contact-action-alert">Report a side effect →</Link>
        </div>
      </div>

      <div className="pp-contact-form-card">
        <div className="pp-contact-form-head">
          <h2>Send Us a Message</h2>
          <p>General questions about this portal, events or your account. We usually reply within 2 working days.</p>
        </div>

        {!contactEnabled ? (
          <div className="pp-contact-note">Contact form submissions are not currently available for this portal.</div>
        ) : status === 'success' ? (
          <div className="pp-contact-success" role="status">
            <div className="pp-contact-success-icon">✓</div>
            <h3>Message sent</h3>
            <p>
              Thank you{name ? `, ${name.split(' ')[0]}` : ''}. We have received your message
              {reference && <> — your reference is <strong>{reference}</strong></>}. A confirmation has been sent to {email}.
            </p>
            <button type="button" className="pp-btn pp-btn-outline" onClick={startAnother}>Send another message</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {status === 'error' && (
              <div className="pp-contact-error" role="alert">{errorMsg}</div>
            )}
            <div className="pp-field-row">
              <div className="pp-field">
                <label htmlFor="contact-name">Full name <span className="pp-required" aria-hidden="true">*</span></label>
                <input id="contact-name" type="text" autoComplete="name" placeholder="e.g. Dr. Ananya Iyer"
                  value={name} onChange={e => setName(e.target.value)} required disabled={busy} />
              </div>
              <div className="pp-field">
                <label htmlFor="contact-email">Email <span className="pp-required" aria-hidden="true">*</span></label>
                <input id="contact-email" type="email" autoComplete="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} />
              </div>
            </div>
            <div className="pp-field">
              <label htmlFor="contact-subject">Subject <span className="pp-required" aria-hidden="true">*</span></label>
              <input id="contact-subject" type="text" placeholder="What is this about?"
                value={subject} onChange={e => setSubject(e.target.value)} required disabled={busy} />
            </div>
            <div className="pp-field">
              <label htmlFor="contact-message">Message <span className="pp-required" aria-hidden="true">*</span></label>
              <textarea id="contact-message" rows={6} maxLength={MESSAGE_MAX} placeholder="How can we help?"
                value={message} onChange={e => setMessage(e.target.value)} required disabled={busy} />
              <span className="pp-contact-count">{message.length} / {MESSAGE_MAX}</span>
            </div>
            <fieldset className="pp-contact-ae">
              <legend>
                Did anyone become unwell, or have an unexpected medical problem, after using the product? <span className="pp-required" aria-hidden="true">*</span>
              </legend>
              <p className="pp-contact-ae-help">This includes anything you did not expect — however minor, and whether or not you think the product caused it.</p>
              <div className="pp-contact-ae-options">
                {['No', 'Yes'].map(v => (
                  <label key={v} className={`pp-contact-ae-option${aeAnswer === v ? ' on' : ''}`}>
                    <input type="radio" name="ae_screen_answer" value={v} checked={aeAnswer === v}
                      onChange={() => setAeAnswer(v)} disabled={busy} />
                    {v}
                  </label>
                ))}
              </div>
              {aeAnswer === 'Yes' && (
                <div className="pp-field" style={{ marginTop: 12 }}>
                  <label htmlFor="contact-ae-detail">Please tell us what happened</label>
                  <textarea id="contact-ae-detail" rows={3} placeholder="In your own words. Anything you can tell us helps."
                    value={aeDetail} onChange={e => setAeDetail(e.target.value)} disabled={busy} />
                </div>
              )}
            </fieldset>
            <div className="pp-contact-form-foot">
              <p>Reporting a side effect? Please use the <Link to={`${base}/submit?type=adverse_event`}>adverse event form</Link> so it reaches our safety team.</p>
              <button type="submit" className="pp-btn pp-btn-primary pp-btn-lg" disabled={busy}>
                {busy ? 'Sending…' : 'Send Message'}
              </button>
            </div>
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
