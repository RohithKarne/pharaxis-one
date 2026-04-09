const Anthropic = require('@anthropic-ai/sdk')
const PROVIDER = 'claude'

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
    TIMEOUT: 'Claude request timed out.',
    AUTH_ERROR: 'Claude authentication failed.',
    RATE_LIMIT: 'Claude rate limit exceeded.',
    BAD_REQUEST: 'Claude rejected the request.',
    PROVIDER_ERROR: 'Claude request failed.'
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
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: 'You are a helpful assistant for a pharmaceutical and healthcare platform.',
      messages: [{ role: 'user', content: prompt }]
    })

    const answer = Array.isArray(response?.content)
      ? response.content
          .filter((part) => part?.type === 'text')
          .map((part) => part?.text || '')
          .join('')
      : ''

    if (!answer.trim()) {
      return buildEmptyResult()
    }

    return buildResult(
      answer,
      Number(response?.usage?.input_tokens) || 0,
      Number(response?.usage?.output_tokens) || 0
    )
  } catch (error) {
    throw toAdapterError(error)
  }
}

module.exports = { query }
