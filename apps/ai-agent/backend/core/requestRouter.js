const { getAdapter } = require('../adapters/index')
const { buildPrompt } = require('./promptBuilder')
const { format } = require('./responseFormatter')

// Routes the request to the correct provider adapter
// req.agentKey and req.agentProvider are set by keyResolver middleware
async function routeRequest({ provider, apiKey, queryType, payload }) {
  const adapter = getAdapter(provider)
  const prompt = buildPrompt(queryType, payload)

  const result = await adapter.query({
    apiKey,
    prompt,
    context: payload.context || {}
  })

  return format(result)
}

module.exports = { routeRequest }
