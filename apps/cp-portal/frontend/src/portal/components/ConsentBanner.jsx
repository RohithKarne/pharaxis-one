import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'

const DEFAULT_CHOICES = {
  necessary:  true,
  functional: false,
  analytics:  false,
  marketing:  false,
}

// CPPM-29: the server keeps an anonymous visitor's choice 12 months (Vasu, CCO), so
// the browser forgets it after 12 months too and asks again. Browsers that stored
// "true" with no date are asked once more — re-asking is the safe direction.
const CONSENT_KEEP_MS = 365 * 24 * 60 * 60 * 1000

// CP walk 2026-10-04: the browser now also keeps the choices made, so a person who
// accepted before signing in (the banner covers the sign-in page) can have that
// choice recorded against their account once they are signed in. Older browsers
// stored only a timestamp; for them the choices are unknown.
function rememberedConsent(key) {
  const raw = localStorage.getItem(key)
  let savedAt = Number(raw), choices = null
  if (raw && raw[0] === '{') { try { const o = JSON.parse(raw); savedAt = Number(o.at); choices = o.choices || null } catch { savedAt = 0 } }
  return savedAt > 0 && Date.now() - savedAt < CONSENT_KEEP_MS ? { choices } : null
}

const PREFERENCE_TOGGLES = [
  { key: 'functional', label: 'Functional', desc: 'Enables personalised features and remembers your preferences.' },
  { key: 'analytics',  label: 'Analytics',  desc: 'Helps us understand how you use the portal to improve it.' },
  { key: 'marketing',  label: 'Marketing',  desc: 'Allows us to show relevant content and communications.' },
]

export default function ConsentBanner() {
  const { portalConfig, clientCode, user, portalFetch } = usePortal()
  const compliance = portalConfig?.compliance
  // Use the configured version verbatim. This used to strip a leading "v", so a
  // config of "v1.1" was recorded as "1.1" here while other clients (and the
  // config itself) used "v1.1" — two incomparable keys for the same notice, and
  // re-consent could never match reliably. Existing browsers will be prompted
  // once more as the storage key changes; re-asking is the safe direction.
  const version    = compliance?.version || '1.0'

  const [show, setShow]       = useState(false)
  const [step, setStep]       = useState('banner') // 'banner' | 'preferences'
  const [choices, setChoices] = useState(DEFAULT_CHOICES)
  const [saving, setSaving]   = useState(false)
  // CPPM-13: the wording this visitor actually accepted, read back from the record.
  const [agreed, setAgreed]   = useState(null)

  useEffect(() => {
    if (!compliance) return
    const remembered = rememberedConsent(`cp_consent_v${version}`)
    // Signed-in user — the record on their account decides. Before, a choice the
    // browser remembered was taken as final, so a person who accepted on the
    // sign-in page was never recorded in the Consent Audit Log under their name.
    if (user) {
      portalFetch(`/api/portal/consent/check?clientCode=${clientCode}&version=${version}`)
        .then(r => r.json())
        .then(d => {
          if (d.consented) return
          if (remembered?.choices) saveConsent(remembered.choices) // record the choice they already made, without asking again
          else setShow(true)
        })
        .catch(() => setShow(true)) // fallback: show banner on error
      return
    }
    // Anonymous user — only localStorage
    if (!remembered) setShow(true)
  }, [compliance, user, clientCode, version])

  // CPPM-35: "Cookie settings" in the footer reopens the preferences with the
  // visitor's current choice, so consent can be changed or withdrawn at any time.
  useEffect(() => {
    async function reopen() {
      try {
        const res = await fetch(`/api/portal/consent/my-choice?clientCode=${clientCode}`)
        const d = res.ok ? await res.json() : {}
        setChoices({ ...DEFAULT_CHOICES, ...(d.choices || {}), necessary: true })
        setAgreed(d.agreed || null)
      } catch {
        setChoices(DEFAULT_CHOICES)
        setAgreed(null)
      }
      setStep('preferences')
      setShow(true)
    }
    window.addEventListener('cp:open-consent', reopen)
    return () => window.removeEventListener('cp:open-consent', reopen)
  }, [clientCode])

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
    let serverOk = false
    try {
      const res = await fetch('/api/portal/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode, choices: finalChoices, version }),
      })
      serverOk = res.ok
    } catch { /* network error — fall back to local-only for anonymous users */ }
    // For a signed-in user a server rejection must stay retryable: don't persist
    // local "consented" or close the banner unless the server accepted it.
    if (user && !serverOk) {
      setSaving(false)
      return
    }
    localStorage.setItem(`cp_consent_v${version}`, JSON.stringify({ at: Date.now(), choices: finalChoices }))
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
  const title        = bannerConfig.title        || portalConfig?.consent_banner_title || portalConfig?.banner_title || 'We use cookies'
  const body         = bannerConfig.body         || portalConfig?.consent_banner_text  || portalConfig?.banner_text  || 'We use cookies and similar technologies to improve your experience on this portal. Please choose your preferences below.'
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
              <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Always On</span>
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

            {/* CPPM-13: what this visitor agreed to, in the words they were shown. */}
            {agreed && (
              <div style={{ marginTop: 18, padding: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  What you agreed to (version {agreed.version}
                  {agreed.consented_at ? ` on ${new Date(agreed.consented_at).toLocaleDateString()}` : ''})
                </div>
                {agreed.title && <div style={{ fontSize: 13, fontWeight: 600 }}>{agreed.title}</div>}
                <div style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{agreed.body}</div>
              </div>
            )}

            <div className="pp-consent-actions" style={{ marginTop: 20 }}>
              <button className="pp-consent-btn-primary" onClick={handleSavePreferences} disabled={saving}>
                {saving ? 'Saving…' : 'Save My Preferences'}
              </button>
              <button className="pp-consent-btn-link" onClick={() => setStep('banner')} disabled={saving}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
