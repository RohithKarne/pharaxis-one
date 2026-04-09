// Constructs the prompt string from query_type and payload
// As prompt templates mature in Phase 2, templateStore will augment this

const PROMPT_BUILDERS = {
  document_search: (payload) => {
    return `You are searching a pharmaceutical content library.
Find the most relevant documents for the following user query.
Return a ranked list with a short explanation of why each document is relevant.

Query: ${payload.query}

${payload.context?.documents ? `Available documents:\n${JSON.stringify(payload.context.documents, null, 2)}` : ''}

Respond with a JSON array: [{ "title": "...", "relevance_score": 0.0-1.0, "reason": "..." }]`
  },

  faq_draft: (payload) => {
    return `You are a medical information specialist drafting a response to a frequently asked question.
Use only the provided knowledge base content. Do not make up information.

Question: ${payload.query}

${payload.context?.knowledge_base ? `Knowledge base:\n${payload.context.knowledge_base}` : ''}

Draft a clear, accurate response. Flag if the question cannot be answered from the available content.`
  },

  content_expiry_suggestion: (payload) => {
    return `A document in a pharmaceutical content library is expiring soon.
Suggest relevant replacement or related active documents.

Expiring document: ${payload.query}
${payload.context?.available_documents ? `Active documents available:\n${JSON.stringify(payload.context.available_documents, null, 2)}` : ''}

Return a JSON array of suggested replacements: [{ "title": "...", "reason": "..." }]`
  }
}

function buildPrompt(queryType, payload) {
  const builder = PROMPT_BUILDERS[queryType]
  if (!builder) {
    throw new Error(`Unsupported query_type: ${queryType}`)
  }
  return builder(payload)
}

module.exports = { buildPrompt }
