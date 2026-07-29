/**
 * Admin SSO — /api/admin/sso
 * Per-client OIDC single sign-on configuration (Microsoft Entra / Google).
 * Client secrets are encrypted at rest (utils/secretCrypto) and never echoed —
 * reads return a masked hint only, and a masked value sent back on save is ignored
 * so the stored secret is preserved (same contract as the Integration screen).
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { encryptSecret, decryptSecret } = require('../../utils/secretCrypto');
const sso = require('../../services/ssoService');

// Providers we support. The UI always shows both slots (configured or empty).
const SUPPORTED = [
  { key: 'microsoft', label: 'Microsoft', tenantRequired: true },
  { key: 'google',    label: 'Google',    tenantRequired: false },
];

function maskSecret(value) {
  const plain = String(value || '');
  if (!plain) return null;
  return plain.length <= 4 ? 'Configured' : '••••' + plain.slice(-4);
}

// GET /api/admin/sso/:clientId — login mode + one entry per supported provider
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const client = await sso.getClientById(req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const rows = await sso.getProviderRows(client.id);
    const byKey = Object.fromEntries(rows.map(r => [r.provider_key, r]));

    const providers = SUPPORTED.map(({ key, label, tenantRequired }) => {
      const row = byKey[key];
      const configured = !!(row && row.oidc_client_id && row.client_secret_encrypted);
      return {
        provider_key: key,
        label,
        tenant_required: tenantRequired,
        oidc_client_id: row?.oidc_client_id || '',
        tenant_id: row?.tenant_id || (tenantRequired ? 'common' : ''),
        allowed_domains: (row?.allowed_domains || []).join(', '),
        is_active: !!row?.is_active,
        configured,
        // Never send the secret; a hint only so the admin knows one is stored.
        client_secret_masked: row?.client_secret_encrypted ? maskSecret(decryptSecret(row.client_secret_encrypted)) : null,
        // The redirect URI the client must register with their IdP.
        redirect_uri: `${(process.env.CP_BACKEND_BASE_URL || `http://localhost:${process.env.CP_PORT || 4000}`).replace(/\/+$/, '')}/api/portal/auth/sso/${key}/callback`,
        updated_at: row?.updated_at || null,
      };
    });

    res.json({
      login_mode: sso.normalizeLoginMode(client.login_mode),
      providers,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/sso/:clientId — save login mode + provider configs
router.put('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const client = await sso.getClientById(req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const loginMode = sso.normalizeLoginMode(req.body.login_mode);
    await pool.execute('UPDATE cp_clients SET login_mode = ?, updated_at = NOW() WHERE id = ?', [loginMode, client.id]);

    const incoming = Array.isArray(req.body.providers) ? req.body.providers : [];
    for (const item of incoming) {
      const providerKey = sso.normalizeProviderKey(item.provider_key);
      if (!providerKey) continue;

      const [[existing]] = await pool.execute(
        'SELECT client_secret_encrypted FROM cp_sso_provider_configs WHERE client_id = ? AND provider_key = ? LIMIT 1',
        [client.id, providerKey]
      );

      // A blank or masked secret means "leave the stored one untouched".
      const rawSecret = String(item.client_secret || '');
      const nextSecret = (rawSecret && !rawSecret.startsWith('••••') && rawSecret !== 'Configured')
        ? encryptSecret(rawSecret)
        : (existing?.client_secret_encrypted || null);

      const tenantId = providerKey === 'microsoft'
        ? (String(item.tenant_id || 'common').trim() || 'common')
        : null;
      const allowedDomains = sso.parseAllowedDomains(item.allowed_domains);

      await pool.execute(
        `INSERT INTO cp_sso_provider_configs
           (client_id, provider_key, provider_type, oidc_client_id, client_secret_encrypted, tenant_id, allowed_domains, is_active, updated_by)
         VALUES (?, ?, 'oidc', ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           oidc_client_id = VALUES(oidc_client_id),
           client_secret_encrypted = VALUES(client_secret_encrypted),
           tenant_id = VALUES(tenant_id),
           allowed_domains = VALUES(allowed_domains),
           is_active = VALUES(is_active),
           updated_by = VALUES(updated_by),
           updated_at = NOW()`,
        [
          client.id,
          providerKey,
          String(item.oidc_client_id || '').trim() || null,
          nextSecret,
          tenantId,
          JSON.stringify(allowedDomains),
          item.is_active ? 1 : 0,
          req.admin?.adminId || null,
        ]
      );
    }

    res.json({ message: 'SSO configuration saved.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
