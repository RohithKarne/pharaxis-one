import { useEffect, useMemo, useRef, useState } from 'react'
import toast from '../../../shared/utils/toast'
import PCTabPanel from './PCTabPanel'
import TransmissionSignModal from './TransmissionSignModal'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { toDateInputValues } from '../../../shared/utils/dateOnly.js'
import DynamicFieldsSection from './DynamicFieldsSection'
import { useCaseFieldContext } from '../../../shared/components/WiredField'
import StickySectionNav from '../../../shared/components/StickySectionNav'

const API = import.meta.env.VITE_API_URL || '/api'

const PC_TABS = [
  { key: 'general',          label: 'General' },
  { key: 'patient-info',     label: 'PC Patient Info' },
  { key: 'product-info',     label: 'Product Info' },
  { key: 'return-retrieval', label: 'Return / Retrieval' },
  { key: 'replacement',      label: 'Replacement' },
  { key: 'refund-credit',    label: 'Refund / Credit' },
]

const PC_COMPLETION_DEFS = {
  general: {
    sectionName: 'PC — General',
    fields: [
      { label: 'Complaint Description', key: 'complaint_description' },
      { label: 'PC Status', key: 'pc_status' },
      { label: 'PC Category', key: 'pc_category' },
      { label: 'PC Classification', key: 'pc_classification' },
      { label: 'Date of Complaint', key: 'date_of_complaint' },
      { label: 'Date Received', key: 'date_received' },
      { label: 'Severity', key: 'severity' },
      { label: 'Root Cause', key: 'root_cause' },
      { label: 'Additional Info', key: 'additional_info_general' },
    ],
  },
  'patient-info': {
    sectionName: 'PC — Patient Information',
    fields: [
      { label: 'Patient Name', key: 'patient_name' },
      { label: 'Date of Birth', key: 'date_of_birth' },
      { label: 'Age', key: 'age' },
      { label: 'Age Unit', key: 'age_unit' },
      { label: 'Gender', key: 'sex' },
      { label: 'Weight (kg)', key: 'weight_kg' },
      { label: 'Therapy Start Date', key: 'therapy_start_date' },
      { label: 'Therapy End Date', key: 'therapy_end_date' },
      { label: 'Indication', key: 'indication' },
      { label: 'Injury Experienced', key: 'injury_experienced' },
      { label: 'Additional Info', key: 'additional_info_patient' },
    ],
  },
  'product-info': {
    sectionName: 'PC — Product Information',
    fields: [
      { label: 'Product Name', key: 'product_name' },
      { label: 'Product Type', key: 'product_type' },
      { label: 'Product Category', key: 'product_category' },
      { label: 'Lot Number', key: 'lot_number' },
      { label: 'Expiry Date', key: 'expiry_date' },
      { label: 'Manufacturing Date', key: 'manufacturing_date' },
      { label: 'Pack Size', key: 'pack_size' },
      { label: 'Product Sample Available', key: 'quantity_available' },
      { label: 'Storage Conditions', key: 'storage_conditions' },
      { label: 'Additional Info', key: 'additional_info_product' },
    ],
  },
  'return-retrieval': {
    sectionName: 'PC — Return & Retrieval',
    fields: [
      { label: 'Return Requested', key: 'return_requested' },
      { label: 'Return Date', key: 'return_date' },
      { label: 'Return Address', key: 'return_address' },
      { label: 'Return Method', key: 'return_method' },
      { label: 'Retrieval Requested', key: 'retrieval_requested' },
      { label: 'Retrieval Date', key: 'retrieval_date' },
      { label: 'Retrieval Method', key: 'retrieval_method' },
      { label: 'Tracking Number', key: 'tracking_number' },
      { label: 'Notes', key: 'notes_return' },
    ],
  },
  replacement: {
    sectionName: 'PC — Replacement',
    fields: [
      { label: 'Replacement Requested', key: 'replacement_requested' },
      { label: 'Replacement Approved', key: 'replacement_approved' },
      { label: 'Replacement Date', key: 'replacement_date' },
      { label: 'Replacement Product', key: 'replacement_product' },
      { label: 'Quantity', key: 'quantity' },
      { label: 'Notes', key: 'notes_replacement' },
    ],
  },
  'refund-credit': {
    sectionName: 'PC — Refund & Credit',
    fields: [
      { label: 'Refund Requested', key: 'refund_requested' },
      { label: 'Refund Approved', key: 'refund_approved' },
      { label: 'Refund Amount', key: 'refund_amount' },
      { label: 'Credit Requested', key: 'credit_requested' },
      { label: 'Credit Approved', key: 'credit_approved' },
      { label: 'Credit Amount', key: 'credit_amount' },
      { label: 'Credit Note Number', key: 'credit_note_number' },
      { label: 'Notes', key: 'notes_refund' },
    ],
  },
}

function isFilled(value) {
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')
}

function getPcFieldConfig(formConfig, sectionName, fieldName) {
  const section = formConfig?.sections?.find(item => item.section_name === sectionName)
  return section?.fields?.find(field => field.field_name === fieldName) || null
}

function getTrackedPcFields(fields, formConfig, sectionName) {
  if (!Array.isArray(fields) || fields.length === 0) return []
  const requiredFields = fields.filter(field => getPcFieldConfig(formConfig, sectionName, field.label)?.is_required)
  // Prefer admin-configured required fields when present; otherwise fall back to the fields this tab actually renders.
  return requiredFields.length > 0 ? requiredFields : fields
}

function computePcCompletion(data, fields, formConfig, sectionName) {
  if (!data || Array.isArray(data)) return null
  const trackedFields = getTrackedPcFields(fields, formConfig, sectionName)
  if (trackedFields.length === 0) return null
  return {
    count: trackedFields.length,
    complete: trackedFields.reduce((total, field) => total + (isFilled(data?.[field.key]) ? 1 : 0), 0),
  }
}

export default function CasePCTab({
  id, headers, setSavedMsg, users, getFieldConfig, getPicklistOptions, onCountChange,
  formConfig, dynFieldValues, setDynFieldValues, dynFieldSaving, dynFieldErrors,
  saveDynFields, caseType, registerSectionSave, caseClosed = false,
}) {
  const ctx = useCaseFieldContext()
  // Admin settings for the panel's own fields — formConfig.core entries carry
  // their section and field name (migration 109 links the rows).
  const panelField = useMemo(() => {
    const entries = Object.values(formConfig?.core || {})
    return (section, name, fallback) => {
      const def = entries.find(e => e.section_name === section && e.field_name === name)
      return def
        ? { label: def.label || fallback, required: !!def.is_required, hidden: !!def.is_hidden }
        : { label: fallback, required: false, hidden: false }
    }
  }, [formConfig])
  const [pcVersions,   setPcVersions]   = useState([])
  const [activePcVer,  setActivePcVer]  = useState(null)
  const [activePcTab,  setActivePcTab]  = useState('general')
  const [pcTabData,    setPcTabData]    = useState({})
  // Last loaded/saved copy of each PC section, so Save Case knows what changed.
  const pcSaved = useRef({})
  const [pcTabLoading, setPcTabLoading] = useState(false)

  const [pcTransmissions, setPcTransmissions] = useState([])
  const [pcTxLoading,     setPcTxLoading]     = useState(false)
  const [pcTxDrawer,      setPcTxDrawer]      = useState(false)
  const [pcTxForm,        setPcTxForm]        = useState({ assigned_to_id: '', priority: 'routine', notes: '' })
  const [pcTxSaving,      setPcTxSaving]      = useState(false)
  const [pcClosingVersion, setPcClosingVersion] = useState(false)

  useEffect(() => { loadPCVersions(); loadPcTransmissions() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // A closed case is read-only whatever its versions say (MIPM-208).
  const isLocked = (ver) => !!caseClosed || (ver && ver.is_locked === 1)
  const isClosed = (ver) => String(ver?.status || '').trim().toLowerCase() === 'closed'
  const latestPcVersion = pcVersions.length > 0 ? pcVersions[pcVersions.length - 1] : null
  const canCreatePcVersion = !caseClosed && (!latestPcVersion || isClosed(latestPcVersion))
  const pcCompletionByTab = useMemo(() => {
    const versionId = activePcVer?.id
    if (!versionId) return {}
    return Object.fromEntries(
      PC_TABS.map(tab => {
        const def = PC_COMPLETION_DEFS[tab.key]
        if (!def) return [tab.key, null]
        const payload = pcTabData[`${versionId}_${tab.key}`]
        if (payload === undefined) return [tab.key, null]
        return [tab.key, computePcCompletion(payload, def.fields, formConfig, def.sectionName)]
      }),
    )
  }, [activePcVer?.id, pcTabData, formConfig])

  useEffect(() => {
    const versionId = activePcVer?.id
    if (!versionId) return
    const draftKey = `mims_case_${id}_pc_${versionId}_${activePcTab}`
    try {
      const raw = sessionStorage.getItem(draftKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed !== null && parsed !== undefined) {
        setPcTabData(prev => ({ ...prev, [`${versionId}_${activePcTab}`]: parsed }))
      }
    } catch {
      // no-op
    }
  }, [activePcTab, activePcVer?.id, id])

  async function loadPCVersions() {
    try {
      const res  = await httpFetch(`${API}/cases/${id}/pc/versions`, { headers })
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setPcVersions(list)
      onCountChange?.(list.length)
      if (list.length > 0) { setActivePcVer(list[list.length - 1]); loadPCTab(list[list.length - 1].id, 'general') }
    } catch { setPcVersions([]) }
  }

  async function loadPCTab(versionId, tabKey) {
    setPcTabLoading(true)
    try {
      const res  = await httpFetch(`${API}/cases/pc/versions/${versionId}/${tabKey}`, { headers })
      const data = toDateInputValues(await res.json())
      pcSaved.current[`${versionId}_${tabKey}`] = JSON.stringify(data)
      // An unsaved draft for this version + section wins over the server copy,
      // except on a locked version, which shows only what was saved. The saved
      // copy stays in pcSaved, so a restored draft counts as an unsaved change.
      let draft = null
      if (!isLocked(pcVersions.find(v => v.id === versionId))) {
        try { draft = JSON.parse(sessionStorage.getItem(`mims_case_${id}_pc_${versionId}_${tabKey}`)) } catch { /* no-op */ }
      }
      setPcTabData(prev => ({ ...prev, [`${versionId}_${tabKey}`]: draft ?? data }))
    } catch { /* ignore tab fetch errors */ }
    finally { setPcTabLoading(false) }
  }

  function switchPCTab(tabKey) {
    setActivePcTab(tabKey)
    if (activePcVer) loadPCTab(activePcVer.id, tabKey)
  }

  async function createPCVersion() {
    if (!canCreatePcVersion) {
      toast.error('Close the current PC version before creating a new version.')
      return
    }
    try {
      const res  = await httpFetch(`${API}/cases/${id}/pc/versions`, { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // B5 — refetch authoritative version list from server (kill client-side race).
      const refetch = await httpFetch(`${API}/cases/${id}/pc/versions`, { headers })
      const list    = await refetch.json()
      const safeList = Array.isArray(list) ? list : []
      setPcVersions(safeList)
      onCountChange?.(safeList.length)
      const fresh = safeList.find(v => v.id === data.id) || data
      setActivePcVer(fresh)
      setActivePcTab('general')
      loadPCTab(fresh.id, 'general')
    } catch (err) { toast.error(err.message) }
  }

  async function closePCVersion() {
    if (!activePcVer || isLocked(activePcVer) || isClosed(activePcVer) || pcClosingVersion) return
    setPcClosingVersion(true)
    try {
      const res = await httpFetch(`${API}/cases/pc/versions/${activePcVer.id}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: 'Closed' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to close version')
      setPcVersions(prev => prev.map(v => v.id === activePcVer.id ? { ...v, status: data.status || 'Closed', is_locked: data.is_locked } : v))
      setActivePcVer(prev => (prev ? { ...prev, status: data.status || 'Closed', is_locked: data.is_locked } : prev))
      setSavedMsg('PC version closed'); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPcClosingVersion(false)
    }
  }

  // Only what the person types is a draft; loading a section never writes one.
  function editPCTab(d) {
    setPcTabData(prev => ({ ...prev, [`${activePcVer?.id}_${activePcTab}`]: d }))
    try { sessionStorage.setItem(`mims_case_${id}_pc_${activePcVer?.id}_${activePcTab}`, JSON.stringify(d)) } catch { /* no-op */ }
  }

  const [pcTabSaving, setPcTabSaving] = useState(false)
  async function savePCTab() {
    if (!activePcVer || isLocked(activePcVer) || pcTabSaving) return false
    setPcTabSaving(true)
    const tabData = pcTabData[`${activePcVer.id}_${activePcTab}`] || {}
    try {
      const res  = await httpFetch(`${API}/cases/pc/versions/${activePcVer.id}/${activePcTab}`, { method: 'PUT', headers, body: JSON.stringify(tabData) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const saved = toDateInputValues(data)
      pcSaved.current[`${activePcVer.id}_${activePcTab}`] = JSON.stringify(saved)
      setPcTabData(prev => ({ ...prev, [`${activePcVer.id}_${activePcTab}`]: saved }))
      sessionStorage.removeItem(`mims_case_${id}_pc_${activePcVer.id}_${activePcTab}`)
      setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 2000)
      return true
    } catch (err) { toast.error(err.message); return false }
    finally { setPcTabSaving(false) }
  }

  // Let the page's Save Case save this PC section too when it has unsaved edits.
  useEffect(() => {
    if (!registerSectionSave || !activePcVer || isLocked(activePcVer)) return undefined
    const key = `${activePcVer.id}_${activePcTab}`
    return registerSectionSave('pc', {
      label: `PC ${activePcTab}`,
      isDirty: () => pcSaved.current[key] !== undefined && JSON.stringify(pcTabData[key]) !== pcSaved.current[key],
      save: savePCTab,
    })
  })

  async function loadPcTransmissions() {
    setPcTxLoading(true)
    try {
      const res  = await httpFetch(`${API}/cases/${id}/pc-transmissions`, { headers })
      const data = await res.json()
      setPcTransmissions(Array.isArray(data) ? data : [])
    } catch { setPcTransmissions([]) }
    finally { setPcTxLoading(false) }
  }

  async function createPcTransmission() {
    if (pcTxSaving) return
    setPcTxSaving(true)
    try {
      const res  = await httpFetch(`${API}/cases/${id}/pc-transmissions`, { method: 'POST', headers, body: JSON.stringify(pcTxForm) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPcTransmissions(prev => [data, ...prev])
      setPcTxDrawer(false)
      setPcTxForm({ assigned_to_id: '', priority: 'routine', notes: '' })
      setSavedMsg('Routed to Quality team'); setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) { toast.error(err.message) }
    finally { setPcTxSaving(false) }
  }

  // Closed and moving back out need an e-signature (MIPM-164); the sign
  // box calls back here with it and shows any refusal itself.
  const PC_TX_SIGNED = ['Closed']
  const [pcTxSign, setPcTxSign] = useState(null)
  async function updatePcTxStatus(txId, status, sign = null) {
    const current = pcTransmissions.find(t => t.id === txId)?.status
    if (!sign && (PC_TX_SIGNED.includes(status) || PC_TX_SIGNED.includes(current))) { setPcTxSign({ txId, status }); return '' }
    try {
      const res  = await httpFetch(`${API}/cases/${id}/pc-transmissions/${txId}`, { method: 'PATCH', headers, body: JSON.stringify({ status, ...sign }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPcTransmissions(prev => prev.map(t => t.id === txId ? data : t))
      return ''
    } catch (err) { if (sign) return err.message; toast.error(err.message); return err.message }
  }

  return (
    <div id="tab-pc" className="cf-tab-pane">
      <div className="cf-section-header-row">
        <button className="cf-add-btn" onClick={createPCVersion} disabled={!canCreatePcVersion}>
          + New Version
        </button>
        <button
          className="cf-cancel-btn"
          onClick={closePCVersion}
          disabled={!activePcVer || isLocked(activePcVer) || isClosed(activePcVer) || pcClosingVersion}
        >
          {pcClosingVersion ? 'Closing…' : 'Close Version'}
        </button>
        <button className="cf-tx-trigger-btn" onClick={() => setPcTxDrawer(p => !p)}>
          {pcTxDrawer ? 'Cancel Routing' : 'Route to Quality'}
        </button>
      </div>
      {!canCreatePcVersion && !caseClosed && (
        <div className="cf-inline-note">Close the current PC version before creating a new version.</div>
      )}

      {pcVersions.length === 0 ? (
        <div className="cf-empty-state">
          <h3 className="cf-empty-title">No PC versions yet</h3>
          <p className="cf-empty-msg">
            Create the first PC version to start the product-complaint investigation.
            Each version is a sealed snapshot tied to a regulatory submission or
            quality milestone.
          </p>
          <ul className="cf-empty-hints">
            <li>Click <strong>+ New Version</strong> above to start.</li>
            <li>Close a version when the investigation results are submitted to the quality system.</li>
            <li>Investigation updates create a new version — never overwrite prior data.</li>
          </ul>
        </div>
      ) : (
        <>
          <div className="cf-version-bar">
            {pcVersions.map(v => (
              <button
                key={v.id}
                className={`cf-version-btn ${activePcVer?.id === v.id ? 'active' : ''} ${v.is_locked ? 'locked' : ''}`}
                onClick={() => { setActivePcVer(v); loadPCTab(v.id, activePcTab) }}
              >
                <span className="cf-version-label">Version #{v.version_number}</span>
                {!!v.is_locked && <span className="cf-lock-icon">Locked</span>}
                <span className={`cf-ver-status ${v.status.toLowerCase()}`}>Status: {v.status}</span>
              </button>
            ))}
          </div>

          {isLocked(activePcVer) && (
            <div className="cf-locked-notice">{caseClosed
              ? 'This case is closed (read-only). Reopen the case to make changes.'
              : 'This version is locked (read-only). Create a new version to continue editing.'}</div>
          )}

          <div className="cf-case-workspace cf-pc-workspace">
            <StickySectionNav
              sections={PC_TABS.map(t => ({
                id: t.key,
                label: t.label,
                count: pcCompletionByTab[t.key]?.count,
                complete: pcCompletionByTab[t.key]?.complete,
              }))}
              activeId={activePcTab}
              onSelect={switchPCTab}
            />
            <div className="cf-case-workspace-main">
              {pcTabLoading ? (
                <div className="cf-tab-loading">Loading…</div>
              ) : (
                <PCTabPanel
                  tabKey={activePcTab}
                  data={pcTabData[`${activePcVer?.id}_${activePcTab}`] || {}}
                  onChange={editPCTab}
                  locked={isLocked(activePcVer)}
                  getFieldConfig={getFieldConfig}
                  getPicklistOptions={getPicklistOptions}
                  versionId={activePcVer?.id}
                  panelField={panelField}
                  headers={headers}
                  onSave={savePCTab}
                  saving={pcTabSaving}
                />
              )}
            </div>
          </div>
        </>
      )}

      {pcTxDrawer && (
        <div className="cf-tx-drawer">
          <div className="cf-tx-drawer-title">New PC Routing to Quality Team</div>
          <div className="cf-form-grid">
            <div className="cf-form-field">
              <label>Assign To (Quality Team)</label>
              <select value={pcTxForm.assigned_to_id} onChange={e => setPcTxForm(p => ({ ...p, assigned_to_id: e.target.value }))}>
                <option value="">— Select Assignee —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="cf-form-field">
              <label>Priority</label>
              <select value={pcTxForm.priority} onChange={e => setPcTxForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="routine">Routine</option>
                <option value="expedited">Expedited</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="cf-form-field cf-form-field--full">
              <label>Notes for Quality Team</label>
              <textarea rows={3} value={pcTxForm.notes} onChange={e => setPcTxForm(p => ({ ...p, notes: e.target.value }))} placeholder="Context and notes for quality team…" />
            </div>
          </div>
          <div className="cf-form-actions">
            <button className="cf-cancel-btn" onClick={() => setPcTxDrawer(false)}>Cancel</button>
            <button className="cf-save-btn" onClick={createPcTransmission} disabled={pcTxSaving}>
              {pcTxSaving ? 'Routing…' : 'Route to Quality'}
            </button>
          </div>
        </div>
      )}

      <TransmissionSignModal
        key={pcTxSign ? `${pcTxSign.txId}-${pcTxSign.status}` : 'none'}
        target={pcTxSign}
        what="Quality routing"
        onCancel={() => setPcTxSign(null)}
        onConfirm={async (password, reason) => {
          const msg = await updatePcTxStatus(pcTxSign.txId, pcTxSign.status, { password, reason })
          if (!msg) setPcTxSign(null)
          return msg
        }}
      />
      <div className="cf-tx-tracker">
        <div className="cf-tx-tracker-title">PC Quality Routing Tracker</div>
        {pcTxLoading && <div className="cf-empty-msg">Loading routings…</div>}
        {!pcTxLoading && pcTransmissions.length === 0 && <div className="cf-empty-msg">No PC routings created yet.</div>}
        {!pcTxLoading && pcTransmissions.map(tx => (
          <div key={tx.id} className="cf-tx-card">
            <div className="cf-tx-card-top">
              <span className={`cf-tx-status-badge cf-tx-status--${(tx.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{tx.status}</span>
              {/* Stored as standard / high / urgent; the form offers Routine / Expedited / Urgent. */}
              <span className="cf-tx-meta">Priority: <strong>{({ standard: 'Routine', high: 'Expedited', urgent: 'Urgent' })[tx.priority] || tx.priority}</strong></span>
              {tx.due_date && <span className="cf-tx-meta">Due: <strong>{String(tx.due_date).slice(0, 10)}</strong></span>}
              <span className="cf-tx-meta">Assigned to {tx.assignee_name || 'nobody'}</span>
            </div>
            {tx.notes && <div className="cf-tx-narrative">{tx.notes}</div>}
            <div className="cf-tx-status-actions">
              {['Pending', 'Under Investigation', 'Closed'].map(s => (
                <button key={s} className={`cf-tx-status-btn${tx.status === s ? ' active' : ''}`} onClick={() => updatePcTxStatus(tx.id, s)} disabled={tx.status === s}>{s}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* B1 fix — admin-configured PC fields render here, scoped to displayTab='pc' */}
      {formConfig && Array.isArray(formConfig.sections) && (
        <div className="cf-overview-card">
          <div className="cf-overview-kicker">Additional Fields</div>
          <h3>PC Configured Fields</h3>
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
            caseSection="pc"
            presence={ctx?.presence}
            currentUserId={ctx?.currentUserId}
            caseType={caseType}
            displayTab="pc"
          />
        </div>
      )}
    </div>
  )
}
