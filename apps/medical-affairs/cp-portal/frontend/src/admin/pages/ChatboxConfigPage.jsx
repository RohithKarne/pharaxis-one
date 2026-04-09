import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

export default function ChatboxConfigPage() {
  const { clientId }  = useParams()
  const [config, setConfig] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    fetch(`/api/admin/chatbox/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => setConfig(d.chatbox || {})).catch(() => {})
  }, [clientId])

  function set(key, value) { setConfig(c => ({ ...c, [key]: value })); setSaved(false) }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true)
    const payload = { ...config }
    if (apiKey) payload.api_key = apiKey
    const res = await fetch(`/api/admin/chatbox/${clientId}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(payload) })
    setSaving(false)
    if (res.ok) { setSaved(true); setApiKey('') }
  }

  if (!config) return <AdminLayout title="Chatbox AI"><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout title="Chatbox AI Configuration">
      <form onSubmit={handleSave}>
        <div className="cp-card">
          <div className="cp-card-title">AI Provider</div>
          <div className="cp-field-row">
            <div className="cp-field">
              <label>Provider</label>
              <select value={config.ai_provider || 'anthropic'} onChange={e => set('ai_provider', e.target.value)}>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
              </select>
            </div>
            <div className="cp-field">
              <label>Model</label>
              {config.ai_provider === 'openai' ? (
                <select value={config.model || 'gpt-4o-mini'} onChange={e => set('model', e.target.value)}>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gpt-4o">GPT-4o</option>
                </select>
              ) : (
                <select value={config.model || 'claude-haiku-4-5-20251001'} onChange={e => set('model', e.target.value)}>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fast)</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Balanced)</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6 (Most Capable)</option>
                </select>
              )}
            </div>
            <div className="cp-field">
              <label>Max Tokens</label>
              <input type="number" value={config.max_tokens || 1024} min={256} max={4096}
                onChange={e => set('max_tokens', Number(e.target.value))} />
            </div>
          </div>
          <div className="cp-field">
            <label>API Key {config.is_active ? '(set — leave blank to keep current)' : ''}</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={config.is_active ? '••••••••' : 'Paste API key…'} />
          </div>
        </div>

        <div className="cp-card">
          <div className="cp-card-title">Chatbox Behaviour</div>
          <div className="cp-field">
            <label>System Prompt</label>
            <textarea rows={5} value={config.system_prompt || ''} onChange={e => set('system_prompt', e.target.value)}
              placeholder="You are a helpful medical information assistant for [Company Name]. You provide accurate information about our products and therapeutic areas..." />
            <small>This sets the AI's persona and boundaries. Therapeutic area and drug context from this client's content is automatically included.</small>
          </div>
          <div className="cp-field">
            <label>Welcome Message</label>
            <input value={config.welcome_message || ''} onChange={e => set('welcome_message', e.target.value)}
              placeholder="Hello! How can I help you today?" />
          </div>
          <div className="cp-field cp-field-checkbox">
            <input type="checkbox" id="chatActive" checked={!!config.is_active} onChange={e => set('is_active', e.target.checked ? 1 : 0)} />
            <label htmlFor="chatActive">Enable chatbox on portal</label>
          </div>
        </div>

        {saved && <div className="cp-success">✓ Chatbox configuration saved.</div>}
        <div className="cp-form-actions">
          <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Configuration'}</button>
        </div>
      </form>
    </AdminLayout>
  )
}
