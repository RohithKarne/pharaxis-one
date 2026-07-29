import { useState } from 'react'

// Three steps, capture only. The old "Case Meta" step was deleted (locked with
// Rohith 2026-07-28) because every field on it was system-assigned — status,
// owner, priority, intake channel and date received are set by the system or at
// triage, not typed during intake. Case Type moved to the New Case action; the
// workflow fields moved to the final step, where the work actually happens.
const WIZARD_STEPS = [
  { id: 1, label: 'Step 1: Reporter & Patient', icon: '👤' },
  { id: 2, label: 'Step 2: Product & Details', icon: '📦' },
  { id: 3, label: 'Step 3: Response & Workflow', icon: '✍️' },
]

const LAST_STEP = WIZARD_STEPS.length

export default function CaseFormWizard({
  activeStep,
  setActiveStep,
  caseType,
  caseNumber,
  saving,
  onSave,
  children
}) {
  const nextStep = () => setActiveStep(prev => Math.min(prev + 1, LAST_STEP))
  const prevStep = () => setActiveStep(prev => Math.max(prev - 1, 1))

  return (
    <div className="cf-wizard-container" style={{ marginBottom: 24 }}>
      {/* Sticky Stepper Bar */}
      <div style={{
        background: '#fff',
        border: '1px solid var(--border-color, #e5e7eb)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>{caseType === 'AE' ? '🚨' : caseType === 'PC' ? '📦' : '💬'}</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {caseNumber ? `Case ${caseNumber}` : 'New Case Intake'}
              </h2>
              {/* Case type and status deliberately not repeated here — the page
                  header carries the type badge and the header strip carries
                  status. Read-only facts appear once, in the strip. */}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {activeStep > 1 && (
              <button type="button" className="btn btn-outline" onClick={prevStep}>
                ← Back
              </button>
            )}
            {activeStep < LAST_STEP ? (
              <button type="button" className="btn btn-primary" onClick={nextStep}>
                Next Step →
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => onSave(false)} disabled={saving}>
                {saving ? 'Saving Case…' : '💾 Complete & Save Case'}
              </button>
            )}
          </div>
        </div>

        {/* Step Progress Tracker */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LAST_STEP}, 1fr)`, gap: 8 }}>
          {WIZARD_STEPS.map(step => {
            const isActive = activeStep === step.id
            const isCompleted = activeStep > step.id
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid',
                  borderColor: isActive ? 'var(--primary, #2563eb)' : isCompleted ? '#bbf7d0' : '#e5e7eb',
                  background: isActive ? '#eff6ff' : isCompleted ? '#f0fdf4' : '#f9fafb',
                  color: isActive ? '#1e40af' : isCompleted ? '#166534' : '#6b7280',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <span style={{ fontSize: 14 }}>{isCompleted ? '✓' : step.icon}</span>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {step.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Step Body View */}
      <div className="cf-wizard-step-body" style={{ minHeight: 380 }}>
        {children}
      </div>

      {/* Bottom Step Navigation Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={prevStep}
          disabled={activeStep === 1}
        >
          ← Previous Step
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
          Step {activeStep} of {LAST_STEP}
        </span>
        {activeStep < LAST_STEP ? (
          <button type="button" className="btn btn-primary" onClick={nextStep}>
            Next Step →
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => onSave(false)} disabled={saving}>
            {saving ? 'Saving Case…' : '💾 Complete & Save Case'}
          </button>
        )}
      </div>
    </div>
  )
}
