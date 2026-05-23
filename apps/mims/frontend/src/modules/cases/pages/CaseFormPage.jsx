import { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../cases.css'
import useCaseForm from '../hooks/useCaseForm'
import CaseContactsTab      from '../components/CaseContactsTab'
import CaseOverviewTab      from '../components/CaseOverviewTab'
import CaseCommunicationsWorkspace from '../components/CaseCommunicationsWorkspace'
import CaseMITab            from '../components/CaseMITab'
import CaseAETab            from '../components/CaseAETab'
import CasePCTab            from '../components/CasePCTab'
import AiAssistantPanel     from '../components/AiAssistantPanel'
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
    const sectionMap = {
      overview: { tab: 'overview' },
      info: { tab: 'overview' },
      people: { tab: 'people' },
      contacts: { tab: 'people' },
      communications: { tab: 'communications' },
      comments: { tab: 'communications', communicationsPane: 'threads' },
      correspondence: { tab: 'communications', communicationsPane: 'correspondence' },
      mi: { tab: 'mi' },
      ae: { tab: 'ae' },
      pc: { tab: 'pc' },
      icsr: { tab: 'overview', regulatoryPane: 'icsr' },
      dppr: { tab: 'overview', regulatoryPane: 'privacy' },
    }
    return sectionMap[targetSection] || null
  }, [location.search])
  const [activeTab,  setActiveTab]  = useState(routeTarget?.tab || 'overview')
  const [tabCounts,  setTabCounts]  = useState({})
  const currentTab = routeTarget?.tab || activeTab

  // B19 — unsaved-changes guard. `draftStatus` is set by useCaseForm whenever
  // there's an in-flight autosave; we treat that as the canonical "dirty" signal.
  const guard = useUnsavedChangesGuard()
  useEffect(() => { guard.setDirty(!!draftStatus && draftStatus !== 'Saved') },
    [draftStatus, guard])

  function syncTabInUrl(next) {
    const params = new URLSearchParams(location.search || '')
    params.set('section', next)
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : '',
      },
      { replace: true, state: location.state }
    )
  }

  function safeSetActiveTab(next) {
    if (guard.isDirty.current &&
        !window.confirm('You have unsaved changes. Switch tabs and lose them?')) return
    setActiveTab(next)
    syncTabInUrl(next)
  }

  function handleBackNavigation() {
    const from = location.state?.from
    if (from && typeof from === 'string') { navigate(from); return }
    navigate('/cases')
  }

  function countFor(key) { return tabCounts[key] > 0 ? tabCounts[key] : null }

  if (loading) return <div className="cf-form-loading">Loading case…</div>
  if (!caseData) return <div className="cf-form-error">Case not found. <button onClick={handleBackNavigation}>Back</button></div>

  const TABS = [
    { key: 'overview',       label: 'Overview' },
    { key: 'people',         label: 'People',           badge: countFor('contacts') },
    { key: 'communications', label: 'Communications',   badge: countFor('correspondence') || countFor('comments') },
    { key: 'mi',             label: 'MI Workspace',     badge: countFor('mi') },
    { key: 'ae',             label: 'AE Workspace',     badge: countFor('ae') },
    { key: 'pc',             label: 'PC Workspace',     badge: countFor('pc') },
  ]

  return (
    <MIMSLayout bodyClassName="no-scroll">
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
          <button className="cf-save-btn" onClick={() => saveInfo(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Save Case'}
          </button>
        </div>
      </div>

      <div className="cf-tabbar">
        {TABS.map(t => (
          <button key={t.key} className={`cf-tabbar-btn${currentTab === t.key ? ' active' : ''}`} onClick={() => safeSetActiveTab(t.key)}>
            {t.label}
            {t.badge != null && <span className="cf-tabbar-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      <CaseFormShell
        caseId={id}
        caseStatus={caseData?.status}
        caseType={caseData?.case_type}
        sections={TABS.map(t => ({ id: `tab-${t.key}`, label: t.label, count: t.badge, complete: t.badge }))}
        requiredFields={[]}
        payload={infoForm || {}}
        dueAt={caseData?.due_at || null}
        dueLabel="Action required"
        transitions={[]}
        onTransition={() => { /* Wired by future workflow engine */ }}
        onCloned={(newId) => navigate(`/cases/${newId}`)}
        onValidityNavigate={(key) => {
          if (key === 'reporter' || key === 'patient') safeSetActiveTab('people')
          else if (key === 'product' || key === 'event') safeSetActiveTab('ae')
        }}
      >
      <div className="cf-tab-content">
        {currentTab === 'overview' && (
          <CaseOverviewTab
            key={routeTarget?.regulatoryPane || 'overview'}
            id={id}
            headers={headers}
            caseData={caseData}
            users={users}
            statuses={statuses}
            infoForm={infoForm}
            setInfoForm={setInfoForm}
            formConfig={formConfig}
            dynFieldValues={dynFieldValues}
            setDynFieldValues={setDynFieldValues}
            dynFieldSaving={dynFieldSaving}
            dynFieldErrors={dynFieldErrors}
            scheduleAutoSave={scheduleAutoSave}
            saveDynFields={saveDynFields}
            caseType={caseData?.case_type}
            reassignForm={reassignForm}
            setReassignForm={setReassignForm}
            reassignSaving={reassignSaving}
            reassignCase={reassignCase}
            escalateForm={escalateForm}
            setEscalateForm={setEscalateForm}
            escalateSaving={escalateSaving}
            escalateCase={escalateCase}
            setSavedMsg={setSavedMsg}
            onNavigateToTab={safeSetActiveTab}
            routeRegulatoryPane={routeTarget?.regulatoryPane || ''}
          />
        )}
        {currentTab === 'people' && (
          <CaseContactsTab
            id={id} headers={headers}
            onCountChange={n => setTabCounts(p => ({ ...p, contacts: n }))}
          />
        )}
        {currentTab === 'communications' && (
          <CaseCommunicationsWorkspace
            key={routeTarget?.communicationsPane || 'communications'}
            id={id}
            headers={headers}
            token={token}
            currentUserId={user?.id || user?.userId || null}
            setSavedMsg={setSavedMsg}
            routePane={routeTarget?.communicationsPane || ''}
            onCommentCount={n => setTabCounts(p => ({ ...p, comments: n }))}
            onCorrespondenceCount={n => setTabCounts(p => ({ ...p, correspondence: n }))}
          />
        )}
        {currentTab === 'mi' && (
          <CaseMITab
            id={id} token={token} headers={headers} setSavedMsg={setSavedMsg}
            onCountChange={n => setTabCounts(p => ({ ...p, mi: n }))}
            formConfig={formConfig}
            dynFieldValues={dynFieldValues} setDynFieldValues={setDynFieldValues}
            dynFieldSaving={dynFieldSaving} dynFieldErrors={dynFieldErrors}
            saveDynFields={saveDynFields}
            caseType={caseData?.case_type}
          />
        )}
        {currentTab === 'ae' && (
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
        {currentTab === 'pc' && (
          <CasePCTab
            id={id} headers={headers} setSavedMsg={setSavedMsg}
            users={users} getPicklistOptions={getPicklistOptions}
            onCountChange={n => setTabCounts(p => ({ ...p, pc: n }))}
            formConfig={formConfig}
            dynFieldValues={dynFieldValues} setDynFieldValues={setDynFieldValues}
            dynFieldSaving={dynFieldSaving} dynFieldErrors={dynFieldErrors}
            saveDynFields={saveDynFields}
            caseType={caseData?.case_type}
          />
        )}
      </div>
      </CaseFormShell>

      <AiAssistantPanel caseId={id} headers={headers} activeTab={currentTab} />

    </div>
    </MIMSLayout>
  )
}
