'use strict';

const { inputSecurityMiddleware } = require('../middleware/inputSecurity');

function runMiddleware(reqOverrides = {}) {
  const req = {
    baseUrl: '/api',
    path: '/health',
    params: {},
    query: {},
    body: undefined,
    ...reqOverrides,
  };

  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };

  let nextCalled = false;
  inputSecurityMiddleware(req, res, () => {
    nextCalled = true;
  });

  return { req, res, nextCalled };
}

describe('inputSecurityMiddleware', () => {
  test('allows oauth callback state values that resemble hostile edge patterns', () => {
    const result = runMiddleware({
      path: '/auth/sso/google/callback',
      query: {
        state: 'eyJhbGciOiJIUzI1NiJ9.payload-with--segment.signature',
        code: '4/0AQSTgQ_example',
      },
    });

    expect(result.nextCalled).toBe(true);
    expect(result.res.statusCode).toBe(200);
    expect(result.req.query.state).toBe('eyJhbGciOiJIUzI1NiJ9.payload-with--segment.signature');
  });

  test('still blocks the same pattern on non-SSO routes', () => {
    const result = runMiddleware({
      path: '/cases',
      query: {
        state: 'eyJhbGciOiJIUzI1NiJ9.payload-with--segment.signature',
      },
    });

    expect(result.nextCalled).toBe(false);
    expect(result.res.statusCode).toBe(400);
    expect(result.res.payload).toEqual({
      error: 'Invalid input at req.query.state: unsafe pattern detected.',
    });
  });

  test('still blocks script injection on SSO callback parameters', () => {
    const result = runMiddleware({
      path: '/auth/sso/google/callback',
      query: {
        state: '<script>alert(1)</script>',
      },
    });

    expect(result.nextCalled).toBe(false);
    expect(result.res.statusCode).toBe(400);
    expect(result.res.payload).toEqual({
      error: 'Invalid input at req.query.state: script injection pattern detected.',
    });
  });
});
