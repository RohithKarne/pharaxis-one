function serializeError(error) {
  if (!error) return null
  return {
    name: error.name || 'Error',
    message: error.message || 'Unknown error',
    stack: error.stack || null
  }
}

function buildLogPayload(level, event, data = {}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...data
  })
}

function logInfo(event, data = {}) {
  // eslint-disable-next-line no-console
  console.log(buildLogPayload('info', event, data))
}

function logWarn(event, data = {}) {
  // eslint-disable-next-line no-console
  console.warn(buildLogPayload('warn', event, data))
}

function logError(event, data = {}) {
  const payload = { ...data }
  if (payload.error instanceof Error) {
    payload.error = serializeError(payload.error)
  }
  // eslint-disable-next-line no-console
  console.error(buildLogPayload('error', event, payload))
}

module.exports = {
  logInfo,
  logWarn,
  logError
}
