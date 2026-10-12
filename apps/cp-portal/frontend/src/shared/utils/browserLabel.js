// A readable name for a browser string: "Chrome on Windows", not the whole line.
export function browserLabel(ua) {
  const u = String(ua || '')
  if (!u) return 'Unknown browser'
  const browser = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox'
    : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser'
  const os = /Windows/.test(u) ? 'Windows' : /iPhone|iPad/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android'
    : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'unknown device'
  return `${browser} on ${os}`
}
