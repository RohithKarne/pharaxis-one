import { apiJson, authHeaders, getOrgToken, getSuperadminToken } from '../utils/session'

export function orgApi(path, options = {}) {
  return apiJson(path, {
    ...options,
    headers: authHeaders(getOrgToken(), {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }),
    body: options.body && !(options.body instanceof FormData) && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body
  })
}

export function superadminApi(path, options = {}) {
  return apiJson(path, {
    ...options,
    headers: authHeaders(getSuperadminToken(), {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }),
    body: options.body && !(options.body instanceof FormData) && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body
  })
}
