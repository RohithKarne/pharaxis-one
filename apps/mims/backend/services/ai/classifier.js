'use strict';

function classifyText(text = '') {
  const s = String(text).toLowerCase();
  // Whole words only, and no guess when nothing matches: every unmatched email
  // used to come back as 'MI' (a YouTube terms-of-service notice was tagged
  // Medical Information, M-21). caseType null means "no keyword hint".
  // "Hospital" alone is where many senders work ("Dr Priya Shah, St Mary's
  // Hospital"), so it no longer flags an AE or high urgency — being admitted does (MIPM-198).
  const admitted = /\b(admitted|taken|went|rushed) to (the )?hospital\b/.test(s);
  const isAe = admitted || /\b(adverse|side effects?|reactions?|rash|hospitali[sz]ed|fatal|death|died)\b/.test(s);
  const isPc = /\b(complaints?|defects?|defective|broken|leak(ed|ing|s)?|packaging)\b/.test(s);
  const isMi = /\b(dose|dosage|dosing|interactions?|pregnan(t|cy)|breastfeeding|lactation|storage|stability|contraindicat(ed|ion|ions)|off-label|medical information|formulation|excipients?|shelf life)\b/.test(s);
  const urgency = admitted || /\b(fatal|death|life threatening|hospitali[sz]ed|emergency|serious)\b/.test(s) ? 'High' : /\b(urgent|asap)\b/.test(s) ? 'Medium' : 'Normal';
  return {
    caseType: isAe ? 'AE' : isPc ? 'PC' : isMi ? 'MI' : null,
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
