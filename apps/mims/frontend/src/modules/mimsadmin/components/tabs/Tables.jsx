import { TABLES_NAV, findTableLabel } from '../configItems'
import PicklistsTable from './PicklistsTable'

function flattenNav(items, parent = []) {
  return items.flatMap((item) => {
    const lineage = [...parent, item.label]
    if (item.children) return flattenNav(item.children, lineage)
    return [{ label: item.label, value: item.value, lineage }]
  })
}

export default function Tables({ selectedItem, onSelect }) {
  if (selectedItem === 'tbl-general') return <PicklistsTable />
  const items = flattenNav(TABLES_NAV)

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
      <div style={{ maxWidth: 1080, display: 'grid', gap: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Tables Workspace</h2>
          <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>
            General table maintenance is available directly below. Other table topics stay reachable from this catalog instead of dropping into a dead-end stub.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onSelect?.('tbl-general')}
            style={{
              border: '1px solid var(--primary)',
              background: 'rgba(var(--primary-rgb, 79,70,229),0.08)',
              color: 'var(--primary)',
              borderRadius: 999,
              padding: '10px 16px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Open General Table Manager
          </button>
          {selectedItem && (
            <div style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              Selected topic: <strong>{findTableLabel(selectedItem)}</strong>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {items.map((item) => (
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
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{item.lineage.slice(0, -1).join(' / ') || 'Tables'}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
