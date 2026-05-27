import { useEffect, useState } from 'react'
import MIMSLayout from '../../shared/components/MIMSLayout'

export default function DeveloperPortalPage() {
  const [spec, setSpec] = useState('')
  useEffect(() => { fetch('/api/openapi.yaml').then(r => r.text()).then(setSpec).catch(() => setSpec('Unable to load OpenAPI spec.')) }, [])
  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>
      <div className="developer-portal">
        <h1>MIMS Developer Portal</h1>
        <p>Use OAuth2 client credentials, scoped REST APIs, GraphQL, signed webhooks, and sandbox clients to integrate with MIMS.</p>
        <section><h2>Getting Started</h2><pre>{`curl -X POST /oauth/token \\\n  -H 'Content-Type: application/json' \\\n  -d '{"grant_type":"client_credentials","client_id":"...","client_secret":"..."}'`}</pre></section>
        <section><h2>API Reference</h2><pre>{spec}</pre></section>
        <section><h2>Sample Python SDK</h2><pre>{`import requests\ntoken = requests.post(base + '/oauth/token', json=creds).json()['access_token']\ncases = requests.get(base + '/api/v1/cases', headers={'Authorization': f'Bearer {token}'}).json()`}</pre></section>
      </div>
    </MIMSLayout>
  )
}
