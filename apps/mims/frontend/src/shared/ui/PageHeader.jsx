/**
 * PageHeader — one consistent page title/subtitle/action row so every page
 * shares the same heading hierarchy and primary-action placement (action
 * top-right). Replaces bespoke per-page header markup.
 */

export default function PageHeader({ title, subtitle, actions, style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 18,
        ...style,
      }}
    >
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{title}</h1>
        {subtitle && (
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}
