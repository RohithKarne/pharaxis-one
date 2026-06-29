/**
 * useCasePresence — Theme 5 / Wave 0 #3 bridge (Wave 4).
 *
 * Subscribes to /api/cases/ws and exposes:
 *   users:    [{userId, name, email, initials}]
 *   focus:    Map<fieldName, userId>      — who currently has each field focused
 *   typing:   Map<fieldName, {userId, until}>
 *   actions:  { focus(field), blur(field), typing(field) }
 *
 * Auto-joins / leaves when caseId changes. Reconnects with exponential backoff.
 *
 * Gated by cf.theme5_realtime_collab — when off, returns inert stubs.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../context/FeatureFlagsContext'

const EMPTY = { users: [], focus: new Map(), typing: new Map() }

export function useCasePresence(caseId) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme5_realtime_collab')

  const wsRef = useRef(null)
  const backoffRef = useRef(500)
  const reconnectRef = useRef(null)  // WP6: track the pending reconnect timer so cleanup can cancel it
  const [state, setState] = useState(EMPTY)
  const [ready, setReady] = useState(false)

  // ── connect / disconnect ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !caseId || !token) return
    let cancelled = false

    function connect() {
      if (cancelled) return  // WP6: a queued reconnect must not open a socket after unmount
      try {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const ws = new WebSocket(`${proto}://${window.location.host}/api/cases/ws`)
        wsRef.current = ws

        ws.onopen = () => {
          backoffRef.current = 500
          setReady(true)
          ws.send(JSON.stringify({ type: 'join', caseId }))
        }
        ws.onmessage = (e) => {
          let msg; try { msg = JSON.parse(e.data) } catch { return }
          setState(prev => apply(prev, msg))
        }
        ws.onclose = () => {
          setReady(false)
          if (cancelled) return
          backoffRef.current = Math.min(backoffRef.current * 2, 30_000)
          reconnectRef.current = setTimeout(connect, backoffRef.current)
        }
        ws.onerror = () => ws.close()
      } catch { /* will retry on close */ }
    }
    connect()
    return () => {
      cancelled = true
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }  // WP6
      try {
        wsRef.current?.send(JSON.stringify({ type: 'leave', caseId }))
        wsRef.current?.close()
      } catch { /* ignore close errors */ }
      setState(EMPTY); setReady(false)
    }
  }, [enabled, caseId, token])

  // WP6: prune expired "typing" entries. They carry an `until` timestamp but nothing
  // ever removed them, so a field showed a perpetual "typing…" long after the user stopped.
  useEffect(() => {
    if (!enabled) return
    const iv = setInterval(() => {
      setState(prev => {
        if (!prev.typing.size) return prev
        const now = Date.now()
        let changed = false
        const t = new Map()
        for (const [field, info] of prev.typing) {
          if (info?.until && new Date(info.until).getTime() < now) { changed = true; continue }
          t.set(field, info)
        }
        return changed ? { ...prev, typing: t } : prev
      })
    }, 3000)
    return () => clearInterval(iv)
  }, [enabled])

  function send(payload) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }
  const focus  = useCallback((field) => send({ type: 'focus',  caseId, field }), [caseId])
  const blur   = useCallback((field) => send({ type: 'blur',   caseId, field }), [caseId])
  const typing = useCallback((field) => send({ type: 'typing', caseId, field }), [caseId])

  // expose stable references
  return useMemo(() => ({
    enabled,
    ready,
    users:  state.users,
    focus:  state.focus,
    typing: state.typing,
    actions: { focus, blur, typing },
  }), [enabled, ready, state, focus, blur, typing])
}

// Reducer for inbound WS messages
function apply(prev, msg) {
  switch (msg.type) {
    case 'presence.snapshot': return { ...prev, users: msg.users || [] }
    case 'presence.joined':   return { ...prev, users: upsert(prev.users, msg.user) }
    case 'presence.left':     return { ...prev, users: prev.users.filter(u => u.userId !== msg.userId),
                                       focus: dropByUser(prev.focus, msg.userId) }
    case 'presence.focus': {
      const f = new Map(prev.focus); f.set(msg.field, msg.userId); return { ...prev, focus: f }
    }
    case 'presence.blur': {
      const f = new Map(prev.focus); if (f.get(msg.field) === msg.userId) f.delete(msg.field); return { ...prev, focus: f }
    }
    case 'presence.typing': {
      const t = new Map(prev.typing); t.set(msg.field, { userId: msg.userId, until: msg.expiresAt }); return { ...prev, typing: t }
    }
    default: return prev
  }
}
function upsert(arr, user) {
  if (!user) return arr
  const filtered = arr.filter(u => u.userId !== user.userId)
  return [...filtered, user]
}
function dropByUser(map, userId) {
  const out = new Map()
  for (const [k, v] of map.entries()) if (v !== userId) out.set(k, v)
  return out
}

export default useCasePresence
