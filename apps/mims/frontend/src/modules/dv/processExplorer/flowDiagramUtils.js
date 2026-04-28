export const CONCEPT_C = {
  '🔐': { bg: 'rgba(251,191,36,0.18)', fg: '#FCD34D' },
  '💾': { bg: 'rgba(52,211,153,0.18)', fg: '#34D399' },
  '🌐': { bg: 'rgba(96,165,250,0.18)', fg: '#93C5FD' },
  '🔄': { bg: 'rgba(249,115,22,0.18)', fg: '#FB923C' },
  '📧': { bg: 'rgba(167,139,250,0.18)', fg: '#C4B5FD' },
  '🖥': { bg: 'rgba(148,163,184,0.18)', fg: '#CBD5E1' },
  '⚡': { bg: 'rgba(251,191,36,0.18)', fg: '#FCD34D' },
  '🗄': { bg: 'rgba(52,211,153,0.18)', fg: '#6EE7B7' },
}

export const WORKSPACE_ROOT = '/Users/rohithkarne/MIMS-CP Portal'

export const STANDARD_LANES = [
  'Admin',
  'Frontend',
  'API Gateway / Router',
  'Middleware',
  'Backend',
  'Auth',
  'Cache (Redis)',
  'Database',
  'Queue / Jobs',
  'External Services',
  'File Storage',
]

export const ENRICH_FLOW_TITLES = new Set(['Admin Login', 'Error — 401 Unauthorized'])
export const VIRTUAL_LANE_TITLES = new Set(['Admin Login'])
export const VIRTUAL_LANES = [
  'Admin',
  'Frontend',
  'API Gateway',
  'Middleware',
  'Backend',
  'Auth',
  'Cache',
  'Database',
  'Queue',
  'External',
  'File Storage',
]

export function conceptStyle(tag) {
  if (!tag) return CONCEPT_C['🖥']
  for (const [emoji, style] of Object.entries(CONCEPT_C)) {
    if (tag.startsWith(emoji)) return style
  }
  return { bg: 'rgba(255,255,255,0.1)', fg: '#CBD5E1' }
}

export function toVscodeLink(filePath, line) {
  if (!filePath) return null
  const raw = String(filePath)
  const abs = raw.startsWith('/') ? raw : `${WORKSPACE_ROOT}/${raw}`
  if (!abs.includes('/mims/')) return null
  const encoded = encodeURI(abs)
  return `vscode://file/${encoded}${line ? `:${line}` : ''}`
}

export function truncate(text, max) {
  if (!text) return '-'
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

export function mapLaneName(name) {
  if (!name) return 'External Services'
  const lane = name.toLowerCase()
  if (lane.includes('admin') || lane.includes('user')) return 'Admin'
  if (lane.includes('front')) return 'Frontend'
  if (lane.includes('gateway') || lane.includes('router') || lane.includes('api')) return 'API Gateway / Router'
  if (lane.includes('middleware')) return 'Middleware'
  if (lane.includes('back')) return 'Backend'
  if (lane.includes('auth')) return 'Auth'
  if (lane.includes('cache') || lane.includes('redis')) return 'Cache (Redis)'
  if (lane.includes('db') || lane.includes('database')) return 'Database'
  if (lane.includes('queue') || lane.includes('job') || lane.includes('scheduler')) return 'Queue / Jobs'
  if (lane.includes('file') || lane.includes('storage') || lane.includes('document')) return 'File Storage'
  if (lane.includes('external') || lane.includes('email') || lane.includes('notify') || lane.includes('notification')) return 'External Services'
  return 'External Services'
}

export function standardLaneIndex(name) {
  const mapped = mapLaneName(name)
  const idx = STANDARD_LANES.indexOf(mapped)
  return idx >= 0 ? idx : STANDARD_LANES.indexOf('External Services')
}

export function inferTypeIcon(step) {
  const concept = step.concept || ''
  if (concept.startsWith('🔐')) return '🔐'
  if (concept.startsWith('💾')) return '🗄'
  if (concept.startsWith('🌐')) return '🌐'
  if (concept.startsWith('🔄')) return '🔄'
  if (concept.startsWith('🖥')) return '🖥'
  if (concept.startsWith('⚡')) return '⚡'
  if (concept.startsWith('📧')) return '✉️'
  return '🔧'
}

export function inferStepType(step) {
  const concept = step.concept || ''
  if (concept.includes(' ')) return concept.split(' ').slice(1).join(' ')
  if (step.dbQuery) return 'DB'
  if (step.apiRoute) return 'API'
  return 'Step'
}

export function inferStatus(step, logEntry) {
  const meaning = step.statusMeaning || ''
  const label = step.label || ''
  const hit = (meaning + ' ' + label).match(/\\b(401|403|404|422|500)\\b/)
  if (hit) return hit[1]
  if (step.type === 'dashed' && logEntry?.status_code) return String(logEntry.status_code)
  if (step.type === 'dashed') return '200'
  return '--'
}

export function buildEnrichment(step, logEntry) {
  const status = inferStatus(step, logEntry)
  const latency = step.duration_ms != null
    ? `${step.duration_ms}ms`
    : logEntry?.duration_ms != null
      ? `${logEntry.duration_ms}ms`
      : (step.type === 'dashed' ? '8ms' : '15ms')
  const typeIcon = inferTypeIcon(step)
  const stepType = inferStepType(step)
  const req = truncate(step.requestBody || step.apiRoute || '', 28)
  const res = truncate(step.responseBody || step.statusMeaning || '', 28)
  const db = truncate(step.dbQuery || '', 28)
  const failure = Number(status) >= 400 ? 'FAILED' : null
  return { latency, status, typeIcon, stepType, req, res, db, failure }
}

export function shortFile(path) {
  if (!path) return null
  const parts = path.split('/')
  return parts.length >= 2 ? parts.slice(-2).join('/') : parts[parts.length - 1]
}

export function sqlStatementType(sqlTextValue) {
  const match = String(sqlTextValue || '').trim().match(/^([a-zA-Z]+)/)
  return match ? match[1].toUpperCase() : ''
}

export function parseMethodAndPath(text) {
  const match = String(text || '').match(/\b(GET|POST|PUT|PATCH|DELETE|JOB|SCHEMA)\s+(\/[A-Za-z0-9_\/:\-?&.=]+)/i)
  if (!match) return null
  return { method: match[1].toUpperCase(), path: match[2].split('?')[0] }
}

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function highlightSqlHtml(sqlText) {
  const escaped = escapeHtml(sqlText)
  return escaped
    .replace(/\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|INSERT|INTO|VALUES|UPDATE|SET|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|AND|OR|AS|COUNT|AVG|MAX|MIN|DESC|ASC)\b/gi, '<span style="color:#1D4ED8;font-weight:700">$1</span>')
    .replace(/(:[a-zA-Z_][a-zA-Z0-9_]*)/g, '<span style="color:#7C3AED">$1</span>')
    .replace(/('[^']*')/g, '<span style="color:#047857">$1</span>')
}

export function wrapLabel(text, max) {
  if (!text || text.length <= max) return text ? [text] : []
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > max) {
      if (current) lines.push(current)
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  }
  if (current) lines.push(current)
  return lines
}
