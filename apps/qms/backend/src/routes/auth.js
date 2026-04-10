import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDbPool } from '../db/pool.js';
import { env } from '../config/env.js';

export const authRouter = Router();

authRouter.get('/providers', (_req, res) => {
  res.json({
    jwt: true,
    keycloak: Boolean(env.KEYCLOAK_JWKS_URI)
  });
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password, orgCode } = req.body || {};

    if (!email || !password || !orgCode) {
      return res.status(400).json({
        error: 'email, password, and orgCode are required'
      });
    }

    const pool = getDbPool();
    const query = `
      SELECT
        u.id,
        u.org_id,
        u.email::text AS email,
        u.full_name,
        u.role_key,
        o.org_code
      FROM qms_users u
      JOIN qms_orgs o ON o.id = u.org_id
      WHERE lower(u.email) = lower($1)
        AND o.org_code = $2
        AND u.is_active = true
        AND u.password_hash = crypt($3, u.password_hash)
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [email, orgCode, password]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        orgId: user.org_id,
        roles: [user.role_key],
        email: user.email,
        name: user.full_name
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return res.json({
      tokenType: 'Bearer',
      accessToken: token,
      expiresIn: env.JWT_EXPIRES_IN,
      user: {
        id: user.id,
        orgId: user.org_id,
        email: user.email,
        fullName: user.full_name,
        roleKey: user.role_key,
        orgCode: user.org_code
      }
    });
  } catch (error) {
    return next(error);
  }
});
