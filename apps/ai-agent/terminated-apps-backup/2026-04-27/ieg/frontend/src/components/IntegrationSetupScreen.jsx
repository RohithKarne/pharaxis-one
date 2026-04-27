export default function IntegrationSetupScreen({
  integrationSetup,
  integrationSecretMeta,
  updateIntegrationSetup,
  refreshIntegrationSetup,
  saveIntegrationDraft,
  resetIntegrationDraft,
  importIntegrationDraft,
  copyEnvDraft,
  envPreview
}) {
  return (
    <main className="dashboard-shell">
      <section className="panel reveal-up delay-2">
        <div className="panel-head">
          <h2>Integration Setup</h2>
          <span className="muted">
            Enter provider details now, save draft in browser, and activate when real credentials are available.
          </span>
        </div>
        <div className="action-row">
          <button className="ghost" onClick={refreshIntegrationSetup}>Load Stored Setup</button>
        </div>

        <div className="ops-block">
          <h3>Veeva Vault</h3>
          <div className="form-grid three">
            <div>
              <label>Enable Veeva</label>
              <select value={integrationSetup.veevaEnabled} onChange={(e) => updateIntegrationSetup('veevaEnabled', e.target.value)}>
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </div>
            <div>
              <label>Veeva Base URL</label>
              <input value={integrationSetup.veevaBaseUrl} onChange={(e) => updateIntegrationSetup('veevaBaseUrl', e.target.value)} placeholder="https://your-veeva.example.com" />
            </div>
            <div>
              <label>Veeva Token URL</label>
              <input value={integrationSetup.veevaTokenUrl} onChange={(e) => updateIntegrationSetup('veevaTokenUrl', e.target.value)} placeholder="https://.../oauth/token" />
            </div>
          </div>
          <div className="form-grid three">
            <div>
              <label>Veeva Client ID</label>
              <input value={integrationSetup.veevaClientId} onChange={(e) => updateIntegrationSetup('veevaClientId', e.target.value)} placeholder="client id" />
            </div>
            <div>
              <label>Veeva Client Secret</label>
              <input type="password" value={integrationSetup.veevaClientSecret} onChange={(e) => updateIntegrationSetup('veevaClientSecret', e.target.value)} placeholder="client secret" />
              <div className="hint-text">
                Stored in backend: {integrationSecretMeta.veevaClientSecret ? 'Yes' : 'No'}
              </div>
            </div>
          </div>
        </div>

        <div className="ops-block">
          <h3>SharePoint / Microsoft Graph</h3>
          <div className="form-grid three">
            <div>
              <label>Enable SharePoint</label>
              <select value={integrationSetup.sharePointEnabled} onChange={(e) => updateIntegrationSetup('sharePointEnabled', e.target.value)}>
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </div>
            <div>
              <label>Tenant ID</label>
              <input value={integrationSetup.msTenantId} onChange={(e) => updateIntegrationSetup('msTenantId', e.target.value)} placeholder="tenant id" />
            </div>
            <div>
              <label>Client ID</label>
              <input value={integrationSetup.msClientId} onChange={(e) => updateIntegrationSetup('msClientId', e.target.value)} placeholder="client id" />
            </div>
          </div>
          <div className="form-grid three">
            <div>
              <label>Client Secret</label>
              <input type="password" value={integrationSetup.msClientSecret} onChange={(e) => updateIntegrationSetup('msClientSecret', e.target.value)} placeholder="client secret" />
              <div className="hint-text">
                Stored in backend: {integrationSecretMeta.msClientSecret ? 'Yes' : 'No'}
              </div>
            </div>
            <div>
              <label>SharePoint Site ID</label>
              <input value={integrationSetup.sharePointSiteId} onChange={(e) => updateIntegrationSetup('sharePointSiteId', e.target.value)} placeholder="site id" />
            </div>
            <div>
              <label>SharePoint Drive ID</label>
              <input value={integrationSetup.sharePointDriveId} onChange={(e) => updateIntegrationSetup('sharePointDriveId', e.target.value)} placeholder="drive id" />
            </div>
          </div>
        </div>

        <div className="ops-block">
          <h3>ClinicalTrials + OpenAI + ERP</h3>
          <div className="form-grid three">
            <div>
              <label>Enable ClinicalTrials Live</label>
              <select value={integrationSetup.ctgLiveEnabled} onChange={(e) => updateIntegrationSetup('ctgLiveEnabled', e.target.value)}>
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </div>
            <div>
              <label>Enable OpenAI LLM</label>
              <select value={integrationSetup.llmLiveEnabled} onChange={(e) => updateIntegrationSetup('llmLiveEnabled', e.target.value)}>
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </div>
            <div>
              <label>OpenAI Model</label>
              <input value={integrationSetup.openaiModel} onChange={(e) => updateIntegrationSetup('openaiModel', e.target.value)} placeholder="gpt-4.1-mini" />
            </div>
          </div>
          <div className="form-grid three">
            <div>
              <label>OpenAI API Key</label>
              <input type="password" value={integrationSetup.openaiApiKey} onChange={(e) => updateIntegrationSetup('openaiApiKey', e.target.value)} placeholder="sk-..." />
              <div className="hint-text">
                Stored in backend: {integrationSecretMeta.openaiApiKey ? 'Yes' : 'No'}
              </div>
            </div>
            <div>
              <label>Enable ERP Delivery</label>
              <select value={integrationSetup.erpDeliveryEnabled} onChange={(e) => updateIntegrationSetup('erpDeliveryEnabled', e.target.value)}>
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </div>
            <div>
              <label>ERP Endpoint URL</label>
              <input value={integrationSetup.erpEndpoint} onChange={(e) => updateIntegrationSetup('erpEndpoint', e.target.value)} placeholder="https://erp.example.com/export" />
            </div>
          </div>
          <div className="form-grid three">
            <div>
              <label>ERP Auth Token</label>
              <input type="password" value={integrationSetup.erpAuthToken} onChange={(e) => updateIntegrationSetup('erpAuthToken', e.target.value)} placeholder="token (optional)" />
              <div className="hint-text">
                Stored in backend: {integrationSecretMeta.erpAuthToken ? 'Yes' : 'No'}
              </div>
            </div>
          </div>
        </div>

        <div className="action-row">
          <button onClick={saveIntegrationDraft}>Save Draft</button>
          <button className="ghost" onClick={copyEnvDraft}>Copy .env Snippet</button>
          <button className="ghost" onClick={resetIntegrationDraft}>Reset Draft</button>
        </div>

        <div className="ops-block">
          <h3>Import Credential JSON</h3>
          <label>Upload draft JSON (optional)</label>
          <input type="file" accept="application/json" onChange={importIntegrationDraft} />
        </div>

        <div className="ops-block">
          <h3>.env Preview</h3>
          <textarea className="env-preview" readOnly value={envPreview} />
        </div>
      </section>
    </main>
  )
}
