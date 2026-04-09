// Phase 2 — Document Chunking Engine
// Splits large documents into optimal token-sized chunks before sending to provider
// Interface defined now. Implementation deferred to Phase 2.

function chunk(_documentText, _maxTokens = 2000) {
  // Phase 2: split document into chunks respecting token limit
  // Return array of chunk strings
  return [_documentText]
}

function estimateTokens(text) {
  // Phase 2: estimate token count (approx 4 chars per token)
  return Math.ceil(text.length / 4)
}

module.exports = { chunk, estimateTokens }
