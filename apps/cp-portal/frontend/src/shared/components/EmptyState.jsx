import Icon from './Icon'

/**
 * EmptyState — consistent "nothing here yet" panel for empty lists (CP-30).
 * Announced to screen readers via role="status".
 */
export default function EmptyState({ icon = 'inbox', title, message, action = null }) {
  return (
    <div className="pp-empty-state" role="status">
      <span className="pp-empty-state-icon"><Icon name={icon} size={26} /></span>
      {title && <div className="pp-empty-state-title">{title}</div>}
      {message && <p className="pp-empty-state-msg">{message}</p>}
      {action && <div className="pp-empty-state-action">{action}</div>}
    </div>
  )
}
