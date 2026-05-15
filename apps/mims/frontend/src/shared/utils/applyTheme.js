/**
 * applyTheme.js — Read the platform theme and apply it to <html data-theme="...">
 *
 * Strategy:
 *   1. Read cached theme from localStorage (instant first paint, no flash).
 *   2. Fetch fresh theme from /api/admin/system-params/theme (public endpoint).
 *   3. Apply + cache if it differs.
 *
 * Allowed themes: blue (default) | warm | green
 */

const STORAGE_KEY = 'mims_ui_theme'
const ALLOWED     = ['blue', 'warm', 'green']
const DEFAULT     = 'blue'

export function applyThemeToDOM(theme) {
  const safe = ALLOWED.includes(theme) ? theme : DEFAULT
  document.documentElement.dataset.theme = safe
  return safe
}

export function getCachedTheme() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    return ALLOWED.includes(cached) ? cached : DEFAULT
  } catch (_) {
    return DEFAULT
  }
}

export function setCachedTheme(theme) {
  try {
    if (ALLOWED.includes(theme)) localStorage.setItem(STORAGE_KEY, theme)
  } catch (_) {}
}

/**
 * Boot-time call. Apply cached theme immediately, then sync with server.
 */
export async function bootTheme() {
  applyThemeToDOM(getCachedTheme())

  try {
    const res = await fetch('/api/admin/system-params/theme')
    if (!res.ok) return
    const data = await res.json()
    if (data?.ui_theme) {
      applyThemeToDOM(data.ui_theme)
      setCachedTheme(data.ui_theme)
    }
  } catch (_) { /* offline or backend down — keep cached theme */ }
}

/**
 * Called after admin saves a new theme — apply immediately + cache.
 */
export function setActiveTheme(theme) {
  const applied = applyThemeToDOM(theme)
  setCachedTheme(applied)
  return applied
}
