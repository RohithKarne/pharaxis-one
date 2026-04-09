const { GoogleGenerativeAI } = require('@google/generative-ai')

// Standard response shape: { answer, sources, confidence, tokens_used: { in, out }, provider }
async function query({ apiKey, prompt, context }) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

  const result = await model.generateContent(prompt)
  const response = result.response

  return {
    answer: response.text(),
    sources: context?.sources || [],
    confidence: null,
    tokens_used: {
      in: response.usageMetadata?.promptTokenCount || 0,
      out: response.usageMetadata?.candidatesTokenCount || 0
    },
    provider: 'gemini'
  }
}

module.exports = { query }
