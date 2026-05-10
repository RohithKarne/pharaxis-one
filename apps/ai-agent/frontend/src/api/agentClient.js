// Shared API client for suite apps to import and use AI-Agent
// Import this into CP Portal, MIMS, Vault etc. — do not call the AI-Agent API directly

const AI_AGENT_BASE = import.meta.env.VITE_AI_AGENT_URL || ''

function withAuthHeaders(token, extra = {}) {
  const headers = { ...extra }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function query({ orgId, appSource, queryType, payload, token }) {
  const res = await fetch(`${AI_AGENT_BASE}/api/v1/agent/query`, {
    method: 'POST',
    credentials: 'include',
    headers: withAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      org_id: orgId,
      app_source: appSource,
      query_type: queryType,
      payload
    })
  })
  return res.json()
}

async function getKeyConfig(token) {
  const res = await fetch(`${AI_AGENT_BASE}/api/v1/agent/admin/keys`, {
    credentials: 'include',
    headers: withAuthHeaders(token)
  })
  return res.json()
}

async function saveKey({ provider, apiKey, token }) {
  const res = await fetch(`${AI_AGENT_BASE}/api/v1/agent/admin/keys`, {
    method: 'POST',
    credentials: 'include',
    headers: withAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ provider, api_key: apiKey })
  })
  return res.json()
}

async function toggleActive({ isActive, token }) {
  const res = await fetch(`${AI_AGENT_BASE}/api/v1/agent/admin/provider/toggle`, {
    method: 'PATCH',
    credentials: 'include',
    headers: withAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ is_active: isActive })
  })
  return res.json()
}

export { query, getKeyConfig, saveKey, toggleActive }
