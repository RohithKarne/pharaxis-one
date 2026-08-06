'use strict';

/**
 * caseHandoffService — AE/PC handoff to an external safety/quality system.
 *
 * Guards the two things that must not regress:
 *   1. The validity gate actually blocks. A safety system that ACCEPTS a
 *      malformed case is worse than one that rejects it, because the bad record
 *      becomes the system of record (Sowmya, 2026-07-28).
 *   2. The payload stays coding-free. There is no MSSO licence, so reaction
 *      terms travel verbatim and MIMS never emits a MedDRA code (Rohith,
 *      2026-07-28). A future change that starts coding here is a licence breach,
 *      not a feature.
 */

const pool = require('../database/db');
const handoff = require('../services/caseHandoffService');

const ORG_ID = 1;
const MARKER = 'HANDOFF_TEST';

let userId;
let completeAeId;
let bareAeId;
let miId;

async function makeCase(caseType, description) {
  const [res] = await pool.query(
    `INSERT INTO cases (org_id, site_id, case_type, priority, intake_channel,
                        date_received, date_of_intake, awareness_date, description, created_by)
     VALUES (?, 1, ?, 'normal', 'manual', CURDATE(), NOW(), CURDATE(), ?, ?)`,
    [ORG_ID, caseType, description, userId]
  );
  return res.insertId;
}

beforeAll(async () => {
  // db.js kicks off an async initialization on require. Without waiting for it,
  // afterAll can close the pool mid-init and the suite dies with
  // "Can't add new command when connection is in closed state".
  await pool.initPromise;
  const [users] = await pool.query('SELECT id FROM users WHERE org_id = ? LIMIT 1', [ORG_ID]);
  if (!users.length) throw new Error(`No user in org ${ORG_ID} — cannot seed the handoff fixture.`);
  userId = users[0].id;

  // A complete AE: reporter + patient + suspect drug + event, all four present.
  completeAeId = await makeCase('AE', `${MARKER} complete adverse event`);
  await pool.query(
    `INSERT INTO case_contacts (case_id, contact_role, is_primary, first_name, last_name, email, reporter_type)
     VALUES (?, 'reporter', 1, 'Ada', 'Reporter', 'ada.reporter@example.test', 'HCP')`,
    [completeAeId]
  );
  await pool.query(
    'INSERT INTO case_patient (case_id, initials, age, age_unit, gender) VALUES (?, ?, ?, ?, ?)',
    [completeAeId, 'A.B.', 44, 'years', 'F']
  );
  await pool.query(
    `INSERT INTO case_ae_intake (case_id, suspect_drug_name, batch_lot_number, reaction_description,
                                 reaction_onset_date, outcome, is_serious)
     VALUES (?, 'Testdrug', 'LOT-9', 'Severe rash after second dose', CURDATE(), 'recovered', 1)`,
    [completeAeId]
  );

  // A bare AE: nothing but the case row — must fail the gate.
  bareAeId = await makeCase('AE', `${MARKER} incomplete adverse event`);

  miId = await makeCase('MI', `${MARKER} medical information enquiry`);
});

afterAll(async () => {
  for (const id of [completeAeId, bareAeId, miId].filter(Boolean)) {
    await pool.query('DELETE FROM transmission_audit_trail WHERE case_id = ?', [id]);
    await pool.query('DELETE FROM case_audit_trail WHERE case_id = ?', [id]);
    await pool.query('DELETE FROM case_ae_intake WHERE case_id = ?', [id]);
    await pool.query('DELETE FROM case_patient WHERE case_id = ?', [id]);
    await pool.query('DELETE FROM case_contacts WHERE case_id = ?', [id]);
    await pool.query('DELETE FROM cases WHERE id = ?', [id]);
  }
  await pool.end();
});

describe('buildPayload', () => {
  test('emits the canonical intake payload with the awareness date', async () => {
    const built = await handoff.buildPayload({ orgId: ORG_ID, caseId: completeAeId });
    expect(built).not.toBeNull();

    const { payload } = built;
    expect(payload.payload_version).toBe(handoff.PAYLOAD_VERSION);
    expect(payload.source.system).toBe('MIMS');
    // Day 0 for the regulatory clock. Non-delegable — it must travel with the case.
    expect(payload.case.awareness_date).toBeTruthy();
    expect(payload.reporter.email).toBe('ada.reporter@example.test');
    expect(payload.patient.initials).toBe('A.B.');
  });

  test('carries the suspect drug and the verbatim reaction from the flat intake row', async () => {
    const { payload } = await handoff.buildPayload({ orgId: ORG_ID, caseId: completeAeId });
    expect(payload.drugs).toHaveLength(1);
    expect(payload.drugs[0]).toMatchObject({ name: 'Testdrug', role: 'suspect', lot_number: 'LOT-9' });
    expect(payload.events[0].description_verbatim).toBe('Severe rash after second dose');
  });

  test('never emits a coded term — no MSSO licence', async () => {
    const { payload } = await handoff.buildPayload({ orgId: ORG_ID, caseId: completeAeId });
    expect(payload.coding.meddra).toBeNull();
    expect(payload.coding.whodrug).toBeNull();
    // Belt and braces: no MedDRA code anywhere in the serialised payload.
    expect(JSON.stringify(payload)).not.toMatch(/meddra_(code|pt|llt)/i);
  });

  test('returns null for a case in another org', async () => {
    const built = await handoff.buildPayload({ orgId: ORG_ID + 9999, caseId: completeAeId });
    expect(built).toBeNull();
  });
});

describe('assessReadiness', () => {
  test('passes a complete AE on all four ICH elements', async () => {
    const r = await handoff.assessReadiness({ orgId: ORG_ID, caseId: completeAeId, caseType: 'AE' });
    expect(r.required).toBe(4);
    expect(r.score).toBe(4);
    expect(r.blocking_for_submission).toBe(false);
  });

  test('blocks an AE that is missing elements, and names which', async () => {
    const r = await handoff.assessReadiness({ orgId: ORG_ID, caseId: bareAeId, caseType: 'AE' });
    expect(r.blocking_for_submission).toBe(true);
    expect(r.score).toBeLessThan(4);
    const missing = r.elements.filter(e => !e.satisfied).map(e => e.key);
    expect(missing).toEqual(expect.arrayContaining(['reporter', 'patient', 'product', 'event']));
  });

  test('uses complaint criteria for PC, not the adverse-event test', async () => {
    const r = await handoff.assessReadiness({ orgId: ORG_ID, caseId: bareAeId, caseType: 'PC' });
    expect(r.required).toBe(3);
    expect(r.elements.map(e => e.key)).toEqual(['reporter', 'product', 'complaint']);
  });
});

describe('transmit', () => {
  test('refuses a case that fails the validity gate', async () => {
    const result = await handoff.transmit({
      orgId: ORG_ID, caseId: bareAeId, userId, userName: 'Handoff Test', targetSystem: 'argus',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
    expect(result.readiness.blocking_for_submission).toBe(true);

    // A blocked attempt must not be recorded as a transmission.
    const [rows] = await pool.query('SELECT COUNT(*) n FROM transmission_audit_trail WHERE case_id = ?', [bareAeId]);
    expect(rows[0].n).toBe(0);
  });

  test('refuses an MI case — MI is answered, not transmitted', async () => {
    const result = await handoff.transmit({
      orgId: ORG_ID, caseId: miId, userId, userName: 'Handoff Test', targetSystem: 'argus',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  test('records an audited attempt when no integration subscribes', async () => {
    // No org_integrations row subscribes to case.ae.handoff, so nothing leaves
    // MIMS. That must NOT be reported as success — writing a row and calling it
    // done is the exact failure the verification standard exists to prevent.
    const result = await handoff.transmit({
      orgId: ORG_ID, caseId: completeAeId, userId, userName: 'Handoff Test', targetSystem: 'argus',
    });
    expect(result.ok).toBe(false);
    expect(result.transmission_status).toBe('NO_TARGET');

    const [rows] = await pool.query(
      'SELECT target_system, status FROM transmission_audit_trail WHERE case_id = ? ORDER BY id DESC LIMIT 1',
      [completeAeId]
    );
    expect(rows[0]).toMatchObject({ target_system: 'argus', status: 'NO_TARGET' });

    // And the attempt is on the case's own audit trail, not only the
    // transmission log.
    const [audit] = await pool.query(
      "SELECT action_type, new_value FROM case_audit_trail WHERE case_id = ? AND action_type = 'CASE_HANDOFF' ORDER BY id DESC LIMIT 1",
      [completeAeId]
    );
    expect(audit[0].new_value).toContain('NO_TARGET');
  });
});
