/**
 * HelpHint.jsx — context-aware (?) help icon.
 *
 * Click → opens a side drawer with help articles for the given featureKey,
 * fetched from the existing /api/admin/help?feature_key=... endpoint
 * (the same data shown in MIMS Admin > Help > Guide).
 *
 * Drop this component anywhere a feature-specific help is useful, passing
 * the right featureKey from the catalog. If no article exists, the drawer
 * gracefully shows a "No help yet — contact your admin" message.
 *
 * CSS namespace: ma-help-hint-
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

export default function HelpHint({ featureKey, label = 'Help for this screen', placement = 'inline' }) {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [articles, setArticles] = useState([])
  const [err, setErr] = useState('')

  async function loadArticles() {
    if (!featureKey) return
    setLoading(true); setErr(''); setArticles([])
    try {
      const H = { Authorization: `Bearer ${token}` }
      const r = await httpFetch(`/api/admin/help?feature_key=${encodeURIComponent(featureKey)}&is_active=1`, { headers: H })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Could not load help.'); return }
      setArticles(d.articles || d.items || [])
    } catch { setErr('Network error — could not load help.') }
    finally { setLoading(false) }
  }

  function onOpen() { setOpen(true); loadArticles() }

  const iconStyle = placement === 'topbar'
    ? { width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 14 }
    : { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 12, lineHeight: 1, background: 'transparent' }

  return (
    <>
      <span
        title={label}
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen()}
        style={iconStyle}
      >
        ?
      </span>

      {open && (
        <div
          onClick={e => e.target === e.currentTarget && setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 1300,
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          <aside
            style={{
              width: 'min(520px, 96vw)', height: '100%', background: 'var(--surface)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Help
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                  {label}
                </div>
                {featureKey && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
                    feature_key: {featureKey}
                  </div>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              {loading && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading help…</div>
              )}
              {!loading && err && (
                <div style={{ color: 'var(--error, #c00)', fontSize: 13 }}>{err}</div>
              )}
              {!loading && !err && articles.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
                  <p style={{ marginTop: 0 }}>
                    No help article is published for this screen yet.
                  </p>
                  <p>
                    You can browse the full Help Guide for related topics at <strong>MIMS Admin → Help → Guide</strong>.
                  </p>
                </div>
              )}
              {!loading && !err && articles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {articles.map(a => (
                    <article key={a.id} style={{ paddingBottom: 18, borderBottom: '1px solid var(--border)' }}>
                      <h2 style={{ margin: 0, fontSize: 17, color: 'var(--text-primary)' }}>{a.title}</h2>
                      {a.summary && (
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {a.summary}
                        </div>
                      )}
                      <div
                        style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 10, lineHeight: 1.7 }}
                        dangerouslySetInnerHTML={{ __html: a.content_html || '' }}
                      />
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px', borderTop: '1px solid var(--border)',
              fontSize: 12, color: 'var(--text-muted)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>Need to add or edit help? Go to <strong>Help → Guide</strong>.</span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)',
                }}
              >Close</button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
