/**
 * UrgencyBanner — Theme 4 Wave 1.
 *
 * Surfaces case-level urgency at the top of the form. Shows SLA countdown,
 * mandatory-by-phase escalation, and serious-AE / regulatory-reporting flags.
 *
 * Inputs:
 *   {
 *     dueAt:        '2026-05-18T12:00:00Z' (or null),
 *     dueLabel:     'Submit to FDA',
 *     severity:     'critical' | 'warning' | 'info',
 *     message:      'Serious unexpected ADR — 15-day timeline',
 *     onSnooze?:    () => void,
 *     onAcknowledge?: () => void,
 *   }
 *
 * Auto-recolors as the due date approaches: >24h info, <24h warning, <2h critical.
 */

import { useEffect, useState } from 'react'

const COLORS = {
  critical: { bg: '#fdecea', border: '#f5c6c6', icon: '#b91c1c', text: '#7a1313' },
  warning:  { bg: '#fff4d6', border: '#ffe082', icon: '#8a6a00', text: '#6a4c00' },
  info:     { bg: '#eaf2ff', border: '#c4d6ee', icon: '#1a4f9c', text: '#143a73' },
}

export default function UrgencyBanner({
  dueAt, dueLabel = 'Action required',
  severity, message,
  onSnooze, onAcknowledge,
  dismissible = false,
}) {
  const [now, setNow] = useState(() => Date.now())
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!dueAt) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [dueAt])

  if (hidden) return null

  // Derive severity from time-to-due if not explicitly set
  let resolvedSeverity = severity
  let countdown = null
  if (dueAt) {
    const ms = new Date(dueAt).getTime() - now
    const hrs = ms / 3_600_000
    if (!resolvedSeverity) {
      if (hrs < 0)      resolvedSeverity = 'critical'
      else if (hrs < 2) resolvedSeverity = 'critical'
      else if (hrs < 24)resolvedSeverity = 'warning'
      else              resolvedSeverity = 'info'
    }
    countdown = formatCountdown(ms)
  }
  resolvedSeverity = resolvedSeverity || 'info'
  const c = COLORS[resolvedSeverity] || COLORS.info

  return (
    <div style={{
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14,
      background: c.bg, border: `1px solid ${c.border}`,
      borderLeft: `4px solid ${c.icon}`, borderRadius: 6,
      color: c.text, fontSize: 13,
    }}>
      <span style={{ fontSize: 18 }}>
        {resolvedSeverity === 'critical' ? '⚠' : resolvedSeverity === 'warning' ? '⏱' : 'ⓘ'}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{dueLabel}</div>
        {message && <div style={{ marginTop: 2, fontSize: 12 }}>{message}</div>}
      </div>
      {countdown && (
        <span style={{
          fontWeight: 700, fontSize: 14, fontFamily: 'monospace',
          padding: '4px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.55)',
        }}>{countdown}</span>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {onAcknowledge && (
          <button onClick={onAcknowledge} style={btn(c.icon)}>Acknowledge</button>
        )}
        {onSnooze && (
          <button onClick={onSnooze} style={btn(c.icon, true)}>Snooze 1h</button>
        )}
        {dismissible && (
          <button onClick={() => setHidden(true)} style={btn(c.icon, true)} aria-label="Dismiss">×</button>
        )}
      </div>
    </div>
  )
}

function btn(color, ghost = false) {
  return {
    padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    borderRadius: 4,
    border: `1px solid ${color}`,
    background: ghost ? 'transparent' : color,
    color: ghost ? color : '#fff',
  }
}

function formatCountdown(ms) {
  const abs = Math.abs(ms); const sign = ms < 0 ? '-' : ''
  const h  = Math.floor(abs / 3_600_000)
  const m  = Math.floor((abs % 3_600_000) / 60_000)
  if (h >= 24) return `${sign}${Math.floor(h / 24)}d ${h % 24}h`
  return `${sign}${h}h ${m}m`
}
