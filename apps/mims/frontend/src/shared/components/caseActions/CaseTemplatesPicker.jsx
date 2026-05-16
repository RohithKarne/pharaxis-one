/**
 * CaseTemplatesPicker — Theme 8 (Wave 4) modal for picking a starter template
 * when creating a new case.
 *
 * Props:
 *   caseType — 'ae' | 'pc' | 'mi'
 *   open, onClose
 *   onPick   — (template) => void   (caller seeds the new-case form with template.payload_json)
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function CaseTemplatesPicker({ caseType, open, onClose, onPick }) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme8_smart_actions')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !enabled) return
    setLoading(true)
    httpFetch(`/api/case-templates?case_type=${encodeURIComponent(caseType || '')}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json())
      .then(d => setItems(d.templates || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [open, caseType, token, enabled])

  async function pick(tpl) {
    try {
      const r = await httpFetch(`/api/case-templates/${tpl.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      onPick?.(d.template)
      onClose?.()
    } catch {}
  }

  if (!open || !enabled) return null
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, maxWidth: '92vw', background: 'var(--surface,#fff)',
        borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between' }}>
          <strong>Start from template{caseType ? ` (${caseType.toUpperCase()})` : ''}</strong>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loading && <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && items.length === 0 && (
            <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>
              No templates configured for this case type.
            </div>
          )}
          {items.map(t => (
            <div key={t.id} onClick={() => pick(t)} style={{
              padding: '10px 16px', cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
              {t.description && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {t.description}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t.case_type} {t.org_id == null && '· global'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
