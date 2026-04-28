import { useEffect, useState } from 'react'

function SectionHeader({ title, desc }) {
  return (
    <div className="admin-section-header" style={{ marginBottom: 16 }}>
      <h2>{title}</h2>
      {desc && <p>{desc}</p>}
    </div>
  )
}

function JsonPreview({ value, emptyText = 'No data.' }) {
  if (value === null || value === undefined) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{emptyText}</div>
  }
  return (
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, maxHeight: 260, overflow: 'auto' }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export default function AdminContentIntelligenceSection({ contentSection, H, flash }) {
  const [evidenceForm, setEvidenceForm] = useState({ content_type: 'document', content_id: '', mode: 'publish' })
  const [evidenceResult, setEvidenceResult] = useState(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceRules, setEvidenceRules] = useState([])
  const [evidenceRuns, setEvidenceRuns] = useState([])
  const [evidenceRuleSaving, setEvidenceRuleSaving] = useState(false)
  const [editingEvidenceRuleId, setEditingEvidenceRuleId] = useState(null)
  const [evidenceRuleForm, setEvidenceRuleForm] = useState({
    rule_name: '',
    applies_to: 'all',
    mode_scope: 'both',
    check_type: 'status_in',
    check_config_text: '{"values":["Approved"]}',
    severity: 'block',
    priority: 100,
    is_active: true,
  })

  const [scanForm, setScanForm] = useState({ min_token_overlap: 4, limit: 50, include_non_published: false })
  const [scanLoading, setScanLoading] = useState(false)
  const [scanSummary, setScanSummary] = useState(null)
  const [findings, setFindings] = useState([])
  const [findingStatusSavingId, setFindingStatusSavingId] = useState(null)

  const [digitalTwinForm, setDigitalTwinForm] = useState({
    scenario_name: 'Release Scenario',
    changes_text: '[\n  { "content_type": "document", "content_id": 1, "action": "publish" }\n]',
    change_window_hours: 24,
  })
  const [digitalTwinLoading, setDigitalTwinLoading] = useState(false)
  const [digitalTwinResult, setDigitalTwinResult] = useState(null)
  const [digitalTwinRuns, setDigitalTwinRuns] = useState([])

  const [riskEvalForm, setRiskEvalForm] = useState({
    context_type: 'release',
    context_id: '',
    evidence_blockers: 0,
    contradiction_findings: 0,
    projected_usage: 0,
    policy_denies_30d: 0,
    change_window_hours: 24,
    manual_risk_adjustment: 0,
  })
  const [riskDecision, setRiskDecision] = useState(null)
  const [riskEvalLoading, setRiskEvalLoading] = useState(false)
  const [riskRules, setRiskRules] = useState([])
  const [riskDecisions, setRiskDecisions] = useState([])
  const [riskRuleSaving, setRiskRuleSaving] = useState(false)
  const [editingRiskRuleId, setEditingRiskRuleId] = useState(null)
  const [riskRuleForm, setRiskRuleForm] = useState({
    rule_name: '',
    min_score: 0,
    max_score: 20,
    decision_action: 'auto_approve',
    escalation_role: 'manager',
    sla_hours: 8,
    priority: 100,
    is_active: true,
  })

  useEffect(() => {
    if (contentSection === 'evidence-chain-compiler') {
      loadEvidenceRules()
      loadEvidenceRuns()
    }
    if (contentSection === 'contradiction-radar') {
      loadFindings()
    }
    if (contentSection === 'digital-twin-release-simulator') {
      loadDigitalTwinRuns()
    }
    if (contentSection === 'adaptive-risk-workflow') {
      loadRiskRules()
      loadRiskDecisions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentSection])

  function notify(text, type = 'success') {
    if (typeof flash === 'function') flash(text, type)
  }

  async function loadEvidenceRules() {
    try {
      const res = await fetch('/api/admin/evidence-chain/rules', { headers: H })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load evidence rules.')
      setEvidenceRules(body.rules || [])
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function loadEvidenceRuns() {
    try {
      const res = await fetch('/api/admin/evidence-chain/runs?limit=25', { headers: H })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load evidence runs.')
      setEvidenceRuns(body.runs || [])
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  function setEvidenceRuleFromRow(row) {
    setEditingEvidenceRuleId(row.id)
    setEvidenceRuleForm({
      rule_name: row.rule_name || '',
      applies_to: row.applies_to || 'all',
      mode_scope: row.mode_scope || 'both',
      check_type: row.check_type || 'status_in',
      check_config_text: JSON.stringify(row.check_config || {}, null, 2),
      severity: row.severity || 'block',
      priority: row.priority ?? 100,
      is_active: !!row.is_active,
    })
  }

  function resetEvidenceRuleForm() {
    setEditingEvidenceRuleId(null)
    setEvidenceRuleForm({
      rule_name: '',
      applies_to: 'all',
      mode_scope: 'both',
      check_type: 'status_in',
      check_config_text: '{"values":["Approved"]}',
      severity: 'block',
      priority: 100,
      is_active: true,
    })
  }

  async function saveEvidenceRule(e) {
    e.preventDefault()

    let parsedConfig = {}
    try {
      parsedConfig = JSON.parse(evidenceRuleForm.check_config_text || '{}')
    } catch {
      notify('check_config must be valid JSON.', 'error')
      return
    }

    setEvidenceRuleSaving(true)
    try {
      const payload = {
        rule_name: evidenceRuleForm.rule_name,
        applies_to: evidenceRuleForm.applies_to,
        mode_scope: evidenceRuleForm.mode_scope,
        check_type: evidenceRuleForm.check_type,
        check_config: parsedConfig,
        severity: evidenceRuleForm.severity,
        priority: Number(evidenceRuleForm.priority) || 100,
        is_active: evidenceRuleForm.is_active ? 1 : 0,
      }

      const isEdit = Boolean(editingEvidenceRuleId)
      const endpoint = isEdit
        ? `/api/admin/evidence-chain/rules/${editingEvidenceRuleId}`
        : '/api/admin/evidence-chain/rules'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(endpoint, {
        method,
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save rule.')

      notify(isEdit ? 'Evidence rule updated.' : 'Evidence rule created.')
      resetEvidenceRuleForm()
      await loadEvidenceRules()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setEvidenceRuleSaving(false)
    }
  }

  async function runEvidenceCompile(e) {
    e.preventDefault()
    const contentId = Number.parseInt(evidenceForm.content_id, 10)
    if (!contentId) {
      notify('Valid content_id is required.', 'error')
      return
    }

    setEvidenceLoading(true)
    setEvidenceResult(null)
    try {
      const res = await fetch('/api/admin/evidence-chain/compile', {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_type: evidenceForm.content_type,
          content_id: contentId,
          mode: evidenceForm.mode,
          metadata: { source: 'admin-console' },
        }),
      })
      const body = await res.json()
      if (!res.ok && res.status !== 422) throw new Error(body.error || 'Evidence compile failed.')
      setEvidenceResult(body)
      notify(body.allow ? 'Evidence compile passed.' : 'Evidence compile blocked.', body.allow ? 'success' : 'error')
      await loadEvidenceRuns()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setEvidenceLoading(false)
    }
  }

  async function runContradictionScan(e) {
    e.preventDefault()
    setScanLoading(true)
    try {
      const res = await fetch('/api/admin/contradiction-radar/scan', {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          min_token_overlap: Number(scanForm.min_token_overlap) || 4,
          limit: Number(scanForm.limit) || 50,
          include_non_published: scanForm.include_non_published,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Contradiction scan failed.')
      setScanSummary(body)
      setFindings(body.open_findings || [])
      notify(`Scan complete. ${body.generated_findings || 0} new finding(s).`)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setScanLoading(false)
    }
  }

  async function loadFindings(status = 'open') {
    try {
      const res = await fetch(`/api/admin/contradiction-radar/findings?status=${encodeURIComponent(status)}&limit=200`, { headers: H })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load contradiction findings.')
      setFindings(body.findings || [])
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function updateFindingStatus(id, status) {
    setFindingStatusSavingId(id)
    try {
      const res = await fetch(`/api/admin/contradiction-radar/findings/${id}/status`, {
        method: 'PUT',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to update finding status.')
      setFindings((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)))
      notify('Finding status updated.')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setFindingStatusSavingId(null)
    }
  }

  async function runDigitalTwinSimulation(e) {
    e.preventDefault()

    let parsedChanges = []
    try {
      const raw = JSON.parse(digitalTwinForm.changes_text || '[]')
      parsedChanges = Array.isArray(raw) ? raw : []
    } catch {
      notify('changes JSON is invalid.', 'error')
      return
    }

    setDigitalTwinLoading(true)
    try {
      const res = await fetch('/api/admin/digital-twin/simulate', {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_name: digitalTwinForm.scenario_name,
          changes: parsedChanges,
          context: { change_window_hours: Number(digitalTwinForm.change_window_hours) || 24 },
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Digital twin simulation failed.')
      setDigitalTwinResult(body)
      notify('Digital twin simulation completed.')
      await loadDigitalTwinRuns()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setDigitalTwinLoading(false)
    }
  }

  async function loadDigitalTwinRuns() {
    try {
      const res = await fetch('/api/admin/digital-twin/runs?limit=25', { headers: H })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load digital twin runs.')
      setDigitalTwinRuns(body.runs || [])
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function loadRiskRules() {
    try {
      const res = await fetch('/api/admin/adaptive-risk/rules', { headers: H })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load adaptive risk rules.')
      setRiskRules(body.rules || [])
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  async function loadRiskDecisions() {
    try {
      const res = await fetch('/api/admin/adaptive-risk/decisions?limit=30', { headers: H })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load adaptive risk decisions.')
      setRiskDecisions(body.decisions || [])
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  function setRiskRuleFromRow(row) {
    setEditingRiskRuleId(row.id)
    setRiskRuleForm({
      rule_name: row.rule_name || '',
      min_score: row.min_score ?? 0,
      max_score: row.max_score ?? 100,
      decision_action: row.decision_action || 'auto_approve',
      escalation_role: row.escalation_role || 'manager',
      sla_hours: row.sla_hours ?? 12,
      priority: row.priority ?? 100,
      is_active: !!row.is_active,
    })
  }

  function resetRiskRuleForm() {
    setEditingRiskRuleId(null)
    setRiskRuleForm({
      rule_name: '',
      min_score: 0,
      max_score: 20,
      decision_action: 'auto_approve',
      escalation_role: 'manager',
      sla_hours: 8,
      priority: 100,
      is_active: true,
    })
  }

  async function saveRiskRule(e) {
    e.preventDefault()
    setRiskRuleSaving(true)
    try {
      const payload = {
        rule_name: riskRuleForm.rule_name,
        min_score: Number(riskRuleForm.min_score),
        max_score: Number(riskRuleForm.max_score),
        decision_action: riskRuleForm.decision_action,
        escalation_role: riskRuleForm.escalation_role,
        sla_hours: Number(riskRuleForm.sla_hours) || 12,
        priority: Number(riskRuleForm.priority) || 100,
        is_active: riskRuleForm.is_active ? 1 : 0,
      }

      const isEdit = Boolean(editingRiskRuleId)
      const endpoint = isEdit
        ? `/api/admin/adaptive-risk/rules/${editingRiskRuleId}`
        : '/api/admin/adaptive-risk/rules'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(endpoint, {
        method,
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save adaptive risk rule.')

      notify(isEdit ? 'Adaptive risk rule updated.' : 'Adaptive risk rule created.')
      resetRiskRuleForm()
      await loadRiskRules()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setRiskRuleSaving(false)
    }
  }

  async function evaluateRisk(e) {
    e.preventDefault()
    setRiskEvalLoading(true)
    try {
      const res = await fetch('/api/admin/adaptive-risk/evaluate', {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context_type: riskEvalForm.context_type,
          context_id: riskEvalForm.context_id ? Number(riskEvalForm.context_id) : null,
          context: {
            evidence_blockers: Number(riskEvalForm.evidence_blockers) || 0,
            contradiction_findings: Number(riskEvalForm.contradiction_findings) || 0,
            projected_usage: Number(riskEvalForm.projected_usage) || 0,
            policy_denies_30d: Number(riskEvalForm.policy_denies_30d) || 0,
            change_window_hours: Number(riskEvalForm.change_window_hours) || 24,
            manual_risk_adjustment: Number(riskEvalForm.manual_risk_adjustment) || 0,
          },
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to evaluate adaptive risk.')
      setRiskDecision(body)
      notify('Adaptive risk decision generated.')
      await loadRiskDecisions()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setRiskEvalLoading(false)
    }
  }

  if (contentSection === 'evidence-chain-compiler') {
    return (
      <div style={{ padding: '0 4px', display: 'grid', gap: 20 }}>
        <SectionHeader title="Evidence Chain Compiler" desc="Compile and enforce publish/response evidence gates with configurable checks." />

        <div className="card">
          <div className="card-header"><h3>Compile Evidence Chain</h3></div>
          <div className="card-body">
            <form onSubmit={runEvidenceCompile} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Content Type</label>
                <select className="form-control" value={evidenceForm.content_type} onChange={(e) => setEvidenceForm((p) => ({ ...p, content_type: e.target.value }))}>
                  <option value="document">Document</option>
                  <option value="faq">FAQ</option>
                  <option value="template">Template</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Content ID</label>
                <input className="form-control" value={evidenceForm.content_id} onChange={(e) => setEvidenceForm((p) => ({ ...p, content_id: e.target.value }))} placeholder="e.g. 42" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Mode</label>
                <select className="form-control" value={evidenceForm.mode} onChange={(e) => setEvidenceForm((p) => ({ ...p, mode: e.target.value }))}>
                  <option value="publish">Publish</option>
                  <option value="response">Response</option>
                  <option value="release">Release</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={evidenceLoading}>{evidenceLoading ? 'Compiling…' : 'Compile'}</button>
            </form>

            {evidenceResult && (
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: evidenceResult.allow ? '#e6f4ee' : '#fde8ef', color: evidenceResult.allow ? '#007a5a' : '#e01e5a' }}>
                    {evidenceResult.allow ? 'ALLOW' : 'BLOCK'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Risk score: {evidenceResult.risk_score ?? '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Run ID: {evidenceResult.run_id ?? '—'}</span>
                </div>
                <JsonPreview value={evidenceResult} />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>{editingEvidenceRuleId ? 'Edit Evidence Rule' : 'New Evidence Rule'}</h3></div>
          <div className="card-body">
            <form onSubmit={saveEvidenceRule} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Rule Name</label>
                <input className="form-control" value={evidenceRuleForm.rule_name} onChange={(e) => setEvidenceRuleForm((p) => ({ ...p, rule_name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Applies To</label>
                <select className="form-control" value={evidenceRuleForm.applies_to} onChange={(e) => setEvidenceRuleForm((p) => ({ ...p, applies_to: e.target.value }))}>
                  <option value="all">All</option>
                  <option value="document">Document</option>
                  <option value="faq">FAQ</option>
                  <option value="template">Template</option>
                  <option value="module">Module</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Mode Scope</label>
                <select className="form-control" value={evidenceRuleForm.mode_scope} onChange={(e) => setEvidenceRuleForm((p) => ({ ...p, mode_scope: e.target.value }))}>
                  <option value="both">Both</option>
                  <option value="publish">Publish</option>
                  <option value="response">Response</option>
                  <option value="release">Release</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Check Type</label>
                <select className="form-control" value={evidenceRuleForm.check_type} onChange={(e) => setEvidenceRuleForm((p) => ({ ...p, check_type: e.target.value }))}>
                  <option value="status_in">status_in</option>
                  <option value="not_expired">not_expired</option>
                  <option value="min_content_length">min_content_length</option>
                  <option value="min_attachment_count">min_attachment_count</option>
                  <option value="min_reference_count">min_reference_count</option>
                  <option value="max_open_contradictions">max_open_contradictions</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Severity</label>
                <select className="form-control" value={evidenceRuleForm.severity} onChange={(e) => setEvidenceRuleForm((p) => ({ ...p, severity: e.target.value }))}>
                  <option value="block">Block</option>
                  <option value="warning">Warning</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Priority</label>
                <input className="form-control" type="number" value={evidenceRuleForm.priority} onChange={(e) => setEvidenceRuleForm((p) => ({ ...p, priority: e.target.value }))} />
              </div>

              <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label>check_config (JSON)</label>
                <textarea className="form-control" rows={4} value={evidenceRuleForm.check_config_text} onChange={(e) => setEvidenceRuleForm((p) => ({ ...p, check_config_text: e.target.value }))} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / 3' }}>
                <input type="checkbox" checked={evidenceRuleForm.is_active} onChange={(e) => setEvidenceRuleForm((p) => ({ ...p, is_active: e.target.checked }))} />
                Active
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, gridColumn: '3 / -1' }}>
                {editingEvidenceRuleId && <button type="button" className="btn btn-outline" onClick={resetEvidenceRuleForm}>Cancel Edit</button>}
                <button type="submit" className="btn btn-primary" disabled={evidenceRuleSaving}>{evidenceRuleSaving ? 'Saving…' : (editingEvidenceRuleId ? 'Update Rule' : 'Create Rule')}</button>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Rules</h3></div>
          <div className="card-body" style={{ overflow: 'auto' }}>
            {evidenceRules.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No org-level rules yet. Default engine rules are still applied.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Rule', 'Applies', 'Mode', 'Check', 'Severity', 'Priority', 'Active', 'Actions'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evidenceRules.map((rule) => (
                    <tr key={rule.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{rule.rule_name}</td>
                      <td style={{ padding: 8 }}>{rule.applies_to}</td>
                      <td style={{ padding: 8 }}>{rule.mode_scope}</td>
                      <td style={{ padding: 8 }}>{rule.check_type}</td>
                      <td style={{ padding: 8 }}>{rule.severity}</td>
                      <td style={{ padding: 8 }}>{rule.priority}</td>
                      <td style={{ padding: 8 }}>{rule.is_active ? 'Yes' : 'No'}</td>
                      <td style={{ padding: 8 }}><button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setEvidenceRuleFromRow(rule)}>Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Recent Runs</h3></div>
          <div className="card-body" style={{ overflow: 'auto' }}>
            {evidenceRuns.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No evidence runs yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['ID', 'Content', 'Mode', 'Result', 'Risk', 'Created'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evidenceRuns.map((run) => (
                    <tr key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{run.id}</td>
                      <td style={{ padding: 8 }}>{run.content_type}#{run.content_id}</td>
                      <td style={{ padding: 8 }}>{run.mode}</td>
                      <td style={{ padding: 8 }}>{run.result}</td>
                      <td style={{ padding: 8 }}>{run.risk_score}</td>
                      <td style={{ padding: 8 }}>{run.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (contentSection === 'contradiction-radar') {
    return (
      <div style={{ padding: '0 4px', display: 'grid', gap: 20 }}>
        <SectionHeader title="Contradiction Radar" desc="Detect conflicting statements across documents, FAQs, and templates." />

        <div className="card">
          <div className="card-header"><h3>Run Scan</h3></div>
          <div className="card-body">
            <form onSubmit={runContradictionScan} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Min Token Overlap</label>
                <input className="form-control" type="number" min="2" max="8" value={scanForm.min_token_overlap} onChange={(e) => setScanForm((p) => ({ ...p, min_token_overlap: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Limit</label>
                <input className="form-control" type="number" min="1" max="200" value={scanForm.limit} onChange={(e) => setScanForm((p) => ({ ...p, limit: e.target.value }))} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={scanForm.include_non_published} onChange={(e) => setScanForm((p) => ({ ...p, include_non_published: e.target.checked }))} />
                Include non-published
              </label>
              <button className="btn btn-primary" type="submit" disabled={scanLoading}>{scanLoading ? 'Scanning…' : 'Scan'}</button>
            </form>
            {scanSummary && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                Scanned sources: {scanSummary.scanned_sources || 0} | Generated findings: {scanSummary.generated_findings || 0}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Open Findings</h3>
            <button className="btn btn-outline" onClick={() => loadFindings('open')}>Refresh</button>
          </div>
          <div className="card-body" style={{ overflow: 'auto' }}>
            {findings.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No open contradictions.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['ID', 'Pair', 'Type', 'Overlap', 'Confidence', 'Left Snippet', 'Right Snippet', 'Status'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {findings.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                      <td style={{ padding: 8 }}>{item.id}</td>
                      <td style={{ padding: 8 }}>{item.left_source_type}#{item.left_source_id} ↔ {item.right_source_type}#{item.right_source_id}</td>
                      <td style={{ padding: 8 }}>{item.contradiction_type}</td>
                      <td style={{ padding: 8 }}>{item.overlap_score}</td>
                      <td style={{ padding: 8 }}>{item.confidence_score}</td>
                      <td style={{ padding: 8, maxWidth: 240 }}>{item.left_snippet}</td>
                      <td style={{ padding: 8, maxWidth: 240 }}>{item.right_snippet}</td>
                      <td style={{ padding: 8 }}>
                        <select disabled={findingStatusSavingId === item.id} value={item.status} onChange={(e) => updateFindingStatus(item.id, e.target.value)} className="form-control" style={{ minWidth: 130 }}>
                          <option value="open">open</option>
                          <option value="acknowledged">acknowledged</option>
                          <option value="dismissed">dismissed</option>
                          <option value="resolved">resolved</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (contentSection === 'digital-twin-release-simulator') {
    return (
      <div style={{ padding: '0 4px', display: 'grid', gap: 20 }}>
        <SectionHeader title="Digital Twin Release Simulator" desc="Simulate release impact before go-live using evidence checks, usage telemetry, and policy denies." />

        <div className="card">
          <div className="card-header"><h3>Run Simulation</h3></div>
          <div className="card-body">
            <form onSubmit={runDigitalTwinSimulation} style={{ display: 'grid', gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Scenario Name</label>
                <input className="form-control" value={digitalTwinForm.scenario_name} onChange={(e) => setDigitalTwinForm((p) => ({ ...p, scenario_name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Changes (JSON Array)</label>
                <textarea className="form-control" rows={7} value={digitalTwinForm.changes_text} onChange={(e) => setDigitalTwinForm((p) => ({ ...p, changes_text: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0, maxWidth: 240 }}>
                <label>Change Window (hours)</label>
                <input className="form-control" type="number" min="1" value={digitalTwinForm.change_window_hours} onChange={(e) => setDigitalTwinForm((p) => ({ ...p, change_window_hours: e.target.value }))} />
              </div>
              <div>
                <button className="btn btn-primary" type="submit" disabled={digitalTwinLoading}>{digitalTwinLoading ? 'Simulating…' : 'Simulate'}</button>
              </div>
            </form>

            {digitalTwinResult && (
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: '#eef4ff', color: '#3159d1' }}>Gate: {digitalTwinResult.metrics?.recommended_gate || '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Risk score: {digitalTwinResult.metrics?.risk_score ?? '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Risk band: {digitalTwinResult.metrics?.risk_band ?? '—'}</span>
                </div>
                <JsonPreview value={digitalTwinResult} />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Recent Simulations</h3></div>
          <div className="card-body" style={{ overflow: 'auto' }}>
            {digitalTwinRuns.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No simulations yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['ID', 'Scenario', 'Risk', 'Band', 'Gate', 'Latency(ms)', 'Created'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {digitalTwinRuns.map((run) => (
                    <tr key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{run.id}</td>
                      <td style={{ padding: 8 }}>{run.scenario_name}</td>
                      <td style={{ padding: 8 }}>{run.risk_score}</td>
                      <td style={{ padding: 8 }}>{run.risk_band}</td>
                      <td style={{ padding: 8 }}>{run.recommended_gate}</td>
                      <td style={{ padding: 8 }}>{run.simulation_ms}</td>
                      <td style={{ padding: 8 }}>{run.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (contentSection === 'adaptive-risk-workflow') {
    return (
      <div style={{ padding: '0 4px', display: 'grid', gap: 20 }}>
        <SectionHeader title="Adaptive Risk Workflow" desc="Dynamic approvals and escalations based on computed risk score." />

        <div className="card">
          <div className="card-header"><h3>Evaluate Risk Context</h3></div>
          <div className="card-body">
            <form onSubmit={evaluateRisk} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Context Type</label>
                <input className="form-control" value={riskEvalForm.context_type} onChange={(e) => setRiskEvalForm((p) => ({ ...p, context_type: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Context ID</label>
                <input className="form-control" value={riskEvalForm.context_id} onChange={(e) => setRiskEvalForm((p) => ({ ...p, context_id: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Evidence Blockers</label>
                <input className="form-control" type="number" value={riskEvalForm.evidence_blockers} onChange={(e) => setRiskEvalForm((p) => ({ ...p, evidence_blockers: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Contradictions</label>
                <input className="form-control" type="number" value={riskEvalForm.contradiction_findings} onChange={(e) => setRiskEvalForm((p) => ({ ...p, contradiction_findings: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Projected Usage</label>
                <input className="form-control" type="number" value={riskEvalForm.projected_usage} onChange={(e) => setRiskEvalForm((p) => ({ ...p, projected_usage: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Policy Denies (30d)</label>
                <input className="form-control" type="number" value={riskEvalForm.policy_denies_30d} onChange={(e) => setRiskEvalForm((p) => ({ ...p, policy_denies_30d: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Change Window Hours</label>
                <input className="form-control" type="number" value={riskEvalForm.change_window_hours} onChange={(e) => setRiskEvalForm((p) => ({ ...p, change_window_hours: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Manual Adjustment</label>
                <input className="form-control" type="number" value={riskEvalForm.manual_risk_adjustment} onChange={(e) => setRiskEvalForm((p) => ({ ...p, manual_risk_adjustment: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit" disabled={riskEvalLoading}>{riskEvalLoading ? 'Evaluating…' : 'Evaluate Risk'}</button>
              </div>
            </form>

            {riskDecision && (
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: '#eef4ff', color: '#3159d1' }}>{riskDecision.decision_action}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Score: {riskDecision.computed_score}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>SLA: {riskDecision.sla_hours}h</span>
                </div>
                <JsonPreview value={riskDecision} />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>{editingRiskRuleId ? 'Edit Risk Rule' : 'New Risk Rule'}</h3></div>
          <div className="card-body">
            <form onSubmit={saveRiskRule} style={{ display: 'grid', gridTemplateColumns: '2fr repeat(7, minmax(0, 1fr))', gap: 10, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Rule Name</label>
                <input className="form-control" value={riskRuleForm.rule_name} onChange={(e) => setRiskRuleForm((p) => ({ ...p, rule_name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Min</label>
                <input className="form-control" type="number" value={riskRuleForm.min_score} onChange={(e) => setRiskRuleForm((p) => ({ ...p, min_score: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Max</label>
                <input className="form-control" type="number" value={riskRuleForm.max_score} onChange={(e) => setRiskRuleForm((p) => ({ ...p, max_score: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Action</label>
                <select className="form-control" value={riskRuleForm.decision_action} onChange={(e) => setRiskRuleForm((p) => ({ ...p, decision_action: e.target.value }))}>
                  <option value="auto_approve">auto_approve</option>
                  <option value="manager_review">manager_review</option>
                  <option value="medical_review">medical_review</option>
                  <option value="compliance_escalation">compliance_escalation</option>
                  <option value="block_release">block_release</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Escalation Role</label>
                <input className="form-control" value={riskRuleForm.escalation_role} onChange={(e) => setRiskRuleForm((p) => ({ ...p, escalation_role: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>SLA (h)</label>
                <input className="form-control" type="number" value={riskRuleForm.sla_hours} onChange={(e) => setRiskRuleForm((p) => ({ ...p, sla_hours: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Priority</label>
                <input className="form-control" type="number" value={riskRuleForm.priority} onChange={(e) => setRiskRuleForm((p) => ({ ...p, priority: e.target.value }))} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={riskRuleForm.is_active} onChange={(e) => setRiskRuleForm((p) => ({ ...p, is_active: e.target.checked }))} />
                Active
              </label>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {editingRiskRuleId && <button type="button" className="btn btn-outline" onClick={resetRiskRuleForm}>Cancel Edit</button>}
                <button type="submit" className="btn btn-primary" disabled={riskRuleSaving}>{riskRuleSaving ? 'Saving…' : (editingRiskRuleId ? 'Update Rule' : 'Create Rule')}</button>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Adaptive Risk Rules</h3></div>
          <div className="card-body" style={{ overflow: 'auto' }}>
            {riskRules.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No rules configured.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Rule', 'Score Band', 'Action', 'Role', 'SLA(h)', 'Priority', 'Active', 'Actions'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riskRules.map((rule) => (
                    <tr key={rule.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{rule.rule_name}</td>
                      <td style={{ padding: 8 }}>{rule.min_score} - {rule.max_score}</td>
                      <td style={{ padding: 8 }}>{rule.decision_action}</td>
                      <td style={{ padding: 8 }}>{rule.escalation_role}</td>
                      <td style={{ padding: 8 }}>{rule.sla_hours}</td>
                      <td style={{ padding: 8 }}>{rule.priority}</td>
                      <td style={{ padding: 8 }}>{rule.is_active ? 'Yes' : 'No'}</td>
                      <td style={{ padding: 8 }}><button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setRiskRuleFromRow(rule)}>Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Recent Decisions</h3></div>
          <div className="card-body" style={{ overflow: 'auto' }}>
            {riskDecisions.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No decisions generated yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['ID', 'Context', 'Score', 'Action', 'Role', 'SLA(h)', 'Created'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riskDecisions.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}>{d.id}</td>
                      <td style={{ padding: 8 }}>{d.context_type}{d.context_id ? `#${d.context_id}` : ''}</td>
                      <td style={{ padding: 8 }}>{d.computed_score}</td>
                      <td style={{ padding: 8 }}>{d.decision_action}</td>
                      <td style={{ padding: 8 }}>{d.escalation_role}</td>
                      <td style={{ padding: 8 }}>{d.sla_hours}</td>
                      <td style={{ padding: 8 }}>{d.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
