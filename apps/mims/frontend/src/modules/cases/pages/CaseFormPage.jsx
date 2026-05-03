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
    dynFieldValues, setDynFieldValues, dynFieldSaving,
    saveInfo, scheduleAutoSave, reassignCase, saveDynFields,
    getFieldConfig, getPicklistOptions,
    headers,
  } = useCaseForm(id, token)

  const [activeTab,  setActiveTab]  = useState('info')
  const [tabCounts,  setTabCounts]  = useState({})

  useEffect(() => {
    const params        = new URLSearchParams(location.search || '')
    const targetSection = params.get('section')
    const valid = ['info', 'comments', 'contacts', 'correspondence', 'mi', 'ae', 'pc', 'dppr']
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
    { key: 'comments',       label: 'Chat / Notes',      badge: countFor('comments') },
    { key: 'contacts',       label: 'Contacts',          badge: countFor('contacts') },
    { key: 'correspondence', label: 'Correspondence',    badge: countFor('correspondence') },
    { key: 'mi',             label: 'MI Component',      badge: countFor('mi') },
    { key: 'ae',             label: 'AE Component',      badge: countFor('ae') },
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
          {savedMsg && <span className="cf-saved-msg">{savedMsg}</span>}
          <button className="cf-save-btn" onClick={() => saveInfo(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Save Case'}
          </button>
        </div>
      </div>

      <div className="cf-tabbar">
        {TABS.map(t => (
          <button key={t.key} className={`cf-tabbar-btn${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
            {t.badge != null && <span className="cf-tabbar-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="cf-tab-content">
        {activeTab === 'info' && (
          <CaseInfoTab
            infoForm={infoForm} setInfoForm={setInfoForm}
            statuses={statuses} users={users}
            reassignForm={reassignForm} setReassignForm={setReassignForm} reassignSaving={reassignSaving}
            dynFieldValues={dynFieldValues} setDynFieldValues={setDynFieldValues} dynFieldSaving={dynFieldSaving}
            formConfig={formConfig}
            scheduleAutoSave={scheduleAutoSave} reassignCase={reassignCase} saveDynFields={saveDynFields}
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
          />
        )}
        {activeTab === 'ae' && (
          <CaseAETab
            id={id} headers={headers} setSavedMsg={setSavedMsg}
            users={users} getFieldConfig={getFieldConfig} getPicklistOptions={getPicklistOptions}
            onCountChange={n => setTabCounts(p => ({ ...p, ae: n }))}
          />
        )}
        {activeTab === 'pc' && (
          <CasePCTab
            id={id} headers={headers} setSavedMsg={setSavedMsg}
            users={users} getPicklistOptions={getPicklistOptions}
            onCountChange={n => setTabCounts(p => ({ ...p, pc: n }))}
          />
        )}
        {activeTab === 'dppr' && (
          <CaseDPPRTab id={id} headers={headers} />
        )}
      </div>

    </div>
    </MIMSLayout>
  )
}
