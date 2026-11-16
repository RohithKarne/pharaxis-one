import React from 'react'

/**
 * CaseDrillDrawer.jsx — REP-4: In-Context Case Drill-Through Drawer
 *
 * Allows compliance officers and case handlers to inspect full case details
 * directly from report rows without losing filter states or navigating away.
 */

const BADGE_COLORS = {
  AE: { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
  PC: { bg: '#fffbeb', fg: '#92400e', border: '#fde68a' },
  MI: { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' },
  DEFAULT: { bg: '#f1f5f9', fg: '#334155', border: '#cbd5e1' },
}

export default function CaseDrillDrawer({ row, labels = {}, onClose, onOpenCase }) {
  if (!row) return null

  const caseType = String(row.case_type || row.type || 'CASE').toUpperCase()
  const badge = BADGE_COLORS[caseType] || BADGE_COLORS.DEFAULT
  const caseNumber = row.case_number || row.case_no || (row.__drill_route ? row.__drill_route.replace('/cases/', 'Case #') : 'Case Details')
  const drillRoute = row.__drill_route || `/cases/${row.case_id || ''}`

  // Extract non-system row attributes
  const displayEntries = Object.entries(row).filter(([k]) => !k.startsWith('__'))

  return (
    <div
      onClick={onClose}
      data-testid="case-drill-drawer-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="case-drill-drawer"
        style={{
          width: '540px',
          maxWidth: '100vw',
          height: '100%',
          backgroundColor: '#ffffff',
          boxShadow: '-6px 0 24px rgba(15, 23, 42, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border, #e2e8f0)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#f8fafc',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{caseNumber}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  backgroundColor: badge.bg,
                  color: badge.fg,
                  border: `1px solid ${badge.border}`,
                }}
              >
                {caseType}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              In-Context Drill-Through Inspection
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
          {/* Quick Info Box */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                Inspection Mode
              </div>
              <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>
                Report context and filters are preserved in background.
              </div>
            </div>
            <span style={{ fontSize: 20 }}>📋</span>
          </div>

          {/* Key Case Attributes */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
              Case Attributes
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                backgroundColor: '#ffffff',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              {displayEntries.slice(0, 8).map(([key, value]) => (
                <div key={key} style={{ display: 'grid', gap: 2 }}>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                    {labels[key] || key.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500, wordBreak: 'break-word' }}>
                    {value == null || value === '' ? '—' : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Row Details */}
          {displayEntries.length > 8 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                Report Row Data
              </div>
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 8,
                  padding: 14,
                  display: 'grid',
                  gap: 10,
                }}
              >
                {displayEntries.slice(8).map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid #e2e8f0',
                      paddingBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      {labels[key] || key.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>
                      {value == null || value === '' ? '—' : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border, #e2e8f0)',
            backgroundColor: '#f8fafc',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => onOpenCase?.(drillRoute, true)}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Open in New Tab ↗
          </button>
          <button
            type="button"
            onClick={() => onOpenCase?.(drillRoute, false)}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'var(--primary, #0284c7)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Open Full Case
          </button>
        </div>
      </div>
    </div>
  )
}
