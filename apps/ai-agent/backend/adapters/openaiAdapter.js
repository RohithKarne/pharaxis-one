const OpenAI = require('openai')
const PROVIDER = 'openai'

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
    TIMEOUT: 'OpenAI request timed out.',
    AUTH_ERROR: 'OpenAI authentication failed.',
    RATE_LIMIT: 'OpenAI rate limit exceeded.',
    BAD_REQUEST: 'OpenAI rejected the request.',
    PROVIDER_ERROR: 'OpenAI request failed.'
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
    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant for a pharmaceutical and healthcare platform.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    })

    const answer = response?.choices?.[0]?.message?.content
    if (typeof answer !== 'string' || !answer.trim()) {
      return buildEmptyResult()
    }

    return buildResult(
      answer,
      Number(response?.usage?.prompt_tokens) || 0,
      Number(response?.usage?.completion_tokens) || 0
    )
  } catch (error) {
    throw toAdapterError(error)
  }
}

module.exports = { query }
