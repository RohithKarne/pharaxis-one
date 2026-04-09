const openaiAdapter = require('./openaiAdapter')
const claudeAdapter = require('./claudeAdapter')
const geminiAdapter = require('./geminiAdapter')

const ADAPTERS = {
  openai: openaiAdapter,
  claude: claudeAdapter,
  gemini: geminiAdapter
}

function getAdapter(provider) {
  const normalizedProvider = typeof provider === 'string' ? provider.trim().toLowerCase() : ''
  const adapter = ADAPTERS[normalizedProvider]
  if (!adapter) {
    throw new Error(
      `Unsupported provider "${provider}". Supported providers are: openai, claude, gemini.`
    )
  }
  return adapter
}

module.exports = { getAdapter }
