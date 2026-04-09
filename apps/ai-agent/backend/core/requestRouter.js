const { getAdapter } = require('../adapters/index')
const { buildPrompt } = require('./promptBuilder')
const { format } = require('./responseFormatter')

async function routeRequest({ provider, apiKey, queryType, payload }) {
  const adapter = getAdapter(provider)
  const prompt = buildPrompt(queryType, payload)
  const adapterResult = await adapter.query({
    apiKey,
    prompt,
    context: payload?.context || {}
  })

  return format(adapterResult)
}

module.exports = { routeRequest }
