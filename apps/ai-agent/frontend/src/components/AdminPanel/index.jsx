import React, { useEffect, useState } from 'react'

const AI_AGENT_BASE = import.meta.env.VITE_AI_AGENT_URL || 'http://localhost:6000'
const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' }
]

function normalizeProvider(provider) {
  if (!provider || typeof provider !== 'string') return 'openai'
  const normalized = provider.toLowerCase()
  if (normalized === 'openai' || normalized === 'claude' || normalized === 'gemini') {
    return normalized
  }
  return 'openai'
}

function providerLabel(provider) {
  const normalized = normalizeProvider(provider)
  return PROVIDERS.find(item => item.value === normalized)?.label || 'OpenAI'
}

async function authorizedRequest(path, options = {}) {
  const response = await fetch(`${AI_AGENT_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })

  let data = {}
  try {
    data = await response.json()
  } catch {
    data = {}
  }

  if (!response.ok) {
    const err = new Error(data.error || 'Request failed')
    err.status = response.status
    err.data = data
    throw err
  }

  return data
}

export default function AdminPanel() {
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [configured, setConfigured] = useState(false)
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [maskedKey, setMaskedKey] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function loadConfig() {
    setLoadingConfig(true)
    setErrorMessage('')
    try {
      const data = await authorizedRequest('/api/v1/agent/admin/keys', { method: 'GET' })
      setConfigured(Boolean(data.configured))
      setProvider(normalizeProvider(data.provider))
      setIsActive(Boolean(data.is_active))
      setMaskedKey(data.api_key_masked || null)
      setUpdatedAt(data.updated_at || null)
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load AI configuration')
      setConfigured(false)
      setIsActive(false)
      setMaskedKey(null)
      setUpdatedAt(null)
    } finally {
      setLoadingConfig(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    if (!apiKey.trim()) {
      setErrorMessage('API key is required')
      return
    }

    setSaving(true)
    try {
      await authorizedRequest('/api/v1/agent/admin/keys', {
        method: 'POST',
        body: JSON.stringify({ provider, api_key: apiKey.trim() })
      })
      setSuccessMessage('API key saved successfully')
      setApiKey('')
      await loadConfig()
    } catch (err) {
      if (err.status === 422) {
        setErrorMessage('Invalid API key — validation failed')
      } else if (err.status === 503) {
        setErrorMessage('Provider unreachable — please retry')
      } else {
        setErrorMessage(err.message || 'Failed to save API key')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle() {
    if (!configured) return
    setErrorMessage('')
    setSuccessMessage('')
    setToggling(true)

    try {
      const data = await authorizedRequest('/api/v1/agent/admin/provider/toggle', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !isActive })
      })
      setIsActive(Boolean(data.is_active))
      setSuccessMessage(data.is_active ? 'AI provider enabled' : 'AI provider disabled')
    } catch (err) {
      setErrorMessage(err.message || 'Failed to update AI provider status')
    } finally {
      setToggling(false)
    }
  }

  async function handleDelete() {
    const shouldDelete = window.confirm('Delete AI API key configuration for this organisation?')
    if (!shouldDelete) return

    setErrorMessage('')
    setSuccessMessage('')
    setDeleting(true)

    try {
      await authorizedRequest('/api/v1/agent/admin/keys', { method: 'DELETE' })
      setConfigured(false)
      setIsActive(false)
      setMaskedKey(null)
      setUpdatedAt(null)
      setApiKey('')
      setProvider('openai')
      setSuccessMessage('API key configuration removed')
    } catch (err) {
      setErrorMessage(err.message || 'Failed to delete API key configuration')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ marginBottom: '16px' }}>AI Configuration</h2>

      {loadingConfig ? (
        <p>Loading configuration...</p>
      ) : (
        <div style={{ marginBottom: '20px', padding: '16px', border: '1px solid #ddd', borderRadius: '8px', background: '#fafafa' }}>
          <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Current Configuration</h3>
          {configured ? (
            <>
              <p style={{ margin: '6px 0' }}><strong>Provider:</strong> {providerLabel(provider)}</p>
              <p style={{ margin: '6px 0' }}><strong>API Key:</strong> {maskedKey || '••••••••••••••••'}</p>
              <p style={{ margin: '6px 0' }}><strong>Status:</strong> {isActive ? 'Enabled' : 'Disabled'}</p>
              <p style={{ margin: '6px 0' }}><strong>Last Updated:</strong> {updatedAt ? new Date(updatedAt).toLocaleString() : '-'}</p>
            </>
          ) : (
            <p style={{ margin: 0 }}>No AI API key configured yet.</p>
          )}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
        <label style={{ display: 'grid', gap: '6px' }}>
          <span>Provider</span>
          <select
            value={provider}
            onChange={e => setProvider(normalizeProvider(e.target.value))}
            disabled={saving || toggling || deleting}
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
          >
            {PROVIDERS.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: '6px' }}>
          <span>API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Enter provider API key"
            autoComplete="off"
            disabled={saving || toggling || deleting}
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
          />
        </label>

        <button
          type="submit"
          disabled={saving || toggling || deleting}
          style={{
            width: 'fit-content',
            padding: '10px 16px',
            borderRadius: '6px',
            border: '1px solid #333',
            background: '#111',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={handleToggle}
          disabled={!configured || toggling || saving || deleting}
          style={{
            padding: '10px 16px',
            borderRadius: '6px',
            border: '1px solid #bbb',
            background: configured ? '#f4f4f4' : '#e8e8e8',
            cursor: !configured || toggling ? 'not-allowed' : 'pointer'
          }}
        >
          {toggling ? 'Updating...' : (isActive ? 'Disable AI' : 'Enable AI')}
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={!configured || deleting || saving || toggling}
          style={{
            padding: '10px 16px',
            borderRadius: '6px',
            border: '1px solid #c62828',
            background: '#fff5f5',
            color: '#c62828',
            cursor: !configured || deleting ? 'not-allowed' : 'pointer'
          }}
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      {successMessage && (
        <p style={{ color: '#1b5e20', margin: '8px 0' }}>{successMessage}</p>
      )}
      {errorMessage && (
        <p style={{ color: '#b00020', margin: '8px 0' }}>{errorMessage}</p>
      )}
    </div>
  )
}
