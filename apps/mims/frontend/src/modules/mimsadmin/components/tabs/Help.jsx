import { HELP_NAV, findHelpLabel } from '../configItems'
import HelpGuide from './HelpGuide'

export default function Help({ selectedItem, onSelect }) {
  if (selectedItem === 'help-guide') return <HelpGuide />

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
      <div style={{ maxWidth: 960, display: 'grid', gap: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Help & Adoption</h2>
          <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>
            Start from the embedded guide or review the support overview below. This tab no longer falls back to a placeholder.
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
            {findHelpLabel(selectedItem || 'help-about')}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            Use the guide for administrator instructions, policy-aware help content, and search-driven adoption support.
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {HELP_NAV.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onSelect?.(item.value)}
                style={{
                  border: selectedItem === item.value ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: selectedItem === item.value ? 'rgba(var(--primary-rgb, 79,70,229),0.08)' : '#fff',
                  color: selectedItem === item.value ? 'var(--primary)' : 'var(--text-primary)',
                  borderRadius: 999,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
