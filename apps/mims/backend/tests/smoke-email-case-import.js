'use strict';

/**
 * smoke-email-case-import.js — Email Case Import engine smoke test (MIMS-29)
 *
 * Exercises the full auto-import pipeline against the live dev DB:
 *   1. AE structured email  → auto-creates case (Email Intake state, awareness
 *      date = received ts, reporter mapped, AE skeleton, source record, comment)
 *   2. Hidden-AE email      → needs_review (asymmetric rule), NO case created
 *   3. Missing-fields email → needs_review, NO case created
 *   4. Junk email           → left in inbox, NO case created, nothing deleted
 *   5. Follow-up (thread)   → attaches to case from (1), NO second case
 *   6. SLA sweep            → escalates the case from (1) once aged
 *
 * Seeds config + intake fields for the target org, runs, asserts, cleans up
 * everything it created. Run: node tests/smoke-email-case-import.js
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../database/db');
const eci = require('../services/emailCaseImportService');

const ORG_ID = 1; // Novartis (seeded dev org with active agents)
const TAG = `ecismoke-${Date.now()}`;

let pass = 0;
let fail = 0;
function assert(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name} ${detail}`); }
}

async function insertInquiry({ subject, body, sender, messageId }) {
  const [r] = await pool.execute(
    `INSERT INTO inquiries (org_id, email_account_id, message_id, sender, recipient, subject, body, received_at, status, attachments_count, source_tag)
     VALUES (?, NULL, ?, ?, 'intake@test.local', ?, ?, ?, 'inbox', 0, 'Email')`,
    [ORG_ID, messageId || null, sender, subject, body, new Date().toISOString().replace('T', ' ').substring(0, 19)]
  );
  return r.insertId;
}

async function main() {
  console.log(`Email Case Import smoke — org ${ORG_ID}, tag ${TAG}\n`);

  // ── Seed org config + intake field definitions ────────────────────────────
  // Capture the org's real settings, not just whether a row exists. The smoke
  // forces confidence_threshold to 0.750 for its fixtures, and an earlier
  // version restored only `is_enabled` — so every run silently left the org on a
  // threshold nobody had evaluated (the governance gate is run at 0.850).
  // Found in QA 2026-07-31: org 1 was sitting at 0.750 because of this.
  const [[existingCfg]] = await pool.execute(
    'SELECT id, is_enabled, confidence_threshold, ack_enabled FROM email_case_import_config WHERE org_id = ?',
    [ORG_ID]);
  await pool.execute(
    `INSERT INTO email_case_import_config (org_id, is_enabled, confidence_threshold, ack_enabled)
     VALUES (?, 1, 0.750, 0)
     ON DUPLICATE KEY UPDATE is_enabled = 1, confidence_threshold = 0.750, ack_enabled = 0`,
    [ORG_ID]
  );
  await pool.execute(
    `INSERT INTO intake_field_definitions (org_id, field_key, label, target_entity, target_field, is_required, sort_order)
     VALUES (?, 'reporter_name', 'Reporter Name', 'reporter', 'first_name', 1, 1),
            (?, 'reporter_email_field', 'Contact Email', 'reporter', 'email', 0, 2),
            (?, 'product_name', 'Product', 'case', 'description', 1, 3)
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [ORG_ID, ORG_ID, ORG_ID]
  );

  const createdInquiries = [];
  const createdCases = [];

  try {
    // ── 1. AE structured → auto-create ──────────────────────────────────────
    console.log('Scenario 1: structured AE email → auto-create');
    const inq1 = await insertInquiry({
      subject: `Adverse event report ${TAG}`,
      body: `Reporter Name: Jane Tester\nContact Email: jane@example.com\nProduct: Cardizem\n\nMy mother was hospitalized after taking this medication. She had a severe allergic reaction with swelling and vomiting after taking it.`,
      sender: `Jane Tester <jane.${TAG}@example.com>`,
      messageId: `<orig-${TAG}@example.com>`,
    });
    createdInquiries.push(inq1);
    const r1 = await eci.processInquiry({
      inquiryId: inq1,
      account: null,
      parsed: { messageId: `<orig-${TAG}@example.com>`, receivedAt: new Date() },
    });
    assert('auto-creates a case', r1.action === 'case_created', JSON.stringify(r1));
    if (r1.caseId) {
      createdCases.push(r1.caseId);
      const [[c]] = await pool.execute(
        `SELECT c.*, ws.name AS state_name FROM cases c LEFT JOIN workflow_states ws ON ws.id = c.status_id WHERE c.id = ?`,
        [r1.caseId]
      );
      assert('case_type = AE', c.case_type === 'AE', c.case_type);
      assert('case number assigned', !!c.case_number, '');
      assert('intake_channel = email', c.intake_channel === 'email', c.intake_channel);
      assert('workflow state = Email Intake', c.state_name === 'Email Intake', c.state_name);
      assert('awareness_date set (AE clock = received ts)', !!c.awareness_date, '');
      assert('agent auto-assigned', !!c.case_owner_id, 'no owner');
      const [[rep]] = await pool.execute('SELECT * FROM case_reporter WHERE case_id = ?', [r1.caseId]);
      assert('reporter first_name mapped', rep?.first_name === 'Jane Tester', rep?.first_name);
      assert('reporter email mapped (optional field)', rep?.email === 'jane@example.com', rep?.email);
      const [[ver]] = await pool.execute('SELECT * FROM case_ae_versions WHERE case_id = ?', [r1.caseId]);
      assert('AE version skeleton created', !!ver, '');
      assert('seriousness fields empty (clinical boundary)', ver && !ver.is_serious && !ver.seriousness_death, '');
      const [[src]] = await pool.execute(`SELECT * FROM email_case_sources WHERE case_id = ? AND kind = 'original'`, [r1.caseId]);
      assert('immutable source record written', !!src, '');
      assert('extraction JSON stored on source', !!src?.extraction, '');
      const [[com]] = await pool.execute(`SELECT * FROM case_comments WHERE case_id = ? AND comment LIKE '%AI-assisted%'`, [r1.caseId]);
      assert('AI-assisted label comment present', !!com, '');
      const [[inqAfter]] = await pool.execute('SELECT * FROM inquiries WHERE id = ?', [inq1]);
      assert('inquiry linked + processed', inqAfter.case_id === r1.caseId && inqAfter.status === 'processed', `${inqAfter.case_id}/${inqAfter.status}`);
    }

    // ── 2. Hidden AE → asymmetric rule forces review ────────────────────────
    console.log('Scenario 2: hidden AE inside a question → needs_review');
    const inq2 = await insertInquiry({
      subject: `Question about product ${TAG}`,
      body: `Reporter Name: Bob\nProduct: TestDrug\nHow do I store this medicine? Also my husband felt dizziness and fainted after taking it last week.`,
      sender: `bob.${TAG}@example.com`,
    });
    createdInquiries.push(inq2);
    const r2 = await eci.processInquiry({ inquiryId: inq2, account: null, parsed: {} });
    assert('routed to needs_review', r2.action === 'needs_review', JSON.stringify(r2));
    assert('possible-AE flag raised', r2.possibleAe === true, '');
    const [[inq2After]] = await pool.execute('SELECT * FROM inquiries WHERE id = ?', [inq2]);
    assert('no case created', inq2After.case_id == null, String(inq2After.case_id));
    assert('inquiry stays in inbox', inq2After.status === 'inbox', inq2After.status);
    assert('triage_state = needs_review', inq2After.triage_state === 'needs_review', inq2After.triage_state);

    // ── 3. Missing required fields → needs_review ───────────────────────────
    console.log('Scenario 3: missing required intake fields → needs_review');
    const inq3 = await insertInquiry({
      subject: `Adverse reaction ${TAG}`,
      body: 'I had a severe allergic reaction and rash after taking my medication. This was an adverse event.',
      sender: `carol.${TAG}@example.com`,
    });
    createdInquiries.push(inq3);
    const r3 = await eci.processInquiry({ inquiryId: inq3, account: null, parsed: {} });
    assert('routed to needs_review', r3.action === 'needs_review', JSON.stringify(r3));
    assert('missing-fields reason present', (r3.reasons || []).some((x) => x.includes('missing required')), JSON.stringify(r3.reasons));
    const [[inq3After]] = await pool.execute('SELECT case_id FROM inquiries WHERE id = ?', [inq3]);
    assert('no case created', inq3After.case_id == null, '');

    // ── 4. Junk → left in inbox, never dropped ──────────────────────────────
    console.log('Scenario 4: junk email → left in inbox');
    const inq4 = await insertInquiry({
      subject: `Limited time offer ${TAG}`,
      body: 'Congratulations you are a winner! Click here to claim your prize. Unsubscribe anytime. Buy now — crypto investment opportunity.',
      sender: `spam.${TAG}@example.com`,
    });
    createdInquiries.push(inq4);
    const r4 = await eci.processInquiry({ inquiryId: inq4, account: null, parsed: {} });
    assert('junk left in inbox', r4.action === 'junk_left_in_inbox', JSON.stringify(r4));
    const [[inq4After]] = await pool.execute('SELECT * FROM inquiries WHERE id = ?', [inq4]);
    assert('junk row still exists (nothing deleted)', !!inq4After, '');
    assert('junk stays in inbox status', inq4After.status === 'inbox', inq4After.status);

    // ── 5. Follow-up thread → attaches, no second case ──────────────────────
    console.log('Scenario 5: follow-up reply → attaches to existing case');
    const inq5 = await insertInquiry({
      subject: `Re: Adverse event report ${TAG}`,
      body: 'Following up on my earlier email — she is home from hospital now.',
      sender: `Jane Tester <jane.${TAG}@example.com>`,
      messageId: `<reply-${TAG}@example.com>`,
    });
    createdInquiries.push(inq5);
    const r5 = await eci.processInquiry({
      inquiryId: inq5,
      account: null,
      parsed: { messageId: `<reply-${TAG}@example.com>`, inReplyTo: [`<orig-${TAG}@example.com>`], receivedAt: new Date() },
    });
    assert('follow-up attached', r5.action === 'followup_attached', JSON.stringify(r5));
    assert('attached to the scenario-1 case', r5.caseId === createdCases[0], `${r5.caseId} vs ${createdCases[0]}`);
    const [srcRows] = await pool.execute(`SELECT kind FROM email_case_sources WHERE case_id = ?`, [createdCases[0]]);
    assert('case has original + followup sources', srcRows.length === 2, String(srcRows.length));
    const [[c1After]] = await pool.execute('SELECT follow_up_received_date FROM cases WHERE id = ?', [createdCases[0]]);
    assert('follow_up_received_date stamped', !!c1After.follow_up_received_date, '');

    // ── 6. SLA sweep escalates aged Email Intake cases ──────────────────────
    console.log('Scenario 6: SLA sweep → escalation');
    // Age the case far enough that business-hours math cannot save it (10 days).
    await pool.execute(`UPDATE cases SET created_at = DATE_SUB(NOW(), INTERVAL 240 HOUR) WHERE id = ?`, [createdCases[0]]);
    const escalated = await eci.runSlaSweep();
    const [[c1Esc]] = await pool.execute('SELECT escalated_at, escalation_reason FROM cases WHERE id = ?', [createdCases[0]]);
    assert('sweep escalated the aged case', !!c1Esc.escalated_at, `escalated count=${escalated}`);
    assert('escalation reason mentions SLA', String(c1Esc.escalation_reason || '').includes('SLA'), c1Esc.escalation_reason);

  } finally {
    // ── Cleanup — remove everything this test created ─────────────────────
    console.log('\nCleaning up…');
    for (const caseId of createdCases) {
      await pool.execute('DELETE FROM case_comments WHERE case_id = ?', [caseId]);
      await pool.execute('DELETE FROM case_reporter WHERE case_id = ?', [caseId]);
      const [vers] = await pool.execute('SELECT id FROM case_ae_versions WHERE case_id = ?', [caseId]);
      for (const v of vers) await pool.execute('DELETE FROM case_ae_events WHERE version_id = ?', [v.id]);
      await pool.execute('DELETE FROM case_ae_versions WHERE case_id = ?', [caseId]);
      await pool.execute('DELETE FROM email_case_sources WHERE case_id = ?', [caseId]);
      await pool.execute('DELETE FROM cases WHERE id = ?', [caseId]);
    }
    for (const inqId of createdInquiries) {
      await pool.execute('DELETE FROM inquiries WHERE id = ?', [inqId]);
    }
    await pool.execute(`DELETE FROM notifications WHERE event_key LIKE 'eci\\_%'`);
    await pool.execute(`DELETE FROM audit_logs WHERE user_name = 'Email Case Import'`);
    await pool.execute('DELETE FROM intake_field_definitions WHERE org_id = ? AND field_key IN (?, ?, ?)',
      [ORG_ID, 'reporter_name', 'reporter_email_field', 'product_name']);
    if (existingCfg) {
      // Restore every value the smoke overwrote, not just is_enabled.
      await pool.execute(
        `UPDATE email_case_import_config
            SET is_enabled = 0, confidence_threshold = ?, ack_enabled = ?
          WHERE org_id = ?`,
        [existingCfg.confidence_threshold, existingCfg.ack_enabled, ORG_ID]
      );
    } else {
      await pool.execute('DELETE FROM email_case_import_config WHERE org_id = ?', [ORG_ID]);
    }
  }

  console.log(`\nResult: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('SMOKE CRASHED:', err);
  process.exit(1);
});
