const SENSITIVE_FIELDS = new Set(['password', 'token', 'smtp_password', 'verification_token'])

function summarizePayload(body) {
  if (!body || typeof body !== 'object' || !Object.keys(body).length) return null
  const safe = { ...body }
  for (const field of SENSITIVE_FIELDS) delete safe[field]
  return JSON.stringify(safe).slice(0, 300)
}

function captureProcessLog(pool) {
  return function processLogMiddleware(req, res, next) {
    if (req.path.includes('/process-logs')) return next()
    const start = Date.now()
    let capturedErrorMsg = null
    const origJson = res.json.bind(res)

    res.json = function jsonWithCapture(body) {
      if (res.statusCode >= 400 && body) {
        capturedErrorMsg = (body.error || body.message || JSON.stringify(body)).toString().slice(0, 200)
      }
      return origJson(body)
    }

    res.on('finish', () => {
      ;(async () => {
        try {
          const fullPath = req.originalUrl.split('?')[0]
          const source = fullPath.startsWith('/api/portal') ? 'portal' : 'admin'
          const pathPat = fullPath.replace(/\/\d+/g, '/:id')
          const idMatch = fullPath.match(/\/(\d+)/)
          const clientId = idMatch ? parseInt(idMatch[1], 10) : null

          await pool.execute(
            `INSERT INTO cp_process_logs
               (source, method, path, path_pattern, status_code, duration_ms,
                admin_id, portal_user_id, client_id, payload_summary, error_message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              source,
              req.method,
              fullPath,
              pathPat,
              res.statusCode,
              Date.now() - start,
              req.admin?.id ?? null,
              req.portalUser?.id ?? null,
              clientId,
              summarizePayload(req.body),
              res.statusCode >= 400 ? capturedErrorMsg : null
            ]
          )
        } catch {
          // Logging must never break the response path.
        }
      })()
    })
    next()
  }
}

module.exports = { captureProcessLog }
