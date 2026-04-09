// AgentWidget — embeddable AI query widget for suite apps
// Sprint 1: CP Portal document search uses this component
// Import into any app that needs AI query capability

import React, { useState } from 'react'
import { query as agentQuery } from '../../api/agentClient'

export default function AgentWidget({ orgId, appSource, queryType, token, onResult, onUnavailable }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!input.trim()) return
    setLoading(true)
    try {
      const result = await agentQuery({ orgId, appSource, queryType, payload: { query: input }, token })
      if (result.status === 'error') {
        onUnavailable?.(result.error)
      } else {
        onResult?.(result)
      }
    } catch {
      onUnavailable?.('AI service is currently unavailable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Search with AI..."
        disabled={loading}
        style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd' }}
      />
      <button type="submit" disabled={loading || !input.trim()}>
        {loading ? 'Searching...' : 'AI Search'}
      </button>
    </form>
  )
}
