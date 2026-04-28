'use strict';
/**
 * patch-help-audiences.js — One-shot patch for Sprint 21 help article audiences.
 *
 * Changes:
 *  1. Fix "bottom-right" → "top-right" in Welcome article
 *  2. Add "agent" to cm.* articles so agents see relevant help on Content page
 *  3. Add "agent" to cm.reviews (agents get review tasks)
 *  4. Add "cm_admin" to admin.* articles (CM admins use some admin config sections)
 *
 * Usage:  node backend/scripts/patch-help-audiences.js
 */

const pool = require('../database/db');

const PATCHES = [
  // ── Fix welcome text ──────────────────────────────────────────────────────
  {
    title: 'Welcome to MIMS',
    content_html_patch: [
      'Click the <strong>?</strong> button at the bottom-right of any screen',
      'Click the <strong>?</strong> button at the top-right of any screen'
    ],
  },

  // ── Broaden cm.* to include agent ─────────────────────────────────────────
  { title: 'Content Folders',                audience: ['agent','cm_admin','admin','superadmin'] },
  { title: 'Managing Documents',             audience: ['agent','cm_admin','admin','superadmin'] },
  { title: 'Document Versioning & Checkout', audience: ['agent','cm_admin','admin'] },
  { title: 'Bulk Document Actions',          audience: ['cm_admin','admin'] }, // agents don't bulk-manage
  { title: 'Content Modules',               audience: ['agent','cm_admin','admin'] },
  { title: 'Response Templates',            audience: ['agent','cm_admin','admin'] },
  { title: 'Template Merge Fields Reference', audience: ['agent','cm_admin','admin'] },
  { title: 'Merge Reports',                 audience: ['agent','cm_admin','admin'] },
  { title: 'FAQs Management',               audience: ['agent','cm_admin','admin'] },
  { title: 'FAQ Approval Workflow',         audience: ['cm_admin','admin'] },
  { title: 'Content Reviews',               audience: ['agent','cm_admin','admin'] },

  // ── Broaden admin.* to include cm_admin ──────────────────────────────────
  { title: 'Managing Picklists',            audience: ['cm_admin','admin','superadmin'] },
  { title: 'Field Setup & Custom Fields',   audience: ['cm_admin','admin','superadmin'] },
  { title: 'Workflow Activities',           audience: ['cm_admin','admin','superadmin'] },
  { title: 'Product Dictionary',            audience: ['cm_admin','admin','superadmin'] },
  { title: 'Security Groups & Permissions', audience: ['admin','superadmin'] },
  { title: 'Case Numbering Configuration', audience: ['admin','superadmin'] },
  { title: 'Organisation Management',      audience: ['superadmin'] },
  { title: 'Content Intelligence — Overview', audience: ['cm_admin','admin','superadmin'] },
  { title: 'Evidence Chain Analysis',       audience: ['cm_admin','admin','superadmin'] },
  { title: 'Policy Graph',                  audience: ['cm_admin','admin','superadmin'] },
];

async function main() {
  if (pool.initPromise) await pool.initPromise;
  console.log(`\n🔧 Patching ${PATCHES.length} help articles...\n`);

  let updated = 0;

  for (const patch of PATCHES) {
    const [[row]] = await pool.execute(
      'SELECT id, content_html FROM help_articles WHERE title = ? LIMIT 1',
      [patch.title]
    );

    if (!row) {
      console.warn(`  ⚠️  Not found: "${patch.title}"`);
      continue;
    }

    const updates = [];
    const vals = [];

    if (patch.audience) {
      updates.push('audience = ?');
      vals.push(JSON.stringify(patch.audience));
    }

    if (patch.content_html_patch) {
      const [from, to] = patch.content_html_patch;
      const newHtml = row.content_html.replace(from, to);
      if (newHtml !== row.content_html) {
        updates.push('content_html = ?');
        vals.push(newHtml);
      }
    }

    if (!updates.length) {
      console.log(`  ✓ No change needed: "${patch.title}"`);
      continue;
    }

    vals.push(row.id);
    await pool.execute(
      `UPDATE help_articles SET ${updates.join(', ')}, version = version + 1, updated_at = NOW() WHERE id = ?`,
      vals
    );

    const changes = [];
    if (patch.audience) changes.push(`audience → [${patch.audience.join(', ')}]`);
    if (patch.content_html_patch) changes.push('content_html fixed');
    console.log(`  ✅ "${patch.title}" — ${changes.join(' | ')}`);
    updated++;
  }

  console.log(`\n🎉 Done — ${updated} articles patched.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Patch failed:', err);
  process.exit(1);
});
