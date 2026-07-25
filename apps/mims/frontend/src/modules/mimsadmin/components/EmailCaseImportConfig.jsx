import { useEffect, useState } from 'react'
import { guardedFetch } from '../utils/guardedFetch'

/**
 * EmailCaseImportConfig — admin configuration for Email Case Import (MIMS-40).
 * Replaces the dead "Email Case Import" placeholder tile. Org-scoped: every
 * call hits /api/admin/email-case-import/* which enforces the caller's org.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const API = '/api/admin/email-case-import'

const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }
const h3 = { margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }
const sub = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }
const label = { fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }
const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
const btn = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost = { ...btn, background: '#fff', color: 'var(--primary)' }
const chip = (on) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: on ? 'rgba(22,163,74,0.12)' : 'rgba(107,114,128,0.12)', color: on ? '#15803d' : '#6b7280' })

const EMPTY_FIELD = { field_key: '', label: '', aliases: '', target_entity: 'reporter', target_field: 'first_name', is_required: true }
const TARGETS = {
  reporter: ['first_name', 'last_name', 'email', 'phone', 'country', 'organisation', 'reporter_type'],
  case: ['description', 'priority'],
}

export default function EmailCaseImportConfig() {
  const [config, setConfig] = useState(null)
  const [mailboxes, setMailboxes] = useState([])
  const [fields, setFields] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState(null) // { kind: 'ok'|'error', text }
  const [newField, setNewField] = useState(EMPTY_FIELD)

  function flash(text, kind = 'ok') {
    setBanner({ text, kind })
    setTimeout(() => setBanner(null), 4000)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const [cfgRes, mbRes, fRes, mRes] = await Promise.all([
        guardedFetch(`${API}/config`),
        guardedFetch(`${API}/mailboxes`),
        guardedFetch(`${API}/intake-fields`),
        guardedFetch(`${API}/metrics`),
      ])
      if (cfgRes.ok) setConfig(await cfgRes.json())
      if (mbRes.ok) setMailboxes(await mbRes.json())
      if (fRes.ok) setFields(await fRes.json())
      if (mRes.ok) setMetrics(await mRes.json())
    } catch {
      flash('Failed to load Email Case Import configuration.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig(patch) {
    setSaving(true)
    try {
      const res = await guardedFetch(`${API}/config`, {
        method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ ...config, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Save failed.', 'error')
      setConfig(data)
      flash('Configuration saved.')
    } catch {
      flash('Save failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleMailbox(mb) {
    const res = await guardedFetch(`${API}/mailboxes/${mb.id}`, {
      method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ is_case_intake: !mb.is_case_intake }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Mailbox update failed.', 'error')
    setMailboxes((rows) => rows.map((r) => (r.id === mb.id ? { ...r, is_case_intake: data.is_case_intake } : r)))
    flash(`Mailbox "${mb.account_name}" ${data.is_case_intake ? 'flagged as case intake' : 'unflagged'}.`)
  }

  async function addField() {
    const res = await guardedFetch(`${API}/intake-fields`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ ...newField, is_required: newField.is_required ? 1 : 0 }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to add field.', 'error')
    setFields((rows) => [...rows, data])
    setNewField(EMPTY_FIELD)
    flash(`Intake field "${data.label}" added.`)
  }

  async function updateField(f, patch) {
    const res = await guardedFetch(`${API}/intake-fields/${f.id}`, {
      method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ ...f, ...patch }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update field.', 'error')
    setFields((rows) => rows.map((r) => (r.id === f.id ? data : r)))
  }

  async function deleteField(f) {
    if (!window.confirm(`Remove intake field "${f.label}"?`)) return
    const res = await guardedFetch(`${API}/intake-fields/${f.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to remove field.', 'error')
    setFields((rows) => rows.filter((r) => r.id !== f.id))
    flash(`Intake field "${f.label}" removed.`)
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading Email Case Import configuration…</div>
  if (!config) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Configuration unavailable.</div>

  const fmtDuration = (s) => (s == null ? '—' : s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {banner && (
        <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: banner.kind === 'ok' ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
          color: banner.kind === 'ok' ? '#15803d' : '#b91c1c' }}>
          {banner.text}
        </div>
      )}

      {/* ── Status + master switch ─────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={h3}>Email Case Import {' '}<span style={chip(!!config.is_enabled)}>{config.is_enabled ? 'ENABLED' : 'DISABLED'}</span></h3>
            <div style={sub}>
              Auto-creates cases from flagged intake mailboxes. AI-assisted, confidence-gated — uncertain or possible-AE
              emails always fall to the Inbox for human review. Nothing inbound is ever rejected or deleted.
            </div>
          </div>
          <button style={config.is_enabled ? btnGhost : btn} disabled={saving}
            onClick={() => saveConfig({ is_enabled: !config.is_enabled })}>
            {config.is_enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 8 }}>
          <div>
            <label style={label}>Confidence threshold (0.5 – 1)</label>
            <input style={input} type="number" step="0.01" min="0.5" max="1" value={config.confidence_threshold}
              onChange={(e) => setConfig({ ...config, confidence_threshold: e.target.value })}
              onBlur={() => saveConfig({ confidence_threshold: Number(config.confidence_threshold) })} />
          </div>
          <div>
            <label style={label}>Review SLA (business hours)</label>
            <input style={input} type="number" min="1" max="720" value={config.sla_hours}
              onChange={(e) => setConfig({ ...config, sla_hours: e.target.value })}
              onBlur={() => saveConfig({ sla_hours: Number(config.sla_hours) })} />
          </div>
          <div>
            <label style={label}>Alert recipients</label>
            <select style={input} value={config.alert_recipients}
              onChange={(e) => saveConfig({ alert_recipients: e.target.value })}>
              <option value="agent_lead">Assigned agent + leads</option>
              <option value="agent_only">Assigned agent only</option>
            </select>
          </div>
          <div>
            <label style={label}>Case types eligible for auto-creation</label>
            <div style={{ display: 'flex', gap: 12, paddingTop: 6 }}>
              {['mi', 'ae', 'pc'].map((t) => (
                <label key={t} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={!!config[`enable_${t}`]}
                    onChange={(e) => saveConfig({ [`enable_${t}`]: e.target.checked })} />
                  {t.toUpperCase()}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Metrics ────────────────────────────────────────────────────── */}
      <div style={card}>
        <h3 style={h3}>Performance</h3>
        <div style={sub}>Success metrics: % of eligible emails auto-converted, and time from email received to case created.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {[
            ['Auto-created cases', metrics?.auto_created_cases ?? '—'],
            ['% auto-converted', metrics?.pct_auto_converted != null ? `${metrics.pct_auto_converted}%` : '—'],
            ['Avg email → case', fmtDuration(metrics?.avg_seconds_email_to_case)],
            ['Sent to review', metrics?.breakdown?.needs_review ?? '—'],
            ['Follow-ups attached', metrics?.breakdown?.followups_attached ?? '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{v}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Intake mailboxes ───────────────────────────────────────────── */}
      <div style={card}>
        <h3 style={h3}>Case intake mailboxes</h3>
        <div style={sub}>Only flagged mailboxes feed auto-case creation. All other mailboxes keep today's Inbox-only behaviour.</div>
        {mailboxes.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No inbound mailboxes configured for this organisation.</div>}
        <div style={{ display: 'grid', gap: 8 }}>
          {mailboxes.map((mb) => (
            <div key={mb.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{mb.account_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {mb.mailbox_email || 'no address'} · {mb.direction || '—'} · {mb.is_active ? 'active' : 'inactive'}{!mb.imap_configured ? ' · IMAP not configured' : ''}
                </div>
              </div>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!mb.is_case_intake} onChange={() => toggleMailbox(mb)} />
                Case intake
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* ── Intake field definitions ───────────────────────────────────── */}
      <div style={card}>
        <h3 style={h3}>Required intake fields</h3>
        <div style={sub}>
          Fields end users must include in their email (e.g. “Reporter Name: …”). They auto-map to case fields on creation.
          The platform floor (sender, received time, subject, body, case type) is always captured and cannot be removed.
          Emails missing required fields fall to the Inbox for review — never rejected.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: 6 }}>Label (what senders write)</th>
              <th style={{ padding: 6 }}>Key</th>
              <th style={{ padding: 6 }}>Maps to</th>
              <th style={{ padding: 6 }}>Required</th>
              <th style={{ padding: 6 }} />
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 6, fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</td>
                <td style={{ padding: 6, color: 'var(--text-muted)' }}>{f.field_key}</td>
                <td style={{ padding: 6 }}>{f.target_entity}.{f.target_field}</td>
                <td style={{ padding: 6 }}>
                  <input type="checkbox" checked={!!f.is_required} onChange={(e) => updateField(f, { is_required: e.target.checked ? 1 : 0 })} />
                </td>
                <td style={{ padding: 6, textAlign: 'right' }}>
                  <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 12, borderColor: '#dc2626', color: '#dc2626' }} onClick={() => deleteField(f)}>Remove</button>
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 10, color: 'var(--text-muted)' }}>No intake fields defined — only the platform floor applies.</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr auto auto', gap: 8, marginTop: 12, alignItems: 'end' }}>
          <div>
            <label style={label}>Label</label>
            <input style={input} placeholder="Reporter Name" value={newField.label}
              onChange={(e) => setNewField({ ...newField, label: e.target.value, field_key: e.target.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') })} />
          </div>
          <div>
            <label style={label}>Maps to</label>
            <select style={input} value={`${newField.target_entity}.${newField.target_field}`}
              onChange={(e) => {
                const [target_entity, target_field] = e.target.value.split('.')
                setNewField({ ...newField, target_entity, target_field })
              }}>
              {Object.entries(TARGETS).flatMap(([ent, cols]) => cols.map((c) => (
                <option key={`${ent}.${c}`} value={`${ent}.${c}`}>{ent}.{c}</option>
              )))}
            </select>
          </div>
          <div>
            <label style={label}>Aliases (comma-sep)</label>
            <input style={input} placeholder="Name, Your Name" value={newField.aliases}
              onChange={(e) => setNewField({ ...newField, aliases: e.target.value })} />
          </div>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, paddingBottom: 8 }}>
            <input type="checkbox" checked={newField.is_required} onChange={(e) => setNewField({ ...newField, is_required: e.target.checked })} />
            Required
          </label>
          <button style={btn} disabled={!newField.label.trim()} onClick={addField}>Add field</button>
        </div>
      </div>

      {/* ── Acknowledgment ─────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3}>Sender acknowledgment</h3>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!!config.ack_enabled} onChange={(e) => saveConfig({ ack_enabled: e.target.checked })} />
            Enabled
          </label>
        </div>
        <div style={sub}>
          Neutral auto-reply on every intake outcome. Compliance rules: no case number, no case details, no medical advice —
          {' '}a neutral reference token only. Placeholders: {'{{reference}}'} and {'{{missing_fields}}'}.
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label style={label}>Standard template (blank = platform default)</label>
            <textarea style={{ ...input, minHeight: 64 }} value={config.ack_template || ''}
              onChange={(e) => setConfig({ ...config, ack_template: e.target.value })}
              onBlur={() => saveConfig({ ack_template: config.ack_template })} />
          </div>
          <div>
            <label style={label}>Missing-information template (blank = platform default)</label>
            <textarea style={{ ...input, minHeight: 64 }} value={config.ack_missing_fields_template || ''}
              onChange={(e) => setConfig({ ...config, ack_missing_fields_template: e.target.value })}
              onBlur={() => saveConfig({ ack_missing_fields_template: config.ack_missing_fields_template })} />
          </div>
        </div>
      </div>
    </div>
  )
}
