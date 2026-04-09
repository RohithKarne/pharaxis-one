// Phase 2 — Prompt Template Registry
// Pre-built prompt templates per query type and app source
// Reduces prompt construction overhead once patterns stabilise in Phase 1
// Interface defined now. Implementation deferred to Phase 2.

async function getTemplate(_appSource, _queryType) {
  // Phase 2: fetch active template from ai_agent_prompt_templates table
  return null
}

async function saveTemplate(_appSource, _queryType, _templateBody) {
  // Phase 2: insert or update template version
}

module.exports = { getTemplate, saveTemplate }
