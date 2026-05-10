const dns = require('dns').promises
const net = require('net')

function isPrivateIPv4(ip) {
  const parts = String(ip).split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 0) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  return false
}

function isPrivateIPv6(ip) {
  const normalized = String(ip).toLowerCase()
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
}

function isPrivateIp(ip) {
  const family = net.isIP(String(ip))
  if (family === 4) return isPrivateIPv4(ip)
  if (family === 6) return isPrivateIPv6(ip)
  return true
}

function isAllowedHostname(hostname) {
  const allowlist = String(process.env.CP_OUTBOUND_ALLOWED_HOSTS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  if (!allowlist.length) return true
  return allowlist.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`))
}

async function assertSafeOutboundUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(String(rawUrl || '').trim())
  } catch {
    throw new Error('Invalid outbound URL')
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Only http/https outbound URLs are allowed')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Credential-in-URL is not allowed')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error('Outbound localhost/local domains are blocked')
  }
  if (!isAllowedHostname(hostname)) {
    throw new Error('Outbound destination host is not in allowlist')
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Outbound private IPs are blocked')
    return parsed
  }

  const resolved = await dns.lookup(hostname, { all: true, verbatim: true })
  if (!resolved.length) throw new Error('Could not resolve outbound host')
  if (resolved.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('Outbound private IP destinations are blocked')
  }

  return parsed
}

module.exports = { assertSafeOutboundUrl }
