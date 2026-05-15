import { findHelpLabel } from '../configItems'
import HelpGuide from './HelpGuide'

export default function Help({ selectedItem }) {
  if (selectedItem === 'help-guide') return <HelpGuide />

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
      {!selectedItem ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--text-muted)', gap: 12 }}>
          <div style={{ fontSize: 36 }}>❓</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Hover over <strong>Help</strong> in the top nav and select an item.
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 20 }}>❓</span>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {findHelpLabel(selectedItem)}
            </h2>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '32px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Under Development</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <strong>{findHelpLabel(selectedItem)}</strong> is coming soon.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
