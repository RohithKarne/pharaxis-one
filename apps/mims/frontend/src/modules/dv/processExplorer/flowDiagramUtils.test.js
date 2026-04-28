import { describe, it, expect } from 'vitest'
import {
  buildEnrichment,
  conceptStyle,
  highlightSqlHtml,
  mapLaneName,
  parseMethodAndPath,
  shortFile,
  sqlStatementType,
  standardLaneIndex,
  toVscodeLink,
  wrapLabel,
} from './flowDiagramUtils'

describe('flowDiagramUtils', () => {
  it('maps lane names into standard buckets', () => {
    expect(mapLaneName('Frontend App')).toBe('Frontend')
    expect(mapLaneName('API Router')).toBe('API Gateway / Router')
    expect(mapLaneName('Mail Notification Service')).toBe('External Services')
  })

  it('returns standard lane index with fallback', () => {
    expect(standardLaneIndex('Database')).toBe(7)
    expect(standardLaneIndex('Unknown Lane')).toBe(9)
  })

  it('builds VS Code link only for mims paths', () => {
    expect(toVscodeLink('apps/mims/backend/server.js', 12)).toContain('/apps/mims/backend/server.js:12')
    expect(toVscodeLink('/tmp/random.js', 1)).toBeNull()
  })

  it('extracts method and path from route text', () => {
    expect(parseMethodAndPath('GET /api/cases?status=open')).toEqual({ method: 'GET', path: '/api/cases' })
    expect(parseMethodAndPath('not a route')).toBeNull()
  })

  it('detects SQL statement type from editor text', () => {
    expect(sqlStatementType(' select * from users')).toBe('SELECT')
    expect(sqlStatementType('')).toBe('')
  })

  it('wraps long labels but keeps short text as one line', () => {
    expect(wrapLabel('Short label', 30)).toEqual(['Short label'])
    expect(wrapLabel('one two three four', 7)).toEqual(['one two', 'three', 'four'])
  })

  it('formats short file display safely', () => {
    expect(shortFile('frontend/src/modules/max/App.jsx')).toBe('max/App.jsx')
    expect(shortFile('single.js')).toBe('single.js')
  })

  it('applies concept styles with default fallback', () => {
    expect(conceptStyle('🔐 Auth')).toEqual({ bg: 'rgba(251,191,36,0.18)', fg: '#FCD34D' })
    expect(conceptStyle('unknown')).toEqual({ bg: 'rgba(255,255,255,0.1)', fg: '#CBD5E1' })
  })

  it('highlights SQL and escapes unsafe HTML', () => {
    const html = highlightSqlHtml("SELECT * FROM users WHERE id = :id AND name = '<script>'")
    expect(html).toContain('font-weight:700')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('builds enrichment with failure status when step indicates error', () => {
    const enrichment = buildEnrichment(
      { concept: '🌐 API', apiRoute: 'GET /api/auth/me', type: 'dashed' },
      { duration_ms: 91, status_code: 401 },
    )
    expect(enrichment.status).toBe('401')
    expect(enrichment.failure).toBe('FAILED')
    expect(enrichment.latency).toBe('91ms')
    expect(enrichment.stepType).toBe('API')
  })
})
