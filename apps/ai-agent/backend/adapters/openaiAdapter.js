const OpenAI = require('openai')

// Standard response shape: { answer, sources, confidence, tokens_used: { in, out }, provider }
async function query({ apiKey, prompt, context }) {
  const client = new OpenAI({ apiKey })

  const messages = [
    { role: 'system', content: 'You are a helpful assistant for a pharmaceutical and healthcare platform.' },
    { role: 'user', content: prompt }
  ]

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.3
  })

  const choice = response.choices[0]

  return {
    answer: choice.message.content,
    sources: context?.sources || [],
    confidence: null, // OpenAI does not return confidence score natively
    tokens_used: {
      in: response.usage?.prompt_tokens || 0,
      out: response.usage?.completion_tokens || 0
    },
    provider: 'openai'
  }
}

module.exports = { query }
