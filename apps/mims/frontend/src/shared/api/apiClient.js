import { httpFetch } from './httpFetch.js'
'use strict'

/**
 * apiClient — single auth-aware fetch wrapper.
 * Usage: const api = apiClient(token)
 *   api.get(url)
 *   api.post(url, body)
 *   api.put(url, body)
 *   api.patch(url, body)
 *   api.del(url)
 *   api.upload(url, formData)  — multipart, no Content-Type override
 */
export function apiClient(token) {
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  async function request(url, options = {}) {
    const res = await httpFetch(url, { ...options, headers: { ...authHeaders, ...options.headers } })
    let json
    try { json = await res.json() } catch { json = {} }
    if (!res.ok) {
      const err = new Error(json.message || json.error || res.statusText || 'Request failed')
      err.status = res.status
      err.data   = json
      throw err
    }
    return json
  }

  return {
    get:    (url)              => request(url),
    post:   (url, body)        => request(url, { method: 'POST',   body: JSON.stringify(body) }),
    put:    (url, body)        => request(url, { method: 'PUT',    body: JSON.stringify(body) }),
    patch:  (url, body)        => request(url, { method: 'PATCH',  body: JSON.stringify(body) }),
    del:    (url)              => request(url, { method: 'DELETE' }),
    upload: (url, formData)    => httpFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { const e = new Error(j.message || r.statusText); e.status = r.status; e.data = j; throw e }
      return j
    }),
  }
}

/**
 * tokenFromH — extract raw token from a prebuilt headers object.
 * Lets components that receive `H` as prop adopt apiClient without changing prop signatures.
 * Usage: const api = apiClient(tokenFromH(H))
 */
export function tokenFromH(H) {
  return H?.Authorization?.replace(/^Bearer\s+/i, '') ?? ''
}
