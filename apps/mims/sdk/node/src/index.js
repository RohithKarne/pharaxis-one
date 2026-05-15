export class MimsClient {
  constructor({ baseUrl, clientId, clientSecret, token } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '')
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.token = token
  }

  async authenticate() {
    const res = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret }),
    })
    if (!res.ok) throw new Error(`OAuth failed: ${res.status}`)
    const data = await res.json()
    this.token = data.access_token
    return data
  }

  async request(path, options = {}) {
    if (!this.token) await this.authenticate()
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}`, ...(options.headers || {}) },
    })
    if (!res.ok) throw new Error(`MIMS API ${res.status}: ${await res.text()}`)
    return res.json()
  }

  cases(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/api/v1/cases${query ? `?${query}` : ''}`)
  }

  picklists(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/api/v1/picklists${query ? `?${query}` : ''}`)
  }
}
