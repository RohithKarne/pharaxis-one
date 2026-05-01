export function safeJsonParse(value, fallback = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function clearCpSessions() {
  localStorage.removeItem('cp_admin')
  localStorage.removeItem('cp_portal_user')
}
