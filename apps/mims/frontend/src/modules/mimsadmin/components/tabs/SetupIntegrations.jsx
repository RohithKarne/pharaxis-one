import { useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import AdminIntegrationSection from '../../../admin/components/AdminIntegrationSection'
import { findSystemLabel } from '../configItems'

const INTEGRATION_SECTION_BY_SETUP_ITEM = {
  'sys-setup-int-mir': 'mir-int',
  'sys-setup-int-crm': 'crm-int',
  'sys-setup-int-content': 'content-int',
  'sys-setup-int-emir': 'emir-int',
  'sys-setup-int-case-import': 'case-import',
  'sys-setup-int-routing': 'inbox-routing',
  'sys-setup-int-health': 'health-monitor',
}

function Placeholder({ label }) {
  return (
    <div style={{ maxWidth: 720, margin: '24px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, padding: 32, textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 17, color: 'var(--text-primary)' }}>{label}</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
        This integration is listed in the new Setup menu and will be enabled when its configuration panel is available.
      </p>
    </div>
  )
}

export default function SetupIntegrations({ selectedItem }) {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [msg, setMsg] = useState({ text: '', type: '' })
  const contentSection = INTEGRATION_SECTION_BY_SETUP_ITEM[selectedItem]
  const label = findSystemLabel(selectedItem)

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 4000)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '24px 32px 0' }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</h1>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Manage integration settings from MIMS Admin under System Setup.
        </p>
        {msg.text && (
          <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginTop: 12 }}>
            {msg.text}
          </div>
        )}
      </div>
      {contentSection
        ? <AdminIntegrationSection contentSection={contentSection} H={H} flash={flash} />
        : <Placeholder label={label} />}
    </div>
  )
}
