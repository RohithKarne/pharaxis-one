import { useState, useEffect } from 'react'
import { LockedIntegration, IntegrationSectionHeader, useIntegrationHelpers } from './AdminIntegrationShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function AdminEmirIntPanel({ config, setConfig, status, H }) {
  const [saving, setSaving] = useState(false)
  const [emirSenderRules, setEmirSenderRules] = useState([])
  const [emirRoutingRules, setEmirRoutingRules] = useState([])
  const [emirSenderForm, setEmirSenderForm] = useState({ rule_type: 'whitelist', match_type: 'domain', value: '', action: 'reject_silently' })
  const [emirRouteForm, setEmirRouteForm] = useState({ rule_name: '', match_field: 'subject', match_type: 'contains', match_value: '', case_type: 'MI', default_priority: 'normal' })
  const { renderConfigField, renderSelect, renderPassword, renderToggle } = useIntegrationHelpers(config, setConfig)

  // WP7: load existing sender/routing rules on mount — they were init'd to [] with no
  // loader, so saved inbound-email security rules always rendered as "No rules defined"
  // and admins created duplicates / couldn't manage the real ones.
  useEffect(() => {
    if (status === false) return
    let cancelled = false
    ;(async () => {
      try {
        const [sRes, rRes] = await Promise.all([
          httpFetch('/api/admin/emir/sender-rules', { headers: H }),
          httpFetch('/api/admin/emir/routing-rules', { headers: H }),
        ])
        if (!cancelled && sRes.ok) { const d = await sRes.json(); setEmirSenderRules(Array.isArray(d) ? d : (d.rules || [])) }
        if (!cancelled && rRes.ok) { const d = await rRes.json(); setEmirRoutingRules(Array.isArray(d) ? d : (d.rules || [])) }
      } catch { /* leave empty on load failure */ }
    })()
    return () => { cancelled = true }
  }, [status])

  if (status === false) return <LockedIntegration label="EMIR Integration" />

  async function save() {
    setSaving(true)
    try {
      // WP7: surface save failures instead of returning to idle as if it succeeded.
      const res = await httpFetch('/api/admin/integrations/emir/config', { method: 'PUT', headers: H, body: JSON.stringify({ config }) })
      if (!res.ok) { alert('Failed to save EMIR settings.'); return }
    } catch { alert('Failed to save EMIR settings.') } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ marginBottom: 4 }}>EMIR Integration — Inbound Email Processing</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Configure inbound email processing to auto-receive medical information requests and create MIMS cases.</p>

      <IntegrationSectionHeader title="Email Server" />
      {renderSelect('protocol', 'Protocol', [{value:'IMAP',label:'IMAP'},{value:'POP3',label:'POP3'}])}
      {renderConfigField('imap_host', 'Mail Server Host', 'imap.yourcompany.com')}
      {renderConfigField('imap_port', 'Port', '993')}
      {renderSelect('imap_encryption', 'Encryption', [{value:'SSL',label:'SSL/TLS'},{value:'STARTTLS',label:'STARTTLS'},{value:'none',label:'None'}])}
      {renderSelect('auth_method', 'Authentication Method', [{value:'password',label:'Username / Password'},{value:'oauth2',label:'OAuth 2.0 (Microsoft 365 / Gmail)'}])}
      {renderConfigField('imap_username', 'Username / Email Address', 'emir@yourcompany.com')}
      {config.auth_method !== 'oauth2' && renderPassword('imap_password', 'Password', 'Stored encrypted')}
      {config.auth_method === 'oauth2' && (<>
        {renderSelect('oauth_provider', 'OAuth Provider', [{value:'microsoft365',label:'Microsoft 365'},{value:'gmail',label:'Gmail'},{value:'custom',label:'Custom'}])}
        {renderConfigField('oauth_client_id', 'OAuth Client ID', '')}
        {renderPassword('oauth_client_secret', 'OAuth Client Secret', '')}
        {renderConfigField('oauth_tenant_id', 'Azure Tenant ID', 'Microsoft 365 only')}
      </>)}
      {renderConfigField('inbound_email', 'Monitored Inbox Address', 'emir@yourcompany.com')}
      {renderConfigField('mailbox_folder', 'Mailbox Folder', 'INBOX')}
      {renderConfigField('move_to_folder', 'Move Processed Emails To', 'MIMS-Processed')}
      {renderConfigField('poll_interval_min', 'Poll Interval (minutes)', '5')}
      {renderConfigField('max_attachment_mb', 'Max Attachment Size (MB)', '10')}

      <IntegrationSectionHeader title="Sender Rules" />
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Define whitelist and blacklist rules to control which senders are accepted.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
        <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
          {['Rule Type','Match Type','Value','Action',''].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {emirSenderRules.length === 0 && <tr><td colSpan={5} style={{ padding: '12px 8px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No rules defined.</td></tr>}
          {emirSenderRules.map((rule, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>{rule.rule_type}</td>
              <td style={{ padding: '6px 8px' }}>{rule.match_type}</td>
              <td style={{ padding: '6px 8px' }}>{rule.value}</td>
              <td style={{ padding: '6px 8px' }}>{rule.action}</td>
              <td style={{ padding: '6px 8px' }}><button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={async () => {
                if (rule.id) { try { await httpFetch(`/api/admin/emir/sender-rules/${rule.id}`, { method: 'DELETE', headers: H }) } catch { /* ignore remote delete failure while removing local draft row */ } }
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
          if (!emirSenderForm.value) return
          try {
            const r = await httpFetch('/api/admin/emir/sender-rules', { method: 'POST', headers: H, body: JSON.stringify(emirSenderForm) })
            const d = await r.json()
            if (r.ok) {
              setEmirSenderRules(prev => [...prev, { ...emirSenderForm, id: d.id }])
              setEmirSenderForm({ rule_type: 'whitelist', match_type: 'domain', value: '', action: 'reject_silently' })
            }
          } catch { /* ignore remote save failure until user retries */ }
        }}>+ Add Rule</button>
      </div>

      <IntegrationSectionHeader title="Attachment Rules" />
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Allowed MIME Types</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {[['application/pdf','PDF'],['application/msword','Word (.doc)'],['application/vnd.openxmlformats-officedocument.wordprocessingml.document','Word (.docx)'],['text/xml','XML']].map(([mime, lbl]) => (
            <label key={mime} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox"
                checked={(config.allowed_mime_types || []).includes(mime)}
                onChange={e => {
                  const current = config.allowed_mime_types || []
                  const updated = e.target.checked ? [...current, mime] : current.filter(x => x !== mime)
                  setConfig({ ...config, allowed_mime_types: updated })
                }}
              />
              {lbl}
            </label>
          ))}
        </div>
      </div>
      {renderConfigField('total_max_size_mb', 'Max Total Attachment Size (MB)', '50')}
      {renderToggle('parse_emir_xml', 'Parse EMIR XML Attachments (auto-extract structured fields)')}
      {renderSelect('emir_xml_schema_version', 'EMIR XML Schema Version', [{value:'2.0',label:'2.0'},{value:'3.0',label:'3.0'}])}
      {renderToggle('quarantine_on_fail', 'Quarantine Attachments That Fail Validation')}
      {renderToggle('virus_scan_enabled', 'Enable Virus Scanning (requires ClamAV)')}

      <IntegrationSectionHeader title="Auto-Case Routing Rules" />
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Define rules to automatically route incoming emails to the correct case type and assignee.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
        <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
          {['#','Rule Name','Match Field','Match Value','Case Type','Priority',''].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>)}
        </tr></thead>
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
                if (rule.id) { try { await httpFetch(`/api/admin/emir/routing-rules/${rule.id}`, { method: 'DELETE', headers: H }) } catch { /* ignore remote delete failure while removing local draft row */ } }
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
          if (!emirRouteForm.rule_name || !emirRouteForm.match_value) return
          try {
            const r = await httpFetch('/api/admin/emir/routing-rules', { method: 'POST', headers: H, body: JSON.stringify(emirRouteForm) })
            const d = await r.json()
            if (r.ok) {
              setEmirRoutingRules(prev => [...prev, { ...emirRouteForm, id: d.id }])
              setEmirRouteForm({ rule_name: '', match_field: 'subject', match_type: 'contains', match_value: '', case_type: 'MI', default_priority: 'normal' })
            }
          } catch { /* ignore remote save failure until user retries */ }
        }}>+ Add Rule</button>
      </div>

      <IntegrationSectionHeader title="Acknowledgement Email" />
      {renderToggle('ack_enabled', 'Enable Auto-Acknowledgement')}
      {renderConfigField('ack_from_email', 'From Email Address', 'noreply@yourcompany.com')}
      {renderConfigField('ack_from_name', 'From Display Name', 'MIMS Medical Information')}
      {renderConfigField('ack_subject_template', 'Subject Template', 'Your request {{reference_number}} has been received')}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Acknowledgement Body (HTML)</label>
        <textarea className="form-input" rows={6} placeholder={'<p>Dear Requester,</p>\n<p>We have received your medical information request (Ref: {{reference_number}}).</p>\n<p>Our team at {{org_name}} will respond within 3 business days.</p>'} value={config.ack_body_html || ''} onChange={e => setConfig({ ...config, ack_body_html: e.target.value })} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
      </div>
      {renderConfigField('ack_cc', 'CC (comma-separated)', '')}
      {renderConfigField('ack_bcc', 'BCC (comma-separated)', '')}
      {renderToggle('ack_send_on_duplicate', 'Send Acknowledgement for Duplicate Requests')}

      <IntegrationSectionHeader title="Deduplication" />
      {renderSelect('dedup_strategy', 'Deduplication Strategy', [{value:'both',label:'Message ID + Hash (Recommended)'},{value:'message_id',label:'Message ID Only'},{value:'hash',label:'Hash Only'}])}
      {renderSelect('dedup_action', 'On Duplicate Detected', [{value:'reject',label:'Reject'},{value:'flag_and_create',label:'Flag and Create Anyway'},{value:'link_to_existing',label:'Link to Existing Request'}])}
      {renderConfigField('dedup_window_hours', 'Deduplication Window (hours, 0 = all time)', '0')}
      {renderToggle('subject_normalize', 'Normalise Subject (strip RE:, FW:) before deduplication')}

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Settings'}</button>
      </div>
    </div>
  )
}
