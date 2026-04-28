import { useState, useEffect } from 'react'
import toast from '../../../shared/utils/toast'
import AETabPanel from './AETabPanel'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

const AE_TABS = [
  { key: 'general',         label: 'General' },
  { key: 'ae-flex-fields',  label: 'AE Flex Fields' },
  { key: 'events',          label: 'Events' },
  { key: 'patient-info',    label: 'AE Patient Info' },
  { key: 'lab-results',     label: 'Lab Results' },
  { key: 'lab-notes',       label: 'Lab Notes' },
  { key: 'medical-history', label: 'Medical History' },
  { key: 'medical-notes',   label: 'Medical Notes' },
  { key: 'product-info',    label: 'Product Info' },
]

export default function CaseAETab({ id, headers, setSavedMsg, users, getFieldConfig, getPicklistOptions, onCountChange }) {
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

  useEffect(() => { loadAEVersions(); loadAeTransmissions() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLocked = (ver) => ver && ver.is_locked === 1

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
    } catch {}
    finally { setAeTabLoading(false) }
  }

  function switchAETab(tabKey) {
    setActiveAeTab(tabKey)
    if (activeAeVer) loadAETab(activeAeVer.id, tabKey)
  }

  async function createAEVersion() {
    try {
      const res  = await httpFetch(`${API}/cases/${id}/ae/versions`, { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const updated = [...aeVersions.map(v => v.id === (aeVersions[aeVersions.length - 1]?.id) ? { ...v, is_locked: 1 } : v), data]
      setAeVersions(updated)
      onCountChange?.(updated.length)
      setActiveAeVer(data)
      setActiveAeTab('general')
      loadAETab(data.id, 'general')
    } catch (err) { toast.error(err.message) }
  }

  async function saveAETab() {
    if (!activeAeVer || isLocked(activeAeVer)) return
    const tabData = aeTabData[`${activeAeVer.id}_${activeAeTab}`] || {}
    try {
      const res  = await httpFetch(`${API}/cases/ae/versions/${activeAeVer.id}/${activeAeTab}`, { method: 'PUT', headers, body: JSON.stringify(tabData) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAeTabData(prev => ({ ...prev, [`${activeAeVer.id}_${activeAeTab}`]: data }))
      setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { toast.error(err.message) }
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
    <div className="cf-tab-pane">
      <div className="cf-section-header-row">
        <button className="cf-add-btn" onClick={createAEVersion}>+ New Version</button>
        <button className="cf-tx-trigger-btn" onClick={() => setAeTxDrawer(p => !p)}>
          🔬 {aeTxDrawer ? 'Cancel Transmission' : 'Transmit to PV'}
        </button>
      </div>

      {aeVersions.length === 0 ? (
        <div className="cf-empty-msg">No AE versions yet. Click "+ New Version" to start.</div>
      ) : (
        <>
          <div className="cf-version-bar">
            {aeVersions.map(v => (
              <button
                key={v.id}
                className={`cf-version-btn ${activeAeVer?.id === v.id ? 'active' : ''} ${v.is_locked ? 'locked' : ''}`}
                onClick={() => { setActiveAeVer(v); loadAETab(v.id, activeAeTab) }}
              >
                V{v.version_number}
                {v.is_locked && <span className="cf-lock-icon">🔒</span>}
                <span className={`cf-ver-status ${v.status.toLowerCase()}`}>{v.status}</span>
              </button>
            ))}
          </div>

          {isLocked(activeAeVer) && (
            <div className="cf-locked-notice">This version is locked (read-only). Create a new version to continue editing.</div>
          )}

          <div className="cf-tab-bar">
            {AE_TABS.map(t => (
              <button key={t.key} className={`cf-tab-btn ${activeAeTab === t.key ? 'active' : ''}`} onClick={() => switchAETab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

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
              onSave={saveAETab}
            />
          )}
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
    </div>
  )
}
