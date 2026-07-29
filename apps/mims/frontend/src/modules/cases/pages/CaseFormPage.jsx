import { useMemo, useState, useEffect, lazy, Suspense } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../cases.css'
import useCaseForm from '../hooks/useCaseForm'
const CaseContactsTab = lazy(() => import('../components/CaseContactsTab'))
const CaseWorkflowStep = lazy(() => import('../components/CaseWorkflowStep'))
const CaseMITab = lazy(() => import('../components/CaseMITab'))
const CaseAETab = lazy(() => import('../components/CaseAETab'))
const CasePCTab = lazy(() => import('../components/CasePCTab'))
import CaseHeaderStrip     from '../components/CaseHeaderStrip'
import CaseFormWizard      from '../components/CaseFormWizard'
import { WiredTextarea }   from '../../../shared/components/WiredField'
import useCoreFields       from '../hooks/useCoreFields'
import CaseFormShell        from '../../../shared/components/CaseFormShell'
import useUnsavedChangesGuard from '../../../shared/hooks/useUnsavedChangesGuard'

const TYPE_COLOR = { MI: '#2563eb', AE: '#dc2626', PC: '#d97706' }

export default function CaseFormPage() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { token, user } = useAuth()

  const {
    caseData, loading, saving, savedMsg, setSavedMsg,
    statuses, users, formConfig,
    infoForm, setInfoForm,
    reassignForm, setReassignForm, reassignSaving,
    escalateForm, setEscalateForm, escalateSaving, escalateCase,
    dynFieldValues, setDynFieldValues, dynFieldSaving, dynFieldErrors,
    draftStatus,
    saveInfo, scheduleAutoSave, reassignCase, saveDynFields,
    getFieldConfig, getPicklistOptions,
    headers,
  } = useCaseForm(id, token)

  const routeTarget = useMemo(() => {
    const params = new URLSearchParams(location.search || '')
    const targetSection = params.get('section')
    // The wizard dropped from 4 steps to 3 when "Case Meta" was deleted. Existing
    // deep links — saved URLs and Email Case Import notifications — must still
    // land somewhere valid, so the retired sections remap rather than 404.
    //   overview/info → step 3 (the workflow fields moved there)
    //   icsr/dppr     → step 3 (regulatory panels left the form; DPPR is Admin now)
    const sectionMap = {
      overview: { step: 3, tab: 'workflow' },
      info: { step: 3, tab: 'workflow' },
      people: { step: 1, tab: 'people' },
      contacts: { step: 1, tab: 'people' },
      patient: { step: 1, tab: 'people' },
      reporter: { step: 1, tab: 'people' },
      mi: { step: 2, tab: 'mi' },
      ae: { step: 2, tab: 'ae' },
      pc: { step: 2, tab: 'pc' },
      communications: { step: 3, tab: 'workflow' },
      comments: { step: 3, tab: 'workflow', communicationsPane: 'threads' },
      correspondence: { step: 3, tab: 'workflow', communicationsPane: 'correspondence' },
      icsr: { step: 3, tab: 'workflow' },
      dppr: { step: 3, tab: 'workflow' },
    }
    return sectionMap[targetSection] || { step: 1, tab: 'people' }
  }, [location.search])

  const [activeStep, setActiveStep] = useState(routeTarget?.step || 1)

  useEffect(() => {
    if (routeTarget?.step) setActiveStep(routeTarget.step)
  }, [routeTarget?.step])
  const [tabCounts,  setTabCounts]  = useState({})

  // Core field presentation is backend-driven (field_setup → formConfig.core).
  const coreField = useCoreFields(formConfig)

  // B19 — unsaved-changes guard. `draftStatus` is set by useCaseForm whenever
  // there's an in-flight autosave; we treat that as the canonical "dirty" signal.
  const guard = useUnsavedChangesGuard()
  useEffect(() => { guard.setDirty(!!draftStatus && draftStatus !== 'Saved') },
    [draftStatus, guard])

  function handleBackNavigation() {
    const from = location.state?.from
    if (from && typeof from === 'string') { navigate(from); return }
    navigate('/cases')
  }

  if (loading) return <div className="cf-form-loading">Loading case…</div>
  if (!caseData) return <div className="cf-form-error">Case not found. <button onClick={handleBackNavigation}>Back</button></div>

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="no-scroll mims-ops-page-body" surfaceVariant="workspace" compact>
    <div className="cf-form-page">

      <div className="cf-form-header">
        <button className="cf-back-btn" onClick={handleBackNavigation}>← Back</button>
        <div className="cf-form-header-info">
          <span className="cf-form-case-num">
            {caseData.case_number || <span className="cf-draft-badge">DRAFT</span>}
          </span>
          {caseData.case_type && (
            <span className="cf-form-type-badge" style={{ background: TYPE_COLOR[caseData.case_type] }}>
              {caseData.case_type}
            </span>
          )}
          <span className="cf-form-org">{caseData.org_name}</span>
        </div>
        <div className="cf-form-header-right">
          {draftStatus && <span className="cf-draft-save-chip">{draftStatus}</span>}
          {savedMsg && <span className="cf-saved-msg">{savedMsg}</span>}
          {/* The type-specific action screen. Only offered once the case is
              actually saved — there is nothing to transmit or respond to
              before that. */}
          {caseData.case_number && ['AE', 'PC'].includes(caseData.case_type) && (
            <button
              type="button"
              className="cf-action-screen-btn"
              onClick={() => navigate(`/cases/${id}/transmission`)}
            >
              Transmission →
            </button>
          )}
          {caseData.case_number && caseData.case_type === 'MI' && (
            <button
              type="button"
              className="cf-action-screen-btn"
              onClick={() => navigate(`/cases/${id}/response`)}
            >
              Response →
            </button>
          )}
          <button className="cf-save-btn" onClick={() => saveInfo(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Save Case'}
          </button>
        </div>
      </div>

      {/* Read-only summary. Replaces the five panels that used to occupy the
          deleted "Case Meta" step — one line, no extra queries, visible on
          every step. */}
      <CaseHeaderStrip
        caseData={caseData}
        infoForm={infoForm}
        statuses={statuses}
        users={users}
        caseId={id}
        headers={headers}
      />

      {/* cf-form-main is the page's scroll container. This wrapper was left as
          cf-tabbar when the tab strip was replaced by the wizard — that class is
          the horizontal tab strip (flex row, flex-shrink:0, no vertical
          overflow), so anything below the fold was simply clipped and the case
          form could not be scrolled. */}
      <div className="cf-form-main">
      <CaseFormShell
        caseId={id}
        caseStatus={caseData?.status}
        caseType={caseData?.case_type}
        sections={[]}
        showHeader={false}
        requiredFields={[]}
        payload={infoForm || {}}
        dueAt={caseData?.due_at || null}
        dueLabel="Action required"
        transitions={[]}
        onTransition={() => { /* Wired by future workflow engine */ }}
        onCloned={(newId) => navigate(`/cases/${newId}`)}
      >
      <Suspense fallback={<div className="cf-tab-loading">Loading wizard step…</div>}>
        <CaseFormWizard
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          caseType={caseData?.case_type}
          caseNumber={caseData?.case_number}
          saving={saving}
          onSave={saveInfo}
        >
          {activeStep === 1 && (
            <CaseContactsTab
              id={id} headers={headers}
              formConfig={formConfig}
              getFieldConfig={getFieldConfig}
              getPicklistOptions={getPicklistOptions}
              onCountChange={n => setTabCounts(p => ({ ...p, contacts: n }))}
            />
          )}

          {activeStep === 2 && (
            <>
              {/* Description moved off the deleted Case Meta step — it describes
                  the case detail, so it sits with the detail. Label and
                  visibility come from field_setup, not from here. */}
              {!coreField('description', 'Description').hidden && (
                <WiredTextarea
                  label={coreField('description', 'Description').label}
                  section="case_meta" field="description" rows={4}
                  value={infoForm.description}
                  placeholder="Case description…"
                  onChange={v => { setInfoForm(p => ({ ...p, description: v })); scheduleAutoSave() }} />
              )}
              {caseData?.case_type === 'MI' && (
                <CaseMITab
                  view="capture"
                  id={id} token={token} headers={headers} setSavedMsg={setSavedMsg}
                  onCountChange={n => setTabCounts(p => ({ ...p, mi: n }))}
                  formConfig={formConfig}
                  getPicklistOptions={getPicklistOptions}
                  dynFieldValues={dynFieldValues} setDynFieldValues={setDynFieldValues}
                  dynFieldSaving={dynFieldSaving} dynFieldErrors={dynFieldErrors}
                  saveDynFields={saveDynFields}
                  caseType={caseData?.case_type}
                />
              )}
              {caseData?.case_type === 'AE' && (
                <CaseAETab
                  id={id} headers={headers} setSavedMsg={setSavedMsg}
                  users={users} getFieldConfig={getFieldConfig} getPicklistOptions={getPicklistOptions}
                  onCountChange={n => setTabCounts(p => ({ ...p, ae: n }))}
                  formConfig={formConfig}
                  dynFieldValues={dynFieldValues} setDynFieldValues={setDynFieldValues}
                  dynFieldSaving={dynFieldSaving} dynFieldErrors={dynFieldErrors}
                  saveDynFields={saveDynFields}
                  caseType={caseData?.case_type}
                />
              )}
              {caseData?.case_type === 'PC' && (
                <CasePCTab
                  id={id} headers={headers} setSavedMsg={setSavedMsg}
                  users={users} getFieldConfig={getFieldConfig} getPicklistOptions={getPicklistOptions}
                  onCountChange={n => setTabCounts(p => ({ ...p, pc: n }))}
                  formConfig={formConfig}
                  dynFieldValues={dynFieldValues} setDynFieldValues={setDynFieldValues}
                  dynFieldSaving={dynFieldSaving} dynFieldErrors={dynFieldErrors}
                  saveDynFields={saveDynFields}
                  caseType={caseData?.case_type}
                />
              )}
            </>
          )}

          {activeStep === 3 && (
            <CaseWorkflowStep
              key={routeTarget?.communicationsPane || 'workflow'}
              id={id}
              headers={headers}
              token={token}
              currentUserId={user?.id || user?.userId || null}
              setSavedMsg={setSavedMsg}
              infoForm={infoForm}
              setInfoForm={setInfoForm}
              statuses={statuses}
              users={users}
              getPicklistOptions={getPicklistOptions}
              scheduleAutoSave={scheduleAutoSave}
              reassignForm={reassignForm}
              setReassignForm={setReassignForm}
              reassignSaving={reassignSaving}
              reassignCase={reassignCase}
              escalateForm={escalateForm}
              setEscalateForm={setEscalateForm}
              escalateSaving={escalateSaving}
              escalateCase={escalateCase}
              dynFieldValues={dynFieldValues}
              setDynFieldValues={setDynFieldValues}
              dynFieldSaving={dynFieldSaving}
              dynFieldErrors={dynFieldErrors}
              formConfig={formConfig}
              saveDynFields={saveDynFields}
              caseType={caseData?.case_type}
              routePane={routeTarget?.communicationsPane || ''}
              onCommentCount={n => setTabCounts(p => ({ ...p, comments: n }))}
              onCorrespondenceCount={n => setTabCounts(p => ({ ...p, correspondence: n }))}
            />
          )}
        </CaseFormWizard>
      </Suspense>
      </CaseFormShell>

      {/* PARK: AI Assistant panel removed from the case form — the AI suite ships as a
          deterministic-local mock (canned output). Re-surface once a real provider is standard. */}
      </div>
    </div>
    </MIMSLayout>
  )
}
