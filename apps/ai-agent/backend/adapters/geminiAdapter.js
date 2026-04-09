const { GoogleGenerativeAI } = require('@google/generative-ai')
const PROVIDER = 'gemini'

function buildResult(answer, tokenIn, tokenOut) {
  return {
    answer,
    sources: [],
    confidence: null,
    tokens_used: { in: tokenIn, out: tokenOut },
    provider: PROVIDER
  }
}

function buildEmptyResult() {
  return buildResult('', 0, 0)
}

function normalizeErrorCode(error) {
  const rawCode = String(error?.code || '').toUpperCase()
  const status = Number(error?.status || error?.statusCode || error?.response?.status)
  const name = String(error?.name || '')
  const message = String(error?.message || '').toLowerCase()

  if (
    rawCode === 'ETIMEDOUT' ||
    rawCode === 'ECONNABORTED' ||
    name.includes('Timeout') ||
    message.includes('timeout')
  ) {
    return 'TIMEOUT'
  }

  if (status === 401 || status === 403 || rawCode === 'UNAUTHORIZED') {
    return 'AUTH_ERROR'
  }

  if (status === 429 || rawCode.includes('RATE') || message.includes('rate limit')) {
    return 'RATE_LIMIT'
  }

  if (status >= 400 && status < 500) {
    return 'BAD_REQUEST'
  }

  return 'PROVIDER_ERROR'
}

function toAdapterError(error) {
  const code = normalizeErrorCode(error)
  const messagesByCode = {
    TIMEOUT: 'Gemini request timed out.',
    AUTH_ERROR: 'Gemini authentication failed.',
    RATE_LIMIT: 'Gemini rate limit exceeded.',
    BAD_REQUEST: 'Gemini rejected the request.',
    PROVIDER_ERROR: 'Gemini request failed.'
  }

  return {
    message: messagesByCode[code],
    code,
    provider: PROVIDER
  }
}

// Standard response shape: { answer, sources, confidence, tokens_used: { in, out }, provider }
async function query({ apiKey, prompt, context }) {
  void context

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
    const result = await model.generateContent(prompt)
    const response = result?.response
    const answer = typeof response?.text === 'function' ? response.text() : ''

    if (typeof answer !== 'string' || !answer.trim()) {
      return buildEmptyResult()
    }

    return buildResult(
      answer,
      Number(response?.usageMetadata?.promptTokenCount) || 0,
      Number(response?.usageMetadata?.candidatesTokenCount) || 0
    )
  } catch (error) {
    throw toAdapterError(error)
  }
}

module.exports = { query }
