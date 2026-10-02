/**
 * submissionStatus.js — CPPM-4: the history behind a submission's status.
 *
 * cp_submissions keeps only the current status. Every place that changes it also
 * appends a row here, so the portal can tell a person what happened to their
 * report and when, instead of showing one word with no past and no dates.
 *
 * A write here must never cost someone their submission, so it is best-effort in
 * the same sense as utils/chatRecords.js: a failure is logged loudly
 * (portal.submission.status_event_failed) and the caller carries on.
 */
const { pool } = require('../database/db');
const log = require('./logger');

// What each internal status is called on the public portal. A status that is not
// listed here is our own plumbing — the sync between CP and MIMS — and is never
// shown to the person who reported: their report has not moved, only our copy of
// it, and telling them "sync failed" would be noise they cannot act on.
const PUBLIC_LABELS = {
  submitted: 'Received',
  synced:    'With the medical team',
  closed:    'Closed',
  // Bridge row 4: the case was closed in MIMS and then opened again — the person's
  // request is with the medical team again, and says so rather than looking unchanged.
  reopened:  'Reopened — with the medical team again',
  // Bridge row 8: what MIMS says is happening, in the person's words.
  in_review: 'A medical information specialist is working on it',
  answered:  'Answer sent',
  // Bridge row 9: the person added information to the request after sending it.
  follow_up: 'You added more information',
};

// The note a reply writes when it reopens a closed request (routes/portal/submit.js).
const REOPENED_NOTE = 'Reopened by a reply';

/** Append one status change. Returns nothing; failures are logged, never thrown. */
async function recordStatusEvent({ submissionId, clientId, status, note = null, source }) {
  try {
    await pool.execute(
      `INSERT INTO cp_submission_status_events (submission_id, client_id, status, note, source)
       VALUES (?, ?, ?, ?, ?)`,
      [submissionId, clientId, status, note ? String(note).slice(0, 500) : null, source]
    );
  } catch (err) {
    log.error('portal.submission.status_event_failed', { err, submission_id: submissionId, status, source });
  }
}

/**
 * The person-facing history for one submission, oldest first. Internal sync
 * statuses are dropped, and a repeat of the step already showing is dropped too
 * (a retry that lands on 'synced' again is not a new thing that happened).
 */
function publicTimeline(events) {
  const steps = [];
  for (const e of events) {
    // CPPM-63: a reply that reopened a closed request is shown as that, not as a second "Received".
    const label = e.note === REOPENED_NOTE ? 'Reopened' : PUBLIC_LABELS[e.status];
    if (!label) continue;
    if (steps.length && steps[steps.length - 1].label === label) continue;
    steps.push({ label, at: e.created_at });
  }
  return steps;
}

module.exports = { recordStatusEvent, publicTimeline, PUBLIC_LABELS, REOPENED_NOTE };
