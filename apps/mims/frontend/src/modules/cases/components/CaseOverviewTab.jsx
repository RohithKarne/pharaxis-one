import { useEffect, useMemo, useState } from 'react'
import CaseInfoTab from './CaseInfoTab'
import CaseWorkflowPanel from './CaseWorkflowPanel'
import CaseRegulatoryWorkspace from './CaseRegulatoryWorkspace'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import StickySectionNav from '../../../shared/components/StickySectionNav'
import { useAuth } from '../../../shared/context/AuthContext'

function formatDateTime(value) {
  if (!value) return 'Not available'
  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleString()
}

function formatDateOnly(value) {
  if (!value) return 'Not set'
  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleDateString()
}

function isFilled(value) {
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')
}

function summarizeFields(values) {
  return {
    count: values.length,
    complete: values.reduce((total, value) => total + (isFilled(value) ? 1 : 0), 0),
  }
}

export default function CaseOverviewTab({
  id,
  headers,
  caseData,
  users = [],
  getPicklistOptions,
  infoForm,
  setInfoForm,
  statuses,
  formConfig,
  dynFieldValues,
  setDynFieldValues,
  dynFieldSaving,
  dynFieldErrors,
  scheduleAutoSave,
  saveDynFields,
  caseType,
  reassignForm,
  setReassignForm,
  reassignSaving,
  reassignCase,
  escalateForm,
  setEscalateForm,
  escalateSaving,
  escalateCase,
  setSavedMsg,
  onNavigateToTab,
  routeRegulatoryPane = '',
}) {
  const { hasCapability } = useAuth()
  const [contacts, setContacts] = useState([])
  const [correspondence, setCorrespondence] = useState([])
  const [timeline, setTimeline] = useState([])
  const authHeader = headers?.Authorization || ''
  const contentType = headers?.['Content-Type'] || ''
  const requestHeaders = useMemo(() => ({
    ...(authHeader ? { Authorization: authHeader } : {}),
    ...(contentType ? { 'Content-Type': contentType } : {}),
  }), [authHeader, contentType])

  useEffect(() => {
    let cancelled = false

    async function loadOverviewData() {
      try {
        const [contactsRes, corrRes, timelineRes] = await Promise.all([
          httpFetch(`/api/cases/${id}/contacts`, { headers: requestHeaders }),
          httpFetch(`/api/inbox/case/${id}/correspondence`, { headers: requestHeaders }),
          httpFetch(`/api/cases/${id}/timeline?limit=5`, { headers: requestHeaders }),
        ])

        const [contactsData, corrData, timelineData] = await Promise.all([
          contactsRes.json().catch(() => []),
          corrRes.json().catch(() => ({ items: [] })),
          timelineRes.json().catch(() => ({ events: [] })),
        ])

        if (cancelled) return
        setContacts(Array.isArray(contactsData) ? contactsData : [])
        setCorrespondence(Array.isArray(corrData.items) ? corrData.items : [])
        setTimeline(Array.isArray(timelineData.events) ? timelineData.events : [])
      } catch {
        if (cancelled) return
        setContacts([])
        setCorrespondence([])
        setTimeline([])
      }
    }

    loadOverviewData()
    return () => { cancelled = true }
  }, [id, requestHeaders])

  const ownerName = useMemo(() => {
    const ownerId = Number(infoForm.case_owner_id || caseData?.case_owner_id || 0)
    return users.find(user => Number(user.id) === ownerId)?.name || caseData?.case_owner_name || 'Unassigned'
  }, [caseData?.case_owner_id, caseData?.case_owner_name, infoForm.case_owner_id, users])

  const reporter = contacts.find(contact => contact.contact_role === 'reporter') || contacts.find(contact => contact.contact_type === 'Reporter')
  const patient = contacts.find(contact => contact.contact_role === 'patient') || contacts.find(contact => contact.contact_type === 'Patient')
  const otherContacts = contacts.filter(contact => !['reporter', 'patient'].includes(String(contact.contact_role || '').toLowerCase()))
  const inboundCount = correspondence.filter(item => {
    const source = String(item?.source_tag || '').toLowerCase()
    return !(source.includes('reply') || source.includes('forward') || source.includes('sent') || source.includes('transmission'))
  }).length
  const outboundCount = correspondence.length - inboundCount
  const overviewSections = useMemo(() => {
    const lcCaseType = String(caseType || '').toLowerCase()
    const dynamicInfoFields = (formConfig?.sections || [])
      .flatMap(section => (section?.fields || []).filter(field => {
        const scope = String(field.case_type_scope || 'shared').toLowerCase()
        const tab = field.display_tab || null
        if (section?.is_visible === 0) return false
        if (lcCaseType && scope !== 'shared' && scope !== lcCaseType) return false
        return tab === null || tab === 'info'
      }))
    const requiredDynamicInfoFields = dynamicInfoFields.filter(field => field.is_required)
    // Case-info base fields are not modeled in the dynamic form config, so their completion falls back to the fields the panel renders.
    const infoSummary = summarizeFields([
      infoForm.status_id,
      infoForm.case_owner_id,
      infoForm.priority,
      infoForm.intake_channel,
      infoForm.date_received,
      infoForm.awareness_date,
      infoForm.learn_of_validity_date,
      infoForm.follow_up_received_date,
      infoForm.description,
      infoForm.internal_notes,
      ...(requiredDynamicInfoFields.length > 0 ? requiredDynamicInfoFields : dynamicInfoFields).map(field => dynFieldValues?.[field.id]),
    ])
    const snapshotSummary = summarizeFields([
      infoForm.status_id || caseData?.status_id || caseData?.status,
      infoForm.case_owner_id || caseData?.case_owner_id,
      infoForm.priority,
      caseData?.due_at,
    ])
    const peopleSummary = summarizeFields([
      reporter ? `${reporter.first_name || ''}${reporter.last_name || ''}${reporter.email || ''}` : '',
      patient ? `${patient.first_name || ''}${patient.last_name || ''}${patient.email || ''}` : '',
    ])
    const communicationsSummary = summarizeFields([
      correspondence.length > 0 ? correspondence.length : '',
      inboundCount > 0 ? inboundCount : '',
      timeline.length > 0 ? timeline.length : '',
    ])
    const workflowFields = [
      ...(hasCapability('case.assign') ? [reassignForm?.new_owner_id, reassignForm?.reason] : []),
      ...(hasCapability('case.escalate') && escalateCase ? [escalateForm?.reason] : []),
    ]
    const workflowSummary = workflowFields.length > 0 ? summarizeFields(workflowFields) : null
    const regulatorySummary = summarizeFields([
      infoForm.awareness_date,
      infoForm.learn_of_validity_date,
      infoForm.follow_up_received_date,
    ])
    return [
      { id: 'ov-case-info', label: 'Case Information', ...infoSummary },
      { id: 'ov-snapshot', label: 'Case Snapshot', ...snapshotSummary },
      { id: 'ov-people', label: 'People Snapshot', ...peopleSummary },
      { id: 'ov-communications', label: 'Latest Activity', ...communicationsSummary },
      { id: 'ov-workflow', label: 'Workflow Actions', count: workflowSummary?.count, complete: workflowSummary?.complete },
      { id: 'ov-regulatory', label: 'Regulatory And Compliance', ...regulatorySummary },
    ]
  }, [
    caseData?.case_owner_id,
    caseData?.due_at,
    caseData?.status,
    caseData?.status_id,
    caseType,
    correspondence.length,
    dynFieldValues,
    escalateCase,
    escalateForm?.reason,
    formConfig,
    hasCapability,
    inboundCount,
    infoForm,
    patient,
    reassignForm?.new_owner_id,
    reassignForm?.reason,
    reporter,
    timeline.length,
  ])

  return (
    <div className="cf-case-workspace cf-overview-workspace">
      <StickySectionNav sections={overviewSections} />
      <div className="cf-case-workspace-main">
        <div className="cf-overview-layout">
          <section id="ov-case-info" className="cf-overview-card">
            <div className="cf-overview-kicker">Case Overview</div>
            <h3>Core Case Information</h3>
            <CaseInfoTab
              infoForm={infoForm}
              setInfoForm={setInfoForm}
              statuses={statuses}
              users={users}
              getPicklistOptions={getPicklistOptions}
              reassignForm={reassignForm}
              setReassignForm={setReassignForm}
              reassignSaving={reassignSaving}
              escalateForm={escalateForm}
              setEscalateForm={setEscalateForm}
              escalateSaving={escalateSaving}
              escalateCase={escalateCase}
              dynFieldValues={dynFieldValues}
              setDynFieldValues={setDynFieldValues}
              dynFieldSaving={dynFieldSaving}
              dynFieldErrors={dynFieldErrors}
              formConfig={formConfig}
              scheduleAutoSave={scheduleAutoSave}
              reassignCase={reassignCase}
              saveDynFields={saveDynFields}
              caseType={caseType}
              showWorkflowActions={false}
              embedded
            />
          </section>

          <section id="ov-snapshot" className="cf-overview-card">
            <div className="cf-overview-kicker">Snapshot</div>
            <h3>Case Status At A Glance</h3>
            <div className="cf-overview-stat-grid">
              <div className="cf-overview-stat">
                <span>Status</span>
                <strong>{caseData?.status || 'No status'}</strong>
              </div>
              <div className="cf-overview-stat">
                <span>Owner</span>
                <strong>{ownerName}</strong>
              </div>
              <div className="cf-overview-stat">
                <span>Priority</span>
                <strong>{infoForm.priority || 'Normal'}</strong>
              </div>
              <div className="cf-overview-stat">
                <span>Due Date</span>
                <strong>{formatDateOnly(caseData?.due_at)}</strong>
              </div>
            </div>
          </section>

          <section id="ov-people" className="cf-overview-card">
            <div className="cf-overview-kicker">People</div>
            <h3>Reporter And Patient Snapshot</h3>
            <div className="cf-overview-list">
              <div className="cf-overview-list-row">
                <span>Reporter</span>
                <strong>{reporter ? `${reporter.first_name || ''} ${reporter.last_name || ''}`.trim() : 'Not captured'}</strong>
              </div>
              <div className="cf-overview-list-row">
                <span>Patient</span>
                <strong>{patient ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim() : 'Not captured'}</strong>
              </div>
              <div className="cf-overview-list-row">
                <span>Other Contacts</span>
                <strong>{otherContacts.length}</strong>
              </div>
            </div>
            <div className="cf-overview-actions">
              <button type="button" className="cf-open-btn" onClick={() => onNavigateToTab?.('people')}>Open People Workspace</button>
            </div>
          </section>

          <section id="ov-communications" className="cf-overview-card">
            <div className="cf-overview-kicker">Communications</div>
            <h3>Latest Activity</h3>
            <div className="cf-overview-list">
              <div className="cf-overview-list-row">
                <span>Inbound Items</span>
                <strong>{inboundCount}</strong>
              </div>
              <div className="cf-overview-list-row">
                <span>Outbound Items</span>
                <strong>{outboundCount}</strong>
              </div>
            </div>
            <div className="cf-overview-timeline">
              {timeline.length === 0 && <div className="cf-empty-msg">No recent activity yet.</div>}
              {timeline.map((event, index) => (
                <div key={`${event.type}-${event.ts}-${index}`} className="cf-overview-timeline-item">
                  <strong>{event.title}</strong>
                  <span>{formatDateTime(event.ts)}</span>
                </div>
              ))}
            </div>
            <div className="cf-overview-actions">
              <button type="button" className="cf-open-btn" onClick={() => onNavigateToTab?.('communications')}>Open Communications Workspace</button>
            </div>
          </section>

          <section id="ov-workflow">
            <div className="cf-overview-card" style={{ marginBottom: 18 }}>
              <div className="cf-overview-kicker">Workflow</div>
              <h3>Workflow Actions</h3>
            </div>
            <CaseWorkflowPanel
              caseType={caseType}
              users={users}
              reassignForm={reassignForm}
              setReassignForm={setReassignForm}
              reassignSaving={reassignSaving}
              reassignCase={reassignCase}
              escalateForm={escalateForm}
              setEscalateForm={setEscalateForm}
              escalateSaving={escalateSaving}
              escalateCase={escalateCase}
              onNavigateToTab={onNavigateToTab}
            />
          </section>
          <section id="ov-regulatory">
            <CaseRegulatoryWorkspace key={routeRegulatoryPane || 'icsr'} id={id} headers={headers} setSavedMsg={setSavedMsg} routePane={routeRegulatoryPane} />
          </section>
        </div>

      </div>
    </div>
  )
}
