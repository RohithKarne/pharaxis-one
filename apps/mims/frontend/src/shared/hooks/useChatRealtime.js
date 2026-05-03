import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function buildSocketUrl(token) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(`${protocol}//${window.location.host}/api/chat/ws`)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

export default function useChatRealtime({ token, subscription, onEvent }) {
  const [connectionState, setConnectionState] = useState('connecting')
  const socketRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const closedByClientRef = useRef(false)
  const onEventRef = useRef(onEvent)
  const previousSubscriptionRef = useRef(null)
  const socketUrl = useMemo(() => buildSocketUrl(token), [token])

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const sendJson = useCallback((payload) => {
    const ws = socketRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(payload))
    return true
  }, [])

  useEffect(() => {
    closedByClientRef.current = false

    function connect() {
      setConnectionState((prev) => (prev === 'open' ? 'open' : 'connecting'))
      const ws = new WebSocket(socketUrl)
      socketRef.current = ws

      ws.onopen = () => {
        setConnectionState('open')
      }

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'))
          onEventRef.current?.(payload)
        } catch {
          // ignore malformed payloads
        }
      }

      ws.onclose = () => {
        socketRef.current = null
        if (closedByClientRef.current) {
          setConnectionState('closed')
          return
        }
        setConnectionState('reconnecting')
        reconnectTimerRef.current = setTimeout(connect, 1500)
      }

      ws.onerror = () => {
        setConnectionState('reconnecting')
      }
    }

    connect()
    return () => {
      closedByClientRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      const ws = socketRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        const previous = previousSubscriptionRef.current
        if (previous?.conversationId) {
          ws.send(JSON.stringify({ type: 'unsubscribe', conversationId: previous.conversationId }))
        }
      }
      if (ws && ws.readyState !== WebSocket.CLOSED) ws.close()
    }
  }, [socketUrl])

  useEffect(() => {
    if (connectionState !== 'open') return
    const previous = previousSubscriptionRef.current
    if (previous?.conversationId && previous.conversationId !== subscription?.conversationId) {
      sendJson({ type: 'unsubscribe', conversationId: previous.conversationId })
    }
    if (subscription?.conversationId) {
      sendJson({
        type: 'subscribe',
        conversationId: subscription.conversationId,
        participantUserIds: subscription.participantUserIds || [],
      })
    }
    previousSubscriptionRef.current = subscription || null
  }, [connectionState, sendJson, subscription])

  return { connectionState, sendJson }
}
