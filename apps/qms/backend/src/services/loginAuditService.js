export async function recordLoginAudit(client, params) {
  const {
    orgId = null,
    email = null,
    loginSurface,
    outcome,
    reason = null,
    ipAddress = null,
    userAgent = null
  } = params;

  await client.query(
    `
      INSERT INTO qms_login_audit (
        org_id,
        email,
        login_surface,
        outcome,
        reason,
        ip_address,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [orgId, email, loginSurface, outcome, reason, ipAddress, userAgent]
  );
}

export function readRequestMeta(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .find(Boolean);
  const ipAddress = forwarded || req.ip || null;
  const userAgent = req.headers['user-agent'] || null;
  return { ipAddress, userAgent };
}
