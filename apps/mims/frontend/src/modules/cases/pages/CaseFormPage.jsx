import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../cases.css'
import useCaseForm from '../hooks/useCaseForm'
import CaseInfoTab          from '../components/CaseInfoTab'
import CaseCommentsTab      from '../components/CaseCommentsTab'
import CaseContactsTab      from '../components/CaseContactsTab'
import CaseCorrespondenceTab from '../components/CaseCorrespondenceTab'
import CaseMITab            from '../components/CaseMITab'
import CaseAETab            from '../components/CaseAETab'
import CasePCTab            from '../components/CasePCTab'
import CaseDPPRTab          from '../components/CaseDPPRTab'
import CaseICSRTab          from '../components/CaseICSRTab'
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
    dynFieldValues, setDynFieldValues, dynFieldSaving, dynFieldErrors,
    draftStatus,
    saveInfo, scheduleAutoSave, reassignCase, saveDynFields,
    getFieldConfig, getPicklistOptions,
    headers,
  } = useCaseForm(id, token)

  const [activeTab,  setActiveTab]  = useState('info')
  const [tabCounts,  setTabCounts]  = useState({})

  // B19 — unsaved-changes guard. `draftStatus` is set by useCaseForm whenever
  // there's an in-flight autosave; we treat that as the canonical "dirty" signal.
  const guard = useUnsavedChangesGuard()
  useEffect(() => { guard.setDirty(!!draftStatus && draftStatus !== 'Saved') },
    [draftStatus, guard])

  function safeSetActiveTab(next) {
    if (guard.isDirty.current &&
        !window.confirm('You have unsaved changes. Switch tabs and lose them?')) return
    setActiveTab(next)
  }

  useEffect(() => {
    const params        = new URLSearchParams(location.search || '')
    const targetSection = params.get('section')
    const valid = ['info', 'comments', 'contacts', 'correspondence', 'mi', 'ae', 'pc', 'dppr', 'icsr']
    if (targetSection && valid.includes(targetSection)) setActiveTab(targetSection)
  }, [location.search])

  function handleBackNavigation() {
    const from = location.state?.from
    if (from && typeof from === 'string') { navigate(from); return }
    navigate('/cases')
  }

  function countFor(key) { return tabCounts[key] > 0 ? tabCounts[key] : null }

  if (loading) return <div className="cf-form-loading">Loading case…</div>
  if (!caseData) return <div className="cf-form-error">Case not found. <button onClick={handleBackNavigation}>Back</button></div>

  const TABS = [
    { key: 'info',           label: 'Case Information' },
    { key: 'comments',       label: 'Comments / Notes',  badge: countFor('comments') },
    { key: 'contacts',       label: 'Contacts',          badge: countFor('contacts') },
    { key: 'correspondence', label: 'Correspondence',    badge: countFor('correspondence') },
    { key: 'mi',             label: 'MI Component',      badge: countFor('mi') },
    { key: 'ae',             label: 'AE Component',      badge: countFor('ae') },
    { key: 'icsr',           label: 'ICSR / Regulatory', badge: countFor('icsr') },
    { key: 'pc',             label: 'PC Component',      badge: countFor('pc') },
    { key: 'dppr',           label: 'Privacy (DPPR)',    badge: countFor('dppr') },
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
          <span className="cf-form-sep">›</span>
          <span className="cf-form-site">{caseData.site_name}</span>
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
          <button key={t.key} className={`cf-tabbar-btn${activeTab === t.key ? ' active' : ''}`} onClick={() => safeSetActiveTab(t.key)}>
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
        onCloned={(newId) => navigate(`/case/${newId}`)}
        onValidityNavigate={(key) => {
          if (key === 'reporter' || key === 'patient') safeSetActiveTab('contacts')
          else if (key === 'product' || key === 'event') safeSetActiveTab('ae')
        }}
      >
      <div className="cf-tab-content">
        {activeTab === 'info' && (
          <CaseInfoTab
            infoForm={infoForm} setInfoForm={setInfoForm}
            statuses={statuses} users={users}
            reassignForm={reassignForm} setReassignForm={setReassignForm} reassignSaving={reassignSaving}
            dynFieldValues={dynFieldValues} setDynFieldValues={setDynFieldValues} dynFieldSaving={dynFieldSaving}
            dynFieldErrors={dynFieldErrors}
            formConfig={formConfig}
            scheduleAutoSave={scheduleAutoSave} reassignCase={reassignCase} saveDynFields={saveDynFields}
            caseType={caseData?.case_type}
          />
        )}
        {activeTab === 'comments' && (
          <CaseCommentsTab
            id={id} headers={headers} token={token} currentUserId={user?.id || user?.userId || null}
            onCountChange={n => setTabCounts(p => ({ ...p, comments: n }))}
          />
        )}
        {activeTab === 'contacts' && (
          <CaseContactsTab
            id={id} headers={headers}
            onCountChange={n => setTabCounts(p => ({ ...p, contacts: n }))}
          />
        )}
        {activeTab === 'correspondence' && (
          <CaseCorrespondenceTab
            id={id} headers={headers} setSavedMsg={setSavedMsg}
            onCountChange={n => setTabCounts(p => ({ ...p, correspondence: n }))}
          />
        )}
        {activeTab === 'mi' && (
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
        {activeTab === 'ae' && (
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
        {activeTab === 'icsr' && (
          <CaseICSRTab id={id} headers={headers} setSavedMsg={setSavedMsg} />
        )}
        {activeTab === 'pc' && (
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
        {activeTab === 'dppr' && (
          <CaseDPPRTab id={id} headers={headers} />
        )}
      </div>
      </CaseFormShell>

      <AiAssistantPanel caseId={id} headers={headers} />

    </div>
    </MIMSLayout>
  )
}
