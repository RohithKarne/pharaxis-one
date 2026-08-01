'use strict';
// Validates: URS-01, URS-02, URS-03, URS-04, URS-05

jest.mock('../database/db', () => ({
  execute: jest.fn(),
  initPromise: Promise.resolve(),
}));

jest.mock('../services/ssoService', () => ({
  encryptSecret: (value) => `enc:${value}`,
  decryptSecret: (value) => String(value || '').replace(/^enc:/, ''),
}));

const { generateE2BXml } = require('../services/pv/e2bGenerator');
const { validateE2BXml } = require('../services/pv/e2bValidator');
const { canTransition, transition } = require('../services/pv/icsrLifecycle');
const { classifyText } = require('../services/ai/classifier');
const { extractFields } = require('../services/ai/extractor');
const { summarizeCase } = require('../services/ai/summarizer');
const { draftResponse } = require('../services/ai/responseDrafter');
const { runQualityChecks } = require('../services/ai/qualityChecker');
const { deterministicEmbedding, tokenCount } = require('../services/ai/providerAbstraction');
const { cosine } = require('../services/ai/retriever');
const { compare } = require('../services/workflow/ruleEvaluator');
const { validateDefinition, hasCycle } = require('../services/workflow/definitionValidator');
const { traceGraph } = require('../services/workflow/executionEngine');
const { hashToken } = require('../services/api-platform/tokenIssuer');
const { signPayload } = require('../services/api-platform/webhookDispatcher');
const { computePrRor } = require('../services/pv/signalDetection');
const { buildPeriodicSafetySummary } = require('../services/pv/periodicReports');
const { sha256 } = require('../services/eSignManifestService');

describe('enterprise platform service layer', () => {
  const sampleIcsr = {
    report: { id: 1, org_id: 7, case_id: 44, sender_safety_report_id: 'ORG7-2026-000001', receiver_id: 'FDA', primary_source_country: 'US', report_type: 'spontaneous', seriousness_classification: { hospitalization: true }, narrative: 'Patient experienced rash.' },
    reactions: [{ meddra_pt_name: 'Rash', meddra_pt: '10037844', outcome: 'Recovered' }],
    drugs: [{ drug_role: 'suspect', medicinal_product_name: 'Drug A', active_substance: 'Substance A' }],
    tests: [{ test_name: 'ALT', result_text: 'Normal' }],
    history: [{ structure: 'disease', comments: 'Hypertension' }],
  };

  test('generates E2B XML with report id', () => expect(generateE2BXml(sampleIcsr)).toContain('ORG7-2026-000001'));
  test('generates E2B XML with reaction', () => expect(generateE2BXml(sampleIcsr)).toContain('Rash'));
  test('validator accepts generated XML', () => expect(validateE2BXml(generateE2BXml(sampleIcsr))).toEqual([]));
  test('validator rejects empty XML', () => expect(validateE2BXml('')).toHaveLength(1));
  test('draft can move to validated', () => expect(canTransition('draft', 'validated')).toBe(true));
  test('submitted can move to acknowledged', () => expect(canTransition('submitted', 'acknowledged')).toBe(true));
  test('acknowledged cannot move to draft', () => expect(canTransition('acknowledged', 'draft')).toBe(false));
  test('transition returns updated report', () => expect(transition({ status: 'draft' }, 'validated').status).toBe('validated'));
  test('invalid transition throws', () => expect(() => transition({ status: 'superseded' }, 'draft')).toThrow());
  test('periodic summary counts serious reports', () => expect(buildPeriodicSafetySummary({ product: 'A', reports: [{ serious: 'serious' }, {}] }).serious_cases).toBe(1));
  // MIMS-46: this used to assert `review_required === true` for
  // {a:10,b:5,c:3,d:30}. That pinned the arithmetic of the hardcoded
  // comparators, not any methodology — it passed precisely BECAUSE the flag was
  // always true, so it could never have caught the defect. Replaced with a test
  // of the property that actually mattered: with those comparators the flag
  // carries no information.
  test('hardcoded comparators make the flag unconditional — why detection is disabled', () => {
    const alwaysFlagged = [1, 2, 3, 10, 50].every(
      a => computePrRor({ a, b: 5, c: 3, d: 30 }).review_required === true
    );
    expect(alwaysFlagged).toBe(true);
  });
  test('the maths itself still discriminates when comparators are real', () => {
    // Sanity: computePrRor is not broken, it was being fed constants.
    expect(computePrRor({ a: 1, b: 500, c: 300, d: 30000 }).review_required).toBe(false);
    expect(computePrRor({ a: 400, b: 100, c: 50, d: 30000 }).review_required).toBe(true);
  });

  test('AI classifier detects AE', () => expect(classifyText('patient had serious adverse reaction').caseType).toBe('AE'));
  test('AI classifier detects PC', () => expect(classifyText('packaging defect complaint').caseType).toBe('PC'));
  test('AI extractor pulls patient initials', () => expect(extractFields('Patient: AB\nProduct: Drug A').fields.patient_initials).toBe('AB'));
  test('AI extractor pulls product', () => expect(extractFields('Product: Drug A').fields.product_name).toBe('Drug A'));
  test('AI summarizer returns narrative draft', () => expect(summarizeCase({ case_number: 'C1' })).toContain('Narrative draft'));
  test('AI response drafter cites sources', () => expect(draftResponse({ id: 1 }, [{ id: 123 }]).citations[0].source_id).toBe(123));
  test('quality checker blocks missing case type', () => expect(runQualityChecks({}).some(i => i.severity === 'block')).toBe(true));
  test('quality checker warns missing AE narrative', () => expect(runQualityChecks({ case_type: 'AE' }).some(i => i.severity === 'warn')).toBe(true));
  test('embedding has requested dimension', () => expect(deterministicEmbedding('abc', 8)).toHaveLength(8));
  test('token count is approximate', () => expect(tokenCount('12345678')).toBe(2));
  test('cosine identical vectors is one', () => expect(cosine([1, 0], [1, 0])).toBe(1));

  test('workflow equals condition', () => expect(compare({ field: 'severity', op: '=', value: 'Critical' }, { severity: 'Critical' })).toBe(true));
  test('workflow not equals condition', () => expect(compare({ field: 'severity', op: '!=', value: 'Low' }, { severity: 'Critical' })).toBe(true));
  test('workflow greater condition', () => expect(compare({ field: 'score', op: '>', value: 5 }, { score: 6 })).toBe(true));
  test('workflow IN condition', () => expect(compare({ field: 'type', op: 'IN', value: ['AE'] }, { type: 'AE' })).toBe(true));
  test('workflow AND condition', () => expect(compare({ and: [{ field: 'a', op: '=', value: 1 }, { field: 'b', op: '=', value: 2 }] }, { a: 1, b: 2 })).toBe(true));
  test('workflow OR condition', () => expect(compare({ or: [{ field: 'a', op: '=', value: 2 }, { field: 'b', op: '=', value: 2 }] }, { a: 1, b: 2 })).toBe(true));
  test('workflow regex condition', () => expect(compare({ field: 'case_number', op: 'REGEX', value: '^AE' }, { case_number: 'AE-1' })).toBe(true));
  test('definition validator requires start', () => expect(validateDefinition({ nodes: [{ id: 'e', type: 'end' }], edges: [] }).valid).toBe(false));
  test('cycle detector finds cycle', () => expect(hasCycle([{ id: 'a' }, { id: 'b' }], [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }])).toBe(true));
  test('workflow trace follows condition', () => {
    const graph = { nodes: [{ id: 's', type: 'start' }, { id: 'e', type: 'end' }], edges: [{ source: 's', target: 'e', data: { condition: { field: 'ok', op: '=', value: true } } }] };
    expect(traceGraph(graph, { ok: true }).some(t => t.node_id === 'e')).toBe(true);
  });

  test('hash token is stable sha256', () => expect(hashToken('abc')).toHaveLength(64));
  test('webhook signing is stable', () => expect(signPayload('s', { a: 1 })).toBe(signPayload('s', { a: 1 })));
  test('sha256 helper hashes content', () => expect(sha256('abc')).toHaveLength(64));
});
