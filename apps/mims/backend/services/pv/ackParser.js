'use strict';

function textBetween(xml, tag) {
  const m = String(xml || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : null;
}

function parseAck(xml = '') {
  const raw = String(xml || '');
  const statusText = [
    textBetween(raw, 'acknowledgementcode'),
    textBetween(raw, 'ackstatus'),
    textBetween(raw, 'status'),
  ].filter(Boolean).join(' ').toLowerCase();
  const accepted = /accept|ack01|success|ok|validated/.test(statusText) && !/reject|error|fail/.test(statusText);
  const rejected = /reject|ack02|error|fail|invalid/.test(statusText);
  const errors = [];
  const errorRegex = /<(?:error|validationerror|ackerror)[^>]*>([\s\S]*?)<\/(?:error|validationerror|ackerror)>/gi;
  let m;
  while ((m = errorRegex.exec(raw))) errors.push(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  return {
    ack_status: accepted ? 'accepted' : rejected ? 'rejected' : 'unknown',
    report_status: accepted ? 'acknowledged' : rejected ? 'rejected' : 'submitted',
    errors,
    gateway_message_id: textBetween(raw, 'messageidentifier') || textBetween(raw, 'messagenumb') || null,
  };
}

module.exports = { parseAck };
