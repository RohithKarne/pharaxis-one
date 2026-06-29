import { useState } from 'react'
import { LockedIntegration, IntegrationSectionHeader, useIntegrationHelpers } from './AdminIntegrationShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function AdminCrmIntPanel({ config, setConfig, status, H }) {
  const [saving, setSaving] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [syncLog, setSyncLog] = useState([])
  const [syncLogLoading, setSyncLogLoading] = useState(false)
  const { renderConfigField, renderSelect, renderPassword, renderToggle } = useIntegrationHelpers(config, setConfig)

  if (status === false) return <LockedIntegration label="CRM Integration" />

  async function save() {
    setSaving(true)
    try {
      const res = await httpFetch('/api/admin/integrations/crm/config', { method: 'PUT', headers: H, body: JSON.stringify({ config }) })
      if (!res.ok) { alert('Failed to save CRM settings.'); return }  // WP7: surface save failures
    } catch { alert('Failed to save CRM settings.') } finally { setSaving(false) }
  }

  async function testConnection() {
    setTestLoading(true)
    try {
      const r = await httpFetch('/api/admin/integrations/crm/test-connection', { method: 'POST', headers: H })
      const d = await r.json()
      setTestResult(d.success ? '✓ CRM connection verified' : '✗ ' + (d.error || 'Connection failed'))
    } catch { setTestResult('✗ Connection failed — check credentials') }
    finally { setTestLoading(false) }
  }

  async function refreshSyncLog() {
    setSyncLogLoading(true)
    try {
      const r = await httpFetch('/api/admin/integrations/crm/sync-log', { headers: H })
      const d = await r.json()
      setSyncLog(d.log || [])
    } catch { setSyncLog([]) }
    finally { setSyncLogLoading(false) }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ marginBottom: 4 }}>CRM Integration</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Configure CRM synchronisation for contacts, accounts, and cases.</p>

      <IntegrationSectionHeader title="Platform" />
      {renderSelect('crm_platform', 'CRM Platform', [{value:'salesforce',label:'Salesforce'},{value:'veeva_crm',label:'Veeva CRM'},{value:'ms_dynamics',label:'Microsoft Dynamics 365'},{value:'hubspot',label:'HubSpot'},{value:'custom',label:'Custom'}])}
      {renderSelect('environment', 'Environment', [{value:'production',label:'Production'},{value:'sandbox',label:'Sandbox / Developer Org'}])}
      {renderConfigField('integration_label', 'Integration Label', 'e.g. Salesforce Prod')}

      <IntegrationSectionHeader title="Authentication" />
      {(!config.crm_platform || config.crm_platform === 'salesforce') && (<>
        {renderConfigField('sf_client_id', 'Client ID (Consumer Key)', '')}
        {renderPassword('sf_client_secret', 'Client Secret (Consumer Secret)', '')}
        {renderConfigField('sf_instance_url', 'Instance URL', 'https://mycompany.my.salesforce.com')}
        {renderSelect('sf_grant_type', 'OAuth Grant Type', [{value:'client_credentials',label:'Client Credentials (Recommended)'},{value:'password',label:'Username + Password'},{value:'jwt_bearer',label:'JWT Bearer'}])}
        {config.sf_grant_type === 'password' && (<>
          {renderConfigField('sf_username', 'Salesforce Username', '')}
          {renderPassword('sf_password', 'Password + Security Token', '')}
        </>)}
        {renderConfigField('sf_api_version', 'Salesforce API Version', 'v58.0')}
      </>)}
      {config.crm_platform === 'ms_dynamics' && (<>
        {renderConfigField('dynamics_tenant_id', 'Azure Tenant ID', '')}
        {renderConfigField('dynamics_client_id', 'Client ID (App Registration)', '')}
        {renderPassword('dynamics_client_secret', 'Client Secret', '')}
        {renderConfigField('dynamics_resource_url', 'Resource URL', 'https://mycompany.crm.dynamics.com')}
        {renderConfigField('dynamics_scope', 'Scope', 'https://mycompany.crm.dynamics.com/.default')}
        {renderConfigField('dynamics_api_version', 'API Version', 'v9.2')}
      </>)}
      {config.crm_platform === 'veeva_crm' && (<>
        {renderConfigField('veeva_domain', 'Veeva Domain', 'https://mycompany.veevanetwork.com')}
        {renderConfigField('veeva_username', 'Username', '')}
        {renderPassword('veeva_password', 'Password', '')}
        {renderPassword('veeva_security_token', 'Security Token', '')}
        {renderSelect('veeva_region', 'Region', [{value:'us',label:'US'},{value:'eu',label:'EU'},{value:'apac',label:'APAC'}])}
        {renderToggle('veeva_use_vault_session', 'Reuse Vault Session from Content Integration')}
      </>)}

      <IntegrationSectionHeader title="Object Sync" />
      {renderToggle('sync_contacts', 'Sync Contacts')}
      {renderToggle('sync_accounts', 'Sync Accounts / Organisations')}
      {renderToggle('sync_cases', 'Sync Cases')}

      <IntegrationSectionHeader title="Sync Settings" />
      {renderSelect('sync_direction', 'Sync Direction', [{value:'mims_to_crm',label:'MIMS → CRM'},{value:'crm_to_mims',label:'CRM → MIMS'},{value:'bidirectional',label:'Bidirectional'}])}
      {renderSelect('push_mode', 'Push Mode', [{value:'webhook',label:'Webhook'},{value:'polling',label:'Polling'},{value:'both',label:'Both'}])}
      {renderConfigField('poll_interval_minutes', 'Poll Interval (minutes)', '15')}
      {renderConfigField('full_sync_cron', 'Full Sync Schedule (cron expression)', '0 2 * * *')}
      {renderToggle('delta_sync_enabled', 'Delta Sync (only sync changed records)')}
      {renderConfigField('batch_size', 'Batch Size', '200')}
      {renderSelect('conflict_strategy', 'Conflict Resolution', [{value:'mims_wins',label:'MIMS Wins'},{value:'crm_wins',label:'CRM Wins'},{value:'last_write_wins',label:'Last Write Wins'},{value:'flag_for_review',label:'Flag for Review'}])}

      <IntegrationSectionHeader title="Event Triggers" />
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Select which MIMS events trigger a sync to your CRM.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[['case.created','Case Created'],['case.updated','Case Updated'],['case.closed','Case Closed'],['case.assigned','Case Assigned'],['contact.created','Contact Created'],['contact.updated','Contact Updated'],['org.created','Organisation Created'],['mi.response_sent','MI Response Sent'],['ae.submitted','AE Submitted to Regulator']].map(([val, lbl]) => (
          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '6px 0' }}>
            <input type="checkbox"
              checked={((config.event_triggers) || []).includes(val)}
              onChange={e => {
                const current = config.event_triggers || []
                const updated = e.target.checked ? [...current, val] : current.filter(x => x !== val)
                setConfig({ ...config, event_triggers: updated })
              }}
            />
            {lbl}
          </label>
        ))}
      </div>

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
