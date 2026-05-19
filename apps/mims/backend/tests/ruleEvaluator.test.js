'use strict';

const { evaluateRule, evaluateCondition } = require('../../shared/services/ruleEvaluator');

describe('case form rule evaluator', () => {
  test('equals operator matches strings', () => {
    expect(evaluateCondition({ field: 'outcome', op: '=', value: 'Fatal' }, { outcome: 'Fatal' })).toBe(true);
  });

  test('not equals operator rejects same value', () => {
    expect(evaluateCondition({ field: 'status', op: '!=', value: 'Closed' }, { status: 'Open' })).toBe(true);
  });

  test('greater than operator compares numeric values', () => {
    expect(evaluateCondition({ field: 'age', op: '>', value: 17 }, { age: 18 })).toBe(true);
  });

  test('greater than or equal operator compares numeric values', () => {
    expect(evaluateCondition({ field: 'score', op: '>=', value: 10 }, { score: 10 })).toBe(true);
  });

  test('less than operator compares numeric values', () => {
    expect(evaluateCondition({ field: 'days', op: '<', value: 5 }, { days: 4 })).toBe(true);
  });

  test('less than or equal operator compares numeric values', () => {
    expect(evaluateCondition({ field: 'days', op: '<=', value: 5 }, { days: 5 })).toBe(true);
  });

  test('IN operator checks array membership', () => {
    expect(evaluateCondition({ field: 'priority', op: 'IN', value: ['High', 'Critical'] }, { priority: 'Critical' })).toBe(true);
  });

  test('NOT_IN operator checks missing membership', () => {
    expect(evaluateCondition({ field: 'channel', op: 'NOT_IN', value: ['Phone'] }, { channel: 'Email' })).toBe(true);
  });

  test('EMPTY operator detects blank values', () => {
    expect(evaluateCondition({ field: 'narrative', op: 'EMPTY' }, { narrative: '' })).toBe(true);
  });

  test('NOT_EMPTY operator detects present values', () => {
    expect(evaluateCondition({ field: 'narrative', op: 'NOT_EMPTY' }, { narrative: 'Observed rash' })).toBe(true);
  });

  test('REGEX operator validates pattern match', () => {
    expect(evaluateCondition({ field: 'code', op: 'REGEX', value: '^[A-Z]{2}-\\d+$' }, { code: 'AE-100' })).toBe(true);
  });

  test('compound AND conditions require every condition', () => {
    expect(evaluateCondition({ and: [
      { field: 'outcome', op: '=', value: 'Fatal' },
      { field: 'country', op: '=', value: 'US' },
    ] }, { outcome: 'Fatal', country: 'US' })).toBe(true);
  });

  test('compound OR conditions require one condition', () => {
    expect(evaluateCondition({ or: [
      { field: 'outcome', op: '=', value: 'Fatal' },
      { field: 'serious', op: '=', value: true },
    ] }, { outcome: 'Recovered', serious: true })).toBe(true);
  });

  test('compound NOT conditions invert the nested condition', () => {
    expect(evaluateCondition({ not: { field: 'status', op: '=', value: 'Closed' } }, { status: 'Open' })).toBe(true);
  });

  test('nested AND/OR/NOT conditions evaluate predictably', () => {
    expect(evaluateCondition({
      and: [
        { field: 'case_type', op: 'IN', value: ['AE', 'PC'] },
        { or: [
          { field: 'severity', op: '=', value: 'Critical' },
          { not: { field: 'country', op: '=', value: 'US' } },
        ] },
      ],
    }, { case_type: 'AE', severity: 'Normal', country: 'CA' })).toBe(true);
  });

  test('visibility rule returns false when the condition does not match', () => {
    expect(evaluateRule({ rule_type: 'visibility', condition_json: { field: 'outcome', op: '=', value: 'Fatal' }, action_json: { action: 'show' } }, { outcome: 'Recovered' })).toBe(false);
  });
});
