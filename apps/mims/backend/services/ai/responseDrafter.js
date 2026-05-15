'use strict';

function draftResponse(caseData = {}, context = []) {
  const citations = context.slice(0, 3).map((item, i) => ({ source_id: item.id || item.source_id || `doc-${i + 1}`, title: item.title || item.name || 'Approved content' }));
  return {
    text: `Dear Customer,\n\nThank you for contacting Medical Information. Based on the available approved content, we have prepared the following response for case ${caseData.case_number || caseData.id || ''}. Please review for medical accuracy before sending.\n\nRegards,\nMedical Information Team`,
    citations,
  };
}

module.exports = { draftResponse };
