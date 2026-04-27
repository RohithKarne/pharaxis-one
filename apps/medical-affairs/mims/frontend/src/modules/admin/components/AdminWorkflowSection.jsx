import { useState, useEffect, useRef, useMemo } from 'react'
import { SectionHeader, StatusPill } from './AdminShared'

// ── AC-E2: Workflow State Transition Diagram (pure SVG, no extra packages) ────

function WorkflowDiagram({ states, rules }) {
  const activeStates = (states || []).filter(s => s.is_active)
  const NODE_R = 36
  const W = 760
  const H = 480
  const PADDING = 80

  // Arrange nodes in a circle
  const nodes = useMemo(() => {
    if (!activeStates.length) return []
    const cx = W / 2
    const cy = H / 2
    const r = Math.min(W, H) / 2 - PADDING
    return activeStates.map((s, i) => {
      const angle = (2 * Math.PI * i) / activeStates.length - Math.PI / 2
      return { ...s, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
    })
  }, [activeStates.length]) // eslint-disable-line

  const nodeMap = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])

  if (!activeStates.length) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⬡</div>
        <p>No active workflow states. Add states first to view the diagram.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>State Transition Diagram</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {activeStates.length} states · {(rules || []).filter(r => r.is_active).length} active transitions
        </span>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
          <defs>
            <marker id="wf-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--primary, #4f6ef7)" />
            </marker>
            <marker id="wf-arrow-gray" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#aaa" />
            </marker>
          </defs>

          {/* Transition edges */}
          {(rules || []).map(rule => {
            const from = nodeMap[rule.from_state_id]
            const to = nodeMap[rule.to_state_id]
            if (!from || !to) return null
            const dx = to.x - from.x
            const dy = to.y - from.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist === 0) return null
            const ux = dx / dist
            const uy = dy / dist
            const sx = from.x + ux * NODE_R
            const sy = from.y + uy * NODE_R
            const ex = to.x - ux * (NODE_R + 2)
            const ey = to.y - uy * (NODE_R + 2)
            // Slight curve to avoid overlap with reverse rules
            const midX = (sx + ex) / 2 - uy * 24
            const midY = (sy + ey) / 2 + ux * 24
            const active = rule.is_active
            return (
              <g key={rule.id}>
                <path
                  d={`M ${sx} ${sy} Q ${midX} ${midY} ${ex} ${ey}`}
                  fill="none"
                  stroke={active ? 'var(--primary, #4f6ef7)' : '#ccc'}
                  strokeWidth={active ? 2 : 1.5}
                  strokeDasharray={active ? undefined : '5,4'}
                  markerEnd={active ? 'url(#wf-arrow)' : 'url(#wf-arrow-gray)'}
                  opacity={active ? 0.85 : 0.45}
                />
                {(rule.require_password || rule.require_checklist || rule.require_comment) && (
                  <text x={(sx + ex) / 2 - uy * 16} y={(sy + ey) / 2 + ux * 16}
                    textAnchor="middle" fontSize="10" fill="var(--warning, #f59e0b)" fontWeight="700">
                    {[rule.require_password && '🔑', rule.require_checklist && '✅', rule.require_comment && '💬'].filter(Boolean).join('')}
                  </text>
                )}
              </g>
            )
          })}

          {/* State nodes */}
          {nodes.map(n => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={NODE_R}
                fill="var(--surface, #fff)" stroke="var(--primary, #4f6ef7)" strokeWidth={2}
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }} />
              <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize={n.name.length > 10 ? 9 : 11} fontWeight="600"
                fill="var(--text-primary, #1a1a2e)" style={{ userSelect: 'none' }}>
                {n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name}
              </text>
            </g>
          ))}
        </svg>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="28" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="var(--primary, #4f6ef7)" strokeWidth="2" markerEnd="url(#wf-arrow)" /></svg>
            Active transition
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="28" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="#ccc" strokeWidth="1.5" strokeDasharray="4,3" /></svg>
            Inactive rule
          </span>
          <span>🔑 = password required &nbsp; ✅ = checklist &nbsp; 💬 = comment</span>
        </div>
      </div>
    </div>
  )
}

function InlineForm({ placeholder, value, onChange, onSubmit, btnLabel = '+ Add' }) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      <input className="form-control" placeholder={placeholder} value={value} onChange={onChange} required />
      <button className="btn btn-primary" type="submit" style={{ whiteSpace: 'nowrap' }}>{btnLabel}</button>
    </form>
  )
}

export default function AdminWorkflowSection({ contentSection, H, flash }) {
  const depProceedRef = useRef(null)

  const [orgs, setOrgs] = useState([])
  const [workflowStates, setWorkflowStates] = useState([])
  const [sourceTypes, setSourceTypes] = useState([])
  const [srcForm, setSrcForm] = useState({ name: '' })

  const [emailAccounts, setEmailAccounts] = useState([])
  const [selectedSiteDetail, setSelectedSiteDetail] = useState(null)
  const [siteEmailAccounts, setSiteEmailAccounts] = useState([])
  const [siteResponseTemplate, setSiteResponseTemplate] = useState({ subject: '', body_html: '' })
  const [siteRetentionRules, setSiteRetentionRules] = useState([])
  const [siteRetentionForm, setSiteRetentionForm] = useState({ retention_days: 2555, regulation: 'GDPR', auto_delete_enabled: false, notes: '' })
  const [siteAlerts, setSiteAlerts] = useState([])
  const [siteAlertForm, setSiteAlertForm] = useState({ alert_type: 'Case Volume Spike', threshold_value: 10, notify_emails: '' })
  const [siteTabLoading, setSiteTabLoading] = useState(false)

  const [sitesList, setSitesList] = useState([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [sitesSearch, setSitesSearch] = useState('')
  const [showNewSiteForm, setShowNewSiteForm] = useState(false)
  const [newSiteForm, setNewSiteForm] = useState({ org_id: '', name: '', abbreviation: '', country: '', is_primary: false })
  const [newSiteSaving, setNewSiteSaving] = useState(false)
  const [depCheckModal, setDepCheckModal] = useState(null)
  const [depCheckLoading, setDepCheckLoading] = useState(false)
  const [depCheckProceedFn, setDepCheckProceedFn] = useState(null)
  const [wfRules, setWfRules] = useState([])
  const [wfRulesLoading, setWfRulesLoading] = useState(false)
  const [wfRuleForm, setWfRuleForm] = useState({ from_state_id: '', to_state_id: '', require_password: false, require_checklist: false, require_comment: false })
  const [wfRuleMsg, setWfRuleMsg] = useState('')
  const [selectedSite, setSelectedSite] = useState(null)
  const [siteMainTab, setSiteMainTab] = useState('general')
  const [siteEmailPurposes, setSiteEmailPurposes] = useState({ response: [], transmissions: [], correspondence: [], fax: [] })
  const [siteEmailPurposeSaving, setSiteEmailPurposeSaving] = useState(false)
  const [siteGeneralSaving, setSiteGeneralSaving] = useState(false)
  const [siteGeneralForm, setSiteGeneralForm] = useState({ name: '', abbreviation: '', country: '', is_primary: false, is_active: true })

  const [wfTab, setWfTab] = useState('states')
  const [wfActivities, setWfActivities] = useState([])
  const [wfTriggers, setWfTriggers] = useState([])
  const [triggersLoading, setTriggersLoading] = useState(false)
  const [triggerForm, setTriggerForm] = useState({ activity_id: '', trigger_type: 'change_state', target_state_id: '', alert_rule: '', assign_to: '' })
  const [triggerModal, setTriggerModal] = useState(null)
  const [triggerEditTarget, setTriggerEditTarget] = useState(null)

  // ── D2: Impact Preview ─────────────────────────────────────────────────────
  const [impactPanel, setImpactPanel] = useState(null)   // { data, label }
  const [impactLoading, setImpactLoading] = useState(false)

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (contentSection === 'sites') {
      loadAllSites()
      loadOrgs()
      loadEmailAccounts()
    }
    if (contentSection === 'workflow') {
      loadWorkflowStates()
      loadWfActivities()
      loadWfTriggers()
    }
    if (contentSection === 'source-types') loadSourceTypes()
  }, [contentSection])

  useEffect(() => {
    if (contentSection !== 'workflow') return
    if (wfTab === 'rules' || wfTab === 'diagram') loadWfRules()
  }, [wfTab, contentSection])
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    depProceedRef.current = depCheckProceedFn
  }, [depCheckProceedFn])

  async function readJson(res) {
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { error: text || `HTTP ${res.status}` } }
  }

  async function loadOrgs() {
    try {
      const d = await fetch('/api/admin/orgs', { headers: H }).then(r => r.json())
      setOrgs(d.orgs || [])
    } catch {
      setOrgs([])
    }
  }

  async function loadWorkflowStates() {
    try {
      const d = await fetch('/api/admin/workflow-states', { headers: H }).then(r => r.json())
      setWorkflowStates(d.states || [])
    } catch {
      setWorkflowStates([])
    }
  }

  async function loadSourceTypes() {
    try {
      const d = await fetch('/api/admin/source-types', { headers: H }).then(r => r.json())
      setSourceTypes(d.sources || [])
    } catch {
      setSourceTypes([])
    }
  }

  async function loadWfRules() {
    setWfRulesLoading(true)
    try {
      const d = await fetch('/api/admin/workflow-rules', { headers: H }).then(r => r.json())
      setWfRules(d.rules || [])
    } catch {
      setWfRules([])
    } finally {
      setWfRulesLoading(false)
    }
  }

  async function loadSiteTab(tab, siteId) {
    setSiteTabLoading(true)
    try {
      if (tab === 'email') {
        const d = await fetch(`/api/admin/sites/${siteId}/email-accounts`, { headers: H }).then(r => r.json())
        setSiteEmailAccounts(d.emailAccounts || [])
      } else if (tab === 'response') {
        const d = await fetch(`/api/admin/sites/${siteId}/response-template`, { headers: H }).then(r => r.json())
        setSiteResponseTemplate(d.template || { subject: '', body_html: '' })
      } else if (tab === 'retention') {
        const d = await fetch(`/api/admin/sites/${siteId}/data-retention`, { headers: H }).then(r => r.json())
        setSiteRetentionRules(d.rules || [])
      } else if (tab === 'alerts') {
        const d = await fetch(`/api/admin/sites/${siteId}/alerts`, { headers: H }).then(r => r.json())
        setSiteAlerts(d.alerts || [])
      }
    } catch {
      /* silent */
    } finally {
      setSiteTabLoading(false)
    }
  }

  async function saveSiteResponseTemplate(e) {
    e.preventDefault()
    const siteId = selectedSiteDetail?.id || selectedSite?.id
    if (!siteId) return
    const res = await fetch(`/api/admin/sites/${siteId}/response-template`, { method: 'PUT', headers: H, body: JSON.stringify(siteResponseTemplate) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteResponseTemplate(d.template)
    flash('Response template saved.', 'success')
  }

  async function saveSiteRetention(e) {
    e.preventDefault()
    const siteId = selectedSiteDetail?.id || selectedSite?.id
    if (!siteId) return
    const res = await fetch(`/api/admin/sites/${siteId}/data-retention`, { method: 'PUT', headers: H, body: JSON.stringify(siteRetentionForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteRetentionRules(d.rules)
    flash('Data retention rule saved.', 'success')
  }

  async function addSiteAlert(e) {
    e.preventDefault()
    const siteId = selectedSiteDetail?.id || selectedSite?.id
    if (!siteId) return
    const res = await fetch(`/api/admin/sites/${siteId}/alerts`, { method: 'POST', headers: H, body: JSON.stringify(siteAlertForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteAlerts(prev => [...prev, d.alert])
    setSiteAlertForm({ alert_type: 'Case Volume Spike', threshold_value: 10, notify_emails: '' })
    flash('Alert added.', 'success')
  }

  async function deleteSiteAlert(alertId) {
    const siteId = selectedSiteDetail?.id || selectedSite?.id
    if (!siteId) return
    if (!window.confirm('Delete this site alert?')) return
    const res = await fetch(`/api/admin/sites/${siteId}/alerts/${alertId}`, { method: 'DELETE', headers: H })
    if (res.ok) {
      setSiteAlerts(prev => prev.filter(a => a.id !== alertId))
      flash('Deleted.', 'success')
    }
  }

  async function loadAllSites() {
    setSitesLoading(true)
    try {
      const d = await fetch('/api/admin/sites', { headers: H }).then(r => r.json())
      setSitesList(d.sites || [])
    } catch {
      flash('Failed to load sites.', 'error')
    } finally {
      setSitesLoading(false)
    }
  }

  async function createNewSite(e) {
    e.preventDefault()
    setNewSiteSaving(true)
    try {
      const res = await fetch('/api/admin/sites', { method: 'POST', headers: H, body: JSON.stringify(newSiteForm) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Create failed.', 'error')
      flash('Site created.', 'success')
      setShowNewSiteForm(false)
      setNewSiteForm({ org_id: '', name: '', abbreviation: '', country: '', is_primary: false })
      await loadAllSites()
    } catch {
      flash('Save failed.', 'error')
    } finally {
      setNewSiteSaving(false)
    }
  }

  async function selectSiteForConfig(site) {
    setSelectedSite(site)
    setSelectedSiteDetail(site)
    setSiteMainTab('general')
    setSiteGeneralForm({
      name: site.name || '',
      abbreviation: site.abbreviation || '',
      country: site.country || '',
      is_primary: !!site.is_primary,
      is_active: site.is_active !== undefined ? !!site.is_active : true,
    })
    await loadSiteEmailPurposes(site.id)
    loadSiteTab('response', site.id)
    loadSiteTab('retention', site.id)
    loadSiteTab('alerts', site.id)
  }

  async function loadSiteEmailPurposes(siteId) {
    try {
      const d = await fetch(`/api/admin/sites/${siteId}/email-purpose`, { headers: H }).then(r => r.json())
      const map = { response: [], transmissions: [], correspondence: [], fax: [] }
      for (const row of (d.purposes || [])) {
        if (map[row.purpose] !== undefined) map[row.purpose].push(row.email_account_id)
      }
      setSiteEmailPurposes(map)
    } catch {
      /* silent */
    }
  }

  async function saveSiteEmailPurposes() {
    if (!selectedSite) return
    setSiteEmailPurposeSaving(true)
    try {
      const assignments = Object.entries(siteEmailPurposes).map(([purpose, ids]) => ({
        purpose,
        email_account_ids: ids,
      }))
      const res = await fetch(`/api/admin/sites/${selectedSite.id}/email-purpose`, {
        method: 'PUT', headers: H, body: JSON.stringify({ assignments }),
      })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Save failed.', 'error')
      flash('Email account assignments saved.', 'success')
    } catch {
      flash('Save failed.', 'error')
    } finally {
      setSiteEmailPurposeSaving(false)
    }
  }

  async function saveSiteGeneral(e) {
    e.preventDefault()
    if (!selectedSite) return
    setSiteGeneralSaving(true)
    try {
      const res = await fetch(`/api/admin/sites/${selectedSite.id}`, {
        method: 'PUT', headers: H, body: JSON.stringify(siteGeneralForm),
      })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Save failed.', 'error')
      flash('Site updated.', 'success')
      await loadAllSites()
      setSelectedSite(prev => ({ ...prev, ...siteGeneralForm }))
    } catch {
      flash('Save failed.', 'error')
    } finally {
      setSiteGeneralSaving(false)
    }
  }

  function esigConfirm(msg, _entity, _entityId, onConfirm) {
    if (window.confirm(`${msg}?`)) onConfirm()
  }

  async function loadEmailAccounts() {
    try {
      const res = await fetch('/api/admin/email-accounts', { headers: H })
      const d = await readJson(res)
      if (!res.ok) {
        setEmailAccounts([])
        return
      }
      setEmailAccounts(d.accounts || [])
    } catch {
      setEmailAccounts([])
    }
  }

  async function createSrc(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/source-types', { method: 'POST', headers: H, body: JSON.stringify(srcForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSourceTypes(prev => [...prev, d])
    setSrcForm({ name: '' })
    flash('Source type created.')
  }

  async function toggleSrc(src) {
    esigConfirm(`${src.is_active ? 'Deactivate' : 'Activate'} source type "${src.name}"`, 'source_type', src.id, async () => {
      await fetch(`/api/admin/source-types/${src.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: src.name, is_active: !src.is_active }) })
      setSourceTypes(prev => prev.map(s => s.id === src.id ? { ...s, is_active: s.is_active ? 0 : 1 } : s))
      flash('Status updated.')
    })
  }

  async function loadWfActivities() {
    try {
      const res = await fetch('/api/admin/workflow-activities', { headers: H })
      const d = await res.json()
      setWfActivities(d.activities || [])
    } catch {
      /* silent */
    }
  }

  async function loadWfTriggers() {
    setTriggersLoading(true)
    try {
      const res = await fetch('/api/admin/workflow-activity-triggers', { headers: H })
      const d = await res.json()
      setWfTriggers(d.triggers || [])
    } catch {
      /* silent */
    } finally {
      setTriggersLoading(false)
    }
  }

  async function saveTrigger(e) {
    e.preventDefault()
    const isEdit = triggerModal === 'edit'
    const url = isEdit ? `/api/admin/workflow-activity-triggers/${triggerEditTarget.id}` : '/api/admin/workflow-activity-triggers'
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(triggerForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadWfTriggers()
    setTriggerModal(null)
    flash(isEdit ? 'Trigger updated.' : 'Trigger created.')
  }

  async function deleteTrigger(t) {
    if (!window.confirm(`Delete trigger for "${t.activity_name}" → ${t.trigger_type}?`)) return
    await fetch(`/api/admin/workflow-activity-triggers/${t.id}`, { method: 'DELETE', headers: H })
    await loadWfTriggers()
    flash('Trigger deleted.')
  }

  async function toggleWfActivity(act) {
    await fetch(`/api/admin/workflow-activities/${act.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: act.name, description: act.description, is_active: act.is_active ? 0 : 1 })
    })
    await loadWfActivities()
    flash('Activity updated.')
  }

  // ── D2: fetch blast-radius from backend ──────────────────────────────────
  async function fetchImpact(changeType, entityId, label) {
    setImpactLoading(true)
    setImpactPanel(null)
    try {
      const res = await fetch('/api/admin/impact-preview', {
        method: 'POST', headers: H,
        body: JSON.stringify({ change_type: changeType, entity_id: entityId }),
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Impact preview failed.', 'error'); return }
      setImpactPanel({ data, label })
    } catch {
      flash('Could not load impact preview.', 'error')
    } finally {
      setImpactLoading(false)
    }
  }

  async function runDepCheck(row, depEndpoint, proceedFn) {
    setDepCheckLoading(true)
    try {
      const depRes = await fetch(depEndpoint, { headers: H })
      const depData = await depRes.json()
      const deps = depData.dependencies || []
      if (deps.length > 0 && depData.total > 0) {
        setDepCheckModal({ row, deps })
        setDepCheckProceedFn(() => async () => {
          setDepCheckModal(null)
          await proceedFn()
        })
        return false
      }
      return true
    } catch {
      return true
    } finally {
      setDepCheckLoading(false)
    }
  }

  async function confirmDepCheck() {
    if (depProceedRef.current) await depProceedRef.current()
  }

  switch (contentSection) {
      case 'sites': {
        const filteredSites = sitesList.filter(s =>
          !sitesSearch ||
          s.name?.toLowerCase().includes(sitesSearch.toLowerCase()) ||
          (s.abbreviation || '').toLowerCase().includes(sitesSearch.toLowerCase())
        )
        const SITE_TABS = [
          { key: 'general',      label: 'General' },
          { key: 'email',        label: 'Email Accounts' },
          { key: 'response',     label: 'Response' },
          { key: 'rtf',          label: 'Right To Forget' },
          { key: 'alerts',       label: 'Alerts Configuration' },
        ]
        const EMAIL_PURPOSES = [
          { key: 'response',      label: 'Response Emails',     required: true  },
          { key: 'transmissions', label: 'Transmissions',        required: true  },
          { key: 'correspondence',label: 'Correspondence',       required: true  },
          { key: 'fax',           label: 'Fax',                 required: false },
        ]
        return (
          <>
            {/* ── Toolbar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }} />
              <input
                className="form-control"
                placeholder="Search by site name or abbreviation…"
                value={sitesSearch}
                onChange={e => setSitesSearch(e.target.value)}
                style={{ maxWidth: 260, fontSize: 13 }}
              />
              <button
                className="btn btn-primary"
                style={{ fontSize: 13 }}
                onClick={() => { setShowNewSiteForm(v => !v); setSelectedSite(null) }}
              >
                + Add New
              </button>
            </div>

            {/* ── New Site Inline Form ── */}
            {showNewSiteForm && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><h3>New Site</h3></div>
                <div className="card-body">
                  <form onSubmit={createNewSite}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
                        <label>Organisation *</label>
                        <select className="form-control" required value={newSiteForm.org_id}
                          onChange={e => setNewSiteForm(f => ({ ...f, org_id: e.target.value }))}>
                          <option value="">— Select Org —</option>
                          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
                        <label>Site Name *</label>
                        <input className="form-control" required placeholder="e.g. North America"
                          value={newSiteForm.name}
                          onChange={e => setNewSiteForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0, minWidth: 120 }}>
                        <label>Abbreviation</label>
                        <input className="form-control" placeholder="e.g. NA"
                          value={newSiteForm.abbreviation}
                          onChange={e => setNewSiteForm(f => ({ ...f, abbreviation: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
                        <label>Country</label>
                        <input className="form-control" placeholder="e.g. United States"
                          value={newSiteForm.country}
                          onChange={e => setNewSiteForm(f => ({ ...f, country: e.target.value }))} />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 2 }}>
                        <input type="checkbox" checked={newSiteForm.is_primary}
                          onChange={e => setNewSiteForm(f => ({ ...f, is_primary: e.target.checked }))} />
                        Primary Site
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }} disabled={newSiteSaving}>
                          {newSiteSaving ? 'Saving…' : 'Save Site'}
                        </button>
                        <button type="button" className="btn btn-outline" style={{ fontSize: 13 }}
                          onClick={() => setShowNewSiteForm(false)}>Cancel</button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ── Sites List ── */}
            <div className="card" style={{ marginBottom: selectedSite ? 16 : 0 }}>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Site Name</th>
                      <th>Organisation</th>
                      <th>Abbreviation</th>
                      <th>Country</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sitesLoading && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Loading…</td></tr>
                    )}
                    {!sitesLoading && filteredSites.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                        {sitesSearch ? 'No sites match your search.' : 'No sites configured yet. Click + Add New to create one.'}
                      </td></tr>
                    )}
                    {filteredSites.map(s => (
                      <tr key={s.id}
                        style={{ cursor: 'pointer', background: selectedSite?.id === s.id ? 'var(--primary-light, #e8f0fe)' : undefined }}
                        onClick={() => {
                          if (selectedSite?.id === s.id) { setSelectedSite(null); return }
                          selectSiteForConfig(s)
                          setShowNewSiteForm(false)
                        }}
                      >
                        <td>
                          <span style={{ fontWeight: 600, color: selectedSite?.id === s.id ? 'var(--primary)' : undefined }}>
                            {s.name}
                          </span>
                          {s.is_primary ? <span className="badge badge-new" style={{ marginLeft: 6, fontSize: 10 }}>Primary</span> : null}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{s.org_name || '—'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{s.abbreviation || '—'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{s.country || '—'}</td>
                        <td><StatusPill active={s.is_active} /></td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, color: 'var(--primary)' }}>
                            {selectedSite?.id === s.id ? '▲ Close' : 'Configure ▼'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Site Configuration Panel ── */}
            {selectedSite && (
              <div className="card" style={{ border: '1px solid var(--primary)' }}>
                {/* Panel header */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{selectedSite.name}</div>
                  {selectedSite.abbreviation && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>({selectedSite.abbreviation})</span>}
                  {selectedSite.org_name && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {selectedSite.org_name}</span>}
                  <button className="btn btn-outline" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px' }}
                    onClick={() => setSelectedSite(null)}>✕ Close</button>
                </div>

                {/* 5 Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {SITE_TABS.map(tab => (
                    <button key={tab.key} type="button"
                      style={{
                        padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13,
                        fontWeight: siteMainTab === tab.key ? 700 : 400,
                        color: siteMainTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: siteMainTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                        transition: 'all 0.15s',
                      }}
                      onClick={() => {
                        setSiteMainTab(tab.key)
                        if (tab.key === 'email') loadSiteEmailPurposes(selectedSite.id)
                        else if (tab.key === 'response') loadSiteTab('response', selectedSite.id)
                        else if (tab.key === 'rtf') loadSiteTab('retention', selectedSite.id)
                        else if (tab.key === 'alerts') loadSiteTab('alerts', selectedSite.id)
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div style={{ padding: 24 }}>

                  {/* ── General Tab ── */}
                  {siteMainTab === 'general' && (
                    <form onSubmit={saveSiteGeneral}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Site Name *</label>
                          <input className="form-control" required value={siteGeneralForm.name}
                            onChange={e => setSiteGeneralForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Abbreviation</label>
                          <input className="form-control" value={siteGeneralForm.abbreviation}
                            onChange={e => setSiteGeneralForm(f => ({ ...f, abbreviation: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Country</label>
                          <input className="form-control" value={siteGeneralForm.country}
                            onChange={e => setSiteGeneralForm(f => ({ ...f, country: e.target.value }))} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Status</label>
                          <select className="form-control" value={siteGeneralForm.is_active ? 'active' : 'inactive'}
                            onChange={e => setSiteGeneralForm(f => ({ ...f, is_active: e.target.value === 'active' }))}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 20, cursor: 'pointer', width: 'fit-content' }}>
                        <input type="checkbox" checked={siteGeneralForm.is_primary}
                          onChange={e => setSiteGeneralForm(f => ({ ...f, is_primary: e.target.checked }))} />
                        Mark as Primary Site for this Organisation
                      </label>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" className="btn btn-primary" disabled={siteGeneralSaving}>
                          {siteGeneralSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* ── Email Accounts Tab ── */}
                  {siteMainTab === 'email' && (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                        Assign email accounts to each communication purpose for this site. Select from email accounts configured in Email Accounts setup.
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 200 }}>Purpose</th>
                            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 100 }}>Required</th>
                            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email Accounts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {EMAIL_PURPOSES.map((p, i) => (
                            <tr key={p.key} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                              <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</td>
                              <td style={{ padding: '12px 16px' }}>
                                {p.required
                                  ? <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>Mandatory</span>
                                  : <span style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>Optional</span>
                                }
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                {emailAccounts.length === 0
                                  ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No email accounts found. Configure them in Email Accounts setup first.</span>
                                  : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                      {emailAccounts.map(ea => {
                                        const checked = (siteEmailPurposes[p.key] || []).includes(ea.id)
                                        return (
                                          <label key={ea.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                                            padding: '5px 10px', border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                                            borderRadius: 6, cursor: 'pointer',
                                            background: checked ? 'var(--primary-light, #e8f0fe)' : 'var(--surface)',
                                            color: checked ? 'var(--primary)' : 'var(--text-primary)',
                                            userSelect: 'none',
                                          }}>
                                            <input type="checkbox" checked={checked} style={{ display: 'none' }}
                                              onChange={ev => {
                                                setSiteEmailPurposes(prev => ({
                                                  ...prev,
                                                  [p.key]: ev.target.checked
                                                    ? [...(prev[p.key] || []), ea.id]
                                                    : (prev[p.key] || []).filter(id => id !== ea.id)
                                                }))
                                              }} />
                                            <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, background: checked ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                              {checked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                                            </span>
                                            <span>{ea.account_name || ea.mailbox_email}</span>
                                            {ea.mailbox_email && ea.account_name && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({ea.mailbox_email})</span>}
                                          </label>
                                        )
                                      })}
                                    </div>
                                  )
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-primary" onClick={saveSiteEmailPurposes} disabled={siteEmailPurposeSaving}>
                          {siteEmailPurposeSaving ? 'Saving…' : 'Save Email Assignments'}
                        </button>
                      </div>
                    </>
                  )}

                  {/* ── Response Tab ── */}
                  {siteMainTab === 'response' && (
                    <form onSubmit={saveSiteResponseTemplate}>
                      {siteTabLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                      {!siteTabLoading && (
                        <>
                          <div className="form-group">
                            <label>Email Subject</label>
                            <input className="form-control" placeholder="e.g. Thank you for your inquiry — {{case_number}}"
                              value={siteResponseTemplate?.subject || ''}
                              onChange={e => setSiteResponseTemplate(t => ({ ...t, subject: e.target.value }))} />
                          </div>
                          <div className="form-group">
                            <label>Email Body <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(HTML supported)</span></label>
                            <textarea className="form-control" rows={8}
                              placeholder="Your inquiry has been received. Case number: {{case_number}}"
                              value={siteResponseTemplate?.body_html || ''}
                              onChange={e => setSiteResponseTemplate(t => ({ ...t, body_html: e.target.value }))} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary">Save Template</button>
                          </div>
                        </>
                      )}
                    </form>
                  )}

                  {/* ── Right To Forget Tab ── */}
                  {siteMainTab === 'rtf' && (
                    <>
                      {siteTabLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                      {!siteTabLoading && (
                        <>
                          <form onSubmit={saveSiteRetention} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label>Regulation</label>
                              <select className="form-control" value={siteRetentionForm.regulation}
                                onChange={e => setSiteRetentionForm(f => ({ ...f, regulation: e.target.value }))}>
                                <option value="GDPR">GDPR</option>
                                <option value="HIPAA">HIPAA</option>
                                <option value="LOCAL">Local</option>
                              </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label>Retention (days)</label>
                              <input className="form-control" type="number" min={30}
                                value={siteRetentionForm.retention_days}
                                onChange={e => setSiteRetentionForm(f => ({ ...f, retention_days: parseInt(e.target.value, 10) }))}
                                style={{ maxWidth: 120 }} />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 2 }}>
                              <input type="checkbox" checked={siteRetentionForm.auto_delete_enabled}
                                onChange={e => setSiteRetentionForm(f => ({ ...f, auto_delete_enabled: e.target.checked }))} />
                              Auto-Delete Enabled
                            </label>
                            <button type="submit" className="btn btn-primary">Save Rule</button>
                          </form>
                          {siteRetentionRules.length === 0
                            ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No retention rules configured for this site.</div>
                            : (
                              <table className="admin-table">
                                <thead><tr><th>Regulation</th><th>Retention (days)</th><th>Auto-Delete</th></tr></thead>
                                <tbody>
                                  {siteRetentionRules.map(r => (
                                    <tr key={r.id}>
                                      <td style={{ fontWeight: 600 }}>{r.regulation}</td>
                                      <td>{r.retention_days}</td>
                                      <td>{r.auto_delete_enabled
                                        ? <span style={{ background: '#fde8ef', color: '#c0392b', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>ON</span>
                                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Off</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                          }
                        </>
                      )}
                    </>
                  )}

                  {/* ── Alerts Configuration Tab ── */}
                  {siteMainTab === 'alerts' && (
                    <>
                      {siteTabLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                      {!siteTabLoading && (
                        <>
                          <form onSubmit={addSiteAlert} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label>Alert Type</label>
                              <select className="form-control" value={siteAlertForm.alert_type}
                                onChange={e => setSiteAlertForm(f => ({ ...f, alert_type: e.target.value }))}>
                                <option>Case Volume Spike</option>
                                <option>SLA Breach</option>
                                <option>AE Serious Flag</option>
                                <option>Overdue Cases</option>
                              </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label>Threshold</label>
                              <input className="form-control" type="number" min={1}
                                value={siteAlertForm.threshold_value}
                                onChange={e => setSiteAlertForm(f => ({ ...f, threshold_value: parseInt(e.target.value, 10) }))}
                                style={{ maxWidth: 100 }} />
                            </div>
                            <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
                              <label>Notify Emails</label>
                              <input className="form-control" placeholder="a@b.com, c@d.com"
                                value={siteAlertForm.notify_emails}
                                onChange={e => setSiteAlertForm(f => ({ ...f, notify_emails: e.target.value }))} />
                            </div>
                            <button type="submit" className="btn btn-accent">+ Add Alert</button>
                          </form>
                          {siteAlerts.length === 0
                            ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No alerts configured for this site.</div>
                            : (
                              <table className="admin-table">
                                <thead><tr><th>Alert Type</th><th>Threshold</th><th>Notify Emails</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                  {siteAlerts.map(a => (
                                    <tr key={a.id}>
                                      <td style={{ fontWeight: 600 }}>{a.alert_type}</td>
                                      <td>{a.threshold_value}</td>
                                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.notify_emails || '—'}</td>
                                      <td><StatusPill active={a.is_active} /></td>
                                      <td>
                                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                          onClick={() => deleteSiteAlert(a.id)}>Remove</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                          }
                        </>
                      )}
                    </>
                  )}

                </div>
              </div>
            )}
          </>
        )
      }
      case 'workflow':
        return (
          <>
            <SectionHeader title="Workflow Setup" desc="View case workflow states and activity triggers. Changes are managed by SuperAdmin." />
            <div style={{ padding: '8px 14px', marginBottom: 12, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, fontSize: 12, color: '#7a5c00' }}>
              Workflow configuration is controlled by SuperAdmin only. Contact your platform admin to add or modify workflow states and triggers.
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[{ key: 'states', label: 'Workflow States' }, { key: 'triggers', label: 'Activity Triggers' }, { key: 'rules', label: 'Transition Rules' }, { key: 'diagram', label: '⬡ State Diagram' }].map(t => (
                <button key={t.key} onClick={() => setWfTab(t.key)}
                  style={{ padding: '10px 20px', border: 'none', borderBottom: wfTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: wfTab === t.key ? 700 : 400, color: wfTab === t.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Workflow States ── */}
            {wfTab === 'states' && (
              <>
                <div className="card">
                  <div className="card-header"><h3>Workflow States ({workflowStates.length})</h3></div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>State Name</th><th>Status</th><th>Impact</th></tr></thead>
                      <tbody>
                        {workflowStates.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No states configured.</td></tr>}
                        {workflowStates.map(w => (
                          <tr key={w.id}>
                            <td>{w.name}</td>
                            <td><StatusPill active={w.is_active} /></td>
                            <td>
                              <button
                                className="btn btn-outline"
                                style={{ fontSize: 11, padding: '3px 10px', color: '#b45309', borderColor: '#d97706' }}
                                disabled={impactLoading}
                                onClick={() => fetchImpact('workflow_rule', w.id, `State: ${w.name}`)}
                              >
                                {impactLoading ? '…' : '⚠ Preview Impact'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── Activity Triggers ── */}
            {wfTab === 'triggers' && (
              <>
                {/* Activities legend */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Case Activities ({wfActivities.length})</h3>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>Activity</th><th>Description</th><th>Status</th><th>Action</th></tr></thead>
                      <tbody>
                        {wfActivities.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No activities defined.</td></tr>}
                        {wfActivities.map(a => (
                          <tr key={a.id}>
                            <td><strong>{a.name}</strong></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{a.description || '—'}</td>
                            <td><StatusPill active={a.is_active} /></td>
                            <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleWfActivity(a)}>{a.is_active ? 'Deactivate' : 'Activate'}</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Trigger rules */}
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Trigger Rules ({wfTriggers.length})</h3>
                    <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setTriggerForm({ activity_id: '', trigger_type: 'change_state', target_state_id: '', alert_rule: '', assign_to: '' }); setTriggerEditTarget(null); setTriggerModal('add') }}>+ Add Trigger</button>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>If Activity</th><th>Then</th><th>Target State / Rule</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {triggersLoading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>}
                        {!triggersLoading && wfTriggers.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No trigger rules yet.</td></tr>}
                        {!triggersLoading && wfTriggers.map(t => (
                          <tr key={t.id}>
                            <td><strong>{t.activity_name || '—'}</strong></td>
                            <td><span className="badge badge-new" style={{ fontSize: 11 }}>{t.trigger_type === 'change_state' ? 'Change State' : t.trigger_type === 'send_alert' ? 'Send Alert' : 'Assign To'}</span></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.target_state_name || t.alert_rule || t.assign_to || '—'}</td>
                            <td><StatusPill active={t.is_active} /></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => {
                                  setTriggerEditTarget(t)
                                  setTriggerForm({ activity_id: t.activity_id, trigger_type: t.trigger_type, target_state_id: t.target_state_id || '', alert_rule: t.alert_rule || '', assign_to: t.assign_to || '' })
                                  setTriggerModal('edit')
                                }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteTrigger(t)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Trigger Add/Edit Modal */}
                {triggerModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{triggerModal === 'add' ? 'Add Trigger Rule' : 'Edit Trigger Rule'}</h3>
                        <button onClick={() => setTriggerModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveTrigger}>
                        <div style={{ display: 'grid', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>If Activity *</label>
                            <select className="form-control" value={triggerForm.activity_id} onChange={e => setTriggerForm(f => ({ ...f, activity_id: e.target.value }))} required>
                              <option value="">— Select activity —</option>
                              {wfActivities.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Then *</label>
                            <select className="form-control" value={triggerForm.trigger_type} onChange={e => setTriggerForm(f => ({ ...f, trigger_type: e.target.value }))}>
                              <option value="change_state">Change State</option>
                              <option value="send_alert">Send Alert</option>
                              <option value="assign_to">Assign To</option>
                            </select>
                          </div>
                          {triggerForm.trigger_type === 'change_state' && (
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Target State</label>
                              <select className="form-control" value={triggerForm.target_state_id} onChange={e => setTriggerForm(f => ({ ...f, target_state_id: e.target.value }))}>
                                <option value="">— Select state —</option>
                                {workflowStates.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                          )}
                          {triggerForm.trigger_type === 'send_alert' && (
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Alert Rule</label>
                              <input className="form-control" placeholder="e.g. Notify compliance team" value={triggerForm.alert_rule} onChange={e => setTriggerForm(f => ({ ...f, alert_rule: e.target.value }))} />
                            </div>
                          )}
                          {triggerForm.trigger_type === 'assign_to' && (
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Assign To</label>
                              <input className="form-control" placeholder="e.g. QA Reviewer" value={triggerForm.assign_to} onChange={e => setTriggerForm(f => ({ ...f, assign_to: e.target.value }))} />
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setTriggerModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Transition Rules ── */}
            {wfTab === 'rules' && (
              <>
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header"><h3>Add Transition Rule</h3></div>
                  <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 520, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>From State *</label>
                        <select className="form-control" value={wfRuleForm.from_state_id} onChange={e => setWfRuleForm(f => ({ ...f, from_state_id: e.target.value }))}>
                          <option value="">— select —</option>
                          {workflowStates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>To State *</label>
                        <select className="form-control" value={wfRuleForm.to_state_id} onChange={e => setWfRuleForm(f => ({ ...f, to_state_id: e.target.value }))}>
                          <option value="">— select —</option>
                          {workflowStates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 20, marginBottom: 14, fontSize: 13 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={wfRuleForm.require_password} onChange={e => setWfRuleForm(f => ({ ...f, require_password: e.target.checked }))} />
                        Require Password
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={wfRuleForm.require_checklist} onChange={e => setWfRuleForm(f => ({ ...f, require_checklist: e.target.checked }))} />
                        Require Checklist
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={wfRuleForm.require_comment} onChange={e => setWfRuleForm(f => ({ ...f, require_comment: e.target.checked }))} />
                        Require Comment
                      </label>
                    </div>
                    {wfRuleMsg && <p style={{ marginBottom: 10, fontSize: 13, color: wfRuleMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{wfRuleMsg}</p>}
                    <button className="btn btn-primary" disabled={!wfRuleForm.from_state_id || !wfRuleForm.to_state_id} onClick={async () => {
                      setWfRuleMsg('')
                      const r = await fetch('/api/admin/workflow-rules', {
                        method: 'POST', headers: H,
                        body: JSON.stringify({
                          from_state_id: parseInt(wfRuleForm.from_state_id, 10),
                          to_state_id: parseInt(wfRuleForm.to_state_id, 10),
                          require_password: wfRuleForm.require_password,
                          require_checklist: wfRuleForm.require_checklist,
                          require_comment: wfRuleForm.require_comment,
                        }),
                      })
                      const d = await r.json()
                      if (r.ok) {
                        setWfRuleMsg('✓ Rule added.')
                        setWfRuleForm({ from_state_id: '', to_state_id: '', require_password: false, require_checklist: false, require_comment: false })
                        const list = await fetch('/api/admin/workflow-rules', { headers: H }).then(x => x.json()).catch(() => ({ rules: [] }))
                        setWfRules(list.rules || [])
                      } else {
                        setWfRuleMsg(d.error || 'Failed to add rule.')
                      }
                    }}>Add Rule</button>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3>Transition Rules ({wfRules.length})</h3></div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {wfRulesLoading ? (
                      <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
                    ) : (
                      <table className="admin-table">
                        <thead>
                          <tr><th>From State</th><th>To State</th><th>Req Password</th><th>Req Checklist</th><th>Req Comment</th><th>Status</th><th>Impact</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                          {wfRules.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No transition rules defined.</td></tr>}
                          {wfRules.map(rule => (
                            <tr key={rule.id}>
                              <td><strong>{rule.from_state_name || rule.from_state_id}</strong></td>
                              <td><strong>{rule.to_state_name || rule.to_state_id}</strong></td>
                              <td style={{ textAlign: 'center' }}>{rule.require_password ? '✅' : '—'}</td>
                              <td style={{ textAlign: 'center' }}>{rule.require_checklist ? '✅' : '—'}</td>
                              <td style={{ textAlign: 'center' }}>{rule.require_comment ? '✅' : '—'}</td>
                              <td><StatusPill active={rule.is_active} /></td>
                              <td>
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: 11, padding: '3px 10px', color: '#b45309', borderColor: '#d97706' }}
                                  disabled={impactLoading}
                                  onClick={() => fetchImpact('workflow_rule', rule.from_state_id, `Rule: ${rule.from_state_name || rule.from_state_id} → ${rule.to_state_name || rule.to_state_id}`)}
                                >
                                  {impactLoading ? '…' : '⚠ Preview Impact'}
                                </button>
                              </td>
                              <td>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={async () => {
                                  if (!window.confirm('Delete this transition rule?')) return
                                  const r = await fetch(`/api/admin/workflow-rules/${rule.id}`, { method: 'DELETE', headers: H })
                                  if (r.ok) setWfRules(prev => prev.filter(x => x.id !== rule.id))
                                }}>🗑 Delete</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── AC-E2: State Transition Diagram ── */}
            {wfTab === 'diagram' && (
              <WorkflowDiagram states={workflowStates} rules={wfRules} />
            )}

            {/* ── D2: Impact Preview Modal ── */}
            <ImpactPreviewModal panel={impactPanel} onClose={() => setImpactPanel(null)} />
          </>
        )

      case 'source-types':
        return (
          <>
            <SectionHeader title="Source Types" desc="Define how inquiries arrive (Email, Phone, Fax, CP Portal etc.)." />
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Add Source Type</h3></div>
              <div className="card-body">
                <InlineForm placeholder="e.g. Email, Phone, Fax, CP Portal" value={srcForm.name}
                  onChange={e => setSrcForm({ name: e.target.value })} onSubmit={createSrc} />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Source Types ({sourceTypes.length})</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>Source Name</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {sourceTypes.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No source types yet.</td></tr>}
                    {sourceTypes.map(s => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td><StatusPill active={s.is_active} /></td>
                        <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleSrc(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

    default:
      return null
  }
}

// ── D2: Shared Impact Preview Modal ──────────────────────────────────────────
export function ImpactPreviewModal({ panel, onClose }) {
  if (!panel) return null
  const { data, label } = panel
  const riskColor = data.risk_level === 'high' ? '#dc2626' : data.risk_level === 'medium' ? '#d97706' : '#16a34a'
  const riskBg    = data.risk_level === 'high' ? '#fee2e2' : data.risk_level === 'medium' ? '#fef3c7' : '#dcfce7'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.28)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>⚠ Master-Data Impact Preview</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>

          {/* Risk + affected cases */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{data.affected_cases ?? 0}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Affected Cases</div>
            </div>
            {data.referencing_rules != null && (
              <div style={{ flex: 1, padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{data.referencing_rules}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Referencing Rules</div>
              </div>
            )}
            {data.affected_orgs != null && (
              <div style={{ flex: 1, padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{data.affected_orgs}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Affected Orgs</div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 100 }}>
              <span style={{ padding: '6px 16px', borderRadius: 20, background: riskBg, color: riskColor, fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {data.risk_level} risk
              </span>
            </div>
          </div>

          {/* Breakdown by case type */}
          {data.breakdown_by_case_type && Object.keys(data.breakdown_by_case_type).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Breakdown by Case Type</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(data.breakdown_by_case_type).map(([type, count]) => (
                  <div key={type} style={{ padding: '6px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                    <strong>{type}</strong> <span style={{ color: 'var(--text-muted)' }}>({count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AE / PC / Dynamic breakdown for taxonomy */}
          {(data.affected_ae_records != null || data.affected_pc_records != null || data.affected_dynamic_values != null) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Record Breakdown</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {data.affected_ae_records != null && <div style={{ padding: '6px 14px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13 }}><strong>AE Records</strong>: {data.affected_ae_records}</div>}
                {data.affected_pc_records != null && <div style={{ padding: '6px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13 }}><strong>PC Records</strong>: {data.affected_pc_records}</div>}
                {data.affected_dynamic_values != null && <div style={{ padding: '6px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13 }}><strong>Dynamic Values</strong>: {data.affected_dynamic_values}</div>}
              </div>
            </div>
          )}

          {/* Warnings */}
          {(data.warnings || []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {data.warnings.map((w, i) => (
                <div key={i} style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#78350f', marginBottom: 6, lineHeight: 1.5 }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {data.affected_cases === 0 && (data.warnings || []).length === 0 && (
            <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 13, color: '#15803d' }}>
              ✅ No existing records are affected by this change. Safe to proceed.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 24px', background: 'var(--primary, #4f6ef7)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
  )
}
