/**
 * GroupSecurity.jsx — MIMS Admin > System > Security > Group Security
 * Current slice: Details, System Options, and Case Options.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { CASE_OPTION_SECTIONS, SYSTEM_OPTION_SECTIONS, createEmptyCaseOptions, createEmptySystemOptions } from '../groupSecurityConfig'
import './GroupSecurity.css'

const API = '/api/admin/security-groups'

const EMPTY_DETAILS = {
  security_group: '',
  tenant_ids: [],
  department: '',
  general_table: '',
  call_center_location: '',
  call_center_type: '',
}

function makeEmptyForm() {
  return {
    name: '',
    description: '',
    is_active: true,
    details: { ...EMPTY_DETAILS },
    system_options: createEmptySystemOptions(),
    case_options: createEmptyCaseOptions(),
  }
}

function normalizeGroupToForm(group) {
  const privileges = group?.privileges || {}
  const details = { ...EMPTY_DETAILS, ...(privileges.details || {}) }
  const baseSystem = createEmptySystemOptions()
  const baseCase = createEmptyCaseOptions()
  const savedSystem = privileges.system_options || {}
  const savedCase = privileges.case_options || {}

  for (const section of SYSTEM_OPTION_SECTIONS) {
    for (const option of section.options) {
      baseSystem[section.key][option.key] = Boolean(savedSystem?.[section.key]?.[option.key])
    }
  }

  for (const section of CASE_OPTION_SECTIONS) {
    for (const option of section.options) {
      baseCase[section.key][option.key] = Boolean(savedCase?.[section.key]?.[option.key])
    }
  }

  return {
    name: group?.name || details.security_group || '',
    description: group?.description || '',
    is_active: group?.is_active !== 0,
    details: {
      ...details,
      security_group: group?.name || details.security_group || '',
      tenant_ids: Array.isArray(details.tenant_ids) ? details.tenant_ids.map(String) : [],
    },
    system_options: baseSystem,
    case_options: baseCase,
  }
}

function optionLabel(value, fallback = 'No values configured') {
  return value || fallback
}

export default function GroupSecurity() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const [groups, setGroups] = useState([])
  const [options, setOptions] = useState({
    tenants: [], departments: [], general_tables: [], call_center_locations: [], call_center_types: [],
  })
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(makeEmptyForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState('details')
  const [search, setSearch] = useState('')
  const [flash, setFlash] = useState(null)

  const showFlash = useCallback((message, type = 'success') => {
    setFlash({ message, type })
    window.setTimeout(() => setFlash(null), 3500)
  }, [])

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await httpFetch(API, { headers: H }).then(r => r.json())
      setGroups(data.groups || [])
    } catch {
      setGroups([])
      showFlash('Unable to load security groups.', 'error')
    } finally {
      setLoading(false)
    }
  }, [H, showFlash])

  const loadOptions = useCallback(async () => {
    try {
      const data = await httpFetch(`${API}/options`, { headers: H }).then(r => r.json())
      setOptions({
        tenants: data.tenants || [],
        departments: data.departments || [],
        general_tables: data.general_tables || [],
        call_center_locations: data.call_center_locations || [],
        call_center_types: data.call_center_types || [],
      })
    } catch {
      showFlash('Reference dropdowns could not be loaded.', 'error')
    }
  }, [H, showFlash])

  useEffect(() => {
    loadGroups()
    loadOptions()
  }, [loadGroups, loadOptions])

  function startCreate() {
    setSelectedId(null)
    setForm(makeEmptyForm())
    setActiveSection('details')
  }

  async function selectGroup(group) {
    setSelectedId(group.id)
    setActiveSection('details')
    try {
      const data = await httpFetch(`${API}/${group.id}`, { headers: H }).then(r => r.json())
      setForm(normalizeGroupToForm(data.group || group))
    } catch {
      setForm(normalizeGroupToForm(group))
      showFlash('Loaded list values only. Full group detail failed.', 'error')
    }
  }

  function setDetail(key, value) {
    setForm(prev => ({
      ...prev,
      name: key === 'security_group' ? value : prev.name,
      details: { ...prev.details, [key]: value },
    }))
  }

  function toggleTenant(id) {
    const value = String(id)
    setForm(prev => {
      const exists = prev.details.tenant_ids.includes(value)
      return {
        ...prev,
        details: {
          ...prev.details,
          tenant_ids: exists
            ? prev.details.tenant_ids.filter(t => t !== value)
            : [...prev.details.tenant_ids, value],
        },
      }
    })
  }

  function toggleSystemOption(sectionKey, optionKey) {
    setForm(prev => ({
      ...prev,
      system_options: {
        ...prev.system_options,
        [sectionKey]: {
          ...prev.system_options[sectionKey],
          [optionKey]: !prev.system_options[sectionKey][optionKey],
        },
      },
    }))
  }

  function toggleCaseOption(sectionKey, optionKey) {
    setForm(prev => ({
      ...prev,
      case_options: {
        ...prev.case_options,
        [sectionKey]: {
          ...prev.case_options[sectionKey],
          [optionKey]: !prev.case_options[sectionKey][optionKey],
        },
      },
    }))
  }

  function buildPayload() {
    const name = form.details.security_group.trim()
    return {
      name,
      description: form.description || null,
      is_active: form.is_active,
      privileges: {
        details: {
          ...form.details,
          security_group: name,
          tenant_ids: form.details.tenant_ids.map(Number).filter(Boolean),
        },
        system_options: form.system_options,
        case_options: form.case_options,
      },
    }
  }

  async function saveGroup() {
    const name = form.details.security_group.trim()
    if (!name) return showFlash('Security group name is required.', 'error')
    if (!form.details.tenant_ids.length) return showFlash('Select at least one division/tenant.', 'error')

    setSaving(true)
    try {
      const res = await httpFetch(selectedId ? `${API}/${selectedId}` : API, {
        method: selectedId ? 'PUT' : 'POST',
        headers: H,
        body: JSON.stringify(buildPayload()),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Save failed.')
      await loadGroups()
      if (!selectedId && data.id) setSelectedId(data.id)
      window.dispatchEvent(new CustomEvent('mims-security-groups-updated'))
      showFlash(selectedId ? 'Security group updated. Security permissions are active now.' : 'Security group created. Assign it to users from Add / Edit Users.')
    } catch (err) {
      showFlash(err.message || 'Security group save failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filteredGroups = groups.filter(group => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return group.name?.toLowerCase().includes(term) || group.description?.toLowerCase().includes(term)
  })

  const selectedGroup = groups.find(group => Number(group.id) === Number(selectedId))
  const checkedCount = SYSTEM_OPTION_SECTIONS.reduce((count, section) => (
    count + section.options.filter(option => form.system_options?.[section.key]?.[option.key]).length
  ), 0)
  const caseCheckedCount = CASE_OPTION_SECTIONS.reduce((count, section) => (
    count + section.options.filter(option => form.case_options?.[section.key]?.[option.key]).length
  ), 0)

  return (
    <div className="ma-gs-page">
      <aside className="ma-gs-sidebar">
        <div className="ma-gs-sidebar-head">
          <div>
            <h2>Group Security</h2>
            <span>{loading ? 'Loading groups' : `${groups.length} configured group${groups.length === 1 ? '' : 's'}`}</span>
          </div>
          <button type="button" onClick={startCreate}>New</button>
        </div>
        <input
          className="ma-gs-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search security groups"
        />
        <div className="ma-gs-list">
          {filteredGroups.length === 0 ? (
            <div className="ma-gs-empty">No security groups found.</div>
          ) : filteredGroups.map(group => (
            <button
              key={group.id}
              type="button"
              className={`ma-gs-list-item${Number(selectedId) === Number(group.id) ? ' active' : ''}`}
              onClick={() => selectGroup(group)}
            >
              <strong>{group.name}</strong>
              <span>{group.is_active ? 'Active' : 'Inactive'}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="ma-gs-main">
        {flash && <div className={`ma-gs-flash ${flash.type}`}>{flash.message}</div>}

        <div className="ma-gs-header-card">
          <div>
            <p className="ma-gs-kicker">System &gt; Security</p>
            <h1>{selectedGroup ? selectedGroup.name : 'Create Security Group'}</h1>
            <p>Configure tenant-level access across Details, System Options, and Case Options. Unchecked options are treated as no access for that capability.</p>
          </div>
          <div className="ma-gs-summary">
            <span>{form.details.tenant_ids.length} tenant{form.details.tenant_ids.length === 1 ? '' : 's'}</span>
            <span>{checkedCount} system option{checkedCount === 1 ? '' : 's'}</span>
            <span>{caseCheckedCount} case option{caseCheckedCount === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="ma-gs-tabs">
          <button type="button" className={activeSection === 'details' ? 'active' : ''} onClick={() => setActiveSection('details')}>Details</button>
          <button type="button" className={activeSection === 'system' ? 'active' : ''} onClick={() => setActiveSection('system')}>System Options</button>
          <button type="button" className={activeSection === 'case' ? 'active' : ''} onClick={() => setActiveSection('case')}>Case Options</button>
        </div>

        {activeSection === 'details' ? (
          <section className="ma-gs-card">
            <div className="ma-gs-section-title">
              <h3>Details</h3>
              <p>Define the group name and the tenant/picklist values this access group belongs to.</p>
            </div>

            <div className="ma-gs-grid two">
              <label className="ma-gs-field">
                <span>Security Group</span>
                <input value={form.details.security_group} onChange={e => setDetail('security_group', e.target.value)} placeholder="e.g. Medical Information Admin" />
              </label>
              <label className="ma-gs-field">
                <span>Status</span>
                <select value={form.is_active ? '1' : '0'} onChange={e => setForm(prev => ({ ...prev, is_active: e.target.value === '1' }))}>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </label>
            </div>

            <div className="ma-gs-field">
              <span>Division / Tenant</span>
              <div className="ma-gs-tenant-grid">
                {options.tenants.length === 0 ? <em>No tenants available.</em> : options.tenants.map(tenant => {
                  const checked = form.details.tenant_ids.includes(String(tenant.id))
                  return (
                    <label key={tenant.id} className={`ma-gs-tenant${checked ? ' checked' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleTenant(tenant.id)} />
                      <span>{tenant.name}</span>
                      <small>{tenant.is_active ? 'Active' : 'Inactive'}</small>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="ma-gs-grid two">
              <label className="ma-gs-field">
                <span>Department</span>
                <select value={form.details.department} onChange={e => setDetail('department', e.target.value)}>
                  <option value="">{optionLabel('', 'Select department')}</option>
                  {options.departments.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="ma-gs-field">
                <span>Tables General Tables</span>
                <select value={form.details.general_table} onChange={e => setDetail('general_table', e.target.value)}>
                  <option value="">{optionLabel('', 'General tables values coming soon')}</option>
                  {options.general_tables.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="ma-gs-field">
                <span>Call Center Location</span>
                <select value={form.details.call_center_location} onChange={e => setDetail('call_center_location', e.target.value)}>
                  <option value="">{optionLabel('', 'Select call center location')}</option>
                  {options.call_center_locations.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="ma-gs-field">
                <span>Call Center Type</span>
                <select value={form.details.call_center_type} onChange={e => setDetail('call_center_type', e.target.value)}>
                  <option value="">{optionLabel('', 'Select call center type')}</option>
                  {options.call_center_types.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          </section>
        ) : activeSection === 'system' ? (
          <section className="ma-gs-system-grid">
            {SYSTEM_OPTION_SECTIONS.map(section => (
              <div className="ma-gs-option-box" key={section.key}>
                <div className="ma-gs-box-head">
                  <h3>{section.label}</h3>
                  <span>{section.options.filter(option => form.system_options?.[section.key]?.[option.key]).length}/{section.options.length}</span>
                </div>
                <div className="ma-gs-checks">
                  {section.options.map(option => (
                    <label key={option.key} className="ma-gs-check">
                      <input
                        type="checkbox"
                        checked={Boolean(form.system_options?.[section.key]?.[option.key])}
                        onChange={() => toggleSystemOption(section.key, option.key)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="ma-gs-system-grid">
            {CASE_OPTION_SECTIONS.map(section => (
              <div className="ma-gs-option-box" key={section.key}>
                <div className="ma-gs-box-head">
                  <h3>{section.label}</h3>
                  <span>{section.options.filter(option => form.case_options?.[section.key]?.[option.key]).length}/{section.options.length}</span>
                </div>
                <div className="ma-gs-checks">
                  {section.options.map(option => (
                    <label key={option.key} className="ma-gs-check">
                      <input
                        type="checkbox"
                        checked={Boolean(form.case_options?.[section.key]?.[option.key])}
                        onChange={() => toggleCaseOption(section.key, option.key)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        <div className="ma-gs-actions">
          <button type="button" className="secondary" onClick={startCreate}>Clear</button>
          <button type="button" onClick={saveGroup} disabled={saving}>{saving ? 'Saving...' : selectedId ? 'Update Group' : 'Create Group'}</button>
        </div>
      </main>
    </div>
  )
}
