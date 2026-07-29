import React, { useState } from 'react'

export default function AdminGuidedSetupWizardModal({ org, onClose, H, flash, onComplete }) {
  const [step, setStep] = useState(1)
  
  // States for different steps
  const [orgDetails, setOrgDetails] = useState({ name: org?.name || '', country: '', primarySite: '' })
  const [adminUser, setAdminUser] = useState({ email: '', firstName: '', lastName: '' })
  
  const [loading, setLoading] = useState(false)

  const steps = [
    { id: 1, title: 'Org Details & Primary Site' },
    { id: 2, title: 'User Provisioning' },
    { id: 3, title: 'Picklists & Product Dictionary' },
    { id: 4, title: 'Workflow States & Transitions' },
    { id: 5, title: 'Form Rules & Field Setup' },
    { id: 6, title: 'Integration & Readiness Verification' },
  ]

  const nextStep = () => setStep(s => Math.min(s + 1, 6))
  const prevStep = () => setStep(s => Math.max(s - 1, 1))

  const handleComplete = async () => {
    setLoading(true)
    try {
      // Simulate setup API call
      await new Promise(r => setTimeout(r, 1000))
      flash('Guided setup completed successfully!')
      onComplete?.()
      onClose()
    } catch (e) {
      flash('Failed to complete setup', 'error')
    } finally {
      setLoading(false)
    }
  }

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
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Organisation Name</label>
                <input className="form-control" style={{ width: '100%' }} value={orgDetails.name} onChange={e => setOrgDetails({...orgDetails, name: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Country</label>
                <input className="form-control" style={{ width: '100%' }} value={orgDetails.country} onChange={e => setOrgDetails({...orgDetails, country: e.target.value})} placeholder="e.g. India" />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Primary Site Name</label>
                <input className="form-control" style={{ width: '100%' }} value={orgDetails.primarySite} onChange={e => setOrgDetails({...orgDetails, primarySite: e.target.value})} placeholder="e.g. HQ" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 2: User Provisioning</h4>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Create the initial tenant admin user for this organisation.</p>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Admin Email</label>
                <input type="email" className="form-control" style={{ width: '100%' }} value={adminUser.email} onChange={e => setAdminUser({...adminUser, email: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>First Name</label>
                <input className="form-control" style={{ width: '100%' }} value={adminUser.firstName} onChange={e => setAdminUser({...adminUser, firstName: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Last Name</label>
                <input className="form-control" style={{ width: '100%' }} value={adminUser.lastName} onChange={e => setAdminUser({...adminUser, lastName: e.target.value})} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 3: Picklists & Product Dictionary</h4>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Standard picklists and baseline products will be seeded into the environment.</p>
              <div style={{ padding: 12, border: '1px solid #ccc', borderRadius: 6, background: '#f9f9f9' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" defaultChecked /> Seed Baseline Picklists
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 8 }}>
                  <input type="checkbox" defaultChecked /> Setup Default Product Dictionary
                </label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 4: Workflow States & Transitions</h4>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Confirm the state machine setup for case processing.</p>
              <div style={{ padding: 12, border: '1px solid #ccc', borderRadius: 6, background: '#f9f9f9' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" defaultChecked /> Enable Default State Transitions (Draft -{'>'} Review -{'>'} Approved -{'>'} Closed)
                </label>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 5: Form Rules & Field Setup</h4>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Configure mandatory, hidden, and standard fields.</p>
              <div style={{ padding: 12, border: '1px solid #ccc', borderRadius: 6, background: '#f9f9f9' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" defaultChecked /> Apply Baseline Validation Rules
                </label>
              </div>
            </div>
          )}

          {step === 6 && (
            <div>
              <h4 style={{ marginBottom: 16 }}>Step 6: Integration & Readiness Verification</h4>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Run an automated readiness check and finalize the setup.</p>
              <div style={{ padding: 16, border: '1px solid #28a745', borderRadius: 6, background: '#e9f7ef', color: '#155724' }}>
                <strong>Ready to Launch</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: 13 }}>All pre-requisites are configured. Clicking "Complete Setup & Launch" will save these settings and mark the org as ready.</p>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid #ddd' }}>
          <button className="btn btn-secondary" onClick={prevStep} disabled={step === 1 || loading}>Back</button>
          {step < 6 ? (
            <button className="btn btn-primary" onClick={nextStep}>Next</button>
          ) : (
            <button className="btn btn-primary" onClick={handleComplete} disabled={loading}>
              {loading ? 'Completing...' : 'Complete Setup & Launch'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
