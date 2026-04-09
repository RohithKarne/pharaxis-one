function format(adapterResult = {}) {
  return {
    status: 'success',
    provider_used: adapterResult.provider ?? null,
    result: {
      answer: adapterResult.answer ?? '',
      sources: Array.isArray(adapterResult.sources) ? adapterResult.sources : [],
      confidence: adapterResult.confidence ?? null
    },
    tokens_used: {
      in: Number(adapterResult.tokens_used?.in) || 0,
      out: Number(adapterResult.tokens_used?.out) || 0
    }
  }
}

function formatError(message, code) {
  return {
    status: 'error',
    error: message,
    code
  }
}

module.exports = { format, formatError }
