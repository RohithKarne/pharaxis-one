import { useState } from 'react'
import { usePortal } from '../context/PortalContext'

export default function FeedbackWidget() {
  const { clientCode } = usePortal()
  const [open, setOpen]       = useState(false)
  const [rating, setRating]   = useState(0)
  const [hovered, setHovered] = useState(0)
  const [message, setMessage] = useState('')
  const [status, setStatus]   = useState(null) // null | 'sending' | 'done' | 'error'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!rating) return
    setStatus('sending')
    try {
      const res = await fetch(`/api/portal/feedback/${clientCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, message, page_url: window.location.pathname }),
      })
      setStatus(res.ok ? 'done' : 'error')
    } catch {
      setStatus('error')
    }
  }

  function reset() {
    setOpen(false); setRating(0); setHovered(0); setMessage(''); setStatus(null)
  }

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999 }}>
      {open && (
        <div style={{
          background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          width: 300, marginBottom: 12, overflow: 'hidden',
        }}>
          <div style={{ background: 'var(--pp-primary, #6B3FA0)', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Share Feedback</span>
            <button onClick={reset} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>

          {status === 'done' ? (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🙏</div>
              <p style={{ margin: 0, fontSize: 14, color: '#374151', fontWeight: 500 }}>Thank you for your feedback!</p>
              <button className="pp-btn pp-btn-primary" style={{ marginTop: 16, fontSize: 13 }} onClick={reset}>Close</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ padding: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280' }}>How would you rate your experience?</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n} type="button"
                    onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)}
                    onClick={() => setRating(n)}
                    style={{
                      fontSize: 28, background: 'none', border: 'none', cursor: 'pointer',
                      transform: (hovered || rating) >= n ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.1s',
                      filter: (hovered || rating) >= n ? 'none' : 'grayscale(1) opacity(0.4)',
                    }}
                    aria-label={`${n} star`}
                  >⭐</button>
                ))}
              </div>
              <textarea
                rows={3}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Tell us more (optional)…"
                maxLength={1000}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
              />
              {status === 'error' && <p style={{ color: '#DC2626', fontSize: 12, margin: '6px 0 0' }}>Something went wrong. Please try again.</p>}
              <button
                type="submit"
                className="pp-btn pp-btn-primary"
                style={{ width: '100%', marginTop: 10, fontSize: 13 }}
                disabled={!rating || status === 'sending'}
              >
                {status === 'sending' ? 'Sending…' : 'Submit Feedback'}
              </button>
            </form>
          )}
        </div>
      )}

      <button
        onClick={() => { if (open) reset(); else setOpen(true) }}
        style={{
          background: 'var(--pp-primary, #6B3FA0)', color: '#fff',
          border: 'none', borderRadius: 50, width: 52, height: 52,
          fontSize: 22, cursor: 'pointer', boxShadow: '0 4px 16px rgba(107,63,160,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s',
        }}
        aria-label="Give feedback"
        title="Share feedback"
      >
        💬
      </button>
    </div>
  )
}
