const nodemailer = require('nodemailer')

function parseNumber(value, fallback) {
  const num = Number.parseInt(value, 10)
  return Number.isFinite(num) ? num : fallback
}

function createTransport(configMap) {
  const host = configMap.smtp_host || process.env.SMTP_HOST || ''
  const port = parseNumber(configMap.smtp_port || process.env.SMTP_PORT, 587)
  const user = configMap.smtp_user || process.env.SMTP_USER || ''
  const pass = configMap.smtp_password || process.env.SMTP_PASSWORD || ''

  if (!host || !user || !pass) {
    return nodemailer.createTransport({
      jsonTransport: true
    })
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    }
  })
}

async function sendMail({ configMap = {}, to, subject, html, text }) {
  const transport = createTransport(configMap)
  const fromEmail = configMap.smtp_from_email || process.env.SMTP_FROM_EMAIL || 'no-reply@pharaxis.one'

  const info = await transport.sendMail({
    from: fromEmail,
    to,
    subject,
    text,
    html
  })

  return {
    messageId: info.messageId,
    envelope: info.envelope,
    accepted: info.accepted || [],
    rejected: info.rejected || []
  }
}

module.exports = {
  sendMail
}
