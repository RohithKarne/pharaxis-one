import { useState, useMemo } from 'react'
import { computeWordDiff, summarizeDiff } from '../utils/textDiff.js'

export default function DocumentDiffViewer({
  originalText = '',
  modifiedText = '',
  originalLabel = 'Previous Version / Standard Template',
  modifiedLabel = 'Current Revision Draft',
}) {
  const [viewMode, setViewMode] = useState('inline') // 'inline' | 'split'

  const tokens = useMemo(() => computeWordDiff(originalText, modifiedText), [originalText, modifiedText])
  const stats = useMemo(() => summarizeDiff(tokens), [tokens])

  if (!originalText && !modifiedText) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#64748B', fontStyle: 'italic' }}>
        No content available to compare.
      </div>
    )
  }

  return (
    <div className="diff-viewer-container" style={{ border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <strong style={{ fontSize: 13, color: '#1E293B' }}>Document Revision Diff</strong>
          {stats.hasChanges ? (
            <span style={{ fontSize: 12, display: 'flex', gap: 6 }}>
              <span style={{ color: '#166534', fontWeight: 600 }}>+{stats.additions} added</span>
              <span style={{ color: '#991B1B', fontWeight: 600 }}>-{stats.deletions} removed</span>
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>✓ Identical revisions (no changes)</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setViewMode('inline')}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid',
              borderColor: viewMode === 'inline' ? '#2563EB' : '#CBD5E1',
              background: viewMode === 'inline' ? '#EFF6FF' : '#fff',
              color: viewMode === 'inline' ? '#1D4ED8' : '#475569',
              cursor: 'pointer',
              fontWeight: viewMode === 'inline' ? 600 : 400,
            }}
          >
            Inline
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid',
              borderColor: viewMode === 'split' ? '#2563EB' : '#CBD5E1',
              background: viewMode === 'split' ? '#EFF6FF' : '#fff',
              color: viewMode === 'split' ? '#1D4ED8' : '#475569',
              cursor: 'pointer',
              fontWeight: viewMode === 'split' ? 600 : 400,
            }}
          >
            Side-by-Side
          </button>
        </div>
      </div>

      {viewMode === 'inline' ? (
        <div style={{ padding: 16, lineHeight: 1.8, fontSize: 14, color: '#1E293B', maxHeight: 360, overflowY: 'auto' }}>
          {tokens.map((t, idx) => {
            if (t.type === 'added') {
              return (
                <span
                  key={idx}
                  style={{
                    background: '#DCFCE7',
                    color: '#14532D',
                    textDecoration: 'none',
                    padding: '2px 4px',
                    borderRadius: 3,
                    margin: '0 2px',
                    fontWeight: 600,
                  }}
                >
                  {t.text}{' '}
                </span>
              )
            }
            if (t.type === 'removed') {
              return (
                <span
                  key={idx}
                  style={{
                    background: '#FEE2E2',
                    color: '#991B1B',
                    textDecoration: 'line-through',
                    padding: '2px 4px',
                    borderRadius: 3,
                    margin: '0 2px',
                  }}
                >
                  {t.text}{' '}
                </span>
              )
            }
            return <span key={idx}>{t.text} </span>
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', divideX: '1px solid #E2E8F0', maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ padding: 14, borderRight: '1px solid #E2E8F0', background: '#FAFAFA' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8, textTransform: 'uppercase' }}>
              {originalLabel}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: '#334155' }}>
              {tokens
                .filter(t => t.type !== 'added')
                .map((t, idx) => (
                  <span
                    key={idx}
                    style={t.type === 'removed' ? { background: '#FEE2E2', color: '#991B1B', textDecoration: 'line-through', padding: '1px 3px' } : undefined}
                  >
                    {t.text}{' '}
                  </span>
                ))}
            </div>
          </div>

          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8, textTransform: 'uppercase' }}>
              {modifiedLabel}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: '#0F172A' }}>
              {tokens
                .filter(t => t.type !== 'removed')
                .map((t, idx) => (
                  <span
                    key={idx}
                    style={t.type === 'added' ? { background: '#DCFCE7', color: '#14532D', fontWeight: 600, padding: '1px 3px' } : undefined}
                  >
                    {t.text}{' '}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
