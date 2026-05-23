import { useState, useEffect } from 'react'
import toast from '../../../shared/utils/toast'
import PCTabPanel from './PCTabPanel'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import DynamicFieldsSection from './DynamicFieldsSection'
import { useCaseFieldContext } from '../../../shared/components/WiredField'

const API = import.meta.env.VITE_API_URL || '/api'

const PC_TABS = [
  { key: 'general',          label: 'General' },
  { key: 'patient-info',     label: 'PC Patient Info' },
  { key: 'product-info',     label: 'Product Info' },
  { key: 'return-retrieval', label: 'Return / Retrieval' },
  { key: 'replacement',      label: 'Replacement' },
  { key: 'refund-credit',    label: 'Refund / Credit' },
]

export default function CasePCTab({
  id, headers, setSavedMsg, users, getPicklistOptions, onCountChange,
  formConfig, dynFieldValues, setDynFieldValues, dynFieldSaving, dynFieldErrors,
  saveDynFields, caseType,
}) {
  const ctx = useCaseFieldContext()
  const [pcVersions,   setPcVersions]   = useState([])
  const [activePcVer,  setActivePcVer]  = useState(null)
  const [activePcTab,  setActivePcTab]  = useState('general')
  const [pcTabData,    setPcTabData]    = useState({})
  const [pcTabLoading, setPcTabLoading] = useState(false)

  const [pcTransmissions, setPcTransmissions] = useState([])
  const [pcTxLoading,     setPcTxLoading]     = useState(false)
  const [pcTxDrawer,      setPcTxDrawer]      = useState(false)
  const [pcTxForm,        setPcTxForm]        = useState({ assigned_to_id: '', priority: 'routine', notes: '' })
  const [pcTxSaving,      setPcTxSaving]      = useState(false)
  const [pcClosingVersion, setPcClosingVersion] = useState(false)

  useEffect(() => { loadPCVersions(); loadPcTransmissions() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLocked = (ver) => ver && ver.is_locked === 1
  const isClosed = (ver) => String(ver?.status || '').trim().toLowerCase() === 'closed'
  const latestPcVersion = pcVersions.length > 0 ? pcVersions[pcVersions.length - 1] : null
  const canCreatePcVersion = !latestPcVersion || isClosed(latestPcVersion)

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
      const data = await res.json()
      setPcTabData(prev => ({ ...prev, [`${versionId}_${tabKey}`]: data }))
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
      setPcVersions(prev => prev.map(v => v.id === activePcVer.id ? { ...v, status: data.status || 'Closed' } : v))
      setActivePcVer(prev => (prev ? { ...prev, status: data.status || 'Closed' } : prev))
      setSavedMsg('PC version closed'); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPcClosingVersion(false)
    }
  }

  const [pcTabSaving, setPcTabSaving] = useState(false)
  async function savePCTab() {
    if (!activePcVer || isLocked(activePcVer) || pcTabSaving) return
    setPcTabSaving(true)
    const tabData = pcTabData[`${activePcVer.id}_${activePcTab}`] || {}
    try {
      const res  = await httpFetch(`${API}/cases/pc/versions/${activePcVer.id}/${activePcTab}`, { method: 'PUT', headers, body: JSON.stringify(tabData) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPcTabData(prev => ({ ...prev, [`${activePcVer.id}_${activePcTab}`]: data }))
      setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { toast.error(err.message) }
    finally { setPcTabSaving(false) }
  }

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

  async function updatePcTxStatus(txId, status) {
    try {
      const res  = await httpFetch(`${API}/cases/${id}/pc-transmissions/${txId}`, { method: 'PATCH', headers, body: JSON.stringify({ status }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPcTransmissions(prev => prev.map(t => t.id === txId ? data : t))
    } catch (err) { toast.error(err.message) }
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
          🧪 {pcTxDrawer ? 'Cancel Routing' : 'Route to Quality'}
        </button>
      </div>
      {!canCreatePcVersion && (
        <div className="cf-inline-note">Close the current PC version before creating a new version.</div>
      )}

      {pcVersions.length === 0 ? (
        <div className="cf-empty-state">
          <div className="cf-empty-icon" aria-hidden="true">📦</div>
          <h3 className="cf-empty-title">No PC versions yet</h3>
          <p className="cf-empty-msg">
            Create the first PC version to start the product-complaint investigation.
            Each version is a sealed snapshot tied to a regulatory submission or
            quality milestone.
          </p>
          <ul className="cf-empty-hints">
            <li>Click <strong>+ New Version</strong> above to start.</li>
            <li>Close a version when investigation results are submitted to QMS.</li>
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
                {v.is_locked && <span className="cf-lock-icon">🔒</span>}
                <span className={`cf-ver-status ${v.status.toLowerCase()}`}>Status: {v.status}</span>
              </button>
            ))}
          </div>

          {isLocked(activePcVer) && (
            <div className="cf-locked-notice">This version is locked (read-only). Create a new version to continue editing.</div>
          )}

          <div className="cf-tab-bar">
            {PC_TABS.map(t => (
              <button key={t.key} className={`cf-tab-btn ${activePcTab === t.key ? 'active' : ''}`} onClick={() => switchPCTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {pcTabLoading ? (
            <div className="cf-tab-loading">Loading…</div>
          ) : (
            <PCTabPanel
              tabKey={activePcTab}
              data={pcTabData[`${activePcVer?.id}_${activePcTab}`] || {}}
              onChange={d => setPcTabData(prev => ({ ...prev, [`${activePcVer?.id}_${activePcTab}`]: d }))}
              locked={isLocked(activePcVer)}
              getPicklistOptions={getPicklistOptions}
              versionId={activePcVer?.id}
              headers={headers}
              onSave={savePCTab}
              saving={pcTabSaving}
            />
          )}
        </>
      )}

      {pcTxDrawer && (
        <div className="cf-tx-drawer">
          <div className="cf-tx-drawer-title">New PC Routing → Quality Team</div>
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

      <div className="cf-tx-tracker">
        <div className="cf-tx-tracker-title">PC Quality Routing Tracker</div>
        {pcTxLoading && <div className="cf-empty-msg">Loading routings…</div>}
        {!pcTxLoading && pcTransmissions.length === 0 && <div className="cf-empty-msg">No PC routings created yet.</div>}
        {!pcTxLoading && pcTransmissions.map(tx => (
          <div key={tx.id} className="cf-tx-card">
            <div className="cf-tx-card-top">
              <span className={`cf-tx-status-badge cf-tx-status--${(tx.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{tx.status}</span>
              <span className="cf-tx-meta">Priority: <strong>{tx.priority}</strong></span>
              <span className="cf-tx-meta">→ {tx.assignee_name || 'Unassigned'}</span>
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
