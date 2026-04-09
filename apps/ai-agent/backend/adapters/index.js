const openaiAdapter = require('./openaiAdapter')
const claudeAdapter = require('./claudeAdapter')
const geminiAdapter = require('./geminiAdapter')

const ADAPTERS = {
  openai: openaiAdapter,
  claude: claudeAdapter,
  gemini: geminiAdapter
}

function getAdapter(provider) {
  const adapter = ADAPTERS[provider]
  if (!adapter) {
    throw new Error(`Unsupported provider: ${provider}`)
  }
  return adapter
}

module.exports = { getAdapter }
