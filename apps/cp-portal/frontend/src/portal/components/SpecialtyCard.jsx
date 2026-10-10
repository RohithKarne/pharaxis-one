import { useState } from 'react'
import { usePortal } from '../context/PortalContext'

// CP ease-of-use plan, phase 2 row 13: the specialty question is a card in the home
// "For you" section, not a pop-up over every page. Picking one saves it to the profile
// and "For you" reloads matched to it.
const SPECIALTIES = ['Cardiology', 'Oncology', 'Neurology', 'Endocrinology', 'Immunology', 'Rheumatology', 'Dermatology', 'Gastroenterology', 'Respiratory', 'Nephrology', 'Hematology', 'Infectious Disease', 'General Practice', 'Pharmacist', 'Nurse', 'Other']

// CPPM-89: "Skip for now" is remembered for 30 days on this browser, per person,
// instead of only until the next page load.
const SKIP_DAYS = 30
function skipKey(clientCode, userId) { return `cp_specialty_skip_${clientCode}_${userId}` }
function skippedRecently(clientCode, userId) {
  try { return Date.now() - Number(localStorage.getItem(skipKey(clientCode, userId)) || 0) < SKIP_DAYS * 864e5 } catch { return false }
}

export default function SpecialtyCard() {
  const { clientCode, user, login, t } = usePortal()
  const [dismissed, setDismissed] = useState(() => skippedRecently(clientCode, user?.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (dismissed || !user || user.specialty) return null

  function skip() {
    try { localStorage.setItem(skipKey(clientCode, user.id), String(Date.now())) } catch { /* private window: skip for this page only */ }
    setDismissed(true)
  }
  async function pick(specialty) {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/portal/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ specialty }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.user) { setError(data.error || t('Your specialty was not saved. Please try again.')); return }
      login({ ...user, ...data.user }) // specialty is now set: the card goes and "For you" reloads
    } catch {
      setError(t('Your specialty was not saved. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="pp-specialty-card" aria-labelledby="pp-specialty-title">
      <h3 id="pp-specialty-title">{t('Your area of practice')}</h3>
      <p>{t('Choose your specialty to see news, documents and events that match it. It is saved to your profile.')}</p>
      <div className="pp-specialty-grid">
        {SPECIALTIES.map(s => (
          <button key={s} type="button" className="pp-specialty-chip" disabled={saving} onClick={() => pick(s)}>{s}</button>
        ))}
      </div>
      {error && <div className="pp-error-msg" role="alert">{error}</div>}
      <button type="button" className="pp-specialty-skip" onClick={skip}>{t('Skip for now')}</button>
    </section>
  )
}
