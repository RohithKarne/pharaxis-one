const { requestJson, toBool } = require('./integrations/httpClient')

function stringifyRecord(record) {
  const pairs = Object.entries(record || {})
    .filter(([, value]) => value !== null && value !== undefined)
    .slice(0, 60)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
  return pairs.join('\n')
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim()
  }

  const chunks = []
  const outputs = Array.isArray(data?.output) ? data.output : []
  for (const item of outputs) {
    const content = Array.isArray(item?.content) ? item.content : []
    for (const block of content) {
      if (typeof block?.text === 'string') chunks.push(block.text)
      if (typeof block?.output_text === 'string') chunks.push(block.output_text)
    }
  }

  return chunks.join('\n').trim()
}

function parseScorePayload(text, fallback) {
  try {
    const parsed = JSON.parse(text)
    const recommendation = Number(parsed.recommendation)
    const confidence = Number(parsed.confidence)
    return {
      recommendation: Number.isFinite(recommendation) ? Math.max(0, Math.min(100, recommendation)) : fallback.recommendation,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : fallback.confidence,
      rationale: String(parsed.rationale || fallback.rationale)
    }
  } catch (_error) {
    return {
      ...fallback,
      rationale: `${fallback.rationale} (LLM response parsing fallback applied)`
    }
  }
}

async function callOpenAi(systemPrompt, userPrompt, maxOutputTokens = 450) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Missing required environment variable: OPENAI_API_KEY')

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini'

  const response = await requestJson(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: {
      model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userPrompt }]
        }
      ],
      max_output_tokens: maxOutputTokens,
      temperature: 0.2
    }
  })

  return {
    model,
    text: extractOutputText(response.data)
  }
}

async function generateAiSummary({ moduleKey, entityType, entityId, record, fallbackText }) {
  const useLive = toBool(process.env.LLM_LIVE_ENABLED, false)
  if (!useLive) {
    return {
      mode: 'fallback',
      modelLabel: 'sprint2-rules-engine',
      summaryText: fallbackText,
      confidenceScore: 86
    }
  }

  const systemPrompt = [
    'You are an assistant for medical affairs workflow reviews.',
    'Generate a concise summary for internal reviewers.',
    'State objective facts only. Mention material risks.',
    'Do not approve or reject. Human decision is mandatory.'
  ].join(' ')

  const userPrompt = [
    `Module: ${moduleKey}`,
    `Entity type: ${entityType}`,
    `Entity id: ${entityId}`,
    'Record data:',
    stringifyRecord(record)
  ].join('\n')

  try {
    const llm = await callOpenAi(systemPrompt, userPrompt, 420)
    const summaryText = llm.text || fallbackText
    return {
      mode: 'live',
      modelLabel: llm.model,
      summaryText,
      confidenceScore: 91
    }
  } catch (error) {
    if (toBool(process.env.LLM_REQUIRE_LIVE, false)) {
      throw error
    }
    return {
      mode: 'fallback',
      modelLabel: 'sprint2-rules-engine',
      summaryText: fallbackText,
      confidenceScore: 86,
      warning: error.message
    }
  }
}

async function generateAiScore({ moduleKey, entityType, entityId, record, fallbackScore }) {
  const useLive = toBool(process.env.LLM_LIVE_ENABLED, false)
  if (!useLive) {
    return {
      mode: 'fallback',
      modelLabel: 'sprint2-rules-engine',
      score: fallbackScore
    }
  }

  const systemPrompt = [
    'You are a decision-support model for medical affairs teams.',
    'Provide a recommendation score from 0 to 100, confidence 0 to 100, and rationale.',
    'Output JSON with keys recommendation, confidence, rationale.',
    'No autonomous decisions. Human override is mandatory.'
  ].join(' ')

  const userPrompt = [
    `Module: ${moduleKey}`,
    `Entity type: ${entityType}`,
    `Entity id: ${entityId}`,
    'Record data:',
    stringifyRecord(record)
  ].join('\n')

  try {
    const llm = await callOpenAi(systemPrompt, userPrompt, 300)
    return {
      mode: 'live',
      modelLabel: llm.model,
      score: parseScorePayload(llm.text, fallbackScore)
    }
  } catch (error) {
    if (toBool(process.env.LLM_REQUIRE_LIVE, false)) {
      throw error
    }
    return {
      mode: 'fallback',
      modelLabel: 'sprint2-rules-engine',
      score: {
        ...fallbackScore,
        rationale: `${fallbackScore.rationale} (LLM fallback: ${error.message})`
      }
    }
  }
}

module.exports = {
  generateAiSummary,
  generateAiScore
}
