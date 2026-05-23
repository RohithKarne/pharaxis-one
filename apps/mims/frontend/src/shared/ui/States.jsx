/**
 * States — shared empty / loading / error scaffolding so every page handles the
 * three non-happy states consistently instead of bespoke per-page markup.
 */

import Button from './Button.jsx'

export function Spinner({ size = 20, label = 'Loading…', inline = false }) {
  const ring = (
    <span
      role="status"
      aria-label={label}
      style={{
        width: size,
        height: size,
        border: `${Math.max(2, Math.round(size / 10))}px solid var(--border)`,
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'mims-spin 0.7s linear infinite',
      }}
    />
  )
  if (inline) return ring
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 16px', color: 'var(--text-muted)' }}>
      {ring}
      {label && <div style={{ fontSize: 13 }}>{label}</div>}
    </div>
  )
}

export function EmptyState({ title = 'Nothing here yet', message, icon, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
      {icon && <div style={{ marginBottom: 12, opacity: 0.7 }}>{icon}</div>}
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
      {message && <div style={{ marginTop: 6, fontSize: 13, maxWidth: 420, marginInline: 'auto' }}>{message}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div role="alert" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)' }}>{title}</div>
      {message && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', maxWidth: 420, marginInline: 'auto' }}>{message}</div>}
      {onRetry && <div style={{ marginTop: 16 }}><Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button></div>}
    </div>
  )
}
