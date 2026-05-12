/**
 * ecosystem.config.local.js — PM2 config for local UAT/Prod machine
 *
 * Usage on the UAT machine:
 *   pm2 start ecosystem.config.local.js   ← first time
 *   pm2 restart mims-uat                   ← on subsequent deploys
 *   pm2 save                               ← persist across machine restarts
 *   pm2 startup                            ← auto-start PM2 on boot
 *
 * This is separate from ecosystem.config.js (which targets the AWS EC2 server).
 * The app name is 'mims-uat' to avoid conflicts if both configs ever coexist.
 */

module.exports = {
  apps: [
    {
      name: 'mims-uat',
      script: 'server.js',
      cwd: __dirname + '/backend',
      max_memory_restart: '400M',
      restart_delay: 3000,
      watch: false,                  // no hot-reload in UAT — use deploy.sh
      env: {
        NODE_ENV: 'production',
        PORT: 4001,
        HOST: '0.0.0.0',             // listen on all interfaces so LAN peers can connect

        // ── Database (same MySQL server as dev, separate UAT database) ──────────
        MYSQL_HOST:     '127.0.0.1',
        MYSQL_PORT:     '3306',
        MYSQL_USER:     'devuser',
        MYSQL_PASSWORD: 'devpass',
        MYSQL_DATABASE: 'pharaxis_mims_uat',

        // ── Redis ────────────────────────────────────────────────────────────────
        REDIS_URL: 'redis://127.0.0.1:6379',

        // ── Auth — change this to a real secret before sharing with external users
        JWT_SECRET: 'mims-uat-local-jwt-secret-change-before-external-use',
        SESSION_CACHE_TTL_SECONDS: '60',

        // ── SMTP / IMAP timeouts ─────────────────────────────────────────────────
        SMTP_CONNECT_TIMEOUT_MS: '15000',
        IMAP_CONNECT_TIMEOUT_MS: '10000',
        IMAP_SOCKET_TIMEOUT_MS:  '30000',

        // ── Email worker ─────────────────────────────────────────────────────────
        EMAIL_WORKER_POLL_MS:   '15000',
        EMAIL_WORKER_BATCH_SIZE: '5',

        // ── Workflow cache ───────────────────────────────────────────────────────
        WORKFLOW_CACHE_TTL_SECONDS: '300',

        // ── CORS — allow frontend served by PM2 itself ───────────────────────────
        MIMS_FRONTEND_BASE_URL:      'http://localhost:4001/mims',
        MIMS_BACKEND_BASE_URL:       'http://localhost:4001',
        MIMS_ALLOWED_FRONTEND_ORIGINS: 'http://localhost:4001,http://127.0.0.1:4001,http://192.168.0.145:4001',
      },
      // PM2 log config — logs to ~/.pm2/logs/
      out_file: '~/.pm2/logs/mims-uat-out.log',
      error_file: '~/.pm2/logs/mims-uat-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
}
