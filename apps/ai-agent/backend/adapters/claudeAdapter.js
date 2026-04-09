const Anthropic = require('@anthropic-ai/sdk')

// Standard response shape: { answer, sources, confidence, tokens_used: { in, out }, provider }
async function query({ apiKey, prompt, context }) {
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: 'You are a helpful assistant for a pharmaceutical and healthcare platform.',
    messages: [{ role: 'user', content: prompt }]
  })

  return {
    answer: response.content[0]?.text || '',
    sources: context?.sources || [],
    confidence: null,
    tokens_used: {
      in: response.usage?.input_tokens || 0,
      out: response.usage?.output_tokens || 0
    },
    provider: 'claude'
  }
}

module.exports = { query }
