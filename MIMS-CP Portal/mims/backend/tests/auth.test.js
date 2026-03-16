/**
 * auth.test.js — API tests for /api/auth routes
 * Uses Jest + Supertest against the real Express app.
 */

const request = require('supertest')

// Import the Express app without starting the server
// server.js must export `app` for this to work (see note below)
let app

beforeAll(() => {
  // Suppress console output during tests
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
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

  it('returns 200 + token for valid superadmin credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@scimax.com', password: 'superadmin123' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body).toHaveProperty('user')
  })
})

describe('GET /api/admin/orgs — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/orgs')
    expect(res.status).toBe(401)
  })

  it('returns 200 with valid token', async () => {
    // Login first to get token
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@scimax.com', password: 'superadmin123' })
    const token = login.body.token

    const res = await request(app)
      .get('/api/admin/orgs')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('orgs')
  })
})
