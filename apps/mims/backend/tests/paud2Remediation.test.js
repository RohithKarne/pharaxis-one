'use strict';

/**
 * PAUD-2 remediation — MIMS items 12, 4, 3 and 1.
 *
 * Item 12 is why this file leads with authentication. `requireAccessNotExpired`
 * was written, exported, and mounted on nothing: a contractor whose access
 * expired last month still passed every API call. The test that matters is
 * T12.2 — it drives the real `authenticate` middleware, because a unit test of
 * `requireAccessNotExpired` on its own passed happily throughout the whole
 * period the control was doing nothing.
 *
 * No database. The pool, the session cache and the JWT secret are mocked, and
 * the tokens are really signed and really verified.
 */

const jwt = require('jsonwebtoken');

// Value leads with "test" deliberately — scripts/security-scan.sh exempts that
// prefix, and this is a signing key for locally-minted tokens, not a credential.
const SECRET = 'test-paud2-signing-key';
const DAY = 24 * 60 * 60 * 1000;

// ── Item 12 — expired org access is refused ─────────────────────────────────

describe('PAUD-2 item 12 — access expiry is enforced', () => {
  function loadAuth({ accessExpiresAt }) {
    const execute = jest.fn(async (sql) => {
      if (/FROM sessions/.test(sql)) {
        return [[{ id: 1, expires_at: new Date(Date.now() + DAY) }]];
      }
      if (/user_org_access/.test(sql)) {
        return [accessExpiresAt === undefined ? [] : [{ access_expires_at: accessExpiresAt }]];
      }
      return [[]];
    });

    let auth;
    jest.isolateModules(() => {
      jest.doMock('../database/db', () => ({ execute }));
      jest.doMock('../utils/jwtSecret', () => SECRET);
      jest.doMock('../services/redisClient', () => ({
        sessionCacheGet: jest.fn().mockResolvedValue(null),
        sessionCacheSet: jest.fn().mockResolvedValue(undefined),
        sessionCacheInvalidate: jest.fn().mockResolvedValue(undefined),
      }));
      auth = require('../middleware/auth');
    });
    return { auth, execute };
  }

  function callAuthenticate(auth, claims) {
    const token = jwt.sign(claims, SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      statusCode: null,
      payload: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.payload = body; return this; },
    };
    const next = jest.fn();
    return auth.authenticate(req, res, next).then(() => ({ req, res, next }));
  }

  const CONTRACTOR = { userId: 9, email: 'contractor@cro.example', role: 'user', orgId: 4 };

  test('T12.1 a user whose access has not expired is let through', async () => {
    const { auth } = loadAuth({ accessExpiresAt: new Date(Date.now() + DAY) });
    const { res, next } = await callAuthenticate(auth, CONTRACTOR);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  test('T12.2 a user whose access expired yesterday is refused', async () => {
    // The whole item, in one assertion. Before the fix this called next().
    const { auth } = loadAuth({ accessExpiresAt: new Date(Date.now() - DAY) });
    const { res, next } = await callAuthenticate(auth, CONTRACTOR);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.payload.error_code).toBe('ORG_ACCESS_EXPIRED');
  });

  test('T12.3 an open-ended grant (no expiry date) still works', async () => {
    const { auth } = loadAuth({ accessExpiresAt: null });
    const { next } = await callAuthenticate(auth, CONTRACTOR);
    expect(next).toHaveBeenCalled();
  });

  test('T12.4 a platform admin is not gated on org access', async () => {
    const { auth } = loadAuth({ accessExpiresAt: new Date(Date.now() - DAY) });
    const { next } = await callAuthenticate(auth, {
      userId: 1, email: 'admin@pharaxis.example', role: 'platform_admin', platformAdmin: true, orgId: 4,
    });
    expect(next).toHaveBeenCalled();
  });

  test('T12.5 the expiry lookup actually happened', async () => {
    // Guards against a future refactor that keeps the tests green by removing
    // the query rather than the expiry.
    const { auth, execute } = loadAuth({ accessExpiresAt: new Date(Date.now() - DAY) });
    await callAuthenticate(auth, CONTRACTOR);

    const looked = execute.mock.calls.some(([sql]) => /user_org_access/.test(sql));
    expect(looked).toBe(true);
  });
});

// ── Item 4 — the safety reporting clock ─────────────────────────────────────

describe('PAUD-2 item 4 — MI-to-safety conversion preserves the clock start', () => {
  // The scenario throughout: a call taken on the Monday, converted on the
  // Friday. Four days of a fifteen-day clock hung on which date got stored.
  const RECEIVED = new Date('2026-07-27T09:15:00Z');

  function loadService({ sourceCase }) {
    const execute = jest.fn(async (sql) => {
      if (/FROM case_mi m JOIN cases c/.test(sql)) return [[sourceCase]];
      if (/^\s*INSERT INTO cases/.test(sql)) return [{ insertId: 900 }];
      if (/^\s*INSERT/.test(sql)) return [{ insertId: 1 }];
      return [[]];
    });

    let service;
    jest.isolateModules(() => {
      jest.doMock('../database/db', () => ({ execute }));
      service = require('../services/caseConversionService');
    });
    return { service, execute };
  }

  const SOURCE = {
    id: 12, case_id: 5, org_id: 4, site_id: 1, case_number: 'MI-2026-0005',
    question_summary: 'Patient reported a rash after the second dose',
    source_date_received: RECEIVED, source_awareness_date: null,
  };

  function caseInsert(execute) {
    return execute.mock.calls.find(([sql]) => /^\s*INSERT INTO cases/.test(sql));
  }

  test('T4.1 the new safety case does not start its clock on the conversion day', async () => {
    // The defect: date_received was CURRENT_DATE() and awareness_date was never
    // set, so a Monday call converted on Friday lost four days of a 15-day clock.
    const { service, execute } = loadService({ sourceCase: SOURCE });
    await service.convertMiToAe(12, 77);

    const [sql, params] = caseInsert(execute);
    expect(sql).not.toMatch(/CURRENT_DATE\(\)/);
    expect(params).toContain(RECEIVED);
  });

  test('T4.2 awareness_date is carried so haClockService has a start to read', async () => {
    // selectClockStart() reads awareness_date first. Leaving it null was what
    // silently pushed the clock to the conversion date.
    const { service, execute } = loadService({ sourceCase: SOURCE });
    await service.convertMiToAe(12, 77);

    const [sql, params] = caseInsert(execute);
    expect(sql).toMatch(/awareness_date/);
    expect(params).toContain(RECEIVED);
  });

  test('T4.3 an awareness date already on the source case wins over its receipt date', async () => {
    const awareness = new Date('2026-07-28T08:00:00Z');
    const { service, execute } = loadService({
      sourceCase: { ...SOURCE, source_awareness_date: awareness },
    });
    await service.convertMiToAe(12, 77);

    const [, params] = caseInsert(execute);
    expect(params).toContain(awareness);
  });

  test('T4.4 a legacy source row with no dates still converts', async () => {
    // Older rows predate these columns. Failing the conversion would be worse
    // than falling back to today, so long as it is not the silent default.
    const { service, execute } = loadService({
      sourceCase: { ...SOURCE, source_date_received: null, source_awareness_date: null },
    });
    const result = await service.convertMiToAe(12, 77);

    expect(result.case_id).toBe(900);
    expect(caseInsert(execute)).toBeDefined();
  });

  test('T4.5 product complaints carry the same dates', async () => {
    const { service, execute } = loadService({ sourceCase: SOURCE });
    await service.convertMiToPc(12, 77);

    const [, params] = caseInsert(execute);
    expect(params).toContain(RECEIVED);
  });
});

// ── Item 3 — retired documents cannot be sent ───────────────────────────────

describe('PAUD-2 item 3 — the response builder refuses unusable documents', () => {
  function loadService({ documentRows }) {
    const execute = jest.fn(async (sql) => {
      if (/FROM cases c/.test(sql))         return [[{ id: 5, case_number: 'MI-1', case_type: 'MI', org_id: 4, site_id: 1 }]];
      if (/FROM case_mi mi/.test(sql))      return [[{ id: 2, case_id: 5, question_summary: 'Dosing in renal impairment' }]];
      if (/FROM case_contacts cc/.test(sql))return [[{ case_contact_id: 1, first_name: 'Ada', last_name: 'Byron', email: 'ada@nhs.example' }]];
      if (/FROM cm_documents d/.test(sql))  return [documentRows];
      return [[]];
    });

    let service;
    jest.isolateModules(() => {
      jest.doMock('../database/db', () => ({ execute }));
      service = require('../services/miResponseService');
    });
    return { service, execute };
  }

  const req = { user: { userId: 3, orgId: 4, role: 'user' } };
  const LIVE = {
    id: 11, doc_id: 'SRD-011', name: 'Renal dosing SRD', doc_type: 'SRD',
    standard_response_text: '<p>Reduce the dose.</p>', selected_modules: null,
  };

  function documentQuery(execute) {
    return execute.mock.calls.find(([sql]) => /FROM cm_documents d/.test(sql));
  }

  test('T3.1 an approved, in-date document is still usable', async () => {
    const { service } = loadService({ documentRows: [LIVE] });
    const pkg = await service.buildResponsePackage(req, 5, { selected_document_ids: [11] });

    expect(pkg.selected_documents.map((d) => d.id)).toEqual([11]);
  });

  test('T3.2 the query filters on approval status and expiry', async () => {
    const { service, execute } = loadService({ documentRows: [LIVE] });
    await service.buildResponsePackage(req, 5, { selected_document_ids: [11] });

    const [sql] = documentQuery(execute);
    expect(sql).toMatch(/d\.status\s*=\s*'Approved'/);
    expect(sql).toMatch(/expiry_date/);
    expect(sql).toMatch(/activation_date/);
  });

  test('T3.3 a document the filter rejected fails loudly, it is not dropped', async () => {
    // The dangerous failure is the quiet one: the author selects a retired SRD,
    // the query returns nothing for it, and a response goes out missing the
    // content they thought they attached. Refuse the whole build instead.
    const { service } = loadService({ documentRows: [] });

    await expect(
      service.buildResponsePackage(req, 5, { selected_document_ids: [11] })
    ).rejects.toThrow(/not available/i);
  });

  test('T3.4 the error names the document that cannot be used', async () => {
    const { service } = loadService({ documentRows: [] });

    const err = await service
      .buildResponsePackage(req, 5, { selected_document_ids: [11, 12] })
      .catch((e) => e);

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/11/);
    expect(err.message).toMatch(/12/);
  });

  test('T3.5 a response with no documents is unaffected', async () => {
    const { service } = loadService({ documentRows: [] });
    const pkg = await service.buildResponsePackage(req, 5, {});

    expect(pkg.selected_documents).toEqual([]);
  });
});

// ── Item 1 — a caller's earlier cases ───────────────────────────────────────

describe('PAUD-2 item 1 — contact case history', () => {
  const HISTORY = [
    { id: 31, case_number: 'MI-2026-0031', case_type: 'MI', date_received: '2026-06-02', status: 'Closed', role_in_case: 'reporter' },
    { id: 44, case_number: 'MI-2026-0044', case_type: 'MI', date_received: '2026-07-19', status: 'Open',   role_in_case: 'reporter' },
  ];

  function loadRoutes({ contactOrgId, historyRows = HISTORY }) {
    const execute = jest.fn(async (sql) => {
      if (/FROM contacts WHERE id/.test(sql)) {
        return [contactOrgId === null ? [] : [{ org_id: contactOrgId }]];
      }
      if (/FROM case_contacts cc/.test(sql) && /JOIN cases/.test(sql)) return [historyRows];
      return [[]];
    });

    let router;
    jest.isolateModules(() => {
      jest.doMock('../database/db', () => ({ execute }));
      jest.doMock('../middleware/auth', () => ({
        authenticate: (req, _res, next) => { req.user = req.testUser; next(); },
      }));
      router = require('../routes/caseContacts');
    });
    return { router, execute };
  }

  // Drives the route through the express stack rather than calling a handler
  // directly, so the auth middleware and the path both count as covered.
  function callRoute(router, path, user) {
    const express = require('express');
    const app = express();
    app.use((req, _res, next) => { req.testUser = user; next(); });
    app.use('/api', router);

    const http = require('http');
    return new Promise((resolve) => {
      const server = http.createServer(app).listen(0, async () => {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`);
        const body = await res.json().catch(() => null);
        server.close();
        resolve({ status: res.status, body });
      });
    });
  }

  const MEMBER = { userId: 3, orgId: 4, role: 'user' };

  test('T1.1 a contact\'s earlier cases are returned', async () => {
    const { router } = loadRoutes({ contactOrgId: 4 });
    const { status, body } = await callRoute(router, '/cases/contacts/9/history', MEMBER);

    expect(status).toBe(200);
    expect(body.map((c) => c.case_number)).toEqual(['MI-2026-0031', 'MI-2026-0044']);
  });

  test('T1.2 the lookup is by contact, across cases', async () => {
    const { router, execute } = loadRoutes({ contactOrgId: 4 });
    await callRoute(router, '/cases/contacts/9/history', MEMBER);

    const [sql, params] = execute.mock.calls.find(([s]) => /JOIN cases/.test(s));
    expect(sql).toMatch(/cc\.contact_id\s*=\s*\?/);
    expect(sql).toMatch(/is_deleted\s*=\s*0/);
    expect(params).toContain('9');
  });

  test('T1.3 a contact in another org is refused', async () => {
    // The whole point of the feature is showing one person's history across
    // cases. Getting the org boundary wrong here leaks more than a single case.
    const { router } = loadRoutes({ contactOrgId: 99 });
    const { status } = await callRoute(router, '/cases/contacts/9/history', MEMBER);

    expect(status).toBe(403);
  });

  test('T1.4 an unknown contact is refused, not answered with an empty list', async () => {
    const { router } = loadRoutes({ contactOrgId: null });
    const { status } = await callRoute(router, '/cases/contacts/9/history', MEMBER);

    expect(status).toBe(403);
  });

  test('T1.5 a platform admin is not blocked by the org check', async () => {
    const { router } = loadRoutes({ contactOrgId: 99 });
    const { status } = await callRoute(router, '/cases/contacts/9/history', {
      userId: 1, orgId: 1, role: 'platform_admin', platformAdmin: true,
    });

    expect(status).toBe(200);
  });
});
