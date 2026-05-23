/**
 * Card — token-wired surface container. Replaces repeated inline
 * { background, border, borderRadius, boxShadow, padding } blocks.
 */

export default function Card({ padding = 16, interactive = false, style, children, ...rest }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding,
        cursor: interactive ? 'pointer' : 'default',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
