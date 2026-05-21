import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { SectionHeader, StatusPill } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function WorkflowDiagram({ states, rules }) {
  const activeStates = (states || []).filter(s => s.is_active)
  const NODE_R = 36
  const W = 760
  const H = 480
  const PADDING = 80

  const nodes = useMemo(() => {
    if (!activeStates.length) return []
    const cx = W / 2
    const cy = H / 2
    const r = Math.min(W, H) / 2 - PADDING
    return activeStates.map((s, i) => {
      const angle = (2 * Math.PI * i) / activeStates.length - Math.PI / 2
      return { ...s, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
    })
  }, [activeStates])

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
          {(rules || []).map(rule => {
            const from = nodeMap[rule.from_state_id]
            const to = nodeMap[rule.to_state_id]
            if (!from || !to) return null
            const dx = to.x - from.x
            const dy = to.y - from.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist === 0) return null
            const ux = dx / dist; const uy = dy / dist
            const sx = from.x + ux * NODE_R; const sy = from.y + uy * NODE_R
            const ex = to.x - ux * (NODE_R + 2); const ey = to.y - uy * (NODE_R + 2)
            const midX = (sx + ex) / 2 - uy * 24; const midY = (sy + ey) / 2 + ux * 24
            const active = rule.is_active
            return (
              <g key={rule.id}>
                <path d={`M ${sx} ${sy} Q ${midX} ${midY} ${ex} ${ey}`} fill="none" stroke={active ? 'var(--primary, #4f6ef7)' : '#ccc'} strokeWidth={active ? 2 : 1.5} strokeDasharray={active ? undefined : '5,4'} markerEnd={active ? 'url(#wf-arrow)' : 'url(#wf-arrow-gray)'} opacity={active ? 0.85 : 0.45} />
                {(rule.require_password || rule.require_checklist || rule.require_comment) && (
                  <text x={(sx + ex) / 2 - uy * 16} y={(sy + ey) / 2 + ux * 16} textAnchor="middle" fontSize="10" fill="var(--warning, #f59e0b)" fontWeight="700">
                    {[rule.require_password && '🔑', rule.require_checklist && '✅', rule.require_comment && '💬'].filter(Boolean).join('')}
                  </text>
                )}
              </g>
            )
          })}
          {nodes.map(n => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={NODE_R} fill="var(--surface, #fff)" stroke="var(--primary, #4f6ef7)" strokeWidth={2} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }} />
              <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={n.name.length > 10 ? 9 : 11} fontWeight="600" fill="var(--text-primary, #1a1a2e)" style={{ userSelect: 'none' }}>
                {n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name}
              </text>
            </g>
          ))}
        </svg>
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

export function ImpactPreviewModal({ panel, onClose }) {
  if (!panel) return null
  const { data, label } = panel
  const riskColor = data.risk_level === 'high' ? '#dc2626' : data.risk_level === 'medium' ? '#d97706' : '#16a34a'
  const riskBg    = data.risk_level === 'high' ? '#fee2e2' : data.risk_level === 'medium' ? '#fef3c7' : '#dcfce7'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.28)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>⚠ Master-Data Impact Preview</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
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
              <span style={{ padding: '6px 16px', borderRadius: 20, background: riskBg, color: riskColor, fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>{data.risk_level} risk</span>
            </div>
          </div>
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
          {(data.warnings || []).length > 0 && data.warnings.map((w, i) => (
            <div key={i} style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#78350f', marginBottom: 6, lineHeight: 1.5 }}>⚠ {w}</div>
          ))}
          {data.affected_cases === 0 && (data.warnings || []).length === 0 && (
            <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 13, color: '#15803d' }}>
              ✅ No existing records are affected by this change. Safe to proceed.
            </div>
          )}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 24px', background: 'var(--primary, #4f6ef7)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Close Preview</button>
        </div>
      </div>
    </div>
  )
}

export default function AdminWorkflowPanel({ H, flash }) {
  const depProceedRef = useRef(null)

  const [workflowStates, setWorkflowStates] = useState([])
  const [wfRules, setWfRules] = useState([])
  const [wfRulesLoading, setWfRulesLoading] = useState(false)
  const [wfRuleForm, setWfRuleForm] = useState({ from_state_id: '', to_state_id: '', require_password: false, require_checklist: false, require_comment: false })
  const [wfRuleMsg, setWfRuleMsg] = useState('')
  const [wfTab, setWfTab] = useState('states')
  const [wfActivities, setWfActivities] = useState([])
  const [wfTriggers, setWfTriggers] = useState([])
  const [triggersLoading, setTriggersLoading] = useState(false)
  const [triggerForm, setTriggerForm] = useState({ activity_id: '', trigger_type: 'change_state', target_state_id: '', alert_rule: '', assign_to: '' })
  const [triggerModal, setTriggerModal] = useState(null)
  const [triggerEditTarget, setTriggerEditTarget] = useState(null)
  const [impactPanel, setImpactPanel] = useState(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [depCheckModal, setDepCheckModal] = useState(null)
  const [depCheckProceedFn, setDepCheckProceedFn] = useState(null)

  const loadWorkflowStates = useCallback(async () => {
    try { const d = await httpFetch('/api/admin/workflow-states', { headers: H }).then(r => r.json()); setWorkflowStates(d.states || []) }
    catch { setWorkflowStates([]) }
  }, [H])

  const loadWfRules = useCallback(async () => {
    setWfRulesLoading(true)
    try { const d = await httpFetch('/api/admin/workflow-rules', { headers: H }).then(r => r.json()); setWfRules(d.rules || []) }
    catch { setWfRules([]) } finally { setWfRulesLoading(false) }
  }, [H])

  const loadWfActivities = useCallback(async () => {
    try { const d = await httpFetch('/api/admin/workflow-activities', { headers: H }).then(r => r.json()); setWfActivities(d.activities || []) }
    catch { /* silent */ }
  }, [H])

  const loadWfTriggers = useCallback(async () => {
    setTriggersLoading(true)
    try { const d = await httpFetch('/api/admin/workflow-activity-triggers', { headers: H }).then(r => r.json()); setWfTriggers(d.triggers || []) }
    catch { /* silent */ } finally { setTriggersLoading(false) }
  }, [H])

  useEffect(() => {
    loadWorkflowStates()
    loadWfActivities()
    loadWfTriggers()
  }, [loadWfActivities, loadWfTriggers, loadWorkflowStates])

  useEffect(() => {
    if (wfTab === 'rules' || wfTab === 'diagram') loadWfRules()
  }, [loadWfRules, wfTab])

  useEffect(() => { depProceedRef.current = depCheckProceedFn }, [depCheckProceedFn])

  async function saveTrigger(e) {
    e.preventDefault()
    const isEdit = triggerModal === 'edit'
    const url = isEdit ? `/api/admin/workflow-activity-triggers/${triggerEditTarget.id}` : '/api/admin/workflow-activity-triggers'
    const res = await httpFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(triggerForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadWfTriggers()
    setTriggerModal(null)
    flash(isEdit ? 'Trigger updated.' : 'Trigger created.')
  }

  async function deleteTrigger(t) {
    if (!await confirm(`Delete trigger for "${t.activity_name}" → ${t.trigger_type}?`)) return
    await httpFetch(`/api/admin/workflow-activity-triggers/${t.id}`, { method: 'DELETE', headers: H })
    await loadWfTriggers()
    flash('Trigger deleted.')
  }

  async function toggleWfActivity(act) {
    await httpFetch(`/api/admin/workflow-activities/${act.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: act.name, description: act.description, is_active: act.is_active ? 0 : 1 }) })
    await loadWfActivities()
    flash('Activity updated.')
  }

  async function fetchImpact(changeType, entityId, label) {
    setImpactLoading(true); setImpactPanel(null)
    try {
      const res = await httpFetch('/api/admin/impact-preview', { method: 'POST', headers: H, body: JSON.stringify({ change_type: changeType, entity_id: entityId }) })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Impact preview failed.', 'error'); return }
      setImpactPanel({ data, label })
    } catch { flash('Could not load impact preview.', 'error') } finally { setImpactLoading(false) }
  }

  return (
    <>
      <SectionHeader title="Workflow Setup" desc="View case workflow states and activity triggers. Changes are managed by platform admins." />
      <div style={{ padding: '8px 14px', marginBottom: 12, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, fontSize: 12, color: '#7a5c00' }}>
        Workflow configuration is controlled by platform admins only. Contact your platform admin to add or modify workflow states and triggers.
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[{ key: 'states', label: 'Workflow States' }, { key: 'triggers', label: 'Activity Triggers' }, { key: 'rules', label: 'Transition Rules' }, { key: 'diagram', label: '⬡ State Diagram' }].map(t => (
          <button key={t.key} onClick={() => setWfTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', borderBottom: wfTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: wfTab === t.key ? 700 : 400, color: wfTab === t.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {wfTab === 'states' && (
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
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px', color: '#b45309', borderColor: '#d97706' }} disabled={impactLoading} onClick={() => fetchImpact('workflow_rule', w.id, `State: ${w.name}`)}>
                        {impactLoading ? '…' : '⚠ Preview Impact'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {wfTab === 'triggers' && (
        <>
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
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setTriggerEditTarget(t); setTriggerForm({ activity_id: t.activity_id, trigger_type: t.trigger_type, target_state_id: t.target_state_id || '', alert_rule: t.alert_rule || '', assign_to: t.assign_to || '' }); setTriggerModal('edit') }}>✏ Edit</button>
                          <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteTrigger(t)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
                  <input type="checkbox" checked={wfRuleForm.require_password} onChange={e => setWfRuleForm(f => ({ ...f, require_password: e.target.checked }))} /> Require Password
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={wfRuleForm.require_checklist} onChange={e => setWfRuleForm(f => ({ ...f, require_checklist: e.target.checked }))} /> Require Checklist
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={wfRuleForm.require_comment} onChange={e => setWfRuleForm(f => ({ ...f, require_comment: e.target.checked }))} /> Require Comment
                </label>
              </div>
              {wfRuleMsg && <p style={{ marginBottom: 10, fontSize: 13, color: wfRuleMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{wfRuleMsg}</p>}
              <button className="btn btn-primary" disabled={!wfRuleForm.from_state_id || !wfRuleForm.to_state_id} onClick={async () => {
                setWfRuleMsg('')
                const r = await httpFetch('/api/admin/workflow-rules', { method: 'POST', headers: H, body: JSON.stringify({ from_state_id: parseInt(wfRuleForm.from_state_id, 10), to_state_id: parseInt(wfRuleForm.to_state_id, 10), require_password: wfRuleForm.require_password, require_checklist: wfRuleForm.require_checklist, require_comment: wfRuleForm.require_comment }) })
                const d = await r.json()
                if (r.ok) {
                  setWfRuleMsg('✓ Rule added.')
                  setWfRuleForm({ from_state_id: '', to_state_id: '', require_password: false, require_checklist: false, require_comment: false })
                  const list = await httpFetch('/api/admin/workflow-rules', { headers: H }).then(x => x.json()).catch(() => ({ rules: [] }))
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
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px', color: '#b45309', borderColor: '#d97706' }} disabled={impactLoading} onClick={() => fetchImpact('workflow_rule', rule.from_state_id, `Rule: ${rule.from_state_name || rule.from_state_id} → ${rule.to_state_name || rule.to_state_id}`)}>
                            {impactLoading ? '…' : '⚠ Preview Impact'}
                          </button>
                        </td>
                        <td>
                          <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={async () => {
                            if (!await confirm('Delete this transition rule?')) return
                            const r = await httpFetch(`/api/admin/workflow-rules/${rule.id}`, { method: 'DELETE', headers: H })
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

      {wfTab === 'diagram' && <WorkflowDiagram states={workflowStates} rules={wfRules} />}

      <ImpactPreviewModal panel={impactPanel} onClose={() => setImpactPanel(null)} />

      {depCheckModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 28, maxWidth: 480, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--danger)' }}>⚠ Dependencies Found</h3>
            <p style={{ marginBottom: 16, fontSize: 14 }}><strong>"{depCheckModal.row?.name}"</strong> is currently in use. Deactivating may affect:</p>
            <ul style={{ margin: '0 0 20px', paddingLeft: 20, fontSize: 13 }}>
              {depCheckModal.deps.map((d, i) => <li key={i}><strong>{d.count}</strong> {d.label || d.type}</li>)}
            </ul>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setDepCheckModal(null); setDepCheckProceedFn(null) }}>Cancel</button>
              <button className="btn btn-danger" onClick={() => depProceedRef.current && depProceedRef.current()}>Proceed Anyway</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
