import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { CanChange, ReadOnlyUnless } from '../components/RoleGate'
import { adminHeaders } from '../context/AdminAuthContext'

export default function ChatboxConfigPage() {
  const { clientId }  = useParams()
  const [config, setConfig] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    fetch(`/api/admin/chatbox/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => setConfig(d.chatbox || {})).catch(() => {})
  }, [clientId])

  function set(key, value) { setConfig(c => ({ ...c, [key]: value })); setSaved(false); setError('') }

  // CPPM-75: a model belongs to one provider. Switching provider used to keep the old
  // model, show the first option of the new list as if chosen, and save the mismatch.
  const MODELS = {
    anthropic: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'],
    openai: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  }
  const DEFAULT_MODEL = { anthropic: 'claude-opus-5', openai: 'gpt-5.6-luna' }
  function setProvider(provider) {
    setConfig(c => ({ ...c, ai_provider: provider, model: MODELS[provider].includes(c.model) ? c.model : DEFAULT_MODEL[provider] }))
    setSaved(false); setError('')
  }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true); setSaved(false); setError('')
    const payload = { ...config }
    if (apiKey) payload.api_key = apiKey
    try {
      const res = await fetch(`/api/admin/chatbox/${clientId}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(payload) })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ? `Failed to save: ${d.error}` : 'Failed to save configuration.')
        return
      }
      setSaved(true); setApiKey('')
    } catch {
      setError('Network error saving configuration.')
    } finally {
      setSaving(false)
    }
  }

  if (!config) return <AdminLayout title="Chatbox AI"><div className="cp-loading">Loading…</div></AdminLayout>

  const provider = config.ai_provider || 'anthropic'
  const modelMismatch = !!config.model && !MODELS[provider].includes(config.model)

  return (
    <AdminLayout title="Chatbox AI Configuration">
      <ReadOnlyUnless area="chatbox" what="the chatbox settings">
      <form onSubmit={handleSave}>
        {/* CP ease-of-use plan, phase 3 row 22: what a doctor sees first, then the AI
            service and its key; model, answer length and instructions under Advanced. */}
        <div className="cp-card">
          <div className="cp-card-title">Chat box on the portal</div>
          <div className="cp-field cp-field-checkbox">
            <input type="checkbox" id="chatActive" checked={!!config.is_active} onChange={e => set('is_active', e.target.checked ? 1 : 0)} />
            <label htmlFor="chatActive">Show the chat box on the portal</label>
          </div>
          <div className="cp-field">
            <label htmlFor="chatWelcome">Welcome message</label>
            <input id="chatWelcome" value={config.welcome_message || ''} onChange={e => set('welcome_message', e.target.value)}
              placeholder="Hello! How can I help you today?" />
          </div>
        </div>

        <div className="cp-card">
          <div className="cp-card-title">AI service</div>
          <div className="cp-field-row">
            <div className="cp-field">
              <label htmlFor="chatProvider">Provider</label>
              <select id="chatProvider" value={config.ai_provider || 'anthropic'} onChange={e => setProvider(e.target.value)}>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
              </select>
            </div>
            <div className="cp-field" style={{ flex: 2 }}>
              {/* Was keyed on is_active, so an enabled chatbox with no key claimed one was set. */}
              <label htmlFor="chatKey">API Key {config.has_api_key ? '(set — leave blank to keep current)' : <span style={{ color: '#B91C1C' }}>(not set — the assistant cannot answer until you add one)</span>}</label>
              <input id="chatKey" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={config.has_api_key ? '••••••••' : 'Paste API key…'} />
            </div>
          </div>
          {modelMismatch && (
            <div className="cp-error" style={{ marginTop: 8 }}>
              The saved model, {config.model}, is not {provider === 'openai' ? 'an OpenAI' : 'an Anthropic'} model, so the chat box cannot answer. Choose a model and save.
            </div>
          )}

          <details className="cp-advanced" open={modelMismatch || undefined}>
            <summary>Advanced: model, answer length and instructions</summary>
            <div className="cp-field-row">
              <div className="cp-field">
                <label htmlFor="chatModel">Model</label>
                {config.ai_provider === 'openai' ? (
                  <select id="chatModel" value={modelMismatch ? '' : (config.model || 'gpt-5.6-luna')} onChange={e => set('model', e.target.value)}>
                    {modelMismatch && <option value="" disabled>Choose a model…</option>}
                    <option value="gpt-5.6-luna">GPT-5.6 Luna (Fast, lowest cost)</option>
                    <option value="gpt-5.6-terra">GPT-5.6 Terra (Balanced)</option>
                    <option value="gpt-5.6-sol">GPT-5.6 Sol (Most capable GPT-5.6)</option>
                    <option value="gpt-6-astra">GPT-6 Astra (Flagship, highest cost)</option>
                  </select>
                ) : (
                  <select id="chatModel" value={modelMismatch ? '' : (config.model || 'claude-opus-5')} onChange={e => set('model', e.target.value)}>
                    {modelMismatch && <option value="" disabled>Choose a model…</option>}
                    <option value="claude-haiku-4-5">Claude Haiku 4.5 (Fast, lowest cost)</option>
                    <option value="claude-sonnet-5">Claude Sonnet 5 (Balanced)</option>
                    <option value="claude-opus-5">Claude Opus 5 (Most capable Opus)</option>
                    <option value="claude-fable-5-1">Claude Fable 5.1 (Flagship, highest cost)</option>
                  </select>
                )}
              </div>
              <div className="cp-field">
                <label htmlFor="chatMaxTokens">Longest answer (tokens)</label>
                <input id="chatMaxTokens" type="number" value={config.max_tokens || 1024} min={256} max={4096}
                  onChange={e => set('max_tokens', Number(e.target.value))} />
              </div>
            </div>
            <div className="cp-field">
              <label htmlFor="chatPrompt">Instructions for the assistant</label>
              <textarea id="chatPrompt" rows={5} value={config.system_prompt || ''} onChange={e => set('system_prompt', e.target.value)}
                placeholder="You are a helpful medical information assistant for [Company Name]. You provide accurate information about our products and therapeutic areas..." />
              <small>This sets the AI's persona and boundaries. Therapeutic area and drug context from this client's content is automatically included.</small>
            </div>
          </details>
        </div>

        {error && <div className="cp-error">{error}</div>}
        {saved && <div className="cp-success">Chatbox configuration saved.</div>}
        <div className="cp-form-actions">
          <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Configuration'}</button>
        </div>
      </form>
      </ReadOnlyUnless>
    </AdminLayout>
  )
}
