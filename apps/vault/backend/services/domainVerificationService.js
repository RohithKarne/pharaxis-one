const dns = require('dns').promises
const { pool } = require('../database/db')
const { logInfo, logWarn } = require('./logger')
const { runWithDbLock } = require('./distributedLock')

const CNAME_TARGET = process.env.VAULT_CNAME_TARGET || 'hosted.pharaxisvault.com'

async function verifyCname(domain) {
  try {
    const records = await dns.resolveCname(domain)
    const matched = records.some(r => r.toLowerCase() === CNAME_TARGET.toLowerCase())
    return { verified: matched, records }
  } catch (err) {
    return { verified: false, error: err.message }
  }
}

async function provisionSsl(orgId, domain) {
  // Placeholder: in production this triggers ACME / AWS ACM certificate provisioning
  // When full infra integration is in place, replace this with the provider SDK call
  logInfo('ssl_provision_requested', { orgId, domain })
  await pool.execute(
    `UPDATE custom_domains SET ssl_provisioned = 1, ssl_provisioned_at = NOW(),
     onboarding_status = 'ssl_provisioning' WHERE org_id = ?`,
    [orgId]
  )
  if (String(process.env.DOMAIN_SSL_AUTO_ACTIVATE || '').toLowerCase() === 'true') {
    await activateDomain(orgId)
  }
}

async function activateDomain(orgId) {
  await pool.execute(
    `UPDATE custom_domains SET onboarding_status = 'active', activated_at = NOW() WHERE org_id = ?`,
    [orgId]
  )
  logInfo('domain_activated', { orgId })
  await sendWelcomeEmail(orgId)
}

async function sendWelcomeEmail(orgId) {
  try {
    const [[domainRow]] = await pool.execute(
      'SELECT domain, welcome_sent FROM custom_domains WHERE org_id = ?',
      [orgId]
    )
    if (!domainRow || domainRow.welcome_sent) return

    const [[admin]] = await pool.execute(
      `SELECT u.id, u.name, u.email FROM users u
       WHERE u.org_id = ? AND u.role = 'admin' AND u.is_active = 1
       ORDER BY u.created_at ASC LIMIT 1`,
      [orgId]
    )
    if (!admin) {
      logWarn('welcome_email_no_admin', { orgId })
      return
    }

    // Placeholder: replace with actual email service (SES / nodemailer) call
    logInfo('welcome_email_sent', {
      orgId,
      recipientEmail: admin.email,
      vaultUrl: `https://${domainRow.domain}`
    })

    await pool.execute(
      'UPDATE custom_domains SET welcome_sent = 1 WHERE org_id = ?',
      [orgId]
    )
  } catch (err) {
    logWarn('welcome_email_failed', { orgId, error: err.message })
  }
}

async function runOnboardingPoller() {
  try {
    const [pending] = await pool.execute(
      `SELECT org_id, domain FROM custom_domains
       WHERE onboarding_status IN ('cname_pending', 'domain_added')`,
    )
    for (const row of pending) {
      const result = await verifyCname(row.domain)
      if (result.verified) {
        await pool.execute(
          `UPDATE custom_domains SET cname_verified = 1, cname_verified_at = NOW(),
           onboarding_status = 'cname_verified' WHERE org_id = ?`,
          [row.org_id]
        )
        logInfo('cname_verified', { orgId: row.org_id, domain: row.domain })
        await provisionSsl(row.org_id, row.domain)
      }
    }
  } catch (err) {
    logWarn('onboarding_poller_error', { error: err.message })
  }
}

function registerDomainPollerCron() {
  const INTERVAL_MS = 15 * 60 * 1000
  setInterval(async () => {
    try {
      await runWithDbLock('vault:cron:domain-poller', 1, runOnboardingPoller)
    } catch (error) {
      logWarn('domain_poller_lock_error', { error: error.message })
    }
  }, INTERVAL_MS)
  logInfo('domain_poller_registered', { intervalMinutes: 15 })
}

module.exports = {
  verifyCname,
  provisionSsl,
  activateDomain,
  sendWelcomeEmail,
  runOnboardingPoller,
  registerDomainPollerCron
}
