'use strict';

/**
 * Migration 156 — give every organisation its MI categories (MIPM-201).
 *
 * New Document's MI Category list reads mi_categories, which nothing seeded, so it
 * was empty everywhere. Orgs with no categories get the case form's thirteen
 * MI Category names; an org that already set up its own is left alone.
 */

const NAMES = ['Pharmacology', 'Efficacy', 'Safety', 'Dosage', 'Pregnancy/Lactation', 'Drug Interactions', 'Adverse Event Question', 'Regulatory', 'Formulation', 'Off-Label', 'Compassionate Use', 'Clinical Trial', 'Other'];

async function up(conn) {
  const [orgs] = await conn.execute(
    'SELECT o.id FROM organisations o WHERE NOT EXISTS (SELECT 1 FROM mi_categories m WHERE m.org_id = o.id)'
  );
  for (const org of orgs) {
    for (const [i, name] of NAMES.entries()) {
      await conn.execute('INSERT INTO mi_categories (org_id, name, sort_order) VALUES (?, ?, ?)', [org.id, name, i + 1]);
    }
  }
}

async function down(_conn) {}

module.exports = { up, down };
