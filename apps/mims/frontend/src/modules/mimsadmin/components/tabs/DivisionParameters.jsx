import { useState, useEffect } from 'react'
import { guardedFetch } from '../../utils/guardedFetch'

const API = '/api/admin/division-parameters'

// 9-tab wizard definition. P1: General + Users active; Document & Other are
// permanent placeholders; the rest arrive in later phases (disabled for now).
const TABS = [
  { key: 'general',    label: 'General',                 state: 'active'      },
  { key: 'case-entry', label: 'Case Entry/Resp Letters', state: 'active'      },
  { key: 'document',   label: 'Document',                state: 'placeholder' },
  { key: 'email',      label: 'Email/PDF/Fax',           state: 'active'      },
  { key: 'other',      label: 'Other',                   state: 'placeholder' },
  { key: 'ae',         label: 'AE',                      state: 'active'      },
  { key: 'pc',         label: 'PC',                      state: 'active'      },
  { key: 'completion', label: 'Case Completion',         state: 'active'      },
  { key: 'users',      label: 'Users',                   state: 'active'      },
]

const DATE_FORMATS = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'DD-MON-YYYY']
const PRIORITIES   = ['Low', 'Medium', 'High', 'Critical']

const CC_RULES = [
  ['cc_reason_delete_record',          'Require a reason for deleting a record'],
  ['cc_reason_change_case',            'Require a reason for any change to a case record'],
  ['cc_reason_refer_case',             'Require a reason for referring a case'],
  ['cc_password_close_case',           'Require a password to close a case'],
  ['cc_reason_reopen_case',            'Require a reason for reopening a case'],
  ['cc_password_close_ae',             'Require a password to close a case with an adverse event'],
  ['cc_password_close_pc',             'Require a password to close a case with a product complaint'],
  ['cc_reason_change_letter',          'Require a reason for any change to a letter record'],
  ['cc_reason_reopen_letter',          'Require a reason for reopening a letter'],
  ['cc_reason_reopen_pc',              'Require a reason for reopening a product complaint'],
  ['cc_reason_reopen_ae',              'Require a reason for reopening an adverse event'],
  ['cc_reason_change_ae',              'Require a reason for any change to an adverse event record'],
  ['cc_reason_delete_ae',              'Require a reason to delete AE case'],
  ['cc_reason_change_pc',              'Require a reason for any change to a product complaint record'],
  ['cc_reason_change_date_received',   'Require a reason for any change to date received'],
  ['cc_reason_change_first_response',  'Require a reason for any change to first response date'],
  ['cc_reason_escalation',             'Require a reason for escalation'],
]

const lbl = { fontSize: 12, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 0 }
const h3 = { margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }
// Flow cards into multiple columns to use the full screen width instead of one
// tall scrolling column. Cards size to content (alignItems:start) and wrap.
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16, alignItems: 'start', marginBottom: 16 }

export default function DivisionParameters({ H }) {
  const [divisions, setDivisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [activeOrgId, setActiveOrgId] = useState(null)   // null = list view
  const [creating, setCreating] = useState(false)

  function flash(text, type = 'info') { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000) }

  async function loadList() {
    setLoading(true)
    try {
      const res = await guardedFetch(API, { headers: H })
      const data = await res.json()
      setDivisions(data.divisions || [])
    } catch { flash('Failed to load divisions.', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { loadList() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Create now opens the full wizard (General tab) rather than a thin popup.
  if (creating) {
    return <DivisionWizard H={H} creating onBack={() => { setCreating(false); loadList() }}
             onCreated={id => { setCreating(false); loadList(); setActiveOrgId(id) }} flash={flash} msg={msg} />
  }
  if (activeOrgId) {
    return <DivisionWizard H={H} orgId={activeOrgId} onBack={() => { setActiveOrgId(null); loadList() }} flash={flash} msg={msg} />
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Division Parameters</h2>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Create Division</button>
      </div>

      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: msg.type === 'error' ? 'var(--danger,#c0392b)' : 'var(--success,#1e7e34)' }}>{msg.text}</div>}

      {loading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (
        <table className="admin-table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Division</th><th>Code</th><th>Status</th><th>Users</th><th></th></tr>
          </thead>
          <tbody>
            {divisions.map(d => (
              <tr key={d.org_id}>
                <td>{d.name} {d.needs_review ? <span title="Review recommended" style={{ color: '#b8860b' }}>⚠</span> : null}</td>
                <td>{d.division_code || '—'}</td>
                <td>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: d.config_status === 'active' ? '#e6f4ea' : '#fdf1d6', color: d.config_status === 'active' ? '#1e7e34' : '#8a6d1a' }}>
                    {d.config_status || 'draft'}{d.is_active ? '' : ' · inactive'}
                  </span>
                </td>
                <td>{d.user_count}</td>
                <td><button className="btn btn-sm" onClick={() => setActiveOrgId(d.org_id)}>Configure</button></td>
              </tr>
            ))}
            {!divisions.length && <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No divisions yet.</td></tr>}
          </tbody>
        </table>
      )}

    </div>
  )
}

// ── Wizard shell ────────────────────────────────────────────────────────────
function DivisionWizard({ H, orgId, onBack, flash, msg, creating = false, onCreated }) {
  const [tab, setTab] = useState('general')
  const [org, setOrg] = useState(null)
  const [params, setParams] = useState(null)
  const [loading, setLoading] = useState(!creating)

  async function load() {
    if (creating) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await guardedFetch(`${API}/${orgId}`, { headers: H })
      const data = await res.json()
      setOrg(data.org); setParams(data.params)
    } catch { flash('Failed to load division.', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function activate() {
    try {
      const res = await guardedFetch(`${API}/${orgId}/activate`, { method: 'POST', headers: H })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Activate failed.', 'error')
      flash('Division activated.', 'success'); load()
    } catch { flash('Activate failed.', 'error') }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-sm" onClick={onBack}>← Divisions</button>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{creating ? 'New Division' : (org?.name || 'Division')}</h2>
          {!creating && params && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: params.config_status === 'active' ? '#e6f4ea' : '#fdf1d6', color: params.config_status === 'active' ? '#1e7e34' : '#8a6d1a' }}>{params.config_status}</span>}
        </div>
        {!creating && <button className="btn btn-primary" onClick={activate} disabled={params?.config_status === 'active'}>Activate</button>}
      </div>

      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: msg.type === 'error' ? 'var(--danger,#c0392b)' : 'var(--success,#1e7e34)' }}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const disabled = t.state === 'phase' || (creating && t.key !== 'general')
          const isActive = tab === t.key
          return (
            <button key={t.key} disabled={disabled}
              onClick={() => !disabled && setTab(t.key)}
              title={disabled ? 'Coming in a later phase' : ''}
              style={{
                padding: '8px 14px', fontSize: 13, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                background: 'transparent', borderBottom: isActive ? '2px solid var(--primary,#2563eb)' : '2px solid transparent',
                color: disabled ? 'var(--text-muted)' : isActive ? 'var(--primary,#2563eb)' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
              }}>
              {t.label}{disabled ? ' ·' : ''}
            </button>
          )
        })}
      </div>

      {loading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (
        <>
          {tab === 'general'    && <GeneralTab H={H} orgId={orgId} org={org} params={params} onSaved={load} flash={flash} creating={creating} onCreated={onCreated} />}
          {tab === 'case-entry' && <SectionTab H={H} orgId={orgId} section="case-entry" params={params} onSaved={load} flash={flash} render={CaseEntryFields} clientKind="case" />}
          {tab === 'email'      && <SectionTab H={H} orgId={orgId} section="email" params={params} onSaved={load} flash={flash} render={EmailFields} />}
          {tab === 'ae'         && <SectionTab H={H} orgId={orgId} section="ae" params={params} onSaved={load} flash={flash} render={AeFields} clientKind="ae" />}
          {tab === 'pc'         && <SectionTab H={H} orgId={orgId} section="pc" params={params} onSaved={load} flash={flash} render={PcFields} clientKind="pc" />}
          {tab === 'completion' && <SectionTab H={H} orgId={orgId} section="completion" params={params} onSaved={load} flash={flash} render={CompletionFields} />}
          {tab === 'users'      && <UsersTab H={H} orgId={orgId} flash={flash} />}
          {tab === 'document'   && <Placeholder label="Document" />}
          {tab === 'other'      && <Placeholder label="Other" />}
        </>
      )}
    </div>
  )
}

function Placeholder({ label }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🗂️</div>
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 13 }}>Placeholder — configuration for this tab is planned for a later phase.</div>
    </div>
  )
}

// ── General tab ───────────────────────────────────────────────────────────
function GeneralTab({ H, orgId, org, params, onSaved, flash, creating = false, onCreated }) {
  const [countries, setCountries] = useState([])
  const [form, setForm] = useState({
    ...params,
    is_active: org ? !!org.is_active : true,
    name: org?.name || '',
    session_timeout_minutes: org?.session_timeout_minutes ?? 30,
  })
  const [saving, setSaving] = useState(false)
  const [triedSave, setTriedSave] = useState(false)
  // Mandatory fields for save/create.
  const missingName = !String(form.name || '').trim()
  const missingCode = !String(form.division_code || '').trim()

  useEffect(() => {
    guardedFetch(`${API}/countries`, { headers: H }).then(r => r.json()).then(d => setCountries(d.countries || [])).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function uploadLogo(file) {
    if (!file) return
    try {
      const fd = new FormData(); fd.append('logo', file)
      // Reuse the existing org-logo endpoint (no new backend needed).
      const res = await guardedFetch(`/api/admin/platform/orgs/${orgId}/logo`, {
        method: 'POST', headers: { Authorization: H.Authorization }, body: fd,
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); return flash(d.error || 'Logo upload failed.', 'error') }
      flash('Logo uploaded.', 'success')
    } catch { flash('Logo upload failed.', 'error') }
  }

  async function save() {
    if (missingName || missingCode) { setTriedSave(true); return flash('Division Name and Division Code are required.', 'error') }
    setSaving(true)
    try {
      if (creating) {
        // 1) create the division (org + draft row), then 2) save the rest of General.
        const cRes = await guardedFetch(API, { method: 'POST', headers: H, body: JSON.stringify({ name: form.name.trim(), division_code: form.division_code.trim() }) })
        const cData = await cRes.json()
        if (!cRes.ok) return flash(cData.error || 'Create failed.', 'error')
        await guardedFetch(`${API}/${cData.org_id}/save/general`, { method: 'PUT', headers: H, body: JSON.stringify(form) })
        flash('Division created.', 'success')
        onCreated?.(cData.org_id)
      } else {
        const res = await guardedFetch(`${API}/${orgId}/save/general`, { method: 'PUT', headers: H, body: JSON.stringify(form) })
        const data = await res.json()
        if (!res.ok) return flash(data.error || 'Save failed.', 'error')
        flash('General tab saved.', 'success'); onSaved()
      }
    } catch { flash(creating ? 'Create failed.' : 'Save failed.', 'error') }
    finally { setSaving(false) }
  }

  const text = (k, label, ph = '') => (
    <div style={{ marginBottom: 12 }}>
      <label style={lbl}>{label}</label>
      <input className="form-control" value={form[k] ?? ''} placeholder={ph} onChange={e => set(k, e.target.value)} />
    </div>
  )

  // Mandatory field with asterisk + red highlight after a failed save attempt.
  const requiredText = (k, label, ph = '') => {
    const missing = !String(form[k] || '').trim()
    return (
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>{label} <span style={{ color: 'var(--danger,#c0392b)' }}>*</span></label>
        <input className="form-control" value={form[k] ?? ''} placeholder={ph}
          onChange={e => set(k, e.target.value)}
          style={triedSave && missing ? { borderColor: 'var(--danger,#c0392b)', boxShadow: '0 0 0 1px var(--danger,#c0392b)' } : undefined} />
        {triedSave && missing && <div style={{ fontSize: 11, color: 'var(--danger,#c0392b)', marginTop: 3 }}>{label} is required.</div>}
      </div>
    )
  }

  return (
    <div>
      <div style={grid}>
      {/* Division box */}
      <div style={card}>
        <h3 style={h3}>Division</h3>
        {requiredText('name', 'Division Name')}
        {requiredText('division_code', 'Division Code', 'e.g. NVS-ONC')}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13 }}>
          <input type="checkbox" checked={!form.is_active} onChange={e => set('is_active', !e.target.checked)} />
          Inactive (disable this division)
        </label>
        {text('description', 'Division Description')}
        {text('address', 'Address')}
        {text('city', 'City')}
        {text('state_region', 'State / Region')}
        {text('postal_code', 'Zip / Postal')}
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Country</label>
          <select className="form-control" value={form.country ?? ''} onChange={e => set('country', e.target.value)}>
            <option value="">— Select —</option>
            {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        {text('email', 'E-mail')}
        {text('division_group', 'Division Group')}
        {!creating && (
          <div style={{ marginBottom: 0 }}>
            <label style={lbl}>Division Logo</label>
            <input type="file" accept="image/*" onChange={e => uploadLogo(e.target.files?.[0])} style={{ fontSize: 12 }} />
          </div>
        )}
      </div>

      {/* Tailoring options */}
      <div style={card}>
        <h3 style={h3}>Tailoring Options</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Country Default</label>
          <select className="form-control" value={form.country_default ?? ''} onChange={e => set('country_default', e.target.value)}>
            <option value="">— Select —</option>
            {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Personal Info</label>
          <select className="form-control" value={form.personal_info_visibility ?? 'visible'} onChange={e => set('personal_info_visibility', e.target.value)}>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Date Format</label>
          <select className="form-control" value={form.date_format ?? 'YYYY-MM-DD'} onChange={e => set('date_format', e.target.value)}>
            {DATE_FORMATS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Default Case Priority</label>
          <select className="form-control" value={form.default_case_priority ?? ''} onChange={e => set('default_case_priority', e.target.value)}>
            <option value="">— Select —</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 0 }}>
          <label style={lbl}>Session Timeout (minutes)</label>
          <input className="form-control" type="number" min={1} value={form.session_timeout_minutes ?? 30}
            onChange={e => set('session_timeout_minutes', e.target.value)} />
        </div>
      </div>

      {/* Change control / logging rules */}
      <div style={card}>
        <h3 style={h3}>Change Control / Logging Rules</h3>
        {CC_RULES.map(([k, label]) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
            <input type="checkbox" checked={!!form[k]} onChange={e => set(k, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>
      </div>{/* end grid */}

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? (creating ? 'Creating…' : 'Saving…') : (creating ? 'Create Division' : 'Save General')}
      </button>
    </div>
  )
}

// ── Shared field helpers ────────────────────────────────────────────────────
function FText({ form, set, k, label, ph, type = 'text' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={lbl}>{label}</label>
      <input className="form-control" type={type} value={form[k] ?? ''} placeholder={ph}
        onChange={e => set(k, e.target.value)} />
    </div>
  )
}
function FSelect({ form, set, k, label, options }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={lbl}>{label}</label>
      <select className="form-control" value={form[k] ?? ''} onChange={e => set(k, e.target.value)}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  )
}
function FCheck({ form, set, k, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
      <input type="checkbox" checked={!!form[k]} onChange={e => set(k, e.target.checked)} /> {label}
    </label>
  )
}
function FMulti({ form, set, k, label, options }) {
  const selected = String(form[k] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const toggle = v => {
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
    set(k, next.join(','))
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={lbl}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {options.map(v => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} /> {v}
          </label>
        ))}
      </div>
    </div>
  )
}
const YESNO = [['no', 'No'], ['yes', 'Yes']]

// ── Generic section tab: holds form state, renders fields, saves ────────────
function SectionTab({ H, orgId, section, params, onSaved, flash, render, clientKind }) {
  const [form, setForm] = useState({ ...params })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    try {
      const res = await guardedFetch(`${API}/${orgId}/save/${section}`, { method: 'PUT', headers: H, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Save failed.', 'error')
      flash('Saved.', 'success'); onSaved()
    } catch { flash('Save failed.', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={grid}>
        {render({ form, set })}
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      {clientKind && <ClientFieldsEditor H={H} orgId={orgId} kind={clientKind} flash={flash} />}
    </div>
  )
}

// ── Field render functions per tab ──────────────────────────────────────────
function CaseEntryFields({ form, set }) {
  return (
    <>
      <div style={card}>
        <h3 style={h3}>Customizable Actions</h3>
        <FCheck form={form} set={set} k="ce_lookup_city_zip" label="Look up city via zip/postal" />
        <FCheck form={form} set={set} k="ce_lookup_rep_zip" label="Look up rep via zip/postal" />
        <FCheck form={form} set={set} k="ce_lookup_msl" label="Look up MSL via zip/postal or product" />
        <FCheck form={form} set={set} k="ce_suppress_ae" label="Suppress AE (capture only)" />
        <FCheck form={form} set={set} k="ce_suppress_pc" label="Suppress product complaints" />
        <FCheck form={form} set={set} k="ce_lock_entered_date" label="Lock entered date" />
        <FCheck form={form} set={set} k="ce_sort_product_by_status" label="Sort product by status" />
        <FCheck form={form} set={set} k="ce_allow_new_qa_case" label="Allow add new QA case" />
        <FCheck form={form} set={set} k="ce_allow_field_translation" label="Allow case field translation" />
      </div>
      <div style={card}>
        <h3 style={h3}>Case Entry</h3>
        <FText form={form} set={set} k="ce_max_contacts" label="Max number of contacts" type="number" />
        <FText form={form} set={set} k="ce_max_questions" label="Max number of questions" type="number" />
      </div>
      <div style={card}>
        <h3 style={h3}>Numbering Options</h3>
        <FText form={form} set={set} k="num_case_number" label="Case Number" ph="e.g. CASE-{YYYY}-{seq}" />
        <FSelect form={form} set={set} k="num_ae_mode" label="AE" options={[['same', 'Same case number'], ['new', 'New case number']]} />
        <FSelect form={form} set={set} k="num_pc_mode" label="PC" options={[['same', 'Same case number'], ['new', 'New case number']]} />
      </div>
      <div style={card}>
        <h3 style={h3}>Response Options</h3>
        <FCheck form={form} set={set} k="resp_allow_letters" label="Allow response letters" />
        {form.resp_allow_letters && (
          <FSelect form={form} set={set} k="resp_custom_letters_mode" label="Custom letters"
            options={[['auto_on', 'Auto-on'], ['auto_on_off', 'Auto on & off'], ['manual_on_off', 'Manual on & off']]} />
        )}
        <FCheck form={form} set={set} k="resp_store_secured_pdf" label="Store letters as secured PDFs" />
        <FCheck form={form} set={set} k="resp_allow_email" label="Allow response email" />
      </div>
    </>
  )
}

function EmailFields({ form, set }) {
  return (
    <>
      <div style={card}>
        <h3 style={h3}>Email Options</h3>
        <FSelect form={form} set={set} k="email_attachment_format" label="Email attachment format"
          options={[['native', 'Native (As Is)'], ['secured_pdf', 'Secured PDF'], ['unsecured_pdf', 'Unsecured PDF'], ['secured_package', 'Secured Package'], ['unsecured_package', 'Unsecured Package']]} />
      </div>
      <div style={card}>
        <h3 style={h3}>Fax Options</h3>
        <FText form={form} set={set} k="fax_server_domain" label="Fax server tailoring (server / domain details)" />
        <h3 style={{ ...h3, fontSize: 13, marginTop: 8 }}>Outbound</h3>
        <FText form={form} set={set} k="fax_out_address_mask" label="Address mask" />
        <FText form={form} set={set} k="fax_out_subject" label="Subject" />
        <FText form={form} set={set} k="fax_out_success_phrase" label="Success phrase" />
      </div>
    </>
  )
}

function AeFields({ form, set }) {
  return (
    <>
      <div style={card}>
        <h3 style={h3}>General</h3>
        <FSelect form={form} set={set} k="ae_auto_snapshot_on_referral" label="Auto snapshot on referral" options={YESNO} />
        <FSelect form={form} set={set} k="ae_country_of_occurrence" label="Country of occurrence" options={YESNO} />
        <FSelect form={form} set={set} k="ae_delete_cancel_mode" label="Delete/Cancel button" options={[['delete', 'Delete case'], ['cancel', 'Cancel case']]} />
        <FMulti form={form} set={set} k="ae_med_types" label="Med Types" options={['Concomitant', 'Interacting', 'Not administered', 'Past', 'Suspect', 'Treatment']} />
        <FSelect form={form} set={set} k="ae_require_death_date" label="Require death date" options={YESNO} />
        <FSelect form={form} set={set} k="ae_contact_type_to_occupation" label="Contact type to occupation" options={YESNO} />
        <FSelect form={form} set={set} k="ae_default_report_type" label="Default report type" options={YESNO} />
        <FSelect form={form} set={set} k="ae_force_commit_cancel" label="Force commit or cancel" options={[['off', 'Off'], ['on', 'On']]} />
        <FSelect form={form} set={set} k="ae_product_mode" label="Product" options={[['default', 'Default'], ['force', 'Force']]} />
        <FSelect form={form} set={set} k="ae_seriousness" label="Seriousness" options={YESNO} />
      </div>
      <div style={card}>
        <h3 style={h3}>AE Integrations</h3>
        <FSelect form={form} set={set} k="ae_include_attachments" label="Include attachments" options={YESNO} />
        <FSelect form={form} set={set} k="ae_integration_method" label="Integration method" options={[['none', 'None'], ['e2b_r2', 'E2B-R2']]} />
      </div>
    </>
  )
}

function PcFields({ form, set }) {
  return (
    <div style={card}>
      <h3 style={h3}>PC Options</h3>
      <FSelect form={form} set={set} k="pc_auto_snapshot_on_referral" label="Auto snapshot on referral" options={YESNO} />
      <FSelect form={form} set={set} k="pc_delete_cancel_mode" label="Delete/Cancel button" options={[['delete', 'Delete'], ['cancel', 'Cancel']]} />
      <FSelect form={form} set={set} k="pc_force_commit_cancel" label="Force commit or cancel" options={[['off', 'Off'], ['on', 'On']]} />
      <FSelect form={form} set={set} k="pc_validate_case_entry" label="Validate case entry" options={YESNO} />
    </div>
  )
}

function CompletionFields({ form, set }) {
  return (
    <>
      <div style={card}>
        <h3 style={h3}>Case Completion Notification</h3>
        <FCheck form={form} set={set} k="comp_notif_active" label="Active" />
        <FCheck form={form} set={set} k="comp_notif_require_ae" label="Require AE" />
        <FCheck form={form} set={set} k="comp_notif_include_letter" label="Include response letter" />
        <FText form={form} set={set} k="comp_notif_email_template" label="Email template" />
        <FText form={form} set={set} k="comp_notif_email_to" label="Email to address" />
        <FCheck form={form} set={set} k="comp_notif_require_pc" label="Require PC" />
        <FCheck form={form} set={set} k="comp_notif_include_snapshot" label="Include case snapshot" />
        <FCheck form={form} set={set} k="comp_notif_save_attachment" label="Save as case attachment" />
      </div>
      <div style={card}>
        <h3 style={h3}>Sales Rep Notification</h3>
        <FCheck form={form} set={set} k="comp_rep_active" label="Active" />
        <FText form={form} set={set} k="comp_rep_email_template" label="Email template" />
        <FSelect form={form} set={set} k="comp_rep_trigger" label="Trigger" options={[['initial', 'Initial'], ['all', 'All']]} />
        <FMulti form={form} set={set} k="comp_rep_types" label="Rep types" options={['National account manager', 'Patient specialist', 'All']} />
      </div>
      <div style={card}>
        <h3 style={h3}>MSL Notification</h3>
        <FCheck form={form} set={set} k="comp_msl_active" label="Active" />
        <FText form={form} set={set} k="comp_msl_email_template" label="Email template" />
        <FSelect form={form} set={set} k="comp_msl_trigger" label="Trigger" options={[['initial', 'Initial'], ['all', 'All']]} />
      </div>
    </>
  )
}

// ── Reusable custom client fields editor (Case / AE / PC, up to 10) ─────────
function ClientFieldsEditor({ H, orgId, kind, flash }) {
  const [fields, setFields] = useState([])
  const [max, setMax] = useState(10)
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const res = await guardedFetch(`${API}/${orgId}/client-fields/${kind}`, { headers: H })
      const data = await res.json()
      setFields((data.fields || []).map(f => ({ field_name: f.field_name, field_type: f.field_type, default_value: f.default_value || '' })))
      setMax(data.max || 10)
    } catch { flash('Failed to load client fields.', 'error') }
  }
  useEffect(() => { load() }, [orgId, kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (i, k, v) => setFields(fs => fs.map((f, idx) => idx === i ? { ...f, [k]: v } : f))
  const add = () => { if (fields.length < max) setFields(fs => [...fs, { field_name: '', field_type: 'text', default_value: '' }]) }
  const del = i => setFields(fs => fs.filter((_, idx) => idx !== i))

  async function save() {
    setSaving(true)
    try {
      const res = await guardedFetch(`${API}/${orgId}/client-fields/${kind}`, { method: 'PUT', headers: H, body: JSON.stringify({ fields }) })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Save failed.', 'error')
      flash('Client fields saved.', 'success'); load()
    } catch { flash('Save failed.', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <h3 style={h3}>Client Field Names (up to {max})</h3>
      {fields.map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input className="form-control" style={{ flex: 2 }} placeholder={`Field ${i + 1} name`}
            value={f.field_name} onChange={e => upd(i, 'field_name', e.target.value)} />
          <select className="form-control" style={{ flex: 1 }} value={f.field_type} onChange={e => upd(i, 'field_type', e.target.value)}>
            <option value="text">Text</option>
            <option value="numeric">Numeric</option>
            <option value="date">Date</option>
            <option value="yes_no">Yes/No</option>
          </select>
          {f.field_type === 'text' && (
            <input className="form-control" style={{ flex: 2 }} placeholder="List values (comma-separated, optional)"
              value={f.default_value} onChange={e => upd(i, 'default_value', e.target.value)} />
          )}
          <button className="btn btn-sm" onClick={() => del(i)}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-sm" onClick={add} disabled={fields.length >= max}>+ Add field</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save client fields'}</button>
      </div>
    </div>
  )
}

// ── Users tab (dual list, drag-and-drop + click-to-move) ────────────────────
function UsersTab({ H, orgId, flash }) {
  const [assigned, setAssigned] = useState([])
  const [available, setAvailable] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await guardedFetch(`${API}/users?org_id=${orgId}`, { headers: H })
      const data = await res.json()
      setAssigned(data.assigned || []); setAvailable(data.available || [])
    } catch { flash('Failed to load users.', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  function move(user, toAssigned) {
    if (toAssigned) {
      setAvailable(a => a.filter(u => u.user_id !== user.user_id))
      setAssigned(a => a.some(u => u.user_id === user.user_id) ? a : [...a, user])
    } else {
      setAssigned(a => a.filter(u => u.user_id !== user.user_id))
      setAvailable(a => a.some(u => u.user_id === user.user_id) ? a : [...a, user])
    }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await guardedFetch(`${API}/${orgId}/users`, {
        method: 'PUT', headers: H, body: JSON.stringify({ user_ids: assigned.map(u => u.user_id) }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Save failed.', 'error')
      flash('User assignments saved.', 'success'); load()
    } catch { flash('Save failed.', 'error') }
    finally { setSaving(false) }
  }

  const listBox = { flex: 1, minHeight: 320, border: '1px solid var(--border)', borderRadius: 8, padding: 8, overflow: 'auto', background: 'var(--surface)' }
  const row = u => (
    <div key={u.user_id} draggable onDragStart={e => e.dataTransfer.setData('uid', String(u.user_id))}
      onDoubleClick={() => move(u, !u.__assigned)}
      style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, cursor: 'grab', marginBottom: 4, background: 'var(--bg-subtle,#f6f7f9)' }}>
      {u.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>· {u.email}</span>
    </div>
  )

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>

  function dropTo(toAssigned) {
    return e => {
      e.preventDefault()
      const uid = Number(e.dataTransfer.getData('uid'))
      const pool = toAssigned ? available : assigned
      const u = pool.find(x => x.user_id === uid)
      if (u) move(u, toAssigned)
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Drag users between lists (or double-click) to assign them to this division, then Save.
      </p>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>All Users ({available.length})</div>
          <div style={listBox} onDragOver={e => e.preventDefault()} onDrop={dropTo(false)}>
            {available.map(u => row({ ...u, __assigned: false }))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Assigned to Division ({assigned.length})</div>
          <div style={listBox} onDragOver={e => e.preventDefault()} onDrop={dropTo(true)}>
            {assigned.map(u => row({ ...u, __assigned: true }))}
          </div>
        </div>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Users'}</button>
    </div>
  )
}
