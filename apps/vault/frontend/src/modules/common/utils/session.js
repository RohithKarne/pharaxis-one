export function parseJson(value, fallback = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function getOrgToken() {
  return localStorage.getItem('vault_token') || ''
}

export function getOrgUser() {
  return parseJson(localStorage.getItem('vault_user'), {}) || {}
}

export function getSuperadminToken() {
  return localStorage.getItem('vault_superadmin_token') || ''
}

export function getSuperadminUser() {
  return parseJson(localStorage.getItem('vault_superadmin'), {}) || {}
}

export function clearOrgSession() {
  localStorage.removeItem('vault_token')
  localStorage.removeItem('vault_user')
}

export function clearSuperadminSession() {
  localStorage.removeItem('vault_superadmin_token')
  localStorage.removeItem('vault_superadmin')
}

export function authHeaders(token, extra = {}) {
  const headers = { ...extra }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function apiJson(path, options = {}) {
  const response = await fetch(path, options)
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && payload.error
        ? payload.error
        : typeof payload === 'string' && payload
          ? payload
          : 'Request failed'
    throw new Error(errorMessage)
  }

  return payload
}

export function lifecycleBadgeClass(state) {
  const normalized = String(state || '').toLowerCase()
  return `lifecycle-badge ${normalized || 'unknown'}`
}
