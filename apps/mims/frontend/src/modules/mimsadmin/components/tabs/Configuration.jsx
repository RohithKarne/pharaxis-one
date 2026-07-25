import { lazy, Suspense } from 'react'
import { CONFIG_NAV, findConfigLabel } from '../configItems'

const EmailCaseImportConfig = lazy(() => import('../EmailCaseImportConfig'))

// Topics with a real configuration surface (no longer placeholder tiles).
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
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
      <div style={{ maxWidth: 1080, display: 'grid', gap: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Configuration Workspace</h2>
          <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>
            Use this surface to move between legacy configuration topics without landing on a dead-end placeholder.
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Current Focus</div>
          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
            {selectedLabel || 'Select a configuration topic'}
          </div>
          {!TopicComponent && (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              The embedded admin now keeps this tab usable by exposing direct topic navigation instead of an empty stub screen.
            </div>
          )}
        </div>

        {TopicComponent && (
          <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>}>
            <TopicComponent />
          </Suspense>
        )}

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
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{item.lineage.slice(0, -1).join(' / ') || 'Configuration'}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
