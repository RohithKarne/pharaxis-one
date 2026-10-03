import { lazy, Suspense } from 'react'
import { CONFIG_NAV, findConfigLabel } from '../configItems'

const EmailCaseImportConfig = lazy(() => import('../EmailCaseImportConfig'))

// Topics with a real configuration surface. Case Form Fields moved to System ›
// Setup › Forms & Fields, where its menu item is (T10 / M-35).
const TOPIC_COMPONENTS = {
  'imp-email-case': EmailCaseImportConfig,
}

function flattenNav(items, parent = []) {
  return items.flatMap((item) => {
    const lineage = [...parent, item.label]
    if (item.children) return flattenNav(item.children, lineage)
    return [{ label: item.label, value: item.value, lineage }]
  })
}

export default function Configuration({ selectedItem, onSelect }) {
  const items = flattenNav(CONFIG_NAV)
  const selectedLabel = selectedItem ? findConfigLabel(selectedItem) : null
  const TopicComponent = selectedItem ? TOPIC_COMPONENTS[selectedItem] : null

  return (
    <div className="ma-page" style={{ flex: 1, overflow: 'auto' }}>
      <div className="ma-page-header" style={{ marginBottom: 12 }}>
        <h1>Configuration</h1>
        <p>Configuration settings for this organisation.</p>
      </div>
      {selectedLabel && (
        <p style={{ margin: '0 0 12px', fontSize: 12 }}>
          Selected: <b>{selectedLabel}</b>
        </p>
      )}

      {TopicComponent && (
        <div style={{ marginBottom: 12 }}>
          <Suspense fallback={<div style={{ padding: 12, color: 'var(--text-muted)' }}>Loading…</div>}>
            <TopicComponent />
          </Suspense>
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr><th>Topic</th><th>Group</th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.value} style={selectedItem === item.value ? { background: '#fff8e6' } : undefined}>
              <td>
                <button type="button" className="btn btn-link" onClick={() => onSelect?.(item.value)}>
                  {item.label}
                </button>
              </td>
              <td>{item.lineage.slice(0, -1).join(' / ') || 'Configuration'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
