/**
 * Audit Hash Ledger Verification Utility
 * Walks the cryptographic SHA-256 hash chain for an org's audit events and verifies chain continuity.
 */

export async function verifyAuditHashChain(client, orgId) {
  const { rows } = await client.query(
    `
      SELECT id, org_id, prev_hash, curr_hash, occurred_at
      FROM qms_audit_events
      WHERE org_id = $1
      ORDER BY id ASC
    `,
    [orgId]
  );

  let verifiedCount = 0;
  let corruptedEvents = [];

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i];
    const previous = i > 0 ? rows[i - 1] : null;

    if (i === 0) {
      if (current.prev_hash !== null && current.prev_hash !== undefined) {
        corruptedEvents.push({ id: current.id, reason: 'Genesis event has non-null prev_hash' });
      } else {
        verifiedCount++;
      }
    } else {
      if (current.prev_hash !== previous.curr_hash) {
        corruptedEvents.push({
          id: current.id,
          reason: `Broken chain link: prev_hash (${current.prev_hash}) does not match previous curr_hash (${previous.curr_hash})`
        });
      } else {
        verifiedCount++;
      }
    }
  }

  return {
    valid: corruptedEvents.length === 0,
    totalEvents: rows.length,
    verifiedCount,
    corruptedCount: corruptedEvents.length,
    corruptedEvents
  };
}
