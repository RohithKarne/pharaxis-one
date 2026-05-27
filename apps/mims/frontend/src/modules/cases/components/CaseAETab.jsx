import { useEffect, useMemo, useState } from 'react'
import toast from '../../../shared/utils/toast'
import AETabPanel from './AETabPanel'
import StickySectionNav from '../../../shared/components/StickySectionNav'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import DynamicFieldsSection from './DynamicFieldsSection'
import { useCaseFieldContext } from '../../../shared/components/WiredField'

const API = import.meta.env.VITE_API_URL || '/api'

const AE_TABS = [
  { key: 'general',         label: 'General' },
  { key: 'events',          label: 'Events' },
  { key: 'drugs',           label: 'Drugs' },
  { key: 'meddra-coding',   label: 'Reactions Coding' },
  { key: 'causality',       label: 'Causality' },
  { key: 'patient-info',    label: 'AE Patient Info' },
  { key: 'lab-results',     label: 'Lab Results' },
  { key: 'lab-notes',       label: 'Lab Notes' },
  { key: 'medical-history', label: 'Medical History' },
  { key: 'medical-notes',   label: 'Medical Notes' },
  { key: 'product-info',    label: 'Product Info' },
]

const AE_COMPLETION_DEFS = {
  general: {
    type: 'flat',
    sectionName: 'AE — General',
    fields: [
      { label: 'AE Status', key: 'ae_status' },
      { label: 'Date of Awareness', key: 'date_of_awareness' },
      { label: 'Report Type', key: 'report_type' },
      { label: 'Regulatory Reportability', key: 'regulatory_reportability' },
      { label: 'Date of Onset', key: 'date_of_onset' },
      { label: 'Date of Report', key: 'date_of_report' },
      { label: 'Reporter Awareness Date', key: 'reporter_awareness_date' },
      { label: 'Additional Info', read: data => data?.general__additional_info ?? data?.additional_info ?? '' },
    ],
  },
  events: {
    type: 'rows',
    sectionName: 'AE — Events & Seriousness',
    fields: [
      { label: 'Event Description', key: 'event_description' },
      { label: 'MedDRA Term', key: 'meddra_term' },
      { label: 'Outcome', key: 'outcome' },
      { label: 'Reported Causality', key: 'reported_causality' },
      { label: 'Frequency', key: 'frequency' },
      { label: 'Causality Assessment', key: 'causality_assessment' },
      { label: 'Start Date', key: 'start_date' },
      { label: 'End Date', key: 'end_date' },
      { label: 'Serious', key: 'is_serious' },
      { label: 'Death', key: 'is_death' },
      { label: 'Life Threatening', key: 'is_life_threatening' },
      { label: 'Hospitalization', key: 'is_hospitalization' },
      { label: 'Disability', key: 'is_disability' },
      { label: 'Congenital Anomaly', key: 'is_congenital_anomaly' },
      { label: 'Other Medically Important', key: 'is_other_medically_important' },
      { label: 'Required Intervention', key: 'is_required_intervention' },
      { label: 'Lab Abnormality', key: 'is_lab_abnormality' },
    ],
  },
  'patient-info': {
    type: 'flat',
    sectionName: 'AE — Patient Information',
    fields: [
      { label: 'Patient Initials', key: 'patient_initials' },
      { label: 'Date of Birth', key: 'date_of_birth' },
      { label: 'Age', key: 'age' },
      { label: 'Age Unit', key: 'age_unit' },
      { label: 'Gender', key: 'sex' },
      { label: 'Weight (kg)', key: 'weight_kg' },
      { label: 'Height (cm)', key: 'height_cm' },
      { label: 'Ethnicity', key: 'ethnicity' },
      { label: 'Last Menstrual Date', key: 'last_menstrual_date' },
      { label: 'Pregnant', key: 'pregnant' },
      { label: 'Patient Country', key: 'patient_country' },
      { label: 'Additional Info', read: data => data?.['patient-info__additional_info'] ?? data?.additional_info ?? '' },
    ],
  },
  'lab-results': {
    type: 'rows',
    sectionName: 'AE — Lab Results',
    fields: [
      { label: 'Lab Name', key: 'lab_name' },
      { label: 'Test Name', key: 'test_name' },
      { label: 'Result Value', key: 'result' },
      { label: 'Unit', key: 'unit' },
      { label: 'Normal Range', key: 'normal_range' },
      { label: 'Test Date', key: 'test_date' },
    ],
  },
  'lab-notes': {
    type: 'flat',
    sectionName: 'AE — Lab Notes',
    fields: [
      { label: 'Lab Notes', read: data => data?.['lab-notes__notes'] ?? data?.notes ?? '' },
    ],
  },
  'medical-history': {
    type: 'rows',
    sectionName: 'AE — Medical History',
    fields: [
      { label: 'Medical History', key: 'condition_name' },
      { label: 'Start Date', key: 'start_date' },
      { label: 'End Date', key: 'end_date' },
      { label: 'Ongoing', key: 'is_ongoing' },
      { label: 'Relevant History', key: 'notes' },
    ],
  },
  'medical-notes': {
    type: 'flat',
    sectionName: 'AE — Medical Notes',
    fields: [
      { label: 'Medical Notes', read: data => data?.['medical-notes__notes'] ?? data?.notes ?? '' },
    ],
  },
  'product-info': {
    type: 'rows',
    sectionName: 'AE — Product Information',
    fields: [
      { label: 'Product Name', key: 'product_name' },
      { label: 'Product Type', key: 'product_type' },
      { label: 'Product Category', key: 'product_category' },
      { label: 'Batch / Lot Number', key: 'batch_lot_number' },
      { label: 'Dose', key: 'dose' },
      { label: 'Dose Unit', key: 'dose_unit' },
      { label: 'Route of Administration', key: 'route_of_admin' },
      { label: 'Frequency', key: 'frequency' },
      { label: 'Start Date', key: 'start_date' },
      { label: 'Stop Date', key: 'end_date' },
      { label: 'Indication', key: 'indication' },
      { label: 'Action Taken', key: 'action_taken' },
      { label: 'Dechallenge', key: 'dechallenge' },
      { label: 'Rechallenge', key: 'rechallenge' },
      { label: 'Suspect', key: 'is_suspect' },
      { label: 'Concomitant Medications', key: 'is_concomitant' },
    ],
  },
}

function isFilled(value) {
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')
}

function getTrackedAeFields(fields, getFieldConfig, sectionName) {
  if (!Array.isArray(fields) || fields.length === 0) return []
  const requiredFields = fields.filter(field => getFieldConfig?.(sectionName, field.label)?.is_required)
  // Prefer admin-configured required fields when present; otherwise fall back to the fields this tab actually renders.
  return requiredFields.length > 0 ? requiredFields : fields
}

function readAeFieldValue(field, data) {
  return typeof field.read === 'function' ? field.read(data || {}) : data?.[field.key]
}

function computeAeFlatCompletion(data, fields, getFieldConfig, sectionName) {
  if (!data || Array.isArray(data)) return null
  const trackedFields = getTrackedAeFields(fields, getFieldConfig, sectionName)
  if (trackedFields.length === 0) return null
  return {
    count: trackedFields.length,
    complete: trackedFields.reduce((total, field) => total + (isFilled(readAeFieldValue(field, data)) ? 1 : 0), 0),
  }
}

function computeAeRowCompletion(rows, fields, getFieldConfig, sectionName) {
  if (!Array.isArray(rows)) return null
  const trackedFields = getTrackedAeFields(fields, getFieldConfig, sectionName)
  if (trackedFields.length === 0) return null
  if (rows.length === 0) return { count: trackedFields.length, complete: 0 }
  return rows.reduce((summary, row) => ({
    count: summary.count + trackedFields.length,
    complete: summary.complete + trackedFields.reduce((total, field) => total + (isFilled(readAeFieldValue(field, row)) ? 1 : 0), 0),
  }), { count: 0, complete: 0 })
}

export default function CaseAETab({
  id, headers, setSavedMsg, users, getFieldConfig, getPicklistOptions, onCountChange,
  formConfig, dynFieldValues, setDynFieldValues, dynFieldSaving, dynFieldErrors,
  saveDynFields, caseType,
}) {
  const ctx = useCaseFieldContext()
  const [aeVersions,   setAeVersions]   = useState([])
  const [activeAeVer,  setActiveAeVer]  = useState(null)
  const [activeAeTab,  setActiveAeTab]  = useState('general')
  const [aeTabData,    setAeTabData]    = useState({})
  const [aeTabLoading, setAeTabLoading] = useState(false)

  const [aeTransmissions, setAeTransmissions] = useState([])
  const [aeTxLoading,     setAeTxLoading]     = useState(false)
  const [aeTxDrawer,      setAeTxDrawer]      = useState(false)
  const [aeTxForm,        setAeTxForm]        = useState({ assigned_to_id: '', priority: 'routine', narrative: '' })
  const [aeTxSaving,      setAeTxSaving]      = useState(false)
  const [aeClosingVersion, setAeClosingVersion] = useState(false)

  useEffect(() => { loadAEVersions(); loadAeTransmissions() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLocked = (ver) => ver && ver.is_locked === 1
  const isClosed = (ver) => String(ver?.status || '').trim().toLowerCase() === 'closed'
  const latestAeVersion = aeVersions.length > 0 ? aeVersions[aeVersions.length - 1] : null
  const canCreateAeVersion = !latestAeVersion || isClosed(latestAeVersion)
  const aeCompletionByTab = useMemo(() => {
    const versionId = activeAeVer?.id
    if (!versionId) return {}
    return Object.fromEntries(
      AE_TABS.map(tab => {
        const def = AE_COMPLETION_DEFS[tab.key]
        if (!def) return [tab.key, null]
        const payload = aeTabData[`${versionId}_${tab.key}`]
        if (payload === undefined) return [tab.key, null]
        const summary = def.type === 'rows'
          ? computeAeRowCompletion(payload, def.fields, getFieldConfig, def.sectionName)
          : computeAeFlatCompletion(payload, def.fields, getFieldConfig, def.sectionName)
        return [tab.key, summary]
      }),
    )
  }, [activeAeVer?.id, aeTabData, getFieldConfig])

  useEffect(() => {
    const versionId = activeAeVer?.id
    if (!versionId) return
    const draftKey = `mims_case_${id}_ae_${versionId}_${activeAeTab}`
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed !== null && parsed !== undefined) {
        setAeTabData(prev => ({ ...prev, [`${versionId}_${activeAeTab}`]: parsed }))
      }
    } catch {
      // no-op
    }
  }, [activeAeTab, activeAeVer?.id, id])

  useEffect(() => {
    const versionId = activeAeVer?.id
    if (!versionId) return
    const payload = aeTabData[`${versionId}_${activeAeTab}`]
    if (payload === undefined) return
    try { localStorage.setItem(`mims_case_${id}_ae_${versionId}_${activeAeTab}`, JSON.stringify(payload)) } catch { /* no-op */ }
  }, [activeAeTab, activeAeVer?.id, aeTabData, id])

  async function loadAEVersions() {
    try {
      const res  = await httpFetch(`${API}/cases/${id}/ae/versions`, { headers })
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setAeVersions(list)
      onCountChange?.(list.length)
      if (list.length > 0) { setActiveAeVer(list[list.length - 1]); loadAETab(list[list.length - 1].id, 'general') }
    } catch { setAeVersions([]) }
  }

  async function loadAETab(versionId, tabKey) {
    setAeTabLoading(true)
    try {
      const res  = await httpFetch(`${API}/cases/ae/versions/${versionId}/${tabKey}`, { headers })
      const data = await res.json()
      setAeTabData(prev => ({ ...prev, [`${versionId}_${tabKey}`]: data }))
    } catch { /* ignore tab fetch errors */ }
    finally { setAeTabLoading(false) }
  }

  function switchAETab(tabKey) {
    setActiveAeTab(tabKey)
    if (activeAeVer) loadAETab(activeAeVer.id, tabKey)
  }

  async function createAEVersion() {
    if (!canCreateAeVersion) {
      toast.error('Close the current AE version before creating a new version.')
      return
    }
    try {
      const res  = await httpFetch(`${API}/cases/${id}/ae/versions`, { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // B5 — refetch authoritative version list from server (kill client-side race).
      // The server is responsible for locking the previous version atomically with
      // creating the new one; do not infer that state in the client.
      const refetch = await httpFetch(`${API}/cases/${id}/ae/versions`, { headers })
      const list    = await refetch.json()
      const safeList = Array.isArray(list) ? list : []
      setAeVersions(safeList)
      onCountChange?.(safeList.length)
      const fresh = safeList.find(v => v.id === data.id) || data
      setActiveAeVer(fresh)
      setActiveAeTab('general')
      loadAETab(fresh.id, 'general')
    } catch (err) { toast.error(err.message) }
  }

  async function closeAEVersion() {
    if (!activeAeVer || isLocked(activeAeVer) || isClosed(activeAeVer) || aeClosingVersion) return
    setAeClosingVersion(true)
    try {
      const res = await httpFetch(`${API}/cases/ae/versions/${activeAeVer.id}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: 'Closed' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to close version')
      setAeVersions(prev => prev.map(v => v.id === activeAeVer.id ? { ...v, status: data.status || 'Closed' } : v))
      setActiveAeVer(prev => (prev ? { ...prev, status: data.status || 'Closed' } : prev))
      setSavedMsg('AE version closed'); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAeClosingVersion(false)
    }
  }

  const [aeTabSaving, setAeTabSaving] = useState(false)
  async function saveAETab() {
    if (!activeAeVer || isLocked(activeAeVer) || aeTabSaving) return
    setAeTabSaving(true)
    const tabData = aeTabData[`${activeAeVer.id}_${activeAeTab}`] || {}
    try {
      const res  = await httpFetch(`${API}/cases/ae/versions/${activeAeVer.id}/${activeAeTab}`, { method: 'PUT', headers, body: JSON.stringify(tabData) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAeTabData(prev => ({ ...prev, [`${activeAeVer.id}_${activeAeTab}`]: data }))
      localStorage.removeItem(`mims_case_${id}_ae_${activeAeVer.id}_${activeAeTab}`)
      setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { toast.error(err.message) }
    finally { setAeTabSaving(false) }
  }

  async function loadAeTransmissions() {
    setAeTxLoading(true)
    try {
      const res  = await httpFetch(`${API}/cases/${id}/ae-transmissions`, { headers })
      const data = await res.json()
      setAeTransmissions(Array.isArray(data) ? data : [])
    } catch { setAeTransmissions([]) }
    finally { setAeTxLoading(false) }
  }

  async function createAeTransmission() {
    if (aeTxSaving) return
    setAeTxSaving(true)
    try {
      const res  = await httpFetch(`${API}/cases/${id}/ae-transmissions`, { method: 'POST', headers, body: JSON.stringify(aeTxForm) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAeTransmissions(prev => [data, ...prev])
      setAeTxDrawer(false)
      setAeTxForm({ assigned_to_id: '', priority: 'routine', narrative: '' })
      setSavedMsg('Transmission created — PV team notified'); setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) { toast.error(err.message) }
    finally { setAeTxSaving(false) }
  }

  async function updateAeTxStatus(txId, status) {
    try {
      const res  = await httpFetch(`${API}/cases/${id}/ae-transmissions/${txId}`, { method: 'PATCH', headers, body: JSON.stringify({ status }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAeTransmissions(prev => prev.map(t => t.id === txId ? data : t))
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div id="tab-ae" className="cf-tab-pane">
      <div className="cf-section-header-row">
        <button className="cf-add-btn" onClick={createAEVersion} disabled={!canCreateAeVersion}>
          + New Version
        </button>
        <button
          className="cf-cancel-btn"
          onClick={closeAEVersion}
          disabled={!activeAeVer || isLocked(activeAeVer) || isClosed(activeAeVer) || aeClosingVersion}
        >
          {aeClosingVersion ? 'Closing…' : 'Close Version'}
        </button>
        <button className="cf-tx-trigger-btn" onClick={() => setAeTxDrawer(p => !p)}>
          🔬 {aeTxDrawer ? 'Cancel Transmission' : 'Transmit to PV'}
        </button>
      </div>
      {!canCreateAeVersion && (
        <div className="cf-inline-note">Close the current AE version before creating a new version.</div>
      )}

      {aeVersions.length === 0 ? (
        <div className="cf-empty-state">
          <div className="cf-empty-icon" aria-hidden="true">🩺</div>
          <h3 className="cf-empty-title">No AE versions yet</h3>
          <p className="cf-empty-msg">
            Create the first AE version to begin clinical assessment.
            Each version captures a snapshot of the case at a regulatory milestone
            (initial intake, follow-up, expedited submission).
          </p>
          <ul className="cf-empty-hints">
            <li>Click <strong>+ New Version</strong> above to start.</li>
            <li>Close a version when you submit it — that locks it for audit.</li>
            <li>Follow-up info goes into a new version, never overwriting the prior one.</li>
          </ul>
        </div>
      ) : (
        <>
          <div className="cf-version-bar">
            {aeVersions.map(v => (
              <button
                key={v.id}
                className={`cf-version-btn ${activeAeVer?.id === v.id ? 'active' : ''} ${v.is_locked ? 'locked' : ''}`}
                onClick={() => { setActiveAeVer(v); loadAETab(v.id, activeAeTab) }}
              >
                <span className="cf-version-label">Version #{v.version_number}</span>
                {v.is_locked && <span className="cf-lock-icon">🔒</span>}
                <span className={`cf-ver-status ${v.status.toLowerCase()}`}>Status: {v.status}</span>
              </button>
            ))}
          </div>

          {isLocked(activeAeVer) && (
            <div className="cf-locked-notice">This version is locked (read-only). Create a new version to continue editing.</div>
          )}

          <div className="cf-case-workspace cf-ae-workspace">
            <StickySectionNav
              sections={AE_TABS.map(t => ({
                id: t.key,
                label: t.label,
                count: aeCompletionByTab[t.key]?.count,
                complete: aeCompletionByTab[t.key]?.complete,
              }))}
              activeId={activeAeTab}
              onSelect={switchAETab}
            />
            <div className="cf-case-workspace-main">
              {aeTabLoading ? (
                <div className="cf-tab-loading">Loading…</div>
              ) : (
                <AETabPanel
                  tabKey={activeAeTab}
                  data={aeTabData[`${activeAeVer?.id}_${activeAeTab}`] || {}}
                  onChange={d => setAeTabData(prev => ({ ...prev, [`${activeAeVer?.id}_${activeAeTab}`]: d }))}
                  locked={isLocked(activeAeVer)}
                  getFieldConfig={getFieldConfig}
                  getPicklistOptions={getPicklistOptions}
                  versionId={activeAeVer?.id}
                  headers={headers}
                  caseId={id}
                  onSave={saveAETab}
                  saving={aeTabSaving}
                />
              )}
            </div>
          </div>
        </>
      )}

      {aeTxDrawer && (
        <div className="cf-tx-drawer">
          <div className="cf-tx-drawer-title">New AE Transmission → PV Team</div>
          <div className="cf-form-grid">
            <div className="cf-form-field">
              <label>Assign To (PV Team)</label>
              <select value={aeTxForm.assigned_to_id} onChange={e => setAeTxForm(p => ({ ...p, assigned_to_id: e.target.value }))}>
                <option value="">— Select Assignee —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="cf-form-field">
              <label>Priority</label>
              <select value={aeTxForm.priority} onChange={e => setAeTxForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="routine">Routine (30 days)</option>
                <option value="expedited">Expedited (15 days)</option>
                <option value="urgent">Urgent (7 days)</option>
              </select>
            </div>
            <div className="cf-form-field cf-form-field--full">
              <label>Clinical Narrative</label>
              <textarea rows={3} value={aeTxForm.narrative} onChange={e => setAeTxForm(p => ({ ...p, narrative: e.target.value }))} placeholder="Clinical narrative for PV team…" />
            </div>
          </div>
          <div className="cf-form-actions">
            <button className="cf-cancel-btn" onClick={() => setAeTxDrawer(false)}>Cancel</button>
            <button className="cf-save-btn" onClick={createAeTransmission} disabled={aeTxSaving}>
              {aeTxSaving ? 'Transmitting…' : 'Transmit to PV'}
            </button>
          </div>
        </div>
      )}

      <div className="cf-tx-tracker">
        <div className="cf-tx-tracker-title">AE Transmission Tracker</div>
        {aeTxLoading && <div className="cf-empty-msg">Loading transmissions…</div>}
        {!aeTxLoading && aeTransmissions.length === 0 && <div className="cf-empty-msg">No AE transmissions created yet.</div>}
        {!aeTxLoading && aeTransmissions.map(tx => (
          <div key={tx.id} className="cf-tx-card">
            <div className="cf-tx-card-top">
              <span className={`cf-tx-status-badge cf-tx-status--${(tx.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{tx.status}</span>
              <span className="cf-tx-meta">Priority: <strong>{tx.priority}</strong></span>
              {tx.due_date && <span className="cf-tx-meta">Due: {String(tx.due_date).slice(0, 10)}</span>}
              <span className="cf-tx-meta">→ {tx.assignee_name || 'Unassigned'}</span>
            </div>
            {tx.narrative && <div className="cf-tx-narrative">{tx.narrative}</div>}
            <div className="cf-tx-status-actions">
              {['Pending', 'In Review', 'Accepted', 'Closed'].map(s => (
                <button key={s} className={`cf-tx-status-btn${tx.status === s ? ' active' : ''}`} onClick={() => updateAeTxStatus(tx.id, s)} disabled={tx.status === s}>{s}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* B1 fix — admin-configured AE fields render here, scoped to displayTab='ae' */}
      {formConfig && Array.isArray(formConfig.sections) && (
        <div className="cf-overview-card">
          <div className="cf-overview-kicker">Additional Fields</div>
          <h3>AE Configured Fields</h3>
          <DynamicFieldsSection
            sections={formConfig.sections}
            values={dynFieldValues || {}}
            onChange={setDynFieldValues || (() => {})}
            onSave={saveDynFields || (() => {})}
            saving={dynFieldSaving}
            rules={formConfig.rules || []}
            errors={dynFieldErrors || {}}
            caseId={ctx?.caseId}
            caseStatus={ctx?.caseStatus}
            caseSection="ae"
            presence={ctx?.presence}
            currentUserId={ctx?.currentUserId}
            caseType={caseType}
            displayTab="ae"
          />
        </div>
      )}
    </div>
  )
}
