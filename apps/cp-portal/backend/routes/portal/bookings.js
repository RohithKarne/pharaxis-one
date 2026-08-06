/**
 * Portal MSL Bookings — /api/portal/bookings
 * S5-8: Portal users request meetings with MSLs
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal } = require('../../middleware/auth');
const { sendEmail } = require('../../utils/mailer');
const { buildEvent } = require('../../utils/ics');
const { enqueue } = require('../../utils/jobQueue');

// GET /api/portal/bookings/:clientCode/:mslId/slots — available (future, unbooked) slots
router.get('/:clientCode/:mslId/slots', async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [slots] = await pool.execute(
      `SELECT id, starts_at, ends_at FROM cp_msl_slots
       WHERE client_id = ? AND msl_id = ? AND is_booked = 0 AND starts_at > NOW()
       ORDER BY starts_at ASC LIMIT 50`,
      [client.id, req.params.mslId]);
    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/bookings/:clientCode/:mslId — request a meeting
router.post('/:clientCode/:mslId', authenticatePortal, async (req, res) => {
  try {
    const { clientCode, mslId } = req.params;
    const { requester_name, requester_email, preferred_date, topic, message, slot_id } = req.body;

    if (!requester_name || !requester_email) {
      return res.status(400).json({ error: 'requester_name and requester_email are required.' });
    }

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    const [[msl]] = await pool.execute('SELECT id, name, email FROM cp_msls WHERE id = ? AND client_id = ? AND is_active = 1', [mslId, client.id]);
    if (!msl) return res.status(404).json({ error: 'MSL not found.' });

    // If a specific slot was chosen, validate it is still available and use its time.
    let chosenSlot = null;
    if (slot_id) {
      const [[slot]] = await pool.execute(
        'SELECT id, starts_at FROM cp_msl_slots WHERE id = ? AND msl_id = ? AND client_id = ? AND is_booked = 0 AND starts_at > NOW()',
        [slot_id, mslId, client.id]);
      if (!slot) return res.status(409).json({ error: 'That time slot is no longer available. Please pick another.' });
      chosenSlot = slot;
    }

    // Deduplicate: prevent the same email requesting the same MSL more than once per day
    const [[existing]] = await pool.execute(`
      SELECT id FROM cp_msl_bookings
      WHERE msl_id = ? AND requester_email = ? AND DATE(created_at) = DATE(NOW())
    `, [mslId, requester_email.toLowerCase().trim()]);
    if (existing) return res.status(409).json({ error: 'You have already requested a meeting with this MSL today.' });

    const portalUserId = req.portalUser?.id || null;
    const userType     = req.portalUser?.user_type || null;

    const effectiveDate = chosenSlot ? chosenSlot.starts_at : (preferred_date || null);

    const [result] = await pool.execute(`
      INSERT INTO cp_msl_bookings
        (client_id, msl_id, portal_user_id, requester_name, requester_email, requester_user_type, preferred_date, topic, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      client.id, mslId, portalUserId,
      requester_name.trim(), requester_email.toLowerCase().trim(), userType,
      effectiveDate, topic?.trim() || null, message?.trim() || null,
    ]);

    // Reserve the slot so it can't be double-booked.
    if (chosenSlot) {
      await pool.execute('UPDATE cp_msl_slots SET is_booked = 1, booking_id = ? WHERE id = ?', [result.insertId, chosenSlot.id]);
    }

    // Confirmation email — queued (async + retried), with a calendar invite when
    // a concrete slot was chosen (CP-11 + CP-21).
    const whenText = effectiveDate ? new Date(effectiveDate).toLocaleString() : 'a time to be confirmed';
    let attachments;
    if (chosenSlot?.starts_at) {
      const ics = buildEvent({
        uid: `msl-booking-${result.insertId}@pharaxis`,
        start: chosenSlot.starts_at,
        summary: `Meeting with ${msl.name}`,
        description: topic ? `Topic: ${topic}` : 'Medical Science Liaison meeting',
      });
      attachments = [{ filename: 'meeting.ics', content: ics, contentType: 'text/calendar; method=REQUEST' }];
    }
    enqueue('booking.confirm-email', () => sendEmail(client.id, {
      to: requester_email.toLowerCase().trim(),
      subject: `Meeting request received — ${msl.name}`,
      html: `<p>Hi ${requester_name.trim()},</p><p>Your meeting request with <strong>${msl.name}</strong> has been received for <strong>${whenText}</strong>.</p>${topic ? `<p>Topic: ${String(topic).replace(/</g, '&lt;')}</p>` : ''}<p>We'll be in touch to confirm.${attachments ? ' A calendar invite is attached.' : ''}</p>`,
      attachments,
    }));

    // The MSL is the other party to this meeting and was not told about it.
    // Queued separately so a failure to reach the MSL cannot take the doctor's
    // confirmation down with it. email is nullable on cp_msls — where it is
    // unset there is nowhere to send, and the booking still stands.
    if (msl.email) {
      enqueue('booking.notify-msl', () => sendEmail(client.id, {
        to: msl.email,
        subject: `Meeting request — ${requester_name.trim()}`,
        html: `<p>Hi ${msl.name},</p><p><strong>${requester_name.trim()}</strong> (${requester_email.toLowerCase().trim()}) has requested a meeting for <strong>${whenText}</strong>.</p>${topic ? `<p>Topic: ${String(topic).replace(/</g, '&lt;')}</p>` : ''}${message ? `<p>Message: ${String(message).replace(/</g, '&lt;')}</p>` : ''}<p>Booking reference ${result.insertId}.</p>`,
        attachments,
      }));
    }

    res.status(201).json({ ok: true, bookingId: result.insertId, slotBooked: !!chosenSlot });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/bookings/:clientCode — list user's own bookings (requires auth)
router.get('/:clientCode', authenticatePortal, async (req, res) => {
  try {
    if (!req.portalUser) return res.status(401).json({ error: 'Authentication required.' });
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    const [bookings] = await pool.execute(`
      SELECT b.id, b.preferred_date, b.topic, b.message, b.status, b.admin_notes, b.created_at,
             m.name as msl_name, m.title as msl_title, m.specialty as msl_specialty
      FROM cp_msl_bookings b
      JOIN cp_msls m ON m.id = b.msl_id
      WHERE b.client_id = ? AND b.portal_user_id = ?
      ORDER BY b.created_at DESC
    `, [client.id, req.portalUser.id]);

    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
