// Shared API client for suite apps to import and use AI-Agent
// Import this into CP Portal, MIMS, Vault etc. — do not call the AI-Agent API directly

const AI_AGENT_BASE = import.meta.env.VITE_AI_AGENT_URL || 'http://localhost:6000'

async function query({ orgId, appSource, queryType, payload, token }) {
  const res = await fetch(`${AI_AGENT_BASE}/api/v1/agent/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
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
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return res.json()
}

async function saveKey({ provider, apiKey, token }) {
  const res = await fetch(`${AI_AGENT_BASE}/api/v1/agent/admin/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ provider, api_key: apiKey })
  })
  return res.json()
}

async function toggleActive({ isActive, token }) {
  const res = await fetch(`${AI_AGENT_BASE}/api/v1/agent/admin/provider/toggle`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ is_active: isActive })
  })
  return res.json()
}

export { query, getKeyConfig, saveKey, toggleActive }
