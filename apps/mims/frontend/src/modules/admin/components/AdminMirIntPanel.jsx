import { useState } from 'react'
import { LockedIntegration, IntegrationSectionHeader, useIntegrationHelpers } from './AdminIntegrationShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function AdminMirIntPanel({ config, setConfig, status, H }) {
  const [saving, setSaving] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [syncLog, setSyncLog] = useState([])
  const [syncLogLoading, setSyncLogLoading] = useState(false)
  const { renderConfigField, renderSelect, renderPassword, renderToggle } = useIntegrationHelpers(config, setConfig)

  if (status === false) return <LockedIntegration label="MIR Integration" />

  async function save() {
    setSaving(true)
    try {
      await httpFetch('/api/admin/integrations/mir/config', { method: 'PUT', headers: H, body: JSON.stringify({ config }) })
    } finally { setSaving(false) }
  }

  async function testConnection() {
    setTestLoading(true)
    try {
      const r = await httpFetch('/api/admin/integrations/mir/test-connection', { method: 'POST', headers: H })
      const d = await r.json()
      setTestResult(d.success ? '✓ MIR connection verified' : '✗ ' + (d.error || 'Connection failed'))
    } catch { setTestResult('✗ Connection failed — check endpoint and credentials') }
    finally { setTestLoading(false) }
  }

  async function refreshSyncLog() {
    setSyncLogLoading(true)
    try {
      const r = await httpFetch('/api/admin/integrations/mir/sync-log', { headers: H })
      const d = await r.json()
      setSyncLog(d.log || [])
    } catch { setSyncLog([]) }
    finally { setSyncLogLoading(false) }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ marginBottom: 4 }}>MIR Integration</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Configure your Medical Information Request system integration for case synchronisation.</p>

      <IntegrationSectionHeader title="Connection" />
      {renderConfigField('system_name', 'System Name / Label', 'e.g. Veeva MedComms, MIRF')}
      {renderSelect('vendor', 'Vendor / Platform', [{value:'veeva_medcomms',label:'Veeva MedComms'},{value:'mirf',label:'MIRF'},{value:'sfdc_health_cloud',label:'Salesforce Health Cloud'},{value:'custom',label:'Custom'}])}
      {renderConfigField('endpoint_url', 'Base Endpoint URL', 'https://api.vendor.com/v1')}
      {renderConfigField('api_version', 'API Version', 'e.g. v1, v2')}
      {renderSelect('environment', 'Environment', [{value:'production',label:'Production'},{value:'sandbox',label:'Sandbox'},{value:'staging',label:'Staging'}])}
      {renderSelect('auth_type', 'Authentication Type', [{value:'api_key',label:'API Key'},{value:'oauth2',label:'OAuth 2.0'},{value:'basic_auth',label:'Basic Auth'}])}
      {config.auth_type === 'api_key' && (<>
        {renderPassword('api_key', 'API Key', 'Enter API key')}
        {renderConfigField('api_key_header', 'API Key Header Name', 'Default: x-api-key')}
      </>)}
      {config.auth_type === 'oauth2' && (<>
        {renderConfigField('oauth_client_id', 'OAuth Client ID', '')}
        {renderPassword('oauth_client_secret', 'OAuth Client Secret', '')}
        {renderConfigField('oauth_token_url', 'OAuth Token URL', 'https://...')}
        {renderConfigField('oauth_scope', 'OAuth Scope', 'e.g. mi.read mi.write')}
        {renderSelect('oauth_grant_type', 'OAuth Grant Type', [{value:'client_credentials',label:'Client Credentials (M2M)'},{value:'password',label:'Resource Owner Password'}])}
      </>)}
      {config.auth_type === 'basic_auth' && (<>
        {renderConfigField('basic_username', 'Username', '')}
        {renderPassword('basic_password', 'Password', '')}
      </>)}
      {renderSelect('protocol', 'Request Protocol', [{value:'REST',label:'REST'},{value:'SOAP',label:'SOAP'},{value:'HL7_FHIR_R4',label:'HL7 FHIR R4'}])}
      {renderSelect('payload_format', 'Payload Format', [{value:'json',label:'JSON'},{value:'xml',label:'XML'},{value:'hl7_fhir_json',label:'HL7 FHIR JSON'}])}
      {config.protocol === 'SOAP' && renderConfigField('wsdl_url', 'SOAP WSDL URL', 'https://...')}
      {renderConfigField('timeout_seconds', 'Response Timeout (seconds)', '30')}

      <IntegrationSectionHeader title="Case Type Mapping" />
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Map MIMS case types and priorities to the codes your external MIR system expects.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {renderConfigField('case_type_map_MI', 'MI → External Code', 'e.g. MIR, MI_REQUEST')}
        {renderConfigField('case_type_map_AE', 'AE → External Code', 'e.g. ADE, ADVERSE_EVENT')}
        {renderConfigField('case_type_map_PC', 'PC → External Code', 'e.g. PQC, PRODUCT_COMPLAINT')}
        {renderConfigField('priority_map_urgent', 'Priority: Urgent → External', 'e.g. HIGH, P1')}
        {renderConfigField('priority_map_normal', 'Priority: Normal → External', 'e.g. NORMAL, P3')}
        {renderConfigField('status_map_open', 'Status: Open → External', 'e.g. NEW, OPEN')}
        {renderConfigField('status_map_closed', 'Status: Closed → External', 'e.g. RESOLVED, CLOSED')}
        {renderConfigField('external_id_field', 'External Case ID Field Name', 'e.g. mims_ref, external_reference')}
      </div>

      <IntegrationSectionHeader title="Sync Settings" />
      {renderSelect('sync_direction', 'Sync Direction', [{value:'outbound_only',label:'Outbound Only (MIMS → MIR)'},{value:'inbound_only',label:'Inbound Only (MIR → MIMS)'},{value:'bidirectional',label:'Bidirectional'}])}
      {renderSelect('push_mode', 'Push Mode', [{value:'webhook',label:'Webhook (Event-driven)'},{value:'polling',label:'Scheduled Polling'},{value:'both',label:'Both'}])}
      {renderConfigField('poll_interval_minutes', 'Poll Interval (minutes)', '60')}
      {renderConfigField('batch_size', 'Batch Size', '100')}
      {renderToggle('trigger_on_create', 'Send on Case Created')}
      {renderToggle('trigger_on_update', 'Send on Case Updated')}
      {renderToggle('trigger_on_close', 'Send on Case Closed')}
      {renderToggle('trigger_on_assign', 'Send on Assignment Change')}

      <IntegrationSectionHeader title="Deduplication" />
      {renderSelect('dedup_strategy', 'Deduplication Strategy', [{value:'external_id',label:'External ID'},{value:'reference_number',label:'Reference Number'},{value:'composite_key',label:'Composite Key'},{value:'none',label:'None'}])}
      {renderSelect('on_duplicate', 'On Duplicate Found', [{value:'skip',label:'Skip'},{value:'update_existing',label:'Update Existing'},{value:'flag_for_review',label:'Flag for Review'}])}

      <IntegrationSectionHeader title="Error Handling & Retry" />
      {renderConfigField('retry_max_attempts', 'Max Retry Attempts', '3')}
      {renderConfigField('retry_delay_seconds', 'Retry Delay (seconds)', '1')}
      {renderSelect('retry_backoff', 'Backoff Strategy', [{value:'fixed',label:'Fixed'},{value:'exponential',label:'Exponential'},{value:'jitter',label:'Jitter'}])}
      {renderSelect('on_failure', 'On Permanent Failure', [{value:'log_only',label:'Log Only'},{value:'alert_admin',label:'Alert Admin'},{value:'queue_for_manual_review',label:'Queue for Manual Review'}])}
      {renderConfigField('failure_alert_email', 'Failure Alert Email', '')}
      {renderConfigField('circuit_breaker_failures', 'Circuit Breaker Threshold (failures)', '5')}
      {renderConfigField('circuit_breaker_reset_minutes', 'Circuit Breaker Reset (minutes)', '30')}

      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Settings'}</button>
        <button className="btn btn-secondary" disabled={testLoading} onClick={testConnection}>{testLoading ? 'Testing…' : 'Test Connection'}</button>
        {testResult && <span style={{ fontSize: 13, color: testResult.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{testResult}</span>}
      </div>

      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Sync Log</h3>
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} disabled={syncLogLoading} onClick={refreshSyncLog}>{syncLogLoading ? 'Loading…' : 'Refresh'}</button>
        </div>
        {syncLog.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No sync events yet. Click Refresh to load.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Case ID','Status','Message','Timestamp'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
            </tr></thead>
            <tbody>{syncLog.map((row, i) => (
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
}
