import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'

const DEFAULT_CHOICES = {
  necessary:  true,
  functional: false,
  analytics:  false,
  marketing:  false,
}

const PREFERENCE_TOGGLES = [
  { key: 'functional', label: 'Functional', desc: 'Enables personalised features and remembers your preferences.' },
  { key: 'analytics',  label: 'Analytics',  desc: 'Helps us understand how you use the portal to improve it.' },
  { key: 'marketing',  label: 'Marketing',  desc: 'Allows us to show relevant content and communications.' },
]

export default function ConsentBanner() {
  const { portalConfig, clientCode } = usePortal()
  const compliance = portalConfig?.compliance
  const version    = compliance?.version || 'v1.0'

  const [show, setShow]     = useState(false)
  const [step, setStep]     = useState('banner') // 'banner' | 'preferences'
  const [choices, setChoices] = useState(DEFAULT_CHOICES)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!compliance) return
    const stored = localStorage.getItem(`cp_consent_v${version}`)
    if (!stored) setShow(true)
  }, [compliance, version])

  // A-02: hide background content from screen readers when overlay is open
  useEffect(() => {
    const appRoot = document.getElementById('root')
    if (!appRoot) return
    if (show) {
      appRoot.setAttribute('aria-hidden', 'true')
    } else {
      appRoot.removeAttribute('aria-hidden')
    }
    return () => appRoot.removeAttribute('aria-hidden')
  }, [show])

  async function saveConsent(finalChoices) {
    setSaving(true)
    try {
      const token = localStorage.getItem('cp_portal_token')
      await fetch('/api/portal/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ clientCode, choices: finalChoices, version }),
      })
    } catch { /* ignore — still save locally */ }
    localStorage.setItem(`cp_consent_v${version}`, 'true')
    setSaving(false)
    setShow(false)
  }

  function handleAcceptAll() {
    saveConsent({ necessary: true, functional: true, analytics: true, marketing: true })
  }

  function handleNecessaryOnly() {
    saveConsent({ necessary: true, functional: false, analytics: false, marketing: false })
  }

  function handleManage() {
    setStep('preferences')
  }

  function handleSavePreferences() {
    saveConsent(choices)
  }

  function toggleChoice(key) {
    setChoices(c => ({ ...c, [key]: !c[key] }))
  }

  if (!show || !compliance) return null

  const bannerConfig = compliance.banner_config || {}
  const title        = bannerConfig.title        || 'We use cookies'
  const body         = bannerConfig.body         || 'We use cookies and similar technologies to improve your experience on this portal. Please choose your preferences below.'
  const acceptLabel  = bannerConfig.accept_label  || 'Accept All'
  const declineLabel = bannerConfig.decline_label || 'Necessary Only'
  const manageLabel  = bannerConfig.manage_label  || 'Manage Preferences'

  return (
    <div className="pp-consent-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="pp-consent-modal">
        {step === 'banner' ? (
          <>
            <div className="pp-consent-title" id="consent-title">{title}</div>
            <div className="pp-consent-body">{body}</div>
            <div className="pp-consent-actions">
              <button className="pp-consent-btn-primary" onClick={handleAcceptAll} disabled={saving}>
                {saving ? 'Saving…' : acceptLabel}
              </button>
              <button className="pp-consent-btn-secondary" onClick={handleNecessaryOnly} disabled={saving}>
                {declineLabel}
              </button>
              <button className="pp-consent-btn-link" onClick={handleManage} disabled={saving}>
                {manageLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pp-consent-title" id="consent-title">Manage Cookie Preferences</div>
            <div className="pp-consent-body">Choose which cookies you accept. Necessary cookies are always on.</div>

            {/* Necessary — always on */}
            <div className="pp-consent-toggle-row">
              <div>
                <div className="pp-consent-toggle-label">Necessary</div>
                <div className="pp-consent-toggle-desc">Required for the portal to function. Cannot be disabled.</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>Always On</span>
            </div>

            {PREFERENCE_TOGGLES.map(t => (
              <div key={t.key} className="pp-consent-toggle-row">
                <div>
                  <div className="pp-consent-toggle-label">{t.label}</div>
                  <div className="pp-consent-toggle-desc">{t.desc}</div>
                </div>
                <label className="pp-consent-toggle" aria-label={`Toggle ${t.label}`}>
                  <input
                    type="checkbox"
                    checked={!!choices[t.key]}
                    onChange={() => toggleChoice(t.key)}
                  />
                </label>
              </div>
            ))}

            <div className="pp-consent-actions" style={{ marginTop: 20 }}>
              <button className="pp-consent-btn-primary" onClick={handleSavePreferences} disabled={saving}>
                {saving ? 'Saving…' : 'Save My Preferences'}
              </button>
              <button className="pp-consent-btn-link" onClick={() => setStep('banner')} disabled={saving}>
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
