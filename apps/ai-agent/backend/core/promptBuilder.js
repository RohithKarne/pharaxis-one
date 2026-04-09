function stringifyContext(context) {
  if (context === undefined || context === null) {
    return 'No additional context provided.'
  }

  if (typeof context === 'string') {
    return context.trim() || 'No additional context provided.'
  }

  try {
    return JSON.stringify(context, null, 2)
  } catch {
    return String(context)
  }
}

function getPromptInputs(payload) {
  const safePayload = payload && typeof payload === 'object' ? payload : {}
  const queryValue = safePayload.query

  const query = typeof queryValue === 'string'
    ? queryValue.trim()
    : stringifyContext(queryValue)

  return {
    query: query || 'No query supplied.',
    context: stringifyContext(safePayload.context)
  }
}

const PROMPT_BUILDERS = {
  document_search: (payload) => {
    const { query, context } = getPromptInputs(payload)

    return `Task: Retrieve the most relevant documents for a pharmaceutical/healthcare user request.

User query:
${query}

Available context:
${context}

Instructions:
1. Identify the best-matching documents from the context.
2. Prioritise accuracy and policy-safe answers.
3. Return concise rationale for each document match.

Output format:
JSON array where each item has: title, relevance_score (0-1), reason.`
  },

  faq_draft: (payload) => {
    const { query, context } = getPromptInputs(payload)

    return `Task: Draft an FAQ response using only the supplied context.

User question:
${query}

Knowledge/context:
${context}

Instructions:
1. Produce a clear and professional FAQ draft.
2. Do not invent facts that are not supported by context.
3. If context is insufficient, state what is missing.

Output format:
A plain-language FAQ draft answer.`
  },

  content_expiry_suggestion: (payload) => {
    const { query, context } = getPromptInputs(payload)

    return `Task: Suggest replacement or follow-up content for expiring assets.

Expiring content query:
${query}

Current catalog/context:
${context}

Instructions:
1. Suggest relevant replacement documents or content items.
2. Explain why each suggestion is suitable.
3. Prefer active and contextually close alternatives.

Output format:
JSON array where each item has: title, reason.`
  }
}

function buildPrompt(queryType, payload) {
  const builder = PROMPT_BUILDERS[queryType]

  if (!builder) {
    throw new Error(
      `Unsupported query_type: ${queryType}. Supported query types are: document_search, faq_draft, content_expiry_suggestion.`
    )
  }

  return builder(payload)
}

module.exports = { buildPrompt }
