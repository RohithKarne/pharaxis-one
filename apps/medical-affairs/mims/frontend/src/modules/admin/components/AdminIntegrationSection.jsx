import { useState, useEffect } from 'react'

export default function AdminIntegrationSection({ contentSection, H, flash }) {
  const [integrationConfig, setIntegrationConfig] = useState({})
  const [integrationSaving, setIntegrationSaving] = useState(false)
  const [integrationStatus, setIntegrationStatus] = useState({})
  const [integrationTestResult, setIntegrationTestResult] = useState({})
  const [integrationTestLoading, setIntegrationTestLoading] = useState(false)
  const [mirSyncLog, setMirSyncLog] = useState([])
  const [mirSyncLogLoading, setMirSyncLogLoading] = useState(false)
  const [crmSyncLog, setCrmSyncLog] = useState([])
  const [crmSyncLogLoading, setCrmSyncLogLoading] = useState(false)
  const [importJobHistory, setImportJobHistory] = useState([])
  const [importJobLoading, setImportJobLoading] = useState(false)
  const [emirSenderRules, setEmirSenderRules] = useState([])
  const [emirRoutingRules, setEmirRoutingRules] = useState([])
  const [emirSenderForm, setEmirSenderForm] = useState({ rule_type: 'whitelist', match_type: 'domain', value: '', action: 'reject_silently' })
  const [importFile, setImportFile] = useState(null)
  const [importUploading, setImportUploading] = useState(false)
  const [importUploadMsg, setImportUploadMsg] = useState('')
  const [caseImportTab, setCaseImportTab] = useState('export')
  const [scheduledExports, setScheduledExports] = useState([])
  const [scheduledExportsLoading, setScheduledExportsLoading] = useState(false)
  const [scheduledExportForm, setScheduledExportForm] = useState({ name: '', cron_expression: '', format: 'csv', case_type: '', email_to: '', is_active: true })
  const [scheduledExportSaving, setScheduledExportSaving] = useState(false)
  const [scheduledExportMsg, setScheduledExportMsg] = useState('')

  const [caseExportFilters, setCaseExportFilters] = useState({ case_type: '', date_from: '', date_to: '', status_id: '', assigned_to: '', format: 'csv' })
  const [caseExportLoading, setCaseExportLoading] = useState(false)
  const [caseExportMsg, setCaseExportMsg] = useState('')
  const [vaultTypeMapRows, setVaultTypeMapRows] = useState([])
  const [showVaultTypeMapForm, setShowVaultTypeMapForm] = useState(false)
  const [newVaultTypeMap, setNewVaultTypeMap] = useState({ vault_type: '', vault_subtype: '', vault_classification: '', mims_cm_category: '', auto_ingest: false, overwrite_on_update: false })
  const [emirRouteForm, setEmirRouteForm] = useState({ rule_name: '', match_field: 'subject', match_type: 'contains', match_value: '', case_type: 'MI', default_priority: 'normal' })
  const [redactPii, setRedactPii] = useState(false)
  const [e2bConfig, setE2bConfig] = useState({ sender_org: '', sender_id: '', receiver_id: '', meddra_version: '', expedited_days: '15' })

  useEffect(() => {
    const integrationSections = ['mir-int', 'crm-int', 'content-int', 'emir-int', 'case-import']
    if (!integrationSections.includes(contentSection)) return

    let cancelled = false
    const integrationTypes = ['mir', 'crm', 'content', 'emir', 'case_import']

    const loadIntegrationConfig = async () => {
      try {
        const res = await fetch('/api/admin/integrations/config', { headers: H })
        if (res.ok) {
          const d = await res.json()
          if (!cancelled) setIntegrationConfig(d.config || d.configs || {})
          return
        }
      } catch (_e) {}

      try {
        const entries = await Promise.all(integrationTypes.map(async (type) => {
          try {
            const res = await fetch(`/api/admin/integrations/${type}/config`, { headers: H })
            const d = await res.json()
            return [type, d.config || {}]
          } catch (_e) {
            return [type, {}]
          }
        }))
        if (!cancelled) setIntegrationConfig(Object.fromEntries(entries))
      } catch (_e) {}
    }

    const loadIntegrationStatus = async () => {
      try {
        const res = await fetch('/api/admin/integrations', { headers: H })
        const d = await res.json()
        const rows = Array.isArray(d.integrations) ? d.integrations : Array.isArray(d) ? d : []
        const nextStatus = rows.reduce((acc, row) => {
          const type = row?.integration_type || row?.type || row?.key
          if (type) acc[type] = row.enabled
          return acc
        }, {})
        if (!cancelled) setIntegrationStatus(nextStatus)
      } catch (_e) {}
    }

    ;(async () => {
      await Promise.all([loadIntegrationConfig(), loadIntegrationStatus()])

      if (cancelled) return

      if (contentSection === 'mir-int') {
        setMirSyncLogLoading(true)
        try {
          const r = await fetch('/api/admin/integrations/mir/sync-log', { headers: H })
          const d = await r.json()
          if (!cancelled) setMirSyncLog(d.log || [])
        } catch (_e) {
          if (!cancelled) setMirSyncLog([])
        } finally {
          if (!cancelled) setMirSyncLogLoading(false)
        }
      }

      if (contentSection === 'crm-int') {
        setCrmSyncLogLoading(true)
        try {
          const r = await fetch('/api/admin/integrations/crm/sync-log', { headers: H })
          const d = await r.json()
          if (!cancelled) setCrmSyncLog(d.log || [])
        } catch (_e) {
          if (!cancelled) setCrmSyncLog([])
        } finally {
          if (!cancelled) setCrmSyncLogLoading(false)
        }
      }

      if (contentSection === 'emir-int') {
        try {
          const senderRes = await fetch('/api/admin/integrations/emir/sender-rules', { headers: H })
          if (senderRes.ok) {
            const senderData = await senderRes.json()
            if (!cancelled) setEmirSenderRules(senderData.rules || [])
          } else {
            throw new Error('fallback')
          }
        } catch (_e) {
          try {
            const senderRes = await fetch('/api/admin/emir/sender-rules', { headers: H })
            const senderData = await senderRes.json()
            if (!cancelled) setEmirSenderRules(senderData.rules || [])
          } catch (_err) {
            if (!cancelled) setEmirSenderRules([])
          }
        }

        try {
          const routingRes = await fetch('/api/admin/integrations/emir/routing-rules', { headers: H })
          if (routingRes.ok) {
            const routingData = await routingRes.json()
            if (!cancelled) setEmirRoutingRules(routingData.rules || [])
          } else {
            throw new Error('fallback')
          }
        } catch (_e) {
          try {
            const routingRes = await fetch('/api/admin/emir/routing-rules', { headers: H })
            const routingData = await routingRes.json()
            if (!cancelled) setEmirRoutingRules(routingData.rules || [])
          } catch (_err) {
            if (!cancelled) setEmirRoutingRules([])
          }
        }
      }

      if (contentSection === 'case-import') {
        setImportJobLoading(true)
        try {
          const r = await fetch('/api/admin/cases/import/jobs', { headers: H })
          const d = await r.json()
          if (!cancelled) setImportJobHistory(d.jobs || [])
        } catch (_e) {
          if (!cancelled) setImportJobHistory([])
        } finally {
          if (!cancelled) setImportJobLoading(false)
        }

        setScheduledExportsLoading(true)
        try {
          const r = await fetch('/api/admin/exports/scheduled', { headers: H })
          const d = await r.json()
          if (!cancelled) setScheduledExports(d.configs || [])
        } catch (_e) {
          if (!cancelled) setScheduledExports([])
        } finally {
          if (!cancelled) setScheduledExportsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [contentSection])

  async function saveIntegrationConfig(type) {
    setIntegrationSaving(true)
    try {
      await fetch(`/api/admin/integrations/${type}/config`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({ config: integrationConfig[type] || {} }),
      })
    } finally {
      setIntegrationSaving(false)
    }
  }

  function renderLockedIntegration(label) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h3 style={{ marginBottom: 8 }}>{label}</h3>
        <p style={{ color: 'var(--text-muted)' }}>This integration is not enabled for your organisation.<br />Please contact us to activate it.</p>
      </div>
    )
  }

  function renderIntegrationConfigField(type, field, label, placeholder, helpText) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", alignItems: "flex-start", gap: "12px 20px", marginBottom: 14, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{label}</div>
          {helpText && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{helpText}</div>}
        </div>
        <input
          className="form-input"
          type="text"
          placeholder={placeholder}
          value={(integrationConfig[type] || {})[field] || ""}
          onChange={e => setIntegrationConfig(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [field]: e.target.value } }))}
          style={{ maxWidth: 480 }}
        />
      </div>
    )
  }

  function renderIntegrationSelect(type, field, label, options, helpText) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", alignItems: "flex-start", gap: "12px 20px", marginBottom: 14, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{label}</div>
          {helpText && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{helpText}</div>}
        </div>
        <select
          className="form-input"
          value={(integrationConfig[type] || {})[field] || ""}
          onChange={e => setIntegrationConfig(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [field]: e.target.value } }))}
          style={{ maxWidth: 480 }}
        >
          <option value="">— Select —</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }

  function renderIntegrationPassword(type, field, label, placeholder, helpText) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", alignItems: "flex-start", gap: "12px 20px", marginBottom: 14, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{label}</div>
          {helpText && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{helpText}</div>}
        </div>
        <input
          className="form-input"
          type="password"
          placeholder={placeholder}
          autoComplete="new-password"
          value={(integrationConfig[type] || {})[field] || ""}
          onChange={e => setIntegrationConfig(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [field]: e.target.value } }))}
          style={{ maxWidth: 480 }}
        />
      </div>
    )
  }

  function renderIntegrationToggle(type, field, label, helpText) {
    const isOn = !!(integrationConfig[type] || {})[field]
    return (
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", alignItems: "center", gap: "12px 20px", marginBottom: 14, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{label}</div>
          {helpText && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{helpText}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            onClick={() => setIntegrationConfig(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [field]: !isOn } }))}
            style={{ width: 44, height: 24, borderRadius: 12, background: isOn ? "var(--accent, #2563eb)" : "var(--border)", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
          >
            <div style={{ position: "absolute", top: 2, left: isOn ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
          </div>
          <span style={{ fontSize: 13, color: isOn ? "var(--accent, #2563eb)" : "var(--text-muted)" }}>{isOn ? "Enabled" : "Disabled"}</span>
        </div>
      </div>
    )
  }

  function renderIntegrationSectionHeader(title) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "28px 0 4px" }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: "var(--accent, #2563eb)", flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{title}</span>
      </div>
    )
  }

  switch (contentSection) {
    case 'mir-int':
      if (integrationStatus['mir'] === false) return renderLockedIntegration('MIR Integration')
      return (
        <div style={{ padding: 24, maxWidth: 900 }}>
          <h2 style={{ marginBottom: 4 }}>MIR Integration</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Configure your Medical Information Request system integration for case synchronisation.</p>

          {renderIntegrationSectionHeader('Connection')}
          {renderIntegrationConfigField('mir', 'system_name', 'System Name / Label', 'e.g. Veeva MedComms, MIRF')}
          {renderIntegrationSelect('mir', 'vendor', 'Vendor / Platform', [{value:'veeva_medcomms',label:'Veeva MedComms'},{value:'mirf',label:'MIRF'},{value:'sfdc_health_cloud',label:'Salesforce Health Cloud'},{value:'custom',label:'Custom'}])}
          {renderIntegrationConfigField('mir', 'endpoint_url', 'Base Endpoint URL', 'https://api.vendor.com/v1')}
          {renderIntegrationConfigField('mir', 'api_version', 'API Version', 'e.g. v1, v2')}
          {renderIntegrationSelect('mir', 'environment', 'Environment', [{value:'production',label:'Production'},{value:'sandbox',label:'Sandbox'},{value:'staging',label:'Staging'}])}
          {renderIntegrationSelect('mir', 'auth_type', 'Authentication Type', [{value:'api_key',label:'API Key'},{value:'oauth2',label:'OAuth 2.0'},{value:'basic_auth',label:'Basic Auth'}])}
          {(integrationConfig['mir'] || {}).auth_type === 'api_key' && (<>
            {renderIntegrationPassword('mir', 'api_key', 'API Key', 'Enter API key')}
            {renderIntegrationConfigField('mir', 'api_key_header', 'API Key Header Name', 'Default: x-api-key')}
          </>)}
          {(integrationConfig['mir'] || {}).auth_type === 'oauth2' && (<>
            {renderIntegrationConfigField('mir', 'oauth_client_id', 'OAuth Client ID', '')}
            {renderIntegrationPassword('mir', 'oauth_client_secret', 'OAuth Client Secret', '')}
            {renderIntegrationConfigField('mir', 'oauth_token_url', 'OAuth Token URL', 'https://...')}
            {renderIntegrationConfigField('mir', 'oauth_scope', 'OAuth Scope', 'e.g. mi.read mi.write')}
            {renderIntegrationSelect('mir', 'oauth_grant_type', 'OAuth Grant Type', [{value:'client_credentials',label:'Client Credentials (M2M)'},{value:'password',label:'Resource Owner Password'}])}
          </>)}
          {(integrationConfig['mir'] || {}).auth_type === 'basic_auth' && (<>
            {renderIntegrationConfigField('mir', 'basic_username', 'Username', '')}
            {renderIntegrationPassword('mir', 'basic_password', 'Password', '')}
          </>)}
          {renderIntegrationSelect('mir', 'protocol', 'Request Protocol', [{value:'REST',label:'REST'},{value:'SOAP',label:'SOAP'},{value:'HL7_FHIR_R4',label:'HL7 FHIR R4'}])}
          {renderIntegrationSelect('mir', 'payload_format', 'Payload Format', [{value:'json',label:'JSON'},{value:'xml',label:'XML'},{value:'hl7_fhir_json',label:'HL7 FHIR JSON'}])}
          {(integrationConfig['mir'] || {}).protocol === 'SOAP' && renderIntegrationConfigField('mir', 'wsdl_url', 'SOAP WSDL URL', 'https://...')}
          {renderIntegrationConfigField('mir', 'timeout_seconds', 'Response Timeout (seconds)', '30')}

          {renderIntegrationSectionHeader('Case Type Mapping')}
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Map MIMS case types and priorities to the codes your external MIR system expects.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {renderIntegrationConfigField('mir', 'case_type_map_MI', 'MI → External Code', 'e.g. MIR, MI_REQUEST')}
            {renderIntegrationConfigField('mir', 'case_type_map_AE', 'AE → External Code', 'e.g. ADE, ADVERSE_EVENT')}
            {renderIntegrationConfigField('mir', 'case_type_map_PC', 'PC → External Code', 'e.g. PQC, PRODUCT_COMPLAINT')}
            {renderIntegrationConfigField('mir', 'priority_map_urgent', 'Priority: Urgent → External', 'e.g. HIGH, P1')}
            {renderIntegrationConfigField('mir', 'priority_map_normal', 'Priority: Normal → External', 'e.g. NORMAL, P3')}
            {renderIntegrationConfigField('mir', 'status_map_open', 'Status: Open → External', 'e.g. NEW, OPEN')}
            {renderIntegrationConfigField('mir', 'status_map_closed', 'Status: Closed → External', 'e.g. RESOLVED, CLOSED')}
            {renderIntegrationConfigField('mir', 'external_id_field', 'External Case ID Field Name', 'e.g. mims_ref, external_reference')}
          </div>

          {renderIntegrationSectionHeader('Sync Settings')}
          {renderIntegrationSelect('mir', 'sync_direction', 'Sync Direction', [{value:'outbound_only',label:'Outbound Only (MIMS → MIR)'},{value:'inbound_only',label:'Inbound Only (MIR → MIMS)'},{value:'bidirectional',label:'Bidirectional'}])}
          {renderIntegrationSelect('mir', 'push_mode', 'Push Mode', [{value:'webhook',label:'Webhook (Event-driven)'},{value:'polling',label:'Scheduled Polling'},{value:'both',label:'Both'}])}
          {renderIntegrationConfigField('mir', 'poll_interval_minutes', 'Poll Interval (minutes)', '60')}
          {renderIntegrationConfigField('mir', 'batch_size', 'Batch Size', '100')}
          {renderIntegrationToggle('mir', 'trigger_on_create', 'Send on Case Created')}
          {renderIntegrationToggle('mir', 'trigger_on_update', 'Send on Case Updated')}
          {renderIntegrationToggle('mir', 'trigger_on_close', 'Send on Case Closed')}
          {renderIntegrationToggle('mir', 'trigger_on_assign', 'Send on Assignment Change')}

          {renderIntegrationSectionHeader('Deduplication')}
          {renderIntegrationSelect('mir', 'dedup_strategy', 'Deduplication Strategy', [{value:'external_id',label:'External ID'},{value:'reference_number',label:'Reference Number'},{value:'composite_key',label:'Composite Key'},{value:'none',label:'None'}])}
          {renderIntegrationSelect('mir', 'on_duplicate', 'On Duplicate Found', [{value:'skip',label:'Skip'},{value:'update_existing',label:'Update Existing'},{value:'flag_for_review',label:'Flag for Review'}])}

          {renderIntegrationSectionHeader('Error Handling & Retry')}
          {renderIntegrationConfigField('mir', 'retry_max_attempts', 'Max Retry Attempts', '3')}
          {renderIntegrationConfigField('mir', 'retry_delay_seconds', 'Retry Delay (seconds)', '1')}
          {renderIntegrationSelect('mir', 'retry_backoff', 'Backoff Strategy', [{value:'fixed',label:'Fixed'},{value:'exponential',label:'Exponential'},{value:'jitter',label:'Jitter'}])}
          {renderIntegrationSelect('mir', 'on_failure', 'On Permanent Failure', [{value:'log_only',label:'Log Only'},{value:'alert_admin',label:'Alert Admin'},{value:'queue_for_manual_review',label:'Queue for Manual Review'}])}
          {renderIntegrationConfigField('mir', 'failure_alert_email', 'Failure Alert Email', '')}
          {renderIntegrationConfigField('mir', 'circuit_breaker_failures', 'Circuit Breaker Threshold (failures)', '5')}
          {renderIntegrationConfigField('mir', 'circuit_breaker_reset_minutes', 'Circuit Breaker Reset (minutes)', '30')}

          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={integrationSaving} onClick={() => saveIntegrationConfig('mir')}>
              {integrationSaving ? 'Saving…' : 'Save Settings'}
            </button>
            <button className="btn btn-secondary" disabled={integrationTestLoading} onClick={async () => {
              setIntegrationTestLoading(true)
              try {
                const r = await fetch('/api/admin/integrations/mir/test-connection', { method: 'POST', headers: H })
                const d = await r.json()
                setIntegrationTestResult(prev => ({ ...prev, mir: d.success ? '✓ MIR connection verified' : '✗ ' + (d.error || 'Connection failed') }))
              } catch (_e) {
                setIntegrationTestResult(prev => ({ ...prev, mir: '✗ Connection failed — check endpoint and credentials' }))
              } finally {
                setIntegrationTestLoading(false)
              }
            }}>{integrationTestLoading ? 'Testing…' : 'Test Connection'}</button>
            {integrationTestResult['mir'] && <span style={{ fontSize: 13, color: integrationTestResult['mir'].startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{integrationTestResult['mir']}</span>}
          </div>

          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Sync Log</h3>
              <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} disabled={mirSyncLogLoading} onClick={async () => {
                setMirSyncLogLoading(true)
                try {
                  const r = await fetch('/api/admin/integrations/mir/sync-log', { headers: H })
                  const d = await r.json()
                  setMirSyncLog(d.log || [])
                } catch (_e) { setMirSyncLog([]) }
                finally { setMirSyncLogLoading(false) }
              }}>{mirSyncLogLoading ? 'Loading…' : 'Refresh'}</button>
            </div>
            {mirSyncLog.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No sync events yet. Click Refresh to load.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Case ID', 'Status', 'Message', 'Timestamp'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>{mirSyncLog.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{row.case_id || '—'}</td>
                    <td style={{ padding: '6px 8px' }}><span style={{ color: row.status === 'success' ? 'var(--success)' : 'var(--warning)' }}>{row.status}</span></td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{row.message || row.error || '—'}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{row.synced_at ? new Date(row.synced_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )

    case 'crm-int':
      if (integrationStatus['crm'] === false) return renderLockedIntegration('CRM Integration')
      return (
        <div style={{ padding: 24, maxWidth: 900 }}>
          <h2 style={{ marginBottom: 4 }}>CRM Integration</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Configure CRM synchronisation for contacts, accounts, and cases.</p>

          {renderIntegrationSectionHeader('Platform')}
          {renderIntegrationSelect('crm', 'crm_platform', 'CRM Platform', [{value:'salesforce',label:'Salesforce'},{value:'veeva_crm',label:'Veeva CRM'},{value:'ms_dynamics',label:'Microsoft Dynamics 365'},{value:'hubspot',label:'HubSpot'},{value:'custom',label:'Custom'}])}
          {renderIntegrationSelect('crm', 'environment', 'Environment', [{value:'production',label:'Production'},{value:'sandbox',label:'Sandbox / Developer Org'}])}
          {renderIntegrationConfigField('crm', 'integration_label', 'Integration Label', 'e.g. Salesforce Prod')}

          {renderIntegrationSectionHeader('Authentication')}
          {(!(integrationConfig['crm'] || {}).crm_platform || (integrationConfig['crm'] || {}).crm_platform === 'salesforce') && (<>
            {renderIntegrationConfigField('crm', 'sf_client_id', 'Client ID (Consumer Key)', '')}
            {renderIntegrationPassword('crm', 'sf_client_secret', 'Client Secret (Consumer Secret)', '')}
            {renderIntegrationConfigField('crm', 'sf_instance_url', 'Instance URL', 'https://mycompany.my.salesforce.com')}
            {renderIntegrationSelect('crm', 'sf_grant_type', 'OAuth Grant Type', [{value:'client_credentials',label:'Client Credentials (Recommended)'},{value:'password',label:'Username + Password'},{value:'jwt_bearer',label:'JWT Bearer'}])}
            {(integrationConfig['crm'] || {}).sf_grant_type === 'password' && (<>
              {renderIntegrationConfigField('crm', 'sf_username', 'Salesforce Username', '')}
              {renderIntegrationPassword('crm', 'sf_password', 'Password + Security Token', '')}
            </>)}
            {renderIntegrationConfigField('crm', 'sf_api_version', 'Salesforce API Version', 'v58.0')}
          </>)}
          {(integrationConfig['crm'] || {}).crm_platform === 'ms_dynamics' && (<>
            {renderIntegrationConfigField('crm', 'dynamics_tenant_id', 'Azure Tenant ID', '')}
            {renderIntegrationConfigField('crm', 'dynamics_client_id', 'Client ID (App Registration)', '')}
            {renderIntegrationPassword('crm', 'dynamics_client_secret', 'Client Secret', '')}
            {renderIntegrationConfigField('crm', 'dynamics_resource_url', 'Resource URL', 'https://mycompany.crm.dynamics.com')}
            {renderIntegrationConfigField('crm', 'dynamics_scope', 'Scope', 'https://mycompany.crm.dynamics.com/.default')}
            {renderIntegrationConfigField('crm', 'dynamics_api_version', 'API Version', 'v9.2')}
          </>)}
          {(integrationConfig['crm'] || {}).crm_platform === 'veeva_crm' && (<>
            {renderIntegrationConfigField('crm', 'veeva_domain', 'Veeva Domain', 'https://mycompany.veevanetwork.com')}
            {renderIntegrationConfigField('crm', 'veeva_username', 'Username', '')}
            {renderIntegrationPassword('crm', 'veeva_password', 'Password', '')}
            {renderIntegrationPassword('crm', 'veeva_security_token', 'Security Token', '')}
            {renderIntegrationSelect('crm', 'veeva_region', 'Region', [{value:'us',label:'US'},{value:'eu',label:'EU'},{value:'apac',label:'APAC'}])}
            {renderIntegrationToggle('crm', 'veeva_use_vault_session', 'Reuse Vault Session from Content Integration')}
          </>)}

          {renderIntegrationSectionHeader('Object Sync')}
          {renderIntegrationToggle('crm', 'sync_contacts', 'Sync Contacts')}
          {renderIntegrationToggle('crm', 'sync_accounts', 'Sync Accounts / Organisations')}
          {renderIntegrationToggle('crm', 'sync_cases', 'Sync Cases')}

          {renderIntegrationSectionHeader('Sync Settings')}
          {renderIntegrationSelect('crm', 'sync_direction', 'Sync Direction', [{value:'mims_to_crm',label:'MIMS → CRM'},{value:'crm_to_mims',label:'CRM → MIMS'},{value:'bidirectional',label:'Bidirectional'}])}
          {renderIntegrationSelect('crm', 'push_mode', 'Push Mode', [{value:'webhook',label:'Webhook'},{value:'polling',label:'Polling'},{value:'both',label:'Both'}])}
          {renderIntegrationConfigField('crm', 'poll_interval_minutes', 'Poll Interval (minutes)', '15')}
          {renderIntegrationConfigField('crm', 'full_sync_cron', 'Full Sync Schedule (cron expression)', '0 2 * * *')}
          {renderIntegrationToggle('crm', 'delta_sync_enabled', 'Delta Sync (only sync changed records)')}
          {renderIntegrationConfigField('crm', 'batch_size', 'Batch Size', '200')}
          {renderIntegrationSelect('crm', 'conflict_strategy', 'Conflict Resolution', [{value:'mims_wins',label:'MIMS Wins'},{value:'crm_wins',label:'CRM Wins'},{value:'last_write_wins',label:'Last Write Wins'},{value:'flag_for_review',label:'Flag for Review'}])}

          {renderIntegrationSectionHeader('Event Triggers')}
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Select which MIMS events trigger a sync to your CRM.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[['case.created','Case Created'],['case.updated','Case Updated'],['case.closed','Case Closed'],['case.assigned','Case Assigned'],['contact.created','Contact Created'],['contact.updated','Contact Updated'],['org.created','Organisation Created'],['mi.response_sent','MI Response Sent'],['ae.submitted','AE Submitted to Regulator']].map(([val, lbl]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '6px 0' }}>
                <input type="checkbox"
                  checked={((integrationConfig['crm'] || {}).event_triggers || []).includes(val)}
                  onChange={e => {
                    const current = (integrationConfig['crm'] || {}).event_triggers || []
                    const updated = e.target.checked ? [...current, val] : current.filter(x => x !== val)
                    setIntegrationConfig(prev => ({ ...prev, crm: { ...(prev['crm'] || {}), event_triggers: updated } }))
                  }}
                />
                {lbl}
              </label>
            ))}
          </div>

          {renderIntegrationSectionHeader('Error Handling & Retry')}
          {renderIntegrationConfigField('crm', 'retry_max_attempts', 'Max Retry Attempts', '3')}
          {renderIntegrationConfigField('crm', 'retry_delay_seconds', 'Retry Delay (seconds)', '1')}
          {renderIntegrationSelect('crm', 'retry_backoff', 'Backoff Strategy', [{value:'fixed',label:'Fixed'},{value:'exponential',label:'Exponential'},{value:'jitter',label:'Jitter'}])}
          {renderIntegrationSelect('crm', 'on_failure', 'On Permanent Failure', [{value:'log_only',label:'Log Only'},{value:'alert_admin',label:'Alert Admin'},{value:'queue_for_manual_review',label:'Queue for Manual Review'}])}
          {renderIntegrationConfigField('crm', 'failure_alert_email', 'Failure Alert Email', '')}
          {renderIntegrationConfigField('crm', 'circuit_breaker_failures', 'Circuit Breaker Threshold (failures)', '5')}
          {renderIntegrationConfigField('crm', 'circuit_breaker_reset_minutes', 'Circuit Breaker Reset (minutes)', '30')}

          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={integrationSaving} onClick={() => saveIntegrationConfig('crm')}>
              {integrationSaving ? 'Saving…' : 'Save Settings'}
            </button>
            <button className="btn btn-secondary" disabled={integrationTestLoading} onClick={async () => {
              setIntegrationTestLoading(true)
              try {
                const r = await fetch('/api/admin/integrations/crm/test-connection', { method: 'POST', headers: H })
                const d = await r.json()
                setIntegrationTestResult(prev => ({ ...prev, crm: d.success ? '✓ CRM connection verified' : '✗ ' + (d.error || 'Connection failed') }))
              } catch (_e) {
                setIntegrationTestResult(prev => ({ ...prev, crm: '✗ Connection failed — check credentials' }))
              } finally {
                setIntegrationTestLoading(false)
              }
            }}>{integrationTestLoading ? 'Testing…' : 'Test Connection'}</button>
            {integrationTestResult['crm'] && <span style={{ fontSize: 13, color: integrationTestResult['crm'].startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{integrationTestResult['crm']}</span>}
          </div>

          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Sync Log</h3>
              <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} disabled={crmSyncLogLoading} onClick={async () => {
                setCrmSyncLogLoading(true)
                try {
                  const r = await fetch('/api/admin/integrations/crm/sync-log', { headers: H })
                  const d = await r.json()
                  setCrmSyncLog(d.log || [])
                } catch (_e) { setCrmSyncLog([]) }
                finally { setCrmSyncLogLoading(false) }
              }}>{crmSyncLogLoading ? 'Loading…' : 'Refresh'}</button>
            </div>
            {crmSyncLog.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No sync events yet. Click Refresh to load.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Case ID', 'Status', 'Message', 'Timestamp'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>{crmSyncLog.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{row.case_id || '—'}</td>
                    <td style={{ padding: '6px 8px' }}><span style={{ color: row.status === 'success' ? 'var(--success)' : 'var(--warning)' }}>{row.status}</span></td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{row.message || row.error || '—'}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{row.synced_at ? new Date(row.synced_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )

    case 'content-int':
      if (integrationStatus['content'] === false) return renderLockedIntegration('Content Integration (Veeva Vault)')
      return (
        <div style={{ padding: 24, maxWidth: 900 }}>
          <h2 style={{ marginBottom: 4 }}>Content Integration — Veeva Vault</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Configure your Veeva Vault connection to sync documents into MIMS Content Management.</p>

          {renderIntegrationSectionHeader('Connection')}
          {renderIntegrationConfigField('content', 'vault_domain', 'Vault Domain', 'https://mycompany.veevavault.com')}
          {renderIntegrationSelect('content', 'vault_environment', 'Environment', [{value:'production',label:'Production'},{value:'sandbox',label:'Sandbox'},{value:'staging',label:'Staging'}])}
          {renderIntegrationSelect('content', 'vault_api_version', 'API Version', [{value:'v24.1',label:'v24.1 (Latest)'},{value:'v23.3',label:'v23.3'},{value:'v23.2',label:'v23.2'},{value:'v22.1',label:'v22.1'}])}
          {renderIntegrationSelect('content', 'auth_type', 'Authentication Type', [{value:'basic',label:'Basic Auth (Username / Password)'},{value:'oauth2',label:'OAuth 2.0 Client Credentials'}])}
          {renderIntegrationConfigField('content', 'vault_username', 'Vault Username', 'service-account@yourcompany.com')}
          {renderIntegrationPassword('content', 'vault_password', 'Vault Password', 'Stored encrypted')}
          {(integrationConfig['content'] || {}).auth_type === 'oauth2' && (<>
            {renderIntegrationConfigField('content', 'oauth_client_id', 'OAuth Client ID', 'Client ID from IdP')}
            {renderIntegrationPassword('content', 'oauth_client_secret', 'OAuth Client Secret', 'Client secret from IdP')}
            {renderIntegrationConfigField('content', 'oauth_token_url', 'OAuth Token URL', 'https://company.okta.com/oauth2/token')}
            {renderIntegrationConfigField('content', 'vault_client_id', 'Vault OAuth Profile Name', 'As registered in Vault Admin')}
          </>)}
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-secondary" disabled={integrationTestLoading} onClick={async () => {
              setIntegrationTestLoading(true)
              try {
                const r = await fetch('/api/admin/integrations/vault/test-connection', { method: 'POST', headers: H })
                const d = await r.json()
                setIntegrationTestResult(prev => ({ ...prev, content: d.success ? '✓ Vault connection verified' : '✗ ' + (d.error || 'Connection failed') }))
              } catch (_e) {
                setIntegrationTestResult(prev => ({ ...prev, content: '✗ Connection failed — check credentials and vault domain' }))
              } finally {
                setIntegrationTestLoading(false)
              }
            }}>{integrationTestLoading ? 'Testing…' : 'Test Connection'}</button>
            {integrationTestResult['content'] && <span style={{ marginLeft: 12, fontSize: 13, color: integrationTestResult['content'].startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{integrationTestResult['content']}</span>}
          </div>

          {renderIntegrationSectionHeader('Sync Settings')}
          {renderIntegrationSelect('content', 'sync_direction', 'Sync Direction', [{value:'pull_only',label:'Pull Only (Vault → MIMS)'},{value:'push_only',label:'Push Only (MIMS → Vault)'},{value:'bidirectional',label:'Bidirectional'}])}
          {renderIntegrationSelect('content', 'sync_mode', 'Sync Mode', [{value:'poll',label:'Scheduled Poll'},{value:'manual_only',label:'Manual Only'}])}
          {renderIntegrationSelect('content', 'poll_interval_hours', 'Poll Interval', [{value:'1',label:'Every 1 hour'},{value:'2',label:'Every 2 hours'},{value:'4',label:'Every 4 hours'},{value:'6',label:'Every 6 hours'},{value:'12',label:'Every 12 hours (Default)'},{value:'24',label:'Every 24 hours'}])}
          {renderIntegrationToggle('content', 'enable_delta_sync', 'Delta Sync — only pull documents changed since last poll')}
          {renderIntegrationToggle('content', 'poll_on_startup', 'Poll on Server Startup')}
          {renderIntegrationConfigField('content', 'max_documents_per_poll', 'Max Documents Per Poll', '100')}

          {renderIntegrationSectionHeader('Document Filters')}
          {renderIntegrationConfigField('content', 'vault_type', 'Document Type (type__v)', 'e.g. medical_information__c, label__c, protocol__c')}
          {renderIntegrationConfigField('content', 'vault_subtype', 'Document Subtype (subtype__v)', 'e.g. standard_response__c, product_monograph__c')}
          {renderIntegrationConfigField('content', 'vault_classification', 'Document Classification (classification__v)', 'e.g. approved_standard_response__c')}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Status Filter (status__v)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {['approved__v','in_review__v','expired__v','archived__v','withdrawn__v','superseded__v'].map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox"
                    checked={((integrationConfig['content'] || {}).pull_status_filter || []).includes(s)}
                    onChange={e => {
                      const current = (integrationConfig['content'] || {}).pull_status_filter || []
                      const updated = e.target.checked ? [...current, s] : current.filter(x => x !== s)
                      setIntegrationConfig(prev => ({ ...prev, content: { ...(prev['content'] || {}), pull_status_filter: updated } }))
                    }}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          {renderIntegrationConfigField('content', 'pull_product_filter', 'Product Filter', 'Comma-separated product names (blank = all)')}
          {renderIntegrationConfigField('content', 'pull_country_filter', 'Country Filter', 'ISO country codes comma-separated (blank = all)')}
          {renderIntegrationConfigField('content', 'pull_language_filter', 'Language Filter', 'ISO language codes comma-separated (blank = all)')}
          {renderIntegrationToggle('content', 'include_all_versions', 'Include All Versions (off = latest version only)')}
          {renderIntegrationToggle('content', 'include_draft', 'Include Draft Documents')}

          {renderIntegrationSectionHeader('Document Type Mapping (Vault → MIMS Category)')}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Vault Type','Vault Subtype','Vault Classification','MIMS Category','Auto Ingest','Overwrite',''].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vaultTypeMapRows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '12px 8px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No mappings defined. Add a mapping below.</td></tr>
              )}
              {vaultTypeMapRows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>{row.vault_type || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{row.vault_subtype || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{row.vault_classification || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{row.mims_cm_category || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{row.auto_ingest ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '6px 8px' }}>{row.overwrite_on_update ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '6px 8px' }}><button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setVaultTypeMapRows(prev => prev.filter((_, i) => i !== idx))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-secondary" style={{ marginBottom: 12 }} onClick={() => setShowVaultTypeMapForm(v => !v)}>
            {showVaultTypeMapForm ? 'Cancel' : '+ Add Mapping'}
          </button>
          {showVaultTypeMapForm && (
            <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                {[['vault_type','Vault Type (type__v)','medical_information__c'],['vault_subtype','Vault Subtype (optional)','standard_response__c'],['vault_classification','Vault Classification (optional)','approved__c'],['mims_cm_category','MIMS CM Category','Medical Information']].map(([field, label, ph]) => (
                  <div key={field}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>{label}</label>
                    <input className="form-input" placeholder={ph} value={newVaultTypeMap[field] || ''} onChange={e => setNewVaultTypeMap(prev => ({ ...prev, [field]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={!!newVaultTypeMap.auto_ingest} onChange={e => setNewVaultTypeMap(prev => ({ ...prev, auto_ingest: e.target.checked }))} /> Auto Ingest
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={!!newVaultTypeMap.overwrite_on_update} onChange={e => setNewVaultTypeMap(prev => ({ ...prev, overwrite_on_update: e.target.checked }))} /> Overwrite on Update
                  </label>
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => {
                if (!newVaultTypeMap.vault_type || !newVaultTypeMap.mims_cm_category) return
                setVaultTypeMapRows(prev => [...prev, { ...newVaultTypeMap }])
                setNewVaultTypeMap({ vault_type: '', vault_subtype: '', vault_classification: '', mims_cm_category: '', auto_ingest: false, overwrite_on_update: false })
                setShowVaultTypeMapForm(false)
              }}>Add Mapping</button>
            </div>
          )}

          {renderIntegrationSectionHeader('Error Handling & Retry')}
          {renderIntegrationConfigField('content', 'max_retry_attempts', 'Max Retry Attempts', '3')}
          {renderIntegrationConfigField('content', 'retry_delay_seconds', 'Retry Delay (seconds)', '2')}
          {renderIntegrationSelect('content', 'retry_backoff', 'Backoff Strategy', [{value:'fixed',label:'Fixed'},{value:'exponential',label:'Exponential'},{value:'jitter',label:'Jitter'}])}
          {renderIntegrationConfigField('content', 'failure_alert_email', 'Failure Alert Email', 'admin@yourcompany.com')}
          {renderIntegrationConfigField('content', 'circuit_breaker_failures', 'Circuit Breaker Threshold (consecutive failures)', '5')}
          {renderIntegrationConfigField('content', 'circuit_breaker_reset_hours', 'Circuit Breaker Reset (hours)', '1')}

          <div style={{ marginTop: 24 }}>
            <button className="btn btn-primary" disabled={integrationSaving} onClick={() => saveIntegrationConfig('content')}>
              {integrationSaving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )

    case 'emir-int':
      if (integrationStatus['emir'] === false) return renderLockedIntegration('EMIR Integration')
      return (
        <div style={{ padding: 24, maxWidth: 900 }}>
          <h2 style={{ marginBottom: 4 }}>EMIR Integration — Inbound Email Processing</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Configure inbound email processing to auto-receive medical information requests and create MIMS cases.</p>

          {renderIntegrationSectionHeader('Email Server')}
          {renderIntegrationSelect('emir', 'protocol', 'Protocol', [{value:'IMAP',label:'IMAP'},{value:'POP3',label:'POP3'}])}
          {renderIntegrationConfigField('emir', 'imap_host', 'Mail Server Host', 'imap.yourcompany.com')}
          {renderIntegrationConfigField('emir', 'imap_port', 'Port', '993')}
          {renderIntegrationSelect('emir', 'imap_encryption', 'Encryption', [{value:'SSL',label:'SSL/TLS'},{value:'STARTTLS',label:'STARTTLS'},{value:'none',label:'None'}])}
          {renderIntegrationSelect('emir', 'auth_method', 'Authentication Method', [{value:'password',label:'Username / Password'},{value:'oauth2',label:'OAuth 2.0 (Microsoft 365 / Gmail)'}])}
          {renderIntegrationConfigField('emir', 'imap_username', 'Username / Email Address', 'emir@yourcompany.com')}
          {(integrationConfig['emir'] || {}).auth_method !== 'oauth2' && renderIntegrationPassword('emir', 'imap_password', 'Password', 'Stored encrypted')}
          {(integrationConfig['emir'] || {}).auth_method === 'oauth2' && (<>
            {renderIntegrationSelect('emir', 'oauth_provider', 'OAuth Provider', [{value:'microsoft365',label:'Microsoft 365'},{value:'gmail',label:'Gmail'},{value:'custom',label:'Custom'}])}
            {renderIntegrationConfigField('emir', 'oauth_client_id', 'OAuth Client ID', '')}
            {renderIntegrationPassword('emir', 'oauth_client_secret', 'OAuth Client Secret', '')}
            {renderIntegrationConfigField('emir', 'oauth_tenant_id', 'Azure Tenant ID', 'Microsoft 365 only')}
          </>)}
          {renderIntegrationConfigField('emir', 'inbound_email', 'Monitored Inbox Address', 'emir@yourcompany.com')}
          {renderIntegrationConfigField('emir', 'mailbox_folder', 'Mailbox Folder', 'INBOX')}
          {renderIntegrationConfigField('emir', 'move_to_folder', 'Move Processed Emails To', 'MIMS-Processed')}
          {renderIntegrationConfigField('emir', 'poll_interval_min', 'Poll Interval (minutes)', '5')}
          {renderIntegrationConfigField('emir', 'max_attachment_mb', 'Max Attachment Size (MB)', '10')}

          {renderIntegrationSectionHeader('Sender Rules')}
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Define whitelist and blacklist rules to control which senders are accepted.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Rule Type','Match Type','Value','Action',''].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {emirSenderRules.length === 0 && <tr><td colSpan={5} style={{ padding: '12px 8px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No rules defined.</td></tr>}
              {emirSenderRules.map((rule, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>{rule.rule_type}</td>
                  <td style={{ padding: '6px 8px' }}>{rule.match_type}</td>
                  <td style={{ padding: '6px 8px' }}>{rule.value}</td>
                  <td style={{ padding: '6px 8px' }}>{rule.action}</td>
                  <td style={{ padding: '6px 8px' }}><button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={async () => {
                    if (rule.id) {
                      try { await fetch(`/api/admin/emir/sender-rules/${rule.id}`, { method: 'DELETE', headers: H }) } catch (_e) {}
                    }
                    setEmirSenderRules(prev => prev.filter((_, i) => i !== idx))
                  }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
                <select className="form-input" style={{ width: 120 }} value={emirSenderForm.rule_type} onChange={e => setEmirSenderForm(f => ({ ...f, rule_type: e.target.value }))}>
                  <option value="whitelist">Whitelist</option><option value="blacklist">Blacklist</option>
                </select>
                <select className="form-input" style={{ width: 130 }} value={emirSenderForm.match_type} onChange={e => setEmirSenderForm(f => ({ ...f, match_type: e.target.value }))}>
                  <option value="exact_email">Exact Email</option><option value="domain">Domain</option><option value="regex">Regex</option>
                </select>
                <input className="form-input" style={{ width: 200 }} placeholder="e.g. @ema.europa.eu" value={emirSenderForm.value} onChange={e => setEmirSenderForm(f => ({ ...f, value: e.target.value }))} />
                <select className="form-input" style={{ width: 160 }} value={emirSenderForm.action} onChange={e => setEmirSenderForm(f => ({ ...f, action: e.target.value }))}>
                  <option value="reject_silently">Reject Silently</option><option value="send_rejection_reply">Send Rejection Reply</option><option value="quarantine">Quarantine</option>
                </select>
                <button className="btn btn-secondary" onClick={async () => {
                if (!emirSenderForm.value) return;
                try {
                  const r = await fetch('/api/admin/emir/sender-rules', { method: 'POST', headers: H, body: JSON.stringify(emirSenderForm) })
                  const d = await r.json()
                  if (r.ok) {
                    setEmirSenderRules(prev => [...prev, { ...emirSenderForm, id: d.id }])
                    setEmirSenderForm({ rule_type: 'whitelist', match_type: 'domain', value: '', action: 'reject_silently' })
                  }
                } catch (_e) {}
              }}>+ Add Rule</button>
              </div>

          {renderIntegrationSectionHeader('Attachment Rules')}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Allowed MIME Types</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {[['application/pdf','PDF'],['application/msword','Word (.doc)'],['application/vnd.openxmlformats-officedocument.wordprocessingml.document','Word (.docx)'],['text/xml','XML']].map(([mime, lbl]) => (
                <label key={mime} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox"
                    checked={((integrationConfig['emir'] || {}).allowed_mime_types || []).includes(mime)}
                    onChange={e => {
                      const current = (integrationConfig['emir'] || {}).allowed_mime_types || []
                      const updated = e.target.checked ? [...current, mime] : current.filter(x => x !== mime)
                      setIntegrationConfig(prev => ({ ...prev, emir: { ...(prev['emir'] || {}), allowed_mime_types: updated } }))
                    }}
                  />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
          {renderIntegrationConfigField('emir', 'total_max_size_mb', 'Max Total Attachment Size (MB)', '50')}
          {renderIntegrationToggle('emir', 'parse_emir_xml', 'Parse EMIR XML Attachments (auto-extract structured fields)')}
          {renderIntegrationSelect('emir', 'emir_xml_schema_version', 'EMIR XML Schema Version', [{value:'2.0',label:'2.0'},{value:'3.0',label:'3.0'}])}
          {renderIntegrationToggle('emir', 'quarantine_on_fail', 'Quarantine Attachments That Fail Validation')}
          {renderIntegrationToggle('emir', 'virus_scan_enabled', 'Enable Virus Scanning (requires ClamAV)')}

          {renderIntegrationSectionHeader('Auto-Case Routing Rules')}
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Define rules to automatically route incoming emails to the correct case type and assignee.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#','Rule Name','Match Field','Match Value','Case Type','Priority',''].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {emirRoutingRules.length === 0 && <tr><td colSpan={7} style={{ padding: '12px 8px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No routing rules defined. First matching rule wins.</td></tr>}
              {emirRoutingRules.map((rule, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                  <td style={{ padding: '6px 8px' }}>{rule.rule_name}</td>
                  <td style={{ padding: '6px 8px' }}>{rule.match_field}</td>
                  <td style={{ padding: '6px 8px' }}>{rule.match_value}</td>
                  <td style={{ padding: '6px 8px' }}>{rule.case_type}</td>
                  <td style={{ padding: '6px 8px' }}>{rule.default_priority}</td>
                  <td style={{ padding: '6px 8px' }}><button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={async () => {
                    if (rule.id) {
                      try { await fetch(`/api/admin/emir/routing-rules/${rule.id}`, { method: 'DELETE', headers: H }) } catch (_e) {}
                    }
                    setEmirRoutingRules(prev => prev.filter((_, i) => i !== idx))
                  }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Rule Name</label><input className="form-input" value={emirRouteForm.rule_name} onChange={e => setEmirRouteForm(f => ({ ...f, rule_name: e.target.value }))} /></div>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Match Field</label>
                    <select className="form-input" value={emirRouteForm.match_field} onChange={e => setEmirRouteForm(f => ({ ...f, match_field: e.target.value }))}>
                      <option value="subject">Subject</option><option value="body">Body</option><option value="sender_domain">Sender Domain</option><option value="sender_email">Sender Email</option><option value="attachment_name">Attachment Name</option>
                    </select>
                  </div>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Match Type</label>
                    <select className="form-input" value={emirRouteForm.match_type} onChange={e => setEmirRouteForm(f => ({ ...f, match_type: e.target.value }))}>
                      <option value="contains">Contains</option><option value="regex">Regex</option><option value="exact">Exact</option><option value="starts_with">Starts With</option>
                    </select>
                  </div>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Match Value</label><input className="form-input" value={emirRouteForm.match_value} onChange={e => setEmirRouteForm(f => ({ ...f, match_value: e.target.value }))} /></div>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Case Type</label>
                    <select className="form-input" value={emirRouteForm.case_type} onChange={e => setEmirRouteForm(f => ({ ...f, case_type: e.target.value }))}>
                      <option value="MI">MI</option><option value="AE">AE</option><option value="PC">PC</option>
                    </select>
                  </div>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Priority</label>
                    <select className="form-input" value={emirRouteForm.default_priority} onChange={e => setEmirRouteForm(f => ({ ...f, default_priority: e.target.value }))}>
                      <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={async () => {
                if (!emirRouteForm.rule_name || !emirRouteForm.match_value) return;
                try {
                  const r = await fetch('/api/admin/emir/routing-rules', { method: 'POST', headers: H, body: JSON.stringify(emirRouteForm) })
                  const d = await r.json()
                  if (r.ok) {
                    setEmirRoutingRules(prev => [...prev, { ...emirRouteForm, id: d.id }])
                    setEmirRouteForm({ rule_name: '', match_field: 'subject', match_type: 'contains', match_value: '', case_type: 'MI', default_priority: 'normal' })
                  }
                } catch (_e) {}
              }}>+ Add Rule</button>
              </div>

          {renderIntegrationSectionHeader('Acknowledgement Email')}
          {renderIntegrationToggle('emir', 'ack_enabled', 'Enable Auto-Acknowledgement')}
          {renderIntegrationConfigField('emir', 'ack_from_email', 'From Email Address', 'noreply@yourcompany.com')}
          {renderIntegrationConfigField('emir', 'ack_from_name', 'From Display Name', 'MIMS Medical Information')}
          {renderIntegrationConfigField('emir', 'ack_subject_template', 'Subject Template', 'Your request {{reference_number}} has been received')}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Acknowledgement Body (HTML)</label>
            <textarea
              className="form-input"
              rows={6}
              placeholder={'<p>Dear Requester,</p>\n<p>We have received your medical information request (Ref: {{reference_number}}).</p>\n<p>Our team at {{org_name}} will respond within 3 business days.</p>'}
              value={(integrationConfig['emir'] || {}).ack_body_html || ''}
              onChange={e => setIntegrationConfig(prev => ({ ...prev, emir: { ...(prev['emir'] || {}), ack_body_html: e.target.value } }))}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            />
          </div>
          {renderIntegrationConfigField('emir', 'ack_cc', 'CC (comma-separated)', '')}
          {renderIntegrationConfigField('emir', 'ack_bcc', 'BCC (comma-separated)', '')}
          {renderIntegrationToggle('emir', 'ack_send_on_duplicate', 'Send Acknowledgement for Duplicate Requests')}

          {renderIntegrationSectionHeader('Deduplication')}
          {renderIntegrationSelect('emir', 'dedup_strategy', 'Deduplication Strategy', [{value:'both',label:'Message ID + Hash (Recommended)'},{value:'message_id',label:'Message ID Only'},{value:'hash',label:'Hash Only'}])}
          {renderIntegrationSelect('emir', 'dedup_action', 'On Duplicate Detected', [{value:'reject',label:'Reject'},{value:'flag_and_create',label:'Flag and Create Anyway'},{value:'link_to_existing',label:'Link to Existing Request'}])}
          {renderIntegrationConfigField('emir', 'dedup_window_hours', 'Deduplication Window (hours, 0 = all time)', '0')}
          {renderIntegrationToggle('emir', 'subject_normalize', 'Normalise Subject (strip RE:, FW:) before deduplication')}

          <div style={{ marginTop: 24 }}>
            <button className="btn btn-primary" disabled={integrationSaving} onClick={() => saveIntegrationConfig('emir')}>
              {integrationSaving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )

    case 'case-import': {
      const handleCaseExport = async () => {
        setCaseExportLoading(true)
        setCaseExportMsg('')
        try {
          const params = new URLSearchParams()
          if (caseExportFilters.case_type)   params.set('case_type', caseExportFilters.case_type)
          if (caseExportFilters.date_from)   params.set('date_from', caseExportFilters.date_from)
          if (caseExportFilters.date_to)     params.set('date_to', caseExportFilters.date_to)
          if (caseExportFilters.status_id)   params.set('status_id', caseExportFilters.status_id)
          if (caseExportFilters.assigned_to) params.set('assigned_to', caseExportFilters.assigned_to)
          params.set('format', caseExportFilters.format || 'csv')
          const response = await fetch(`/api/admin/cases/export?${params.toString()}`, { headers: H })
          if (response.headers.get('content-type')?.includes('text/csv')) {
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'cases.csv'
            a.click()
            URL.revokeObjectURL(url)
          } else {
            const d = await response.json()
            setCaseExportMsg(d.message || d.error || 'No cases found.')
          }
        } catch (_e) {
          setCaseExportMsg('Export failed. Please try again.')
        } finally {
          setCaseExportLoading(false)
        }
      }
      return (
        <div style={{ padding: 24, maxWidth: 900 }}>
          <h2 style={{ marginBottom: 4 }}>Case Import / Export</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Export filtered cases in multiple formats or import cases from external files.</p>
          <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid var(--border)' }}>
            {[['export','Export Cases'],['import','Import Cases'],['scheduled','Scheduled Exports']].map(([tab, label]) => (
              <button key={tab} onClick={() => setCaseImportTab(tab)} style={{ padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: caseImportTab === tab ? 600 : 400, color: caseImportTab === tab ? 'var(--accent)' : 'var(--text-muted)', borderBottom: caseImportTab === tab ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -2 }}>
                {label}
              </button>
            ))}
          </div>

          {caseImportTab === 'export' && (<>
            {renderIntegrationSectionHeader('Export Filters')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 700 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Case Type</label>
                <select className="form-input" value={caseExportFilters.case_type} onChange={e => setCaseExportFilters(f => ({ ...f, case_type: e.target.value }))}>
                  <option value="">All Types</option><option value="MI">MI</option><option value="AE">AE</option><option value="PC">PC</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Export Format</label>
                <select className="form-input" value={caseExportFilters.format || 'csv'} onChange={e => setCaseExportFilters(f => ({ ...f, format: e.target.value }))}>
                  <option value="csv">CSV</option><option value="xlsx">Excel (XLSX)</option><option value="json">JSON</option><option value="e2b_r3">E2B R3 (Regulatory XML)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Date Field</label>
                <select className="form-input" value={caseExportFilters.date_field || 'created_at'} onChange={e => setCaseExportFilters(f => ({ ...f, date_field: e.target.value }))}>
                  <option value="created_at">Created Date</option><option value="updated_at">Updated Date</option><option value="date_received">Date Received</option><option value="date_of_intake">Date of Intake</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Priority</label>
                <select className="form-input" value={caseExportFilters.priority || ''} onChange={e => setCaseExportFilters(f => ({ ...f, priority: e.target.value }))}>
                  <option value="">All Priorities</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Date From</label>
                <input className="form-input" type="date" value={caseExportFilters.date_from} onChange={e => setCaseExportFilters(f => ({ ...f, date_from: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Date To</label>
                <input className="form-input" type="date" value={caseExportFilters.date_to} onChange={e => setCaseExportFilters(f => ({ ...f, date_to: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Intake Channel</label>
                <select className="form-input" value={caseExportFilters.intake_channel || ''} onChange={e => setCaseExportFilters(f => ({ ...f, intake_channel: e.target.value }))}>
                  <option value="">All Channels</option><option value="manual">Manual</option><option value="email">Email</option><option value="emir">EMIR</option><option value="api">API</option><option value="import">Import</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Is Serious (AE only)</label>
                <select className="form-input" value={caseExportFilters.is_serious || ''} onChange={e => setCaseExportFilters(f => ({ ...f, is_serious: e.target.value }))}>
                  <option value="">All</option><option value="1">Serious Only</option><option value="0">Non-Serious Only</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={redactPii} onChange={e => setRedactPii(e.target.checked)} />
                Redact PII — anonymise patient name, date of birth, and address in export
              </label>
            </div>

            {(caseExportFilters.format === 'e2b_r3') && (
              <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>E2B R3 Submission Configuration</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[['sender_org','Sender Organisation','Your company name'],['sender_id','Sender ID (MAH Identifier)','e.g. EU/1/96/007'],['receiver_id','Receiver ID (EMA/FDA Gateway)','e.g. EMEA-0000066'],['meddra_version','MedDRA Version','e.g. 26.1'],['expedited_days','Expedited Report Days','15']].map(([field, label, ph]) => (
                    <div key={field}>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>{label}</label>
                      <input className="form-input" placeholder={ph} value={e2bConfig[field] || ''} onChange={e => setE2bConfig(prev => ({ ...prev, [field]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {caseExportMsg && <p style={{ marginBottom: 12, color: 'var(--text-muted)' }}>{caseExportMsg}</p>}
            <button className="btn btn-primary" disabled={caseExportLoading} onClick={handleCaseExport}>
              {caseExportLoading ? 'Preparing download…' : 'Download Cases'}
            </button>
          </>)}

          {caseImportTab === 'import' && (<>
            <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 8px' }}>Case Import</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Upload a CSV, Excel, or XML file to bulk-import cases into MIMS. Field mapping and validation rules are applied automatically based on the configuration below.</p>
            </div>
            {renderIntegrationSectionHeader('Import Configuration')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 700, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Import Format</label>
                <select className="form-input">
                  <option value="csv">CSV</option><option value="xlsx">Excel XLSX</option><option value="xml">XML</option><option value="json">JSON</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Default Case Type</label>
                <select className="form-input">
                  <option value="MI">MI — Medical Information</option><option value="AE">AE — Adverse Event</option><option value="PC">PC — Product Complaint</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Encoding</label>
                <select className="form-input"><option value="UTF-8">UTF-8</option><option value="ISO-8859-1">ISO-8859-1</option><option value="Windows-1252">Windows-1252</option></select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Date Format</label>
                <select className="form-input">
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="DD-MMM-YYYY">DD-MMM-YYYY</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>CSV Delimiter</label>
                <select className="form-input"><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="\t">Tab</option><option value="|">Pipe (|)</option></select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>On Validation Error</label>
                <select className="form-input">
                  <option value="abort">Abort Import</option><option value="skip_row">Skip Invalid Rows</option><option value="quarantine">Quarantine Invalid Rows</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" /> Has Header Row
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer' }}>
                <input type="checkbox" /> Dry Run — validate without importing
              </label>
            </div>
            <div style={{ border: `2px dashed ${importFile ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: 32, textAlign: 'center', marginBottom: 24, cursor: 'pointer' }} onClick={() => document.getElementById('case-import-file-input').click()}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
              <p style={{ margin: '0 0 8px', fontWeight: 500 }}>{importFile ? importFile.name : 'Drop file here or click to browse'}</p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{importFile ? `${(importFile.size / 1024).toFixed(1)} KB — ready to upload` : 'Supported: .csv, .xlsx, .xls, .xml, .json'}</p>
              <input id="case-import-file-input" type="file" accept=".csv,.xlsx,.xls,.xml,.json" style={{ display: 'none' }} onChange={e => { setImportFile(e.target.files[0] || null); setImportUploadMsg('') }} />
            </div>
            {renderIntegrationSectionHeader('Field Mapping')}
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Standard field mapping applied automatically. Full dynamic mapping available in Sprint 12.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Source Column','MIMS Table','MIMS Field','Transform'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[['case_number','cases','case_number','Direct'],['case_type','cases','case_type','Uppercase'],['date_received','cases','date_received','Date Convert'],['priority','cases','priority','Lowercase'],['intake_channel','cases','intake_channel','Direct'],['first_name','case_contacts','first_name','Trim'],['last_name','case_contacts','last_name','Trim'],['email','case_contacts','email','Lowercase']].map(([src, tbl, fld, trx], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{src}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{tbl}</td>
                    <td style={{ padding: '6px 8px' }}>{fld}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{trx}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {importUploadMsg && <p style={{ marginBottom: 12, fontSize: 13, color: importUploadMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{importUploadMsg}</p>}
            <button className="btn btn-primary" disabled={!importFile || importUploading} style={{ opacity: (!importFile || importUploading) ? 0.6 : 1 }} onClick={async () => {
              if (!importFile) return
              setImportUploading(true)
              setImportUploadMsg('')
              try {
                const fd = new FormData()
                fd.append('file', importFile)
                const res = await fetch('/api/admin/cases/import/upload', {
                  method: 'POST',
                  headers: { Authorization: H.Authorization },
                  body: fd,
                })
                const d = await res.json()
                if (res.ok) {
                  setImportUploadMsg(`✓ Import job started — Job ID: ${d.jobId || d.id || 'queued'}. Check Import Job History to track progress.`)
                  setImportFile(null)
                  document.getElementById('case-import-file-input').value = ''
                } else {
                  setImportUploadMsg(d.error || 'Upload failed.')
                }
              } catch (_e) {
                setImportUploadMsg('Upload failed — please try again.')
              } finally {
                setImportUploading(false)
              }
            }}>{importUploading ? 'Uploading…' : 'Import Cases'}</button>
            <div style={{ marginTop: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Import Job History</h3>
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} disabled={importJobLoading} onClick={async () => {
                  setImportJobLoading(true)
                  try {
                    const r = await fetch('/api/admin/cases/import/jobs', { headers: H })
                    const d = await r.json()
                    setImportJobHistory(d.jobs || [])
                  } catch (_e) { setImportJobHistory([]) }
                  finally { setImportJobLoading(false) }
                }}>{importJobLoading ? 'Loading…' : 'Refresh'}</button>
              </div>
              {importJobHistory.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No import jobs yet. Click Refresh to load.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Job ID', 'File', 'Status', 'Rows', 'Created', 'Completed'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{importJobHistory.map((job, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{job.id}</td>
                      <td style={{ padding: '6px 8px' }}>{job.filename || '—'}</td>
                      <td style={{ padding: '6px 8px' }}><span style={{ color: job.status === 'completed' ? 'var(--success)' : job.status === 'failed' ? 'var(--warning)' : 'var(--text-muted)' }}>{job.status}</span></td>
                      <td style={{ padding: '6px 8px' }}>{job.rows_imported != null ? `${job.rows_imported}/${job.total_rows || '?'}` : '—'}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{job.created_at ? new Date(job.created_at).toLocaleString() : '—'}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{job.completed_at ? new Date(job.completed_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </>)}
          {caseImportTab === 'scheduled' && (
            <div>
              <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 8px' }}>Scheduled Exports</h3>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Configure recurring case export jobs. Exports are generated on the defined schedule and delivered by email.</p>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 16px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>New Scheduled Export</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 700 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Name</label>
                    <input className="form-input" placeholder="e.g. Weekly MI Export" value={scheduledExportForm.name} onChange={e => setScheduledExportForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Schedule (Cron)</label>
                    <input className="form-input" placeholder="e.g. 0 8 * * 1 (Mon 8am)" value={scheduledExportForm.cron_expression} onChange={e => setScheduledExportForm(f => ({ ...f, cron_expression: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Format</label>
                    <select className="form-input" value={scheduledExportForm.format} onChange={e => setScheduledExportForm(f => ({ ...f, format: e.target.value }))}>
                      <option value="csv">CSV</option><option value="xlsx">Excel (XLSX)</option><option value="json">JSON</option><option value="e2b_r3">E2B R3</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Case Type</label>
                    <select className="form-input" value={scheduledExportForm.case_type} onChange={e => setScheduledExportForm(f => ({ ...f, case_type: e.target.value }))}>
                      <option value="">All Types</option><option value="MI">MI</option><option value="AE">AE</option><option value="PC">PC</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Deliver to Email(s)</label>
                    <input className="form-input" placeholder="email1@example.com, email2@example.com" value={scheduledExportForm.email_to} onChange={e => setScheduledExportForm(f => ({ ...f, email_to: e.target.value }))} />
                  </div>
                </div>
                {scheduledExportMsg && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>{scheduledExportMsg}</p>}
                <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={scheduledExportSaving} onClick={async () => {
                  if (!scheduledExportForm.name || !scheduledExportForm.cron_expression) {
                    setScheduledExportMsg('Name and schedule are required.')
                    return
                  }
                  setScheduledExportSaving(true)
                  setScheduledExportMsg('')
                  try {
                    const r = await fetch('/api/admin/exports/scheduled', { method: 'POST', headers: H, body: JSON.stringify(scheduledExportForm) })
                    const d = await r.json()
                    if (r.ok) {
                      setScheduledExportMsg('Scheduled export created.')
                      setScheduledExportForm({ name: '', cron_expression: '', format: 'csv', case_type: '', email_to: '', is_active: true })
                      const r2 = await fetch('/api/admin/exports/scheduled', { headers: H })
                      const d2 = await r2.json()
                      setScheduledExports(d2.configs || [])
                    } else {
                      setScheduledExportMsg(d.error || 'Failed to create.')
                    }
                  } catch (_e) { setScheduledExportMsg('Request failed.') }
                  finally { setScheduledExportSaving(false) }
                }}>{scheduledExportSaving ? 'Saving…' : 'Create Schedule'}</button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Active Schedules</h4>
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} disabled={scheduledExportsLoading} onClick={async () => {
                  setScheduledExportsLoading(true)
                  try {
                    const r = await fetch('/api/admin/exports/scheduled', { headers: H })
                    const d = await r.json()
                    setScheduledExports(d.configs || [])
                  } catch (_e) { setScheduledExports([]) }
                  finally { setScheduledExportsLoading(false) }
                }}>{scheduledExportsLoading ? 'Loading…' : 'Refresh'}</button>
              </div>
              {scheduledExports.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No scheduled exports configured. Create one above.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Name', 'Schedule', 'Format', 'Case Type', 'Email To', 'Active', ''].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{scheduledExports.map((cfg, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{cfg.name}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{cfg.cron_expression}</td>
                      <td style={{ padding: '6px 8px' }}>{cfg.format?.toUpperCase()}</td>
                      <td style={{ padding: '6px 8px' }}>{cfg.case_type || 'All'}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 12 }}>{cfg.email_to || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{cfg.is_active ? '✓' : '—'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={async () => {
                          if (!window.confirm('Delete this scheduled export?')) return
                          try {
                            await fetch(`/api/admin/exports/scheduled/${cfg.id}`, { method: 'DELETE', headers: H })
                            setScheduledExports(prev => prev.filter((_, idx) => idx !== i))
                          } catch (_e) {}
                        }}>Delete</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )
    }

    default:
      return null
  }
}
