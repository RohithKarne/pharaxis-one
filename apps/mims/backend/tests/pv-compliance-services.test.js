jest.mock('../database/db', () => ({ execute: jest.fn(), query: jest.fn() }));

const { clockStatus } = require('../services/haClockService');
const { generalizeDob, generalizePostal } = require('../services/piiRedactionService');
const { applyNaranjoScore } = require('../services/causalityService');
const { parseAck } = require('../services/pv/ackParser');
const { generateE2BXml } = require('../services/pv/e2bGenerator');

describe('PV compliance helper services', () => {
  test('HA clock status is green above seven days', () => {
    expect(clockStatus(new Date('2026-06-01T00:00:00Z'), new Date('2026-05-16T00:00:00Z')).status).toBe('green');
  });
  test('HA clock status is amber from two to seven days', () => {
    expect(clockStatus(new Date('2026-05-20T00:00:00Z'), new Date('2026-05-16T00:00:00Z')).status).toBe('amber');
  });
  test('HA clock status is red below two days', () => {
    expect(clockStatus(new Date('2026-05-17T00:00:00Z'), new Date('2026-05-16T00:00:00Z')).status).toBe('red');
  });
  test('DOB generalization keeps year only', () => {
    expect(generalizeDob('1980-04-21')).toBe('1980');
  });
  test('postal generalization keeps first three characters', () => {
    expect(generalizePostal('560001')).toBe('560');
  });
  test('Naranjo helper maps high score to certain', () => {
    expect(applyNaranjoScore({ score: 10 })).toBe('certain');
  });
  test('ACK parser detects ACK1 transport acknowledgement', () => {
    const parsed = parseAck('<MCCI_IN200100UV01><acknowledgementcode>accepted</acknowledgementcode></MCCI_IN200100UV01>');
    expect(parsed.level).toBe('ACK1');
    expect(parsed.ack_status).toBe('accepted');
  });
  test('E2B generator maps follow-up and drug role codes', () => {
    const xml = generateE2BXml({
      report: { id: 1, case_id: 10, org_id: 5, receiver_id: 'FDA', sender_safety_report_id: 'ORG-2026-1', submission_type: 'followup' },
      drugs: [{ id: 7, role: 'concomitant', drug_name_verbatim: 'Drug B' }],
      reactions: [],
      causality: [],
    });
    expect(xml).toContain('<senderreporttype>2</senderreporttype>');
    expect(xml).toContain('<drugcharacterization>2</drugcharacterization>');
  });
});
