/**
 * auth.test.js — API tests for /api/auth routes
 * Uses Jest + Supertest against the real Express app.
 */

const request = require('supertest')

// Import the Express app without starting the server
// server.js must export `app` for this to work (see note below)
let app

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

async function loginWithCandidates() {
  const failures = [];
  for (const candidate of getLoginCandidates()) {
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
