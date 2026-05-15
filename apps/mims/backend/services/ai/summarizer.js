'use strict';

function summarizeCase(caseData = {}) {
  const parts = [caseData.case_number, caseData.case_type, caseData.subject, caseData.description, caseData.narrative].filter(Boolean);
  return `Narrative draft: ${parts.join(' | ').slice(0, 1500) || 'No structured narrative data available yet.'}`;
}

module.exports = { summarizeCase };
