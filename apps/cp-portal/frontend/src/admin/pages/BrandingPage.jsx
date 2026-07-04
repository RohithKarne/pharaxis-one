import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'
import ColorPicker from '../components/ColorPicker'
import LoadingButton from '../components/LoadingButton'

const COLOR_FIELDS = [
  { key: 'primary_color',     label: 'Primary Color' },
  { key: 'secondary_color',   label: 'Secondary Color' },
  { key: 'accent_color',      label: 'Accent Color' },
  { key: 'background_color',  label: 'Background' },
  { key: 'surface_color',     label: 'Surface' },
  { key: 'text_primary',      label: 'Text Primary' },
  { key: 'text_secondary',    label: 'Text Secondary' },
  { key: 'header_bg',         label: 'Header Background' },
  { key: 'header_text',       label: 'Header Text' },
  { key: 'footer_bg',         label: 'Footer Background' },
  { key: 'footer_text',       label: 'Footer Text' },
  { key: 'button_bg',         label: 'Button Color' },
  { key: 'button_text',       label: 'Button Text' },
  { key: 'link_color',        label: 'Link Color' },
  { key: 'border_color',      label: 'Border Color' },
]

export default function BrandingPage() {
  const { clientId } = useParams()
  const [branding, setBranding]           = useState(null)
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [error, setError]                 = useState('')
  const [logoPreview, setLogoPreview]     = useState(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError]         = useState('')
  const logoInputRef = useRef(null)

  useEffect(() => {
    fetch(`/api/admin/branding/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => {
        setBranding(d.branding || {})
        setLogoPreview(d.branding?.logo_url || null)
      })
      .catch(() => {})
  }, [clientId])

  function set(key, value) { setBranding(b => ({ ...b, [key]: value })); setSaved(false) }

  async function handleSave() {
    setError(''); setSaving(true)
    try {
      const res = await fetch(`/api/admin/branding/${clientId}`, {
        method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(branding),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed.'); return }
      setSaved(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError(''); setLogoUploading(true)
    // Show local preview immediately
    setLogoPreview(URL.createObjectURL(file))
    try {
      const form = new FormData()
      form.append('logo', file)
      const res = await fetch(`/api/admin/branding/${clientId}/upload-logo`, {
        method: 'POST',
        body: form, // multipart upload; auth rides the session cookie, browser sets Content-Type
      })
      const data = await res.json()
      if (!res.ok) { setLogoError(data.error || 'Upload failed.'); setLogoPreview(branding?.logo_url || null); return }
      setLogoPreview(data.logo_url)
      setBranding(b => ({ ...b, logo_url: data.logo_url }))
    } catch {
      setLogoError('Upload failed — network error.')
      setLogoPreview(branding?.logo_url || null)
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleReset() {
    if (!confirm('Reset branding to defaults?')) return
    await fetch(`/api/admin/branding/${clientId}/reset`, { method: 'POST', headers: adminHeaders() })
    const res = await fetch(`/api/admin/branding/${clientId}`, { headers: adminHeaders() })
    const d   = await res.json()
    setBranding(d.branding || {})
    setLogoPreview(d.branding?.logo_url || null)
    setSaved(true)
  }

  if (!branding) return <AdminLayout title="Branding"><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout title="Branding & Theme">
      <div>
        {/* Identity */}
        <div className="cp-card">
          <div className="cp-card-title">Portal Identity</div>
          <div className="cp-field-row">
            <div className="cp-field">
              <label>Portal Name</label>
              <input value={branding.portal_name || ''} onChange={e => set('portal_name', e.target.value)} />
            </div>
            <div className="cp-field">
              <label>Tagline</label>
              <input value={branding.tagline || ''} onChange={e => set('tagline', e.target.value)} placeholder="Trusted Medical Information" />
            </div>
            <div className="cp-field">
              <label>Custom Domain</label>
              <input value={branding.custom_domain || ''} onChange={e => set('custom_domain', e.target.value)} placeholder="medical.clientname.com" />
            </div>
          </div>

          {/* Logo Upload */}
          <div className="cp-field" style={{ marginTop: 8 }}>
            <label>Portal Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Preview */}
              <div style={{
                width: 120, height: 60, border: '1px dashed #D1D5DB', borderRadius: 8,
                background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {logoPreview
                  ? <img src={logoPreview} alt="Logo preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={() => setLogoPreview(null)} />
                  : <span style={{ fontSize: 11, color: '#9CA3AF' }}>No logo</span>
                }
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleLogoUpload}
                />
                <button
                  type="button"
                  className="cp-btn cp-btn-outline"
                  style={{ fontSize: 13 }}
                  disabled={logoUploading}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoUploading ? 'Uploading…' : logoPreview ? 'Replace Logo' : 'Upload Logo'}
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    onClick={() => {
                      setLogoPreview(null)
                      set('logo_url', null)
                    }}
                  >
                    Remove logo
                  </button>
                )}
                <span style={{ fontSize: 11, color: '#6B7280' }}>PNG, JPG, SVG, WebP · max 5 MB</span>
              </div>
            </div>
            {logoError && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{logoError}</div>}
          </div>
        </div>

        {/* Colors */}
        <div className="cp-card">
          <div className="cp-card-title">Colors</div>
          <div className="cp-color-grid">
            {COLOR_FIELDS.map(f => (
              <ColorPicker
                key={f.key}
                label={f.label}
                value={branding[f.key] || '#6B3FA0'}
                onChange={hex => set(f.key, hex)}
              />
            ))}
          </div>
        </div>

        {/* Color Preview */}
        <div className="cp-card">
          <div className="cp-card-title">Color Preview</div>
          <div className="cp-branding-preview" style={{
            '--pp-primary':   branding.primary_color   || '#0066cc',
            '--pp-secondary': branding.secondary_color || '#333333',
            '--pp-accent':    branding.accent_color    || '#ff6600',
          }}>
            <div style={{ background: 'var(--pp-primary)', padding: '1rem', color: '#fff', borderRadius: 4, marginBottom: 8 }}>Primary Color Preview</div>
            <div style={{ background: 'var(--pp-secondary)', padding: '1rem', color: '#fff', borderRadius: 4, marginBottom: 8 }}>Secondary Color Preview</div>
            <div style={{ background: 'var(--pp-accent)', padding: '1rem', color: '#fff', borderRadius: 4 }}>Accent Color Preview</div>
          </div>
        </div>

        {/* Typography */}
        <div className="cp-card">
          <div className="cp-card-title">Typography & Layout</div>
          <div className="cp-field-row">
            <div className="cp-field">
              <label>Body Font</label>
              <select value={branding.font_family || ''} onChange={e => set('font_family', e.target.value)}>
                <option value="">Default (System Font)</option>
                <option value="Inter, sans-serif">Inter</option>
                <option value="'Roboto', sans-serif">Roboto</option>
                <option value="'Open Sans', sans-serif">Open Sans</option>
                <option value="'Lato', sans-serif">Lato</option>
                <option value="'Montserrat', sans-serif">Montserrat</option>
                <option value="'Poppins', sans-serif">Poppins</option>
                <option value="'Source Sans Pro', sans-serif">Source Sans Pro</option>
                <option value="Georgia, serif">Georgia (Serif)</option>
                <option value="'Times New Roman', serif">Times New Roman (Serif)</option>
              </select>
            </div>
            <div className="cp-field">
              <label>Heading Font</label>
              <select value={branding.heading_font || 'Inter, sans-serif'} onChange={e => set('heading_font', e.target.value)}>
                <option value="Inter, sans-serif">Inter</option>
                <option value="'Roboto', sans-serif">Roboto</option>
                <option value="'Open Sans', sans-serif">Open Sans</option>
                <option value="'Montserrat', sans-serif">Montserrat</option>
                <option value="Georgia, serif">Georgia (serif)</option>
              </select>
            </div>
            <div className="cp-field">
              <label>Base Font Size</label>
              <select value={branding.base_font_size || '14px'} onChange={e => set('base_font_size', e.target.value)}>
                <option value="13px">13px (Small)</option>
                <option value="14px">14px (Default)</option>
                <option value="15px">15px (Medium)</option>
                <option value="16px">16px (Large)</option>
              </select>
            </div>
            <div className="cp-field">
              <label>Border Radius</label>
              <select value={branding.border_radius || '8px'} onChange={e => set('border_radius', e.target.value)}>
                <option value="0px">0px (Sharp)</option>
                <option value="4px">4px (Subtle)</option>
                <option value="8px">8px (Default)</option>
                <option value="12px">12px (Rounded)</option>
                <option value="16px">16px (Pill)</option>
              </select>
            </div>
          </div>
          <div className="cp-field-row">
            <div className="cp-field">
              <label>Header Style</label>
              <select value={branding.header_style || 'solid'} onChange={e => set('header_style', e.target.value)}>
                <option value="solid">Solid</option>
                <option value="transparent">Transparent</option>
                <option value="gradient">Gradient</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cp-card">
          <div className="cp-card-title">Footer</div>
          <div className="cp-field">
            <label>Footer Text</label>
            <textarea value={branding.footer_text_content || ''} onChange={e => set('footer_text_content', e.target.value)} rows={2} placeholder="For medical information or to report adverse events, contact us at..." />
          </div>
          <div className="cp-field">
            <label>Copyright Text</label>
            <input value={branding.copyright_text || ''} onChange={e => set('copyright_text', e.target.value)} placeholder={`© ${new Date().getFullYear()} Company Name. All rights reserved.`} />
          </div>
          <div className="cp-field cp-field-checkbox">
            <input type="checkbox" id="pwrby" checked={!!branding.show_powered_by} onChange={e => set('show_powered_by', e.target.checked ? 1 : 0)} />
            <label htmlFor="pwrby">Show "Powered by CP Portal"</label>
          </div>
        </div>

        <div className="cp-card">
          <div className="cp-card-title">Submission Confirmation</div>
          <div className="cp-field">
            <label>SLA Response Time Text</label>
            <input value={branding.sla_response_text || ''} onChange={e => set('sla_response_text', e.target.value)} placeholder="Our team will review your submission and respond within 5–7 business days." />
          </div>
          <small className="cp-help-text">Shown on the submission success screen. Leave blank for the default message.</small>
        </div>

        {error && <div className="cp-error">{error}</div>}
        {saved && <div className="cp-success">✓ Branding saved.</div>}

        <div className="cp-form-actions">
          <LoadingButton onClick={handleSave} disabled={saving}>Save Branding</LoadingButton>
          <button type="button" className="cp-btn cp-btn-outline" onClick={handleReset}>Reset to Defaults</button>
        </div>
      </div>
    </AdminLayout>
  )
}
