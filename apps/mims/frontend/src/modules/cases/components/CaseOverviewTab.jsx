import { useEffect, useMemo, useState } from 'react'
import CaseInfoTab from './CaseInfoTab'
import CaseWorkflowPanel from './CaseWorkflowPanel'
import CaseRegulatoryWorkspace from './CaseRegulatoryWorkspace'
import { httpFetch } from '../../../shared/api/httpFetch.js'

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

export default function CaseOverviewTab({
  id,
  headers,
  caseData,
  users = [],
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

  return (
    <div className="cf-overview-layout">
      <div className="cf-overview-grid">
        <div className="cf-overview-main">
          <div className="cf-overview-card">
            <div className="cf-overview-kicker">Case Overview</div>
            <h3>Core Case Information</h3>
            <CaseInfoTab
              infoForm={infoForm}
              setInfoForm={setInfoForm}
              statuses={statuses}
              users={users}
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
          </div>
        </div>

        <div className="cf-overview-side">
          <div className="cf-overview-card">
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
          </div>

          <div className="cf-overview-card">
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
          </div>

          <div className="cf-overview-card">
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
        </div>
      </div>

      <CaseRegulatoryWorkspace key={routeRegulatoryPane || 'icsr'} id={id} headers={headers} setSavedMsg={setSavedMsg} routePane={routeRegulatoryPane} />
    </div>
  )
}
