import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
]

const styles = {
  container: {
    maxWidth: 860,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  card: {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: 13,
    lineHeight: 1.5,
    color: '#6B7280',
  },
  grid: {
    marginTop: 16,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  detailCard: {
    border: '1px solid #EEF2F7',
    borderRadius: 10,
    padding: 12,
    background: '#FAFBFC',
  },
  detailLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#667085',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#1F2937',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #D1D5DB',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 14,
    color: '#111827',
    background: '#FFFFFF',
  },
  message: {
    marginBottom: 12,
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  primaryButton: {
    border: 'none',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: 600,
    background: '#2563EB',
    color: '#FFFFFF',
    cursor: 'pointer',
  },
  neutralButton: {
    border: '1px solid #D1D5DB',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: 600,
    background: '#FFFFFF',
    color: '#111827',
    cursor: 'pointer',
  },
  dangerButton: {
    border: '1px solid #FECACA',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: 600,
    background: '#FEF2F2',
    color: '#B91C1C',
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  statusDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginRight: 6,
  },
}

function getAuthHeaders(includeJson = false) {
  const headers = {}
  if (includeJson) headers['Content-Type'] = 'application/json'
  return headers
}

function toLabel(provider) {
  return PROVIDERS.find(p => p.value === provider)?.label || provider || 'Not set'
}

function formatDate(dateValue) {
  if (!dateValue) return 'Not available'
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return parsed.toLocaleString()
}

function extractConfig(raw) {
  const source = raw?.config || raw?.data || raw || {}
  const provider = source.provider || source.provider_name || ''
  const maskedKey = source.masked_key || source.api_key_masked || (source.has_key ? '••••••••••••••••' : '')
  const hasKey = typeof source.has_key === 'boolean'
    ? source.has_key
    : Boolean(maskedKey || provider)

  return {
    provider,
    maskedKey: maskedKey || (hasKey ? '••••••••••••••••' : ''),
    isActive: Boolean(source.is_active),
    lastUpdated: source.last_updated || source.updated_at || source.updatedAt || null,
    hasKey,
  }
}

export default function AIConfigPage() {
  const { clientId } = useParams()
  const API_BASE = (import.meta.env.VITE_API_URL || '/api') + '/admin/clients/' + clientId + '/ai-config'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [currentConfig, setCurrentConfig] = useState(null)
  const [notice, setNotice] = useState({ type: '', text: '' })

  const hasKeyConfigured = useMemo(() => Boolean(currentConfig?.hasKey), [currentConfig])

  useEffect(() => {
    loadConfig()
  }, [clientId])

  async function loadConfig() {
    setLoading(true)
    setNotice({ type: '', text: '' })

    try {
      const response = await fetch(`${API_BASE}/keys`, {
        method: 'GET',
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        if (response.status === 404) {
          setCurrentConfig(null)
          return
        }
        throw new Error('Failed to fetch current configuration')
      }

      const data = await response.json()
      const normalized = extractConfig(data)
      setCurrentConfig(normalized)
      if (normalized.provider) setProvider(normalized.provider)
    } catch {
      setNotice({ type: 'error', text: 'Unable to load AI configuration.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    setNotice({ type: '', text: '' })

    if (!apiKey.trim()) {
      setNotice({ type: 'error', text: 'Please enter an API key.' })
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`${API_BASE}/keys`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ provider, api_key: apiKey.trim() }),
      })

      if (!response.ok) {
        if (response.status === 422) {
          setNotice({ type: 'error', text: 'Invalid API key — validation failed' })
          return
        }
        if (response.status === 503) {
          setNotice({ type: 'error', text: 'Provider unreachable — please retry' })
          return
        }
        setNotice({ type: 'error', text: 'Failed to save API key.' })
        return
      }

      setApiKey('')
      await loadConfig()
      setNotice({ type: 'success', text: 'API key saved successfully' })
    } catch {
      setNotice({ type: 'error', text: 'Failed to save API key.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(nextValue) {
    if (!hasKeyConfigured) return

    setNotice({ type: '', text: '' })
    setToggling(true)
    try {
      const response = await fetch(`${API_BASE}/provider/toggle`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ is_active: nextValue }),
      })

      if (!response.ok) {
        setNotice({ type: 'error', text: 'Failed to update provider status.' })
        return
      }

      setCurrentConfig(prev => prev ? { ...prev, isActive: nextValue } : prev)
      setNotice({ type: 'success', text: `Provider ${nextValue ? 'enabled' : 'disabled'} successfully.` })
    } catch {
      setNotice({ type: 'error', text: 'Failed to update provider status.' })
    } finally {
      setToggling(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete the configured API key? This action cannot be undone.')) return

    setNotice({ type: '', text: '' })
    setDeleting(true)
    try {
      const response = await fetch(`${API_BASE}/keys`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        setNotice({ type: 'error', text: 'Failed to delete API key.' })
        return
      }

      setCurrentConfig(null)
      setApiKey('')
      setNotice({ type: 'success', text: 'API key deleted successfully.' })
    } catch {
      setNotice({ type: 'error', text: 'Failed to delete API key.' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AdminLayout>
      <div className="cp-section-header">
        <h2>AI Configuration</h2>
      </div>

      <div style={styles.container}>
        <section style={styles.card}>
          <h3 style={styles.title}>Current Configuration</h3>
          <p style={styles.subtitle}>
            Configure and control the AI provider used by this client organization.
          </p>

          {loading ? (
            <p style={{ ...styles.subtitle, marginTop: 12 }}>Loading current configuration…</p>
          ) : currentConfig?.hasKey ? (
            <div style={styles.grid}>
              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Provider</span>
                <span style={styles.detailValue}>{toLabel(currentConfig.provider)}</span>
              </div>
              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>API Key</span>
                <span style={styles.detailValue}>{currentConfig.maskedKey || '••••••••••••••••'}</span>
              </div>
              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Status</span>
                <span style={styles.detailValue}>
                  <span
                    style={{
                      ...styles.statusDot,
                      background: currentConfig.isActive ? '#16A34A' : '#DC2626',
                    }}
                  />
                  {currentConfig.isActive ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div style={styles.detailCard}>
                <span style={styles.detailLabel}>Last Updated</span>
                <span style={styles.detailValue}>{formatDate(currentConfig.lastUpdated)}</span>
              </div>
            </div>
          ) : (
            <p style={{ ...styles.subtitle, marginTop: 12 }}>No API key configured yet.</p>
          )}
        </section>

        <section style={styles.card}>
          <h3 style={styles.title}>Provider Credentials</h3>
          <p style={styles.subtitle}>Select provider and save a valid API key.</p>

          {notice.text && (
            <div
              style={{
                ...styles.message,
                background: notice.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                color: notice.type === 'success' ? '#166534' : '#B91C1C',
              }}
            >
              {notice.text}
            </div>
          )}

          <form onSubmit={handleSave}>
            <div style={styles.row}>
              <label htmlFor="ai-provider" style={styles.label}>Provider</label>
              <select
                id="ai-provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                style={styles.input}
              >
                {PROVIDERS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div style={styles.row}>
              <label htmlFor="ai-api-key" style={styles.label}>API Key</label>
              <input
                id="ai-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Enter provider API key"
                style={styles.input}
              />
            </div>

            <div style={styles.actions}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  ...styles.primaryButton,
                  ...(saving ? styles.disabledButton : null),
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </section>

        <section style={styles.card}>
          <h3 style={styles.title}>Activation & Lifecycle</h3>
          <p style={styles.subtitle}>Enable or disable the configured provider, or delete the stored key.</p>

          <div style={styles.actions}>
            <button
              type="button"
              onClick={() => handleToggle(!(currentConfig?.isActive))}
              disabled={toggling || !hasKeyConfigured}
              style={{
                ...styles.neutralButton,
                ...(toggling || !hasKeyConfigured ? styles.disabledButton : null),
              }}
            >
              {toggling
                ? 'Updating…'
                : currentConfig?.isActive
                  ? 'Disable Provider'
                  : 'Enable Provider'}
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || !hasKeyConfigured}
              style={{
                ...styles.dangerButton,
                ...(deleting || !hasKeyConfigured ? styles.disabledButton : null),
              }}
            >
              {deleting ? 'Deleting…' : 'Delete API Key'}
            </button>
          </div>

          {!hasKeyConfigured && (
            <p style={{ ...styles.subtitle, marginTop: 12 }}>
              Save an API key before enabling the provider.
            </p>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}
