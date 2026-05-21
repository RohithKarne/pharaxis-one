'use strict';

/**
 * Migration 085 — Capability catalog seed (Capability-Based Security Groups, P1).
 *
 * Extends access_activity_privileges with the full operational + admin
 * feature×action catalog mapped during design. Builds on the existing 20 seeded
 * privileges (idempotent — INSERT IGNORE, so prior rows are untouched).
 *
 * Zero-regression strategy: each capability carries default_allowed_roles. The
 * existing userHasActivityPrivilege() already falls back to these, so current
 * roles keep their access on day one WITHOUT a risky bulk group-grant backfill.
 * Admins then tighten/loosen per group via the new Group Security grid.
 *
 * Ownership scope: "All records" is modelled as a companion *_all key
 * (e.g. case.update + case.update_all), matching the legacy "modify others" keys.
 */

// [privilege_key, category, label, is_sensitive, default_allowed_roles]
const OPS = 'agent,manager,admin';
const MGR = 'manager,admin';
const ADM = 'admin';

const CAPS = [
  // ── Cases — record ──
  ['case.view',        'Cases', 'View cases',            0, OPS],
  ['case.delete',      'Cases', 'Delete case',           1, MGR],
  ['case.update_all',  'Cases', "Edit others' cases",    1, MGR],
  ['case.close_all',   'Cases', "Close others' cases",   1, MGR],
  ['case.escalate',    'Cases', 'Escalate case',         0, OPS],
  // sub-objects
  ['case.comment.add',     'Cases', 'Add comments',         0, OPS],
  ['case.comment.delete',  'Cases', 'Delete comments',      1, MGR],
  ['case.contact.manage',  'Cases', 'Manage contacts',      0, OPS],
  ['case.letter.draft',    'Cases', 'Draft response letter',0, OPS],
  ['case.letter.approve',  'Cases', 'Approve letter (e-sign)',1, MGR],
  ['case.letter.send',     'Cases', 'Send response letter', 0, OPS],
  ['case.letter.supersede','Cases', 'Amend/supersede letter',1, MGR],
  ['case.ae.view',         'Cases', 'View AE component',    0, OPS],
  ['case.ae.edit',         'Cases', 'Edit AE component',    0, OPS],
  ['case.ae.submit',       'Cases', 'Submit/transmit AE',   1, MGR],
  ['case.pc.view',         'Cases', 'View PC component',    0, OPS],
  ['case.pc.edit',         'Cases', 'Edit PC component',    0, OPS],
  ['case.pc.submit',       'Cases', 'Submit/transmit PC',   1, MGR],
  ['case.icsr.view',       'Cases', 'View ICSR / regulatory',0, OPS],
  ['case.dppr.view',       'Cases', 'View privacy (DPPR)',  1, MGR],

  // ── Inbox ──
  ['inbox.view',      'Inbox', 'View inbox',        0, OPS],
  ['inbox.reply',     'Inbox', 'Reply to items',    0, OPS],
  ['inbox.forward',   'Inbox', 'Forward items',     0, OPS],
  ['inbox.notes',     'Inbox', 'Add notes',         0, OPS],
  ['inbox.bulk',      'Inbox', 'Bulk actions',      0, MGR],
  ['inbox.configure', 'Inbox', 'Configure routing/templates', 1, ADM],

  // ── Chat ──
  ['chat.view',        'Chat', 'View chat',        0, OPS],
  ['chat.participate', 'Chat', 'Participate in chat', 0, OPS],

  // ── Case Query ──
  ['casequery.view',   'Case Query', 'View case query',   0, OPS],
  ['casequery.run',    'Case Query', 'Run/maintain queries', 0, OPS],

  // ── Transmissions ──
  ['transmission.view',   'Transmissions', 'View transmissions', 0, OPS],
  ['transmission.manage', 'Transmissions', 'Manage/retry transmissions', 1, MGR],

  // ── Content ──
  ['content.browse',          'Content Management', 'Browse content',  0, OPS],
  ['content.download',        'Content Management', 'Download content', 0, OPS],
  ['content.faq.manage',      'Content Management', 'Manage FAQs',      0, MGR],
  ['content.module.manage',   'Content Management', 'Manage modules',   0, MGR],
  ['content.folder.configure','Content Management', 'Configure folders',1, ADM],
  ['content.template.configure','Content Management','Configure templates',1, ADM],

  // ── Insight ──
  ['insight.view', 'Insight', 'View Insight screen', 0, OPS],

  // ── Reports (reports.view/manage/export already seeded) ──
  ['reports.schedule', 'Reports', 'Schedule reports', 0, MGR],

  // ── Administration (screen-level) ──
  ['admin.division_parameters', 'Administration', 'Division Parameters', 1, ADM],
  ['admin.view_data',           'Administration', 'View Data',           1, ADM],
  ['admin.system_parameters',   'Administration', 'System Parameters',   1, ADM],
  ['admin.users',               'Administration', 'User Management',     1, ADM],
  ['admin.security_groups',     'Administration', 'Group Security',      1, ADM],
  ['admin.auth_policy',         'Administration', 'Auth Policy',         1, ADM],
  ['admin.tables',              'Administration', 'Tables',              1, ADM],
  ['admin.configuration',       'Administration', 'Configuration',       1, ADM],
  ['admin.escalation',          'Administration', 'Escalation setup',    1, ADM],
  ['admin.documents',           'Administration', 'Document templates',  1, ADM],
  ['admin.setup',               'Administration', 'Setup (forms/workflow/etc.)', 1, ADM],
  ['admin.exception_log',       'Administration', 'Exception Log',       1, ADM],
  ['admin.audit.view',          'Administration', 'View audit trail',    1, MGR],
  ['admin.audit.export',        'Administration', 'Export audit trail',  1, ADM],
];

async function up(conn) {
  for (const [key, category, label, sensitive, roles] of CAPS) {
    const rolesJson = JSON.stringify(roles.split(','));
    try {
      await conn.execute(
        `INSERT IGNORE INTO access_activity_privileges
           (org_id, privilege_key, category, label, is_sensitive, default_allowed_roles, is_active)
         VALUES (NULL, ?, ?, ?, ?, ?, 1)`,
        [key, category, label, sensitive, rolesJson]
      );
    } catch (e) {
      if (!/duplicate/i.test(e.message)) throw e;
    }
  }
}

async function down(_conn) {}

module.exports = { up, down };
