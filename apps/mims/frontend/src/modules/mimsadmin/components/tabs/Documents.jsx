import { DOCUMENTS_NAV, findDocumentLabel } from '../configItems'

export default function Documents({ selectedItem, onSelect }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
      <div style={{ maxWidth: 980, display: 'grid', gap: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Documents Workspace</h2>
          <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>
            Document administration topics stay discoverable here so the tab no longer opens into an unusable placeholder.
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Current Focus</div>
          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
            {selectedItem ? findDocumentLabel(selectedItem) : 'Choose a document governance topic'}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            These quick links keep template-control topics accessible while the document admin consolidation continues inside the unified MIMS shell.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {DOCUMENTS_NAV.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onSelect?.(item.value)}
              style={{
                textAlign: 'left',
                border: selectedItem === item.value ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: selectedItem === item.value ? 'rgba(var(--primary-rgb, 79,70,229),0.08)' : '#fff',
                borderRadius: 12,
                padding: 16,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{item.label}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Documents</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
