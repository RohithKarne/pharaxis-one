import { useState } from 'react'
import { LockedIntegration, IntegrationSectionHeader, useIntegrationHelpers } from './AdminIntegrationShared'

export default function AdminContentIntPanel({ config, setConfig, status, H }) {
  const [saving, setSaving] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [vaultTypeMapRows, setVaultTypeMapRows] = useState([])
  const [showVaultTypeMapForm, setShowVaultTypeMapForm] = useState(false)
  const [newVaultTypeMap, setNewVaultTypeMap] = useState({ vault_type: '', vault_subtype: '', vault_classification: '', mims_cm_category: '', auto_ingest: false, overwrite_on_update: false })
  const { renderConfigField, renderSelect, renderPassword, renderToggle } = useIntegrationHelpers(config, setConfig)

  if (status === false) return <LockedIntegration label="Content Integration (Veeva Vault)" />

  async function save() {
    setSaving(true)
    try {
      await fetch('/api/admin/integrations/content/config', { method: 'PUT', headers: H, body: JSON.stringify({ config }) })
    } finally { setSaving(false) }
  }

  async function testConnection() {
    setTestLoading(true)
    try {
      const r = await fetch('/api/admin/integrations/vault/test-connection', { method: 'POST', headers: H })
      const d = await r.json()
      setTestResult(d.success ? '✓ Vault connection verified' : '✗ ' + (d.error || 'Connection failed'))
    } catch { setTestResult('✗ Connection failed — check credentials and vault domain') }
    finally { setTestLoading(false) }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ marginBottom: 4 }}>Content Integration — Veeva Vault</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Configure your Veeva Vault connection to sync documents into MIMS Content Management.</p>

      <IntegrationSectionHeader title="Connection" />
      {renderConfigField('vault_domain', 'Vault Domain', 'https://mycompany.veevavault.com')}
      {renderSelect('vault_environment', 'Environment', [{value:'production',label:'Production'},{value:'sandbox',label:'Sandbox'},{value:'staging',label:'Staging'}])}
      {renderSelect('vault_api_version', 'API Version', [{value:'v24.1',label:'v24.1 (Latest)'},{value:'v23.3',label:'v23.3'},{value:'v23.2',label:'v23.2'},{value:'v22.1',label:'v22.1'}])}
      {renderSelect('auth_type', 'Authentication Type', [{value:'basic',label:'Basic Auth (Username / Password)'},{value:'oauth2',label:'OAuth 2.0 Client Credentials'}])}
      {renderConfigField('vault_username', 'Vault Username', 'service-account@yourcompany.com')}
      {renderPassword('vault_password', 'Vault Password', 'Stored encrypted')}
      {config.auth_type === 'oauth2' && (<>
        {renderConfigField('oauth_client_id', 'OAuth Client ID', 'Client ID from IdP')}
        {renderPassword('oauth_client_secret', 'OAuth Client Secret', 'Client secret from IdP')}
        {renderConfigField('oauth_token_url', 'OAuth Token URL', 'https://company.okta.com/oauth2/token')}
        {renderConfigField('vault_client_id', 'Vault OAuth Profile Name', 'As registered in Vault Admin')}
      </>)}
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-secondary" disabled={testLoading} onClick={testConnection}>{testLoading ? 'Testing…' : 'Test Connection'}</button>
        {testResult && <span style={{ marginLeft: 12, fontSize: 13, color: testResult.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{testResult}</span>}
      </div>

      <IntegrationSectionHeader title="Sync Settings" />
      {renderSelect('sync_direction', 'Sync Direction', [{value:'pull_only',label:'Pull Only (Vault → MIMS)'},{value:'push_only',label:'Push Only (MIMS → Vault)'},{value:'bidirectional',label:'Bidirectional'}])}
      {renderSelect('sync_mode', 'Sync Mode', [{value:'poll',label:'Scheduled Poll'},{value:'manual_only',label:'Manual Only'}])}
      {renderSelect('poll_interval_hours', 'Poll Interval', [{value:'1',label:'Every 1 hour'},{value:'2',label:'Every 2 hours'},{value:'4',label:'Every 4 hours'},{value:'6',label:'Every 6 hours'},{value:'12',label:'Every 12 hours (Default)'},{value:'24',label:'Every 24 hours'}])}
      {renderToggle('enable_delta_sync', 'Delta Sync — only pull documents changed since last poll')}
      {renderToggle('poll_on_startup', 'Poll on Server Startup')}
      {renderConfigField('max_documents_per_poll', 'Max Documents Per Poll', '100')}

      <IntegrationSectionHeader title="Document Filters" />
      {renderConfigField('vault_type', 'Document Type (type__v)', 'e.g. medical_information__c, label__c, protocol__c')}
      {renderConfigField('vault_subtype', 'Document Subtype (subtype__v)', 'e.g. standard_response__c, product_monograph__c')}
      {renderConfigField('vault_classification', 'Document Classification (classification__v)', 'e.g. approved_standard_response__c')}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Status Filter (status__v)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {['approved__v','in_review__v','expired__v','archived__v','withdrawn__v','superseded__v'].map(s => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox"
                checked={(config.pull_status_filter || []).includes(s)}
                onChange={e => {
                  const current = config.pull_status_filter || []
                  const updated = e.target.checked ? [...current, s] : current.filter(x => x !== s)
                  setConfig({ ...config, pull_status_filter: updated })
                }}
              />
              {s}
            </label>
          ))}
        </div>
      </div>
      {renderConfigField('pull_product_filter', 'Product Filter', 'Comma-separated product names (blank = all)')}
      {renderConfigField('pull_country_filter', 'Country Filter', 'ISO country codes comma-separated (blank = all)')}
      {renderConfigField('pull_language_filter', 'Language Filter', 'ISO language codes comma-separated (blank = all)')}
      {renderToggle('include_all_versions', 'Include All Versions (off = latest version only)')}
      {renderToggle('include_draft', 'Include Draft Documents')}

      <IntegrationSectionHeader title="Document Type Mapping (Vault → MIMS Category)" />
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

      <IntegrationSectionHeader title="Error Handling & Retry" />
      {renderConfigField('max_retry_attempts', 'Max Retry Attempts', '3')}
      {renderConfigField('retry_delay_seconds', 'Retry Delay (seconds)', '2')}
      {renderSelect('retry_backoff', 'Backoff Strategy', [{value:'fixed',label:'Fixed'},{value:'exponential',label:'Exponential'},{value:'jitter',label:'Jitter'}])}
      {renderConfigField('failure_alert_email', 'Failure Alert Email', 'admin@yourcompany.com')}
      {renderConfigField('circuit_breaker_failures', 'Circuit Breaker Threshold (consecutive failures)', '5')}
      {renderConfigField('circuit_breaker_reset_hours', 'Circuit Breaker Reset (hours)', '1')}

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Settings'}</button>
      </div>
    </div>
  )
}
