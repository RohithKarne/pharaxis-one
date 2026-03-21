import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'

export default function FAQPortalPage() {
  const { clientCode, language } = usePortal()
  const [faqs, setFaqs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId]   = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const langParam = language && language !== 'en' ? `?lang=${language}` : ''
        const res = await fetch(`/api/portal/faq/${clientCode}${langParam}`)
        const d   = await res.json()
        setFaqs(d.faqs || [])
      } catch { /* ignore */ }
      setLoading(false)
    }
    if (clientCode) load()
  }, [clientCode, language])

  const grouped = faqs.reduce((acc, f) => {
    const cat = f.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(f)
    return acc
  }, {})

  if (loading) return <div className="pp-loading">Loading…</div>

  return (
    <div className="pp-page-container" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>Frequently Asked Questions</h1>
        <p style={{ color: '#6B7280', fontSize: 15 }}>Find answers to common questions below.</p>
      </div>

      {faqs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>❓</div>
          <p>No FAQ items available yet.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 12 }}>
              {cat}
            </div>
            <div style={{ border: '1px solid var(--pp-border, #E5E7EB)', borderRadius: 10, overflow: 'hidden' }}>
              {items.map((f, idx) => {
                const isOpen = openId === f.id
                return (
                  <div key={f.id} style={{ borderTop: idx > 0 ? '1px solid var(--pp-border, #E5E7EB)' : 'none' }}>
                    <button
                      onClick={() => setOpenId(isOpen ? null : f.id)}
                      style={{
                        width: '100%', textAlign: 'left', background: isOpen ? '#F9F5FF' : '#fff',
                        border: 'none', padding: '16px 20px', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                        transition: 'background 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1A2E', flex: 1 }}>{f.question}</span>
                      <span style={{ fontSize: 18, color: '#6B3FA0', flexShrink: 0, transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 20px 18px', color: '#374151', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#F9F5FF' }}>
                        {f.answer}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
