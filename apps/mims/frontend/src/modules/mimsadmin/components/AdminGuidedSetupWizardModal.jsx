import React, { useEffect, useState } from 'react'
import { guardedFetch } from '../utils/guardedFetch'

// Every step saves through the same server routes the Organisations screen uses
// (MIPM-137). Until then the wizard collected the details, saved none of them and
// still said "Guided setup completed successfully!".
async function send(url, H, method, body) {
  const res = await guardedFetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`)
  return data
}

export default function AdminGuidedSetupWizardModal({ org, onClose, H, flash, onComplete }) {
  const [step, setStep] = useState(1)
  const primary = (org?.sites || []).find(s => s.is_primary) || (org?.sites || [])[0] || null

  // States for different steps
  const [orgDetails, setOrgDetails] = useState({ name: org?.name || '', country: primary?.country || '', primarySite: primary?.name || '' })
  const [adminUser, setAdminUser] = useState({ userId: '', email: '', fullName: '' })
  const [readiness, setReadiness] = useState(org?.readiness || null)
  const [error, setError] = useState('')

  const [loading, setLoading] = useState(false)

  const steps = [
    { id: 1, title: 'Org Details & Primary Site' },
    { id: 2, title: 'User Provisioning' },
    { id: 3, title: 'Picklists & Product Dictionary' },
    { id: 4, title: 'Workflow States & Transitions' },
    { id: 5, title: 'Form Rules & Field Setup' },
    { id: 6, title: 'Integration & Readiness Verification' },
  ]

  useEffect(() => {
    if (step !== 6 || !org?.id) return
    send(`/api/admin/platform/orgs/${org.id}/readiness`, H, 'GET')
      .then(d => setReadiness(d.readiness))
      .catch(() => {})
  }, [step, org?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const adminStarted = !!(adminUser.userId.trim() || adminUser.email.trim() || adminUser.fullName.trim())

  function stepError() {
    if (step === 1 && (!orgDetails.name.trim() || !orgDetails.primarySite.trim())) return 'Organisation name and primary site name are required.'
    if (step === 2 && adminStarted && (!adminUser.userId.trim() || !adminUser.email.trim() || !adminUser.fullName.trim())) {
      return 'Fill in User ID, email and full name, or leave all three empty to add the admin later.'
    }
    return ''
  }

  const nextStep = () => {
    const msg = stepError()
    setError(msg)
    if (!msg) setStep(s => Math.min(s + 1, 6))
  }
  const prevStep = () => { setError(''); setStep(s => Math.max(s - 1, 1)) }

  const handleComplete = async () => {
    setLoading(true)
    setError('')
    const done = []
    try {
      if (orgDetails.name.trim() !== org.name) {
        await send(`/api/admin/platform/orgs/${org.id}`, H, 'PUT', { name: orgDetails.name.trim() })
        done.push('organisation renamed')
      }
      const site = { name: orgDetails.primarySite.trim(), country: orgDetails.country.trim() || null, is_primary: 1 }
      if (primary) {
        if (site.name !== primary.name || (site.country || '') !== (primary.country || '')) {
          await send(`/api/admin/platform/sites/${primary.id}`, H, 'PUT', { ...site, is_active: primary.is_active ? 1 : 0 })
          done.push('primary site updated')
        }
      } else {
        await send(`/api/admin/platform/orgs/${org.id}/sites`, H, 'POST', site)
        done.push('primary site added')
      }
      if (adminStarted) {
        const { groups = [] } = await send('/api/admin/users/security-groups', H, 'GET')
        const adminGroup = groups.find(g => g.name === 'Administrators')
        if (!adminGroup) throw new Error('The "Administrators" security group is missing, so the admin was not created.')
        await send('/api/admin/users', H, 'POST', {
          user_id: adminUser.userId.trim(),
          name: adminUser.fullName.trim(),
          email: adminUser.email.trim(),
          security_group_id: adminGroup.id,
          tenant_ids: [org.id],
        })
        done.push(`admin ${adminUser.email.trim()} created`)
      }
      const result = await send(`/api/admin/platform/orgs/${org.id}/bootstrap`, H, 'POST')
      if (result?.readiness) setReadiness(result.readiness)
      done.push('baseline seeded')
      flash(`Setup saved for ${orgDetails.name.trim()}: ${done.join(', ')}.`)
      onComplete?.()
      onClose()
    } catch (e) {
      const saved = done.length ? ` Already saved: ${done.join(', ')}.` : ' Nothing was saved.'
      setError(`${e.message}${saved}`)
      if (done.length) onComplete?.()
    } finally {
      setLoading(false)
    }
  }

  const seededNote = (what) => (
    <div style={{ padding: 12, border: '1px solid #ccc', borderRadius: 6, background: '#f9f9f9', fontSize: 13 }}>
      {what} The organisation was given these when it was created; Complete Setup runs the bootstrap again and adds anything missing without changing what an administrator has edited.
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24
    }}>
      <div style={{
        width: '100%', maxWidth: 700, background: '#fff', borderRadius: 12,
        border: '1px solid #ddd', padding: 24, boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Guided Setup Wizard - {org?.name}</h2>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: 18, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>×</button>
        </div>

        {/* Progress indicator */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, overflowX: 'auto', paddingBottom: 10 }}>
          {steps.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: step === s.id ? 1 : 0.5,
              fontWeight: step === s.id ? 'bold' : 'normal',
              flexShrink: 0
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: step >= s.id ? '#007bff' : '#ccc',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12
              }}>
                {step > s.id ? '✓' : s.id}
              </div>
              <span style={{ fontSize: 13, color: step >= s.id ? '#000' : '#666' }}>{s.title}</span>
              {s.id !== 6 && <div style={{ width: 20, height: 1, background: '#ccc' }} />}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 24 }}>
          {step === 1 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 1: Org Details & Primary Site</h4>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Organisation Name *</label>
                <input className="form-control" style={{ width: '100%' }} value={orgDetails.name} onChange={e => setOrgDetails({...orgDetails, name: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Country</label>
                <input className="form-control" style={{ width: '100%' }} value={orgDetails.country} onChange={e => setOrgDetails({...orgDetails, country: e.target.value})} placeholder="e.g. India" />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Primary Site Name *</label>
                <input className="form-control" style={{ width: '100%' }} value={orgDetails.primarySite} onChange={e => setOrgDetails({...orgDetails, primarySite: e.target.value})} placeholder="e.g. HQ" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 2: User Provisioning</h4>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Create the first admin for this organisation, in the Administrators group. Leave all three empty to add people later from Add / Edit Users. The admin sets their own password with "Forgot Password?" on the sign-in page.</p>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>User ID</label>
                <input className="form-control" style={{ width: '100%' }} value={adminUser.userId} onChange={e => setAdminUser({...adminUser, userId: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Admin Email</label>
                <input type="email" className="form-control" style={{ width: '100%' }} value={adminUser.email} onChange={e => setAdminUser({...adminUser, email: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Full Name</label>
                <input className="form-control" style={{ width: '100%' }} value={adminUser.fullName} onChange={e => setAdminUser({...adminUser, fullName: e.target.value})} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 3: Picklists & Product Dictionary</h4>
              {seededNote('Standard picklists are seeded for this organisation. Products are added under Tables > Product.')}
            </div>
          )}

          {step === 4 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 4: Workflow States & Transitions</h4>
              {seededNote('The baseline case workflow states are seeded. Transitions are changed under System > Setup > Workflow Setup.')}
            </div>
          )}

          {step === 5 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 5: Form Rules & Field Setup</h4>
              {seededNote('The standard case form fields and case numbering are seeded. Fields and rules are changed under System > Setup > Forms & Fields.')}
            </div>
          )}

          {step === 6 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 6: Integration & Readiness Verification</h4>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Readiness now. Complete Setup saves steps 1 and 2, runs the bootstrap and checks again.</p>
              <div style={{ display: 'grid', gap: 6 }}>
                {(readiness?.checks || []).map(c => (
                  <div key={c.key} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: `1px solid ${c.ok ? '#c3e6cb' : '#ffeeba'}`, background: c.ok ? '#f8fff9' : '#fffaf0' }}>
                    {c.ok ? '✓' : '✕'} <strong>{c.label}</strong> — {c.detail}
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <div role="alert" style={{ marginTop: 12, fontSize: 13, color: '#b91c1c' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid #ddd' }}>
          <button className="btn btn-secondary" onClick={prevStep} disabled={step === 1 || loading}>Back</button>
          {step < 6 ? (
            <button className="btn btn-primary" onClick={nextStep}>Next</button>
          ) : (
            <button className="btn btn-primary" onClick={handleComplete} disabled={loading}>
              {loading ? 'Saving...' : 'Complete Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
