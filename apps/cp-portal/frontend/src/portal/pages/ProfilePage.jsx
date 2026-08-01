import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'
import { formatLongDate } from '../../shared/utils/datetime'
import { useToast } from '../../shared/components/Toast'

const SPECIALTIES = ['Cardiology', 'Oncology', 'Neurology', 'Endocrinology', 'Immunology', 'Rheumatology', 'Dermatology', 'Gastroenterology', 'Respiratory', 'Nephrology', 'Hematology', 'Infectious Disease', 'General Practice', 'Pharmacist', 'Nurse', 'Other']

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, color: '#1A1A2E', background: '#fff', boxSizing: 'border-box' }
const cardStyle  = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 24 }

export default function ProfilePage() {
  const { clientCode, user, login } = usePortal()
  const navigate = useNavigate()
  const toast = useToast()
  const base = `/portal/${clientCode}`

  usePageTitle('My Account')

  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState({ first_name: '', last_name: '', country: '', specialty: '' })
  const [meta, setMeta]       = useState({ email: '', created_at: null })

  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg]       = useState('')
  const [profileErr, setProfileErr]       = useState('')

  const [pwd, setPwd]           = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [savingPwd, setSavingPwd] = useState(false)
  const [pwdMsg, setPwdMsg]       = useState('')
  const [pwdErr, setPwdErr]       = useState('')

  // CP-63 — GDPR data-subject rights (declared with the other hooks, before any early return)
  const [exporting, setExporting]           = useState(false)
  const [showDelete, setShowDelete]         = useState(false)
  const [deleteRequesting, setDeleteRequesting] = useState(false)

  useEffect(() => {
    if (!user) { navigate(`${base}/login`); return }
    fetch('/api/portal/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user) {
          setForm({
            first_name: d.user.first_name || '',
            last_name:  d.user.last_name  || '',
            country:    d.user.country    || '',
            specialty:  d.user.specialty  || '',
          })
          setMeta({ email: d.user.email || '', created_at: d.user.created_at || null })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user, clientCode])

  async function saveProfile(e) {
    e.preventDefault()
    setSavingProfile(true); setProfileMsg(''); setProfileErr('')
    try {
      const res = await fetch('/api/portal/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setProfileErr(data.error || 'Unable to save your details. Please try again.'); toast.error(data.error || 'Unable to save your details.'); return }
      if (data.user) login(data.user) // refresh header name/avatar immediately
      setProfileMsg('Your details have been saved.')
      toast.success('Your details have been saved.')
      setTimeout(() => setProfileMsg(''), 3000)
    } catch {
      setProfileErr('Unable to save your details. Please try again.')
      toast.error('Unable to save your details. Please try again.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwdMsg(''); setPwdErr('')
    if (pwd.new_password.length < 8) { setPwdErr('New password must be at least 8 characters.'); return }
    if (pwd.new_password !== pwd.confirm_password) { setPwdErr('New password and confirmation do not match.'); return }
    if (pwd.new_password === pwd.current_password) { setPwdErr('New password must be different from your current password.'); return }

    setSavingPwd(true)
    try {
      const res = await fetch('/api/portal/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ current_password: pwd.current_password, new_password: pwd.new_password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setPwdErr(data.error || 'Unable to change password. Please try again.'); return }
      setPwdMsg('Password updated successfully.')
      setPwd({ current_password: '', new_password: '', confirm_password: '' })
      setTimeout(() => setPwdMsg(''), 3000)
    } catch {
      setPwdErr('Unable to change password. Please try again.')
    } finally {
      setSavingPwd(false)
    }
  }

  if (loading) return <div className="pp-container pp-page-content"><div className="pp-loading">Loading…</div></div>

  const memberSince = meta.created_at ? formatLongDate(meta.created_at) : '—'

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/portal/personal/export?clientCode=${encodeURIComponent(clientCode)}`, { credentials: 'include' })
      if (!res.ok) { toast.error('Could not generate your export. Please try again.'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `my-data-export.json`; document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success('Your data export has downloaded.')
    } catch { toast.error('Network error — please try again.') } finally { setExporting(false) }
  }

  async function handleDeleteRequest() {
    setDeleteRequesting(true)
    try {
      const res = await fetch(`/api/portal/personal/erasure-request`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'Could not submit your request.'); return }
      setShowDelete(false)
      toast.success('Your account-deletion request has been submitted.')
    } catch { toast.error('Network error — please try again.') } finally { setDeleteRequesting(false) }
  }

  return (
    <div className="pp-container pp-page-content" style={{ maxWidth: 640, paddingTop: 40, paddingBottom: 60 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>My Account</h1>
      <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 28 }}>
        Update your personal details and manage your password.
      </p>

      {/* Profile details */}
      <form onSubmit={saveProfile} style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', marginBottom: 18 }}>Profile Details</h2>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle} htmlFor="pf-first">First name</label>
            <input id="pf-first" style={inputStyle} value={form.first_name}
              onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} maxLength={100} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle} htmlFor="pf-last">Last name</label>
            <input id="pf-last" style={inputStyle} value={form.last_name}
              onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} maxLength={100} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle} htmlFor="pf-email">Email</label>
          <input id="pf-email" style={{ ...inputStyle, background: '#F3F4F6', color: '#6B7280', cursor: 'not-allowed' }}
            value={meta.email} disabled readOnly />
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>
            Email can't be changed here. Contact your administrator if it needs updating.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle} htmlFor="pf-country">Country</label>
            <input id="pf-country" style={inputStyle} value={form.country}
              onChange={e => setForm(f => ({ ...f, country: e.target.value }))} maxLength={100} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle} htmlFor="pf-specialty">Specialty</label>
            <select id="pf-specialty" style={inputStyle} value={form.specialty}
              onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}>
              <option value="">Select…</option>
              {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 20 }}>Member since {memberSince}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="pp-btn pp-btn-primary" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save Changes'}
          </button>
          {profileMsg && <span style={{ color: '#16A34A', fontSize: 13, fontWeight: 500 }}>✓ {profileMsg}</span>}
          {profileErr && <span style={{ color: '#DC2626', fontSize: 13, fontWeight: 500 }}>{profileErr}</span>}
        </div>
      </form>

      {/* Change password */}
      <form onSubmit={changePassword} style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', marginBottom: 18 }}>Change Password</h2>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle} htmlFor="pf-cur">Current password</label>
          <input id="pf-cur" type="password" autoComplete="current-password" style={inputStyle}
            value={pwd.current_password} onChange={e => setPwd(p => ({ ...p, current_password: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle} htmlFor="pf-new">New password</label>
            <input id="pf-new" type="password" autoComplete="new-password" style={inputStyle}
              value={pwd.new_password} onChange={e => setPwd(p => ({ ...p, new_password: e.target.value }))} />
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>At least 8 characters.</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle} htmlFor="pf-confirm">Confirm new password</label>
            <input id="pf-confirm" type="password" autoComplete="new-password" style={inputStyle}
              value={pwd.confirm_password} onChange={e => setPwd(p => ({ ...p, confirm_password: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="pp-btn pp-btn-primary" disabled={savingPwd}>
            {savingPwd ? 'Updating…' : 'Update Password'}
          </button>
          {pwdMsg && <span style={{ color: '#16A34A', fontSize: 13, fontWeight: 500 }}>✓ {pwdMsg}</span>}
          {pwdErr && <span style={{ color: '#DC2626', fontSize: 13, fontWeight: 500 }}>{pwdErr}</span>}
        </div>
      </form>

      {/* CP-63 — GDPR data-subject rights: self-service export + deletion request */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>Privacy &amp; Your Data</h2>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 18 }}>
          Under data-protection law you can download a copy of your personal data, or request that your account be deleted.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="pp-btn pp-btn-outline" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Preparing…' : '⬇ Download my data'}
          </button>
          <button type="button" className="pp-btn pp-btn-outline" style={{ borderColor: '#DC2626', color: '#DC2626' }}
            onClick={() => setShowDelete(true)}>
            Request account deletion
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
          Deletion is reviewed by our team. Some records (e.g. adverse-event and safety reports) must be retained under
          pharmacovigilance law and will be de-identified rather than deleted.
        </p>
      </div>

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 440, width: '90%' }}>
            <h3 style={{ margin: '0 0 8px', color: '#1A1A2E' }}>Request account deletion?</h3>
            <p style={{ fontSize: 14, color: '#4B5563', marginBottom: 20 }}>
              This submits a request for our team to delete your account and personal data. Records we're legally
              required to keep will be de-identified instead. You can't undo this request from here.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="pp-btn pp-btn-outline" onClick={() => setShowDelete(false)}>Cancel</button>
              <button type="button" className="pp-btn pp-btn-primary" style={{ background: '#DC2626' }}
                onClick={handleDeleteRequest} disabled={deleteRequesting}>
                {deleteRequesting ? 'Submitting…' : 'Submit deletion request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
