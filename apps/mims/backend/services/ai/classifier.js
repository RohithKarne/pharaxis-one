'use strict';

function classifyText(text = '') {
  const s = String(text).toLowerCase();
  const isAe = /(adverse|side effect|reaction|rash|hospital|fatal|death|serious)/.test(s);
  const isPc = /(complaint|defect|broken|leak|packaging|quality)/.test(s);
  const urgency = /(fatal|death|life threatening|hospital|emergency|serious)/.test(s) ? 'High' : /(urgent|asap|important)/.test(s) ? 'Medium' : 'Normal';
  return {
    caseType: isAe ? 'AE' : isPc ? 'PC' : 'MI',
    urgency,
    productGuess: extractAfter(text, /(product|drug|medicine)[:\s-]+([^\n,.]+)/i),
    therapyAreaGuess: extractAfter(text, /(therapy|area|indication)[:\s-]+([^\n,.]+)/i),
  };
}

function extractAfter(text, regex) {
  const match = String(text || '').match(regex);
  return match ? match[2].trim().slice(0, 120) : null;
}

module.exports = { classifyText };
