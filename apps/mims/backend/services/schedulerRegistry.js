'use strict';
/**
 * services/schedulerRegistry.js — Single source of truth for all background jobs.
 *
 * Add a new entry here → it auto-appears in the Service Dashboard.
 * scheduler.js reads this for cron job metadata (handlers stay there).
 * The service-dashboard API route reads this for the full job list.
 *
 * type:        'cron'       — runs on a cron schedule via node-cron
 *              'standalone' — own cron/process, not in the main scheduler registry
 *              'poll'       — setInterval-based poll loop, no cron expression
 *
 * configRoute: frontend route user is taken to when they click "Configure".
 *              null = no dedicated config page yet (button shows disabled).
 */

module.exports = [
  // ── Cron jobs (managed by scheduler.js) ──────────────────────────────────
  {
    name:           'runtime-health-watch',
    source:         'Platform Operations',
    cronExpression: '*/5 * * * *',
    description:    'Runs the runtime health check and alerts platform admins when it degrades',
    type:           'cron',
    configRoute:    null,
  },
  {
    name:           'expiry-alerts',
    source:         'Case Management',
    cronExpression: '0 8 * * *',
    description:    'Runs expiry alert checks for cases approaching deadline',
    type:           'cron',
    configRoute:    '/admin-console/sites',
  },
  {
    name:           'cm-expiry-alerts',
    source:         'Content Management',
    cronExpression: '0 7 * * *',
    description:    'Runs CM document expiry alert checks',
    type:           'cron',
    configRoute:    '/browse-content',
  },
  {
    name:           'cm-module-lifecycle',
    source:         'Content Management',
    cronExpression: '45 6 * * *',
    description:    'Archives expired modules and cascades archive to linked documents',
    type:           'cron',
    configRoute:    '/browse-content',
  },
  {
    name:           'cm-content-auto-archive',
    source:         'Content Management',
    cronExpression: '0 5 * * *',
    description:    'Auto-archives published documents and FAQs whose expiry date has passed',
    type:           'cron',
    configRoute:    '/browse-content',
  },
  {
    name:           'cm-review-reminders',
    source:         'Content Management',
    cronExpression: '0 8 * * 1',
    description:    'Sends review cycle reminders for published documents due for review',
    type:           'cron',
    configRoute:    '/browse-content',
  },
  {
    name:           'emir-poller',
    source:         'Email Import',
    cronExpression: '*/5 * * * *',
    description:    'Polls EMIR mailbox for new incoming emails',
    type:           'cron',
    configRoute:    '/admin-console/emir-int',
  },
  {
    name:           'scheduled-exports',
    source:         'Reports',
    cronExpression: '*/15 * * * *',
    description:    'Checks and dispatches timezone-aware scheduled export jobs',
    type:           'cron',
    configRoute:    '/reports',
  },
  {
    name:           'case-transmission-sla',
    source:         'Transmissions',
    cronExpression: '*/30 * * * *',
    description:    'Refreshes transmission SLA states and sends escalation alerts',
    type:           'cron',
    configRoute:    '/transmissions',
  },
  {
    name:           'inbox-operational-sla',
    source:         'Inbox',
    cronExpression: '*/30 * * * *',
    description:    'Refreshes inbox SLA breach alerts for first touch and response',
    type:           'cron',
    configRoute:    '/admin-console/sites',
  },
  {
    name:           'case-state-sla',
    source:         'Cases',
    cronExpression: '*/15 * * * *',
    description:    'WP8: flags workflow-state SLA breaches and escalates them to the case owner + escalation target',
    type:           'cron',
    configRoute:    '/admin-console/sla',
  },
  {
    name:           'notification-delivery-retry',
    source:         'Notifications',
    cronExpression: '*/10 * * * *',
    description:    'Retries failed notification deliveries scheduled for retry',
    type:           'cron',
    configRoute:    '/admin-console/sites',
  },
  {
    name:           'webhook-delivery-dispatch',
    source:         'Developer Platform',
    cronExpression: '*/2 * * * *',
    description:    'Dispatches signed public API webhooks and schedules retries on failures',
    type:           'cron',
    configRoute:    '/developer',
  },
  {
    name:           'workflow-sla-timers',
    source:         'Workflow Engine',
    cronExpression: '*/1 * * * *',
    description:    'Checks workflow SLA timers and records escalation timer events',
    type:           'cron',
    configRoute:    '/mims-admin?system=sys-setup-workflow-engine',
  },
  {
    name:           'pv-signal-detection',
    source:         'Pharmacovigilance',
    cronExpression: '0 3 * * *',
    description:    'Runs daily product-reaction signal detection for active tenants',
    type:           'cron',
    configRoute:    '/cases',
  },
  {
    name:           'login-audit-archive',
    source:         'Security',
    cronExpression: '0 2 * * *',
    description:    'Deletes login audit records older than configured retention period',
    type:           'cron',
    configRoute:    '/admin-console/audit-login',
  },
  {
    name:           'session-cleanup',
    source:         'Security',
    cronExpression: '*/30 * * * *',
    description:    'Prunes expired rows from the sessions table to prevent unbounded growth',
    type:           'cron',
    configRoute:    '/session-management',
  },

  // ── Standalone schedulers (own cron, not in main scheduler registry) ──────
  {
    name:           'dppr-enforcement',
    source:         'DPPR',
    cronExpression: '0 2 * * *',
    description:    'DPPR daily enforcement engine — anonymizes or deletes PII per active rules',
    type:           'standalone',
    configRoute:    '/dppr',
  },

  // ── Poll workers (setInterval-based, no cron expression) ─────────────────
  {
    name:         'email-worker',
    source:       'Email Delivery',
    cronExpression: null,
    pollInterval: 'Every 15s',
    description:  'Async MI response email delivery worker — polls job queue and dispatches SMTP',
    type:         'poll',
    configRoute:  '/admin-console/email-accounts',
  },
]
