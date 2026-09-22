/**
 * chatStub.js — DEVELOPMENT ONLY. Pre-recorded chat replies, so the chat box and
 * its records can be exercised end to end without an AI key or AI cost.
 *
 * On only when CHATBOX_STUB_REPLIES=1 and never when NODE_ENV=production. Every
 * reply is labelled, so a stub answer cannot be mistaken for a real one on
 * screen or in the stored record.
 */
const LABEL = '[Test reply — no AI used]';

const REPLIES = [
  [/dose|dosage|how much|how many/i, 'According to the approved prescribing information, the dose is set by the treating doctor. Please see the cited document for the approved dose ranges, and speak to your healthcare provider before making any change.'],
  [/side effect|adverse|reaction|rash|unwell|allerg/i, 'The known side effects are listed in the cited approved safety information. If you or someone you know has had a side effect, please report it using the adverse event form so our safety team can follow up.'],
  [/trial|study|studies|research/i, 'Details of ongoing and completed studies are in the cited approved material. For anything more specific, please submit a medical inquiry.'],
];
const FALLBACK = "I don't have approved information on that. Please submit a medical inquiry and our medical team will respond.";

function chatStubEnabled() {
  return process.env.CHATBOX_STUB_REPLIES === '1' && process.env.NODE_ENV !== 'production';
}

function stubReply(question, sources) {
  const hit = REPLIES.find(([re]) => re.test(question));
  const cite = hit && sources.length ? ' [1]' : '';
  return `${LABEL} ${hit ? hit[1] : FALLBACK}${cite}`;
}

module.exports = { chatStubEnabled, stubReply };
