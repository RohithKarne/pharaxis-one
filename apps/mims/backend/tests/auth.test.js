/**
 * auth.test.js — API tests for /api/auth routes
 * Uses Jest + Supertest against the real Express app.
 */

const request = require('supertest')
const bcrypt = require('bcrypt')

// Import the Express app without starting the server
// server.js must export `app` for this to work (see note below)
let app

// ── Self-provisioned login fixture ─────────────────────────────────────────
// QA 2026-07-31 (DEF-3): these tests used to log in with whatever ambient
// credentials happened to exist — env vars that are not set, plus a hardcoded
// `vanaja_admin@reviewco.com`. That account belonged to the Vanaja role
// eliminated on 2026-04-14, so it no longer exists. Both happy-path assertions
// had been failing ever since and were repeatedly dismissed as "known baseline
// seed failures" — which meant the LOGIN HAPPY PATH had no automated coverage
// at all.
//
// Per SOP §29 a test must provision its own fixture and never depend on manual
// or ambient setup. This one now creates its user, and deletes it afterwards.
const FIXTURE_EMAIL = 'auth.fixture@mims-test.local'
const FIXTURE_PASSWORD = 'Fixture-9d41c7ba!Auth'
let fixtureUserId = null

async function createFixtureUser(pool) {
  const hash = await bcrypt.hash(FIXTURE_PASSWORD, 10)
  await destroyFixtureUser(pool)
  const [res] = await pool.query(
    `INSERT INTO users (name, email, password, role, is_active, org_id,
                        password_reset_required, email_verified, initials)
     VALUES ('Auth Fixture', ?, ?, 'platform_admin', 1, NULL, 0, 1, 'AF')`,
    [FIXTURE_EMAIL, hash]
  )
  fixtureUserId = res.insertId
  await pool.query(
    `INSERT INTO user_org_access (user_id, org_id, primary_site_id, role_at_org,
                                 site_permission, is_active, site_access_scope, approved_by, approved_at)
     VALUES (?, 1, 1, 'admin', 'full', 1, 'primary', 1, NOW())`,
    [fixtureUserId]
  )
  for (const mod of ['mims_core', 'admin_console', 'reports']) {
    await pool.query(
      'INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, 1)',
      [fixtureUserId, mod]
    )
  }
  return fixtureUserId
}

async function destroyFixtureUser(pool) {
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [FIXTURE_EMAIL])
  for (const row of rows) {
    await pool.query('DELETE FROM user_module_permissions WHERE user_id = ?', [row.id])
    await pool.query('DELETE FROM user_org_access WHERE user_id = ?', [row.id])
    await pool.query('DELETE FROM users WHERE id = ?', [row.id])
  }
  fixtureUserId = null
}

function getLoginCandidates() {
  const raw = [
    {
      email: process.env.BOOTSTRAP_PLATFORM_ADMIN_EMAIL || 'platform_admin',
      password: process.env.BOOTSTRAP_PLATFORM_ADMIN_PASSWORD || '',
    },
    {
      email: process.env.REGRESSION_FALLBACK_EMAIL || '',
      password: process.env.REGRESSION_FALLBACK_PASSWORD || '',
    },
    {
      email: process.env.REGRESSION_EMAIL || '',
      password: process.env.REGRESSION_PASSWORD || '',
    },
    {
      email: 'vanaja_admin@reviewco.com',
      password: 'Test@1234',
    },
  ];

  const seen = new Set();
  return raw.filter((candidate) => {
    const email = String(candidate.email || '').trim();
    const password = String(candidate.password || '');
    if (!email || !password) return false;
    const key = `${email}::${password}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Tries the fixture user first, then any ambient credentials that happen to be
// configured. The fixture guarantees the happy path is always exercised; the
// ambient candidates are kept so a CI environment with real seeded credentials
// still works.
async function loginWithCandidates() {
  const failures = [];
  const candidates = [
    { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD },
    ...getLoginCandidates(),
  ];

  for (const candidate of candidates) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: candidate.email, password: candidate.password });

    if (res.status === 200 && res.body?.token) return res;

    if (res.status === 200 && res.body?.challengeToken) {
      const skip = await request(app)
        .post('/api/auth/2fa/skip-setup')
        .send({ challengeToken: res.body.challengeToken });
      if (skip.status === 200 && skip.body?.token) return skip;
      failures.push(`challenge status ${skip.status} for ${candidate.email}`);
      continue;
    }

    failures.push(`login status ${res.status} for ${candidate.email}`);
  }

  // Fail loudly with the reason — a silent skip here would hide the fact that
  // login has no coverage, which is exactly how this went unnoticed before.
  throw new Error(`No valid login candidate worked: ${failures.join(' | ')}`);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  // Suppress console output during tests
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  const db = require('../database/db')
  await db.initPromise
  app = require('../server').app
  await createFixtureUser(db)
})

afterAll(async () => {
  const db = require('../database/db')
  await destroyFixtureUser(db)
})

describe('POST /api/auth/login', () => {
  it('returns 400 if email or password missing', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })

  it('returns 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'wrongpass' })
    expect(res.status).toBe(401)
  })

  it('returns 200 + token for valid platform admin credentials', async () => {
    const res = await loginWithCandidates()
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
  })
})

describe('GET /api/admin/orgs — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/orgs')
    expect(res.status).toBe(401)
  })

  it('returns 200 with valid token', async () => {
    const login = await loginWithCandidates()
    const token = login.body.token

    const res = await request(app)
      .get('/api/admin/orgs')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('orgs')
  })
})
