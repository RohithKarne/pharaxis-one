export function LockedIntegration({ label }) {
  return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <h3 style={{ marginBottom: 8 }}>{label}</h3>
      <p style={{ color: 'var(--text-muted)' }}>This integration is not enabled for your organisation.<br />Please contact us to activate it.</p>
    </div>
  )
}

export function IntegrationSectionHeader({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 4px' }}>
      <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--accent, #2563eb)', flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>{title}</span>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIntegrationHelpers(config, setConfig) {
  function renderConfigField(field, label, placeholder, helpText) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'flex-start', gap: '12px 20px', marginBottom: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{label}</div>
          {helpText && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{helpText}</div>}
        </div>
        <input className="form-input" type="text" placeholder={placeholder} value={config[field] || ''} onChange={e => setConfig({ ...config, [field]: e.target.value })} style={{ maxWidth: 480 }} />
      </div>
    )
  }

  function renderSelect(field, label, options, helpText) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'flex-start', gap: '12px 20px', marginBottom: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{label}</div>
          {helpText && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{helpText}</div>}
        </div>
        <select className="form-input" value={config[field] || ''} onChange={e => setConfig({ ...config, [field]: e.target.value })} style={{ maxWidth: 480 }}>
          <option value="">— Select —</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }

  function renderPassword(field, label, placeholder, helpText) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'flex-start', gap: '12px 20px', marginBottom: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{label}</div>
          {helpText && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{helpText}</div>}
        </div>
        <input className="form-input" type="password" placeholder={placeholder} autoComplete="new-password" value={config[field] || ''} onChange={e => setConfig({ ...config, [field]: e.target.value })} style={{ maxWidth: 480 }} />
      </div>
    )
  }

  function renderToggle(field, label, helpText) {
    const isOn = !!config[field]
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'center', gap: '12px 20px', marginBottom: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{label}</div>
          {helpText && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{helpText}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div onClick={() => setConfig({ ...config, [field]: !isOn })} style={{ width: 44, height: 24, borderRadius: 12, background: isOn ? 'var(--accent, #2563eb)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: isOn ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: 13, color: isOn ? 'var(--accent, #2563eb)' : 'var(--text-muted)' }}>{isOn ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>
    )
  }

  return { renderConfigField, renderSelect, renderPassword, renderToggle }
}
