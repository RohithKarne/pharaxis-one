/**
 * LoadingButton — action button with inline spinner.
 * Shows spinner for the duration of the async action (min ~1.5s so it's visible).
 * Disables during load to prevent double-clicks.
 */
import { useState } from 'react'
import { showPageLoader } from './PageLoader'

export default function LoadingButton({
  onClick,
  children,
  className = 'cp-btn cp-btn-primary',
  style,
  disabled,
  minDuration = 1500,
  type = 'button',
  ...rest
}) {
  const [loading, setLoading] = useState(false)

  async function handle(e) {
    if (loading || disabled) return
    setLoading(true)
    showPageLoader(minDuration)
    const start = Date.now()
    try {
      await onClick?.(e)
    } finally {
      const elapsed = Date.now() - start
      const remaining = minDuration - elapsed
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining))
      setLoading(false)
    }
  }

  return (
    <button
      type={type}
      className={className}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}
      onClick={handle}
      disabled={loading || disabled}
      {...rest}
    >
      {loading && (
        <span style={{
          width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)',
          borderTopColor: '#fff', borderRadius: '50%',
          display: 'inline-block', flexShrink: 0,
          animation: 'lb-spin 0.7s linear infinite',
        }} />
      )}
      <span style={{ opacity: loading ? 0.8 : 1 }}>{children}</span>
      <style>{`@keyframes lb-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  )
}
