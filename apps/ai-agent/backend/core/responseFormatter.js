// Normalises the adapter response to the standard API response shape
// All consumers receive the same structure regardless of provider

function format(adapterResult) {
  return {
    status: 'success',
    provider_used: adapterResult.provider,
    result: {
      answer: adapterResult.answer || '',
      sources: adapterResult.sources || [],
      confidence: adapterResult.confidence || null
    },
    tokens_used: {
      in: adapterResult.tokens_used?.in || 0,
      out: adapterResult.tokens_used?.out || 0
    }
  }
}

function formatError(message, code = 500) {
  return {
    status: 'error',
    error: message,
    code
  }
}

module.exports = { format, formatError }
