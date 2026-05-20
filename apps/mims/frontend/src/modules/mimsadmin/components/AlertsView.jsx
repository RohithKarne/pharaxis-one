import { useState, useEffect, useCallback } from 'react'
import { guardedFetch } from '../utils/guardedFetch'
import { confirm } from '../../../shared/utils/confirm'

const ALERT_EVENT_OPTIONS = [
  { value: 'failed_login_spike', label: 'Failed Login Spike', mode: 'threshold' },
  { value: 'two_factor_lockout', label: '2FA Lockout', mode: 'threshold' },
  { value: 'smtp_failure', label: 'SMTP Failure', mode: 'immediate' },
  { value: 'mailbox_failure', label: 'Mailbox Failure', mode: 'immediate' },
  { value: 'organization_deactivated', label: 'Organisation Deactivated', mode: 'immediate' },
  { value: 'site_deactivated', label: 'Site Deactivated', mode: 'immediate' },
  { value: 'sensitive_config_change', label: 'Sensitive Config Change', mode: 'immediate' },
  { value: 'service_error_threshold', label: 'Service Error Threshold', mode: 'threshold' },
]

export default function AlertsView({ H, flash, apiBase = '/api/admin' }) {
  const [rules, setRules] = useState([])
  const [events, setEvents] = useState([])
  const [eventTypeError, setEventTypeError] = useState('')
  const [form, setForm] = useState({
    id: null,
    name: '',
    event_type: 'failed_login_spike',
    severity: 'high',
    channels: 'email,in_app',
    recipient_emails: '',
    threshold_value: 1,
    window_minutes: 15,
    cooldown_minutes: 30,
    is_active: true,
  })

  const [eventFilter, setEventFilter] = useState({ event_type: '', severity: '' })
  const [eventsOffset, setEventsOffset] = useState(0)
  const [eventsTotal, setEventsTotal] = useState(0)
  const EVENTS_LIMIT = 20

  const DEFAULT_EMAIL_SUBJECT = 'MIMS Alert: {{alert_title}}'
  const DEFAULT_EMAIL_BODY = 'Alert: {{alert_title}}\nSeverity: {{severity}}\nOrganisation: {{org_name}}\nTriggered at: {{triggered_at}}\n\n{{message}}'
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false)
  const [emailTemplate, setEmailTemplate] = useState({ subject: DEFAULT_EMAIL_SUBJECT, body: DEFAULT_EMAIL_BODY })
  const [emailTemplateSaving, setEmailTemplateSaving] = useState(false)

  const loadEvents = useCallback(async (off = 0, filter = eventFilter) => {
    const params = new URLSearchParams({ limit: EVENTS_LIMIT, offset: off })
    if (filter.event_type) params.set('event_type', filter.event_type)
    if (filter.severity) params.set('severity', filter.severity)
    const res = await guardedFetch(`${apiBase}/alerts/events?${params}`, { headers: H })
    const data = await res.json()
    setEvents(data.events || [])
    setEventsTotal(data.total || 0)
    setEventsOffset(off)
  }, [H.Authorization, eventFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    const [rulesRes, templateRes] = await Promise.all([
      guardedFetch(`${apiBase}/alerts/rules`, { headers: H }),
      guardedFetch(`${apiBase}/alert-email-template`, { headers: H }),
    ])
    const rulesData = await rulesRes.json()
    setRules(rulesData.rules || [])
    if (templateRes.ok) {
      const templateData = await templateRes.json()
      if (templateData.subject || templateData.body) {
        setEmailTemplate({
          subject: templateData.subject || DEFAULT_EMAIL_SUBJECT,
          body: templateData.body || DEFAULT_EMAIL_BODY,
        })
      }
    }
    loadEvents(0)
  }, [H.Authorization, loadEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useEffect(() => { loadEvents(0, eventFilter) }, [eventFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEvent = ALERT_EVENT_OPTIONS.find(option => option.value === form.event_type)
  const isThresholdRule = selectedEvent?.mode === 'threshold'
  const nextToggleStateLabel = (rule) => (rule.is_active ? 'inactive' : 'active')
  const resetRuleForm = () => ({
    id: null,
    name: '',
    event_type: 'failed_login_spike',
    severity: 'high',
    channels: 'email,in_app',
    recipient_emails: '',
    threshold_value: 1,
    window_minutes: 15,
    cooldown_minutes: 30,
    is_active: true,
  })

  async function saveRule(e) {
    e.preventDefault()
    setEventTypeError('')
    if (!form.id) {
      const duplicate = rules.find(r => r.event_type === form.event_type)
      if (duplicate) {
        setEventTypeError('A rule for this event type already exists.')
        return
      }
    }
    const url = form.id ? `${apiBase}/alerts/rules/${form.id}` : `${apiBase}/alerts/rules`
    const method = form.id ? 'PUT' : 'POST'
    const res = await guardedFetch(url, {
      method,
      headers: H,
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to save alert rule.', 'error')
    flash(data.message || 'Alert rule saved.')
    setEventTypeError('')
    setForm(resetRuleForm())
    load()
  }

  async function toggleRule(rule) {
    const res = await guardedFetch(`${apiBase}/alerts/rules/${rule.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ ...rule, is_active: !rule.is_active }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update rule.', 'error')
    flash(`Alert rule set to ${nextToggleStateLabel(rule)}. ${rule.is_active ? 'Events and notifications from this rule will stop.' : 'Events and notifications from this rule will resume.'}`)
    load()
  }

  async function deleteRule(rule) {
    const confirmed = await confirm(`Delete alert rule "${rule.name}"?`)
    if (!confirmed) return
    const res = await guardedFetch(`${apiBase}/alerts/rules/${rule.id}`, {
      method: 'DELETE',
      headers: H,
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to delete rule.', 'error')
    flash('Alert rule deleted.')
    if (form.id === rule.id) {
      setForm(resetRuleForm())
    }
    load()
  }

  async function saveEmailTemplate() {
    if (!emailTemplate.subject.trim() || !emailTemplate.body.trim()) return flash('Subject and body are required.', 'error')
    setEmailTemplateSaving(true)
    try {
      const res = await guardedFetch(`${apiBase}/alert-email-template`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({ subject: emailTemplate.subject, body: emailTemplate.body }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to save email template.', 'error')
      flash('Email alert template saved.')
    } catch {
      flash('Failed to save email template.', 'error')
    } finally {
      setEmailTemplateSaving(false)
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><h3>Alert Rule Setup</h3></div>
        <div className="card-body">
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
            Rule status behavior: <strong>Active</strong> rules can fire alert events and notifications. <strong>Inactive</strong> rules do not fire events or notifications.
            {!form.id && ' New rules are active by default.'}
          </div>
          <form onSubmit={saveRule} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div><label style={{ fontSize: 12 }}>Rule Name</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={{ fontSize: 12 }}>Event</label><select className="form-control" value={form.event_type} onChange={e => {
              const eventType = e.target.value
              const option = ALERT_EVENT_OPTIONS.find(item => item.value === eventType)
              setForm(f => ({
                ...f,
                event_type: eventType,
                threshold_value: option?.mode === 'threshold' ? (f.threshold_value || 1) : 1,
                window_minutes: option?.mode === 'threshold' ? (f.window_minutes || 15) : 0,
              }))
            }}>
              {ALERT_EVENT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></div>
            <div><label style={{ fontSize: 12 }}>Severity</label><select className="form-control" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}><option value="medium">Medium</option><option value="high">High</option></select></div>
            <div><label style={{ fontSize: 12 }}>Channels</label><select className="form-control" value={form.channels} onChange={e => setForm(f => ({ ...f, channels: e.target.value }))}><option value="email">Email only</option><option value="in_app">In-app only</option><option value="email,in_app">Email + In-app</option></select></div>
            {isThresholdRule ? (
              <>
                <div><label style={{ fontSize: 12 }}>Threshold</label><input className="form-control" type="number" min="1" value={form.threshold_value} onChange={e => setForm(f => ({ ...f, threshold_value: Number(e.target.value) || 1 }))} /></div>
                <div><label style={{ fontSize: 12 }}>Window (min)</label><input className="form-control" type="number" min="1" value={form.window_minutes} onChange={e => setForm(f => ({ ...f, window_minutes: Number(e.target.value) || 15 }))} /></div>
              </>
            ) : (
              <div style={{ gridColumn: 'span 2', paddingTop: 22 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
                  This is an immediate event alert. It triggers when the event happens. Threshold and window settings do not apply.
                </div>
              </div>
            )}
            <div><label style={{ fontSize: 12 }}>Cooldown (min)</label><input className="form-control" type="number" min="0" value={form.cooldown_minutes} onChange={e => setForm(f => ({ ...f, cooldown_minutes: Number(e.target.value) || 0 }))} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12 }}>Recipient Emails</label><input className="form-control" placeholder="comma-separated emails" value={form.recipient_emails} onChange={e => setForm(f => ({ ...f, recipient_emails: e.target.value }))} /></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Rule active (if off, this rule will not fire events or notifications)
            </label>
            {eventTypeError && (
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#c0392b', background: '#fdf0ef', border: '1px solid #f5c6cb', borderRadius: 6, padding: '8px 12px' }}>
                {eventTypeError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit">{form.id ? 'Update Rule' : 'Create Rule'}</button>
              {form.id && <button className="btn btn-secondary" type="button" onClick={() => { setForm(resetRuleForm()); setEventTypeError('') }}>Cancel</button>}
            </div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><h3>Alert Rules</h3></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Event</th><th>Mode</th><th>Channels</th><th>Rule Logic</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {!rules.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No alert rules yet.</td></tr>}
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td>{rule.name}</td>
                  <td style={{ fontSize: 12 }}>{rule.event_type}</td>
                  <td style={{ fontSize: 12 }}>{ALERT_EVENT_OPTIONS.find(option => option.value === rule.event_type)?.mode === 'threshold' ? 'Threshold' : 'Immediate'}</td>
                  <td style={{ fontSize: 12 }}>{rule.channels}</td>
                  <td style={{ fontSize: 12 }}>
                    {ALERT_EVENT_OPTIONS.find(option => option.value === rule.event_type)?.mode === 'threshold'
                      ? `${rule.threshold_value} within ${rule.window_minutes}m`
                      : `Immediate event • cooldown ${rule.cooldown_minutes}m`}
                  </td>
                  <td>
                    <span className="badge" title={rule.is_active ? 'This rule can generate events and notifications.' : 'This rule is disabled and will not generate events or notifications.'}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setForm({ ...rule, is_active: !!rule.is_active })}>Edit</button>
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleRule(rule)}>{rule.is_active ? 'Disable' : 'Enable'}</button>
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => deleteRule(rule)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div
          className="card-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setEmailTemplateOpen(v => !v)}
        >
          <h3>Email Alert Template</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emailTemplateOpen ? '▲' : '▼'}</span>
        </div>
        {emailTemplateOpen && (
          <div className="card-body">
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Available placeholders:{' '}
              {['{{alert_title}}', '{{severity}}', '{{org_name}}', '{{triggered_at}}', '{{message}}'].map(p => (
                <code key={p} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontSize: 11, marginRight: 6 }}>{p}</code>
              ))}
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Subject</label>
              <input
                className="form-control"
                style={{ fontSize: 13 }}
                value={emailTemplate.subject}
                onChange={e => setEmailTemplate(t => ({ ...t, subject: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Body</label>
              <textarea
                className="form-control"
                rows={6}
                style={{ fontSize: 13, fontFamily: 'monospace', resize: 'vertical' }}
                value={emailTemplate.body}
                onChange={e => setEmailTemplate(t => ({ ...t, body: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveEmailTemplate} disabled={emailTemplateSaving}>
                {emailTemplateSaving ? 'Saving…' : 'Save Template'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
                onClick={() => setEmailTemplate({ subject: DEFAULT_EMAIL_SUBJECT, body: DEFAULT_EMAIL_BODY })}
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Recent Alert Events</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{eventsTotal} event{eventsTotal !== 1 ? 's' : ''}</span>
        </div>
        <div className="card-body" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="form-control"
            style={{ maxWidth: 220, fontSize: 13 }}
            value={eventFilter.event_type}
            onChange={e => setEventFilter(f => ({ ...f, event_type: e.target.value }))}
          >
            <option value="">All event types</option>
            {ALERT_EVENT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <select
            className="form-control"
            style={{ maxWidth: 160, fontSize: 13 }}
            value={eventFilter.severity}
            onChange={e => setEventFilter(f => ({ ...f, severity: e.target.value }))}
          >
            <option value="">All severities</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {(eventFilter.event_type || eventFilter.severity) && (
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setEventFilter({ event_type: '', severity: '' })}>Clear</button>
          )}
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>Time</th><th>Rule</th><th>Message</th><th>Email</th><th>In-App</th></tr></thead>
            <tbody>
              {!events.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No alert events yet.</td></tr>}
              {events.map(event => (
                <tr key={event.id}>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{event.created_at}</td>
                  <td style={{ fontSize: 12 }}>{event.rule_name || event.event_type}</td>
                  <td style={{ fontSize: 12 }}>{event.message || event.title}</td>
                  <td style={{ fontSize: 12 }}>{event.email_status}</td>
                  <td style={{ fontSize: 12 }}>{event.in_app_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {eventsTotal > EVENTS_LIMIT && (
          <div style={{ padding: '10px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={eventsOffset === 0} onClick={() => loadEvents(eventsOffset - EVENTS_LIMIT)}>← Prev</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              {eventsOffset + 1}–{Math.min(eventsOffset + EVENTS_LIMIT, eventsTotal)} of {eventsTotal}
            </span>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={eventsOffset + EVENTS_LIMIT >= eventsTotal} onClick={() => loadEvents(eventsOffset + EVENTS_LIMIT)}>Next →</button>
          </div>
        )}
      </div>
    </>
  )
}
