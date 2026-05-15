'use strict';

function runQualityChecks(caseData = {}) {
  const issues = [];
  if (!caseData.case_type) issues.push({ check_name: 'case_type_missing', severity: 'block', message: 'Case type is required.' });
  if (caseData.case_type === 'AE' && !caseData.description && !caseData.narrative) {
    issues.push({ check_name: 'ae_narrative_missing', severity: 'warn', message: 'AE narrative/event description is missing.' });
  }
  if (caseData.priority === 'High' && !caseData.owner_id) {
    issues.push({ check_name: 'high_priority_owner', severity: 'warn', message: 'High priority cases should have an owner.' });
  }
  return issues;
}

module.exports = { runQualityChecks };
