import { useState, useEffect } from 'react'
import React from 'react'
import { guardedFetch } from '../utils/guardedFetch'

const INTEGRATION_TYPES = [
  { key: 'mir',         label: 'MIR Integration' },
  { key: 'crm',         label: 'CRM Integration' },
  { key: 'content',     label: 'Content Integration' },
  { key: 'emir',        label: 'EMIR Integration' },
  { key: 'case_import', label: 'Case Import' },
]

export default function IntegrationsView({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [integrations, setIntegrations] = useState([])
  const [selectedIntOrg, setSelectedIntOrg] = useState(null)
  const [intOrgUsers, setIntOrgUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const intOrgs = integrations.reduce((acc, item) => {
    if (item.org_id && !acc.find(o => o.id === item.org_id)) {
      acc.push({ id: item.org_id, name: item.org_name || 'Org ' + item.org_id })
    }
    return acc
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [orgsRes, intRes] = await Promise.all([
          guardedFetch('/api/superadmin/orgs', { headers: H }).then(r => r.json()),
          guardedFetch('/api/superadmin/integrations', { headers: H }).then(r => r.json()),
        ])
        setOrgs(orgsRes.orgs || [])
        setIntegrations(intRes.integrations || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getIntegration(orgId, type) {
    return integrations.find(i => i.org_id === orgId && i.integration_type === type)
  }

  async function selectIntOrg(org) {
    setSelectedIntOrg(org)
    const res = await guardedFetch('/api/superadmin/reports/org/' + org.id + '/users', { headers: H }).then(r => r.json())
    setIntOrgUsers(res.users || [])
  }

  async function toggleIntegration(orgId, type, currentEnabled) {
    const existing = getIntegration(orgId, type)
    try {
      if (existing) {
        await guardedFetch(`/api/superadmin/integrations/${existing.id}`, {
          method: 'PUT',
          headers: H,
          body: JSON.stringify({ enabled: currentEnabled ? 0 : 1, org_override_allowed: existing.org_override_allowed }),
        })
      } else {
        await guardedFetch('/api/superadmin/integrations', {
          method: 'POST',
          headers: H,
          body: JSON.stringify({ org_id: orgId, integration_type: type, enabled: 1, org_override_allowed: 0 }),
        })
      }
      const intRes = await guardedFetch('/api/superadmin/integrations', { headers: H }).then(r => r.json())
      setIntegrations(intRes.integrations || [])
      flash('Integration updated', 'success')
    } catch (_e) {
      flash('Failed to update integration', 'error')
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Organisations</div>
          {intOrgs.map(org => (
            <div key={org.id}
              onClick={() => selectIntOrg(org)}
              style={{
                padding: '8px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                background: selectedIntOrg && selectedIntOrg.id === org.id ? '#e8890c22' : '#f5f5f5',
                border: '1px solid ' + (selectedIntOrg && selectedIntOrg.id === org.id ? '#e8890c' : '#ddd'),
                fontSize: 13,
              }}>
              <div style={{ fontWeight: 500 }}>{org.name}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          {!selectedIntOrg ? (
            <div style={{ color: '#888', marginTop: 40, textAlign: 'center' }}>
              Select an organisation
            </div>
          ) : (
            <React.Fragment>
              <h2 style={{ marginBottom: 4 }}>Integrations</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 13 }}>
                Enable or disable integrations per organisation based on contract.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Organisation</th>
                      {INTEGRATION_TYPES.map(t => <th key={t.key}>{t.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.filter(o => o.is_active !== 0 && o.id === selectedIntOrg.id).map(org => (
                      <tr key={org.id}>
                        <td style={{ fontWeight: 500 }}>{org.name}</td>
                        {INTEGRATION_TYPES.map(t => {
                          const existing = getIntegration(org.id, t.key)
                          const enabled = existing ? !!existing.enabled : false
                          return (
                            <td key={t.key} style={{ textAlign: 'center' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() => toggleIntegration(org.id, t.key, enabled)}
                                />
                                <span style={{ fontSize: 12, color: enabled ? 'var(--success, green)' : 'var(--text-muted)' }}>
                                  {enabled ? 'On' : 'Off'}
                                </span>
                              </label>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 20 }}>
                <h3 style={{ marginBottom: 8 }}>Users in this Organisation</h3>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intOrgUsers.map(u => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.role}</td>
                        <td>Contact superadmin to grant integration access</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  )
}
