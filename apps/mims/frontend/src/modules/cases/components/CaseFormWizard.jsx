import { useState } from 'react'

// Three steps, capture only. The old "Case Meta" step was deleted (locked with
// Rohith 2026-07-28) because every field on it was system-assigned — status,
// owner, priority, intake channel and date received are set by the system or at
// triage, not typed during intake. Case Type moved to the New Case action; the
// workflow fields moved to the final step, where the work actually happens.
const WIZARD_STEPS = [
  { id: 1, label: 'Reporter & Patient' },
  { id: 2, label: 'Product & Details' },
  { id: 3, label: 'Response & Workflow' },
]

const LAST_STEP = WIZARD_STEPS.length

export default function CaseFormWizard({
  activeStep,
  setActiveStep,
  caseNumber,
  saving,
  onSave,
  doneSteps = {},
  children
}) {
  const nextStep = () => setActiveStep(prev => Math.min(prev + 1, LAST_STEP))
  const prevStep = () => setActiveStep(prev => Math.max(prev - 1, 1))

  return (
    <div className="cf-wizard-container" style={{ marginBottom: 24 }}>
      {/* Sticky Stepper Bar */}
      <div style={{
        background: 'var(--panel-head)',
        border: '1px solid var(--border)',
        padding: '6px 10px 0',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
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
                Back
              </button>
            )}
            {activeStep < LAST_STEP ? (
              <button type="button" className="btn btn-primary" onClick={nextStep}>
                Next Step
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => onSave(false)} disabled={saving}>
                {saving ? 'Saving Case…' : 'Complete & Save Case'}
              </button>
            )}
          </div>
        </div>

        {/* Step Progress Tracker */}
        {/* minmax(0, 1fr) + minWidth 0: the step labels shorten with an ellipsis on
            narrow panes instead of pushing the strip off to the right (M-78). */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LAST_STEP}, minmax(0, 1fr))`, gap: 2, marginBottom: -1 }}>
          {WIZARD_STEPS.map(step => {
            const isActive = activeStep === step.id
            // A tick means the step has what it needs, not that it was passed
            // (Step 1 showed a green tick with no reporter, M-23).
            const isCompleted = !isActive && Boolean(doneSteps[step.id])
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 0,
                  padding: '5px 10px',
                  border: '1px solid var(--border)',
                  borderBottom: isActive ? '1px solid #fff' : '1px solid var(--border)',
                  borderTop: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? '#fff' : '#eef1f4',
                  color: isActive ? '#000' : '#333',
                  fontWeight: isActive ? 700 : 400,
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ color: isCompleted ? 'var(--success)' : 'inherit' }}>{isCompleted ? '✓' : `${step.id}.`}</span>
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
          Previous Step
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
          Step {activeStep} of {LAST_STEP}
        </span>
        {activeStep < LAST_STEP ? (
          <button type="button" className="btn btn-primary" onClick={nextStep}>
            Next Step
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => onSave(false)} disabled={saving}>
            {saving ? 'Saving Case…' : 'Complete & Save Case'}
          </button>
        )}
      </div>
    </div>
  )
}
