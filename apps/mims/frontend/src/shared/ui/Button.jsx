/**
 * Button — token-wired button primitive.
 *
 * Replaces ad-hoc inline-styled buttons (e.g. ReportsPage pillButtonStyle) so
 * every button shares the same height, radius, focus ring, and brand colors.
 * Variants: primary (orange CTA), secondary (outline), ghost, danger.
 */

const SIZES = {
  sm: { padding: '5px 10px', fontSize: 12 },
  md: { padding: '8px 14px', fontSize: 13 },
  lg: { padding: '10px 18px', fontSize: 14 },
}

function variantStyle(variant, disabled) {
  const base = {
    border: '1px solid transparent',
    borderRadius: 999,
    fontWeight: 700,
    fontFamily: 'var(--font)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    lineHeight: 1.2,
    transition: 'background 120ms ease, border-color 120ms ease',
  }
  switch (variant) {
    case 'secondary':
      return { ...base, background: 'var(--surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }
    case 'ghost':
      return { ...base, background: 'transparent', color: 'var(--text-secondary)' }
    case 'danger':
      return { ...base, background: 'var(--danger)', color: '#fff' }
    case 'primary':
    default:
      return { ...base, background: 'var(--accent)', color: '#fff' }
  }
}

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  startIcon,
  style,
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={{ ...variantStyle(variant, disabled), ...SIZES[size], ...style }}
      {...rest}
    >
      {startIcon}
      {children}
    </button>
  )
}
