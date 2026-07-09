/**
 * ics.js  (CP-11) — minimal iCalendar (.ics) generator for MSL meeting invites.
 * Produces a VEVENT the recipient can add to their calendar (attached to the
 * booking confirmation email).
 */

function pad(n) { return String(n).padStart(2, '0'); }

function toICSDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function esc(s) { return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n'); }

/**
 * Build an .ics string for a single meeting.
 * @param {{uid:string,start:Date|string,end?:Date|string,summary:string,description?:string,location?:string,organizerEmail?:string}} opts
 */
function buildEvent({ uid, start, end, summary, description, location, organizerEmail }) {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end ? (end instanceof Date ? end : new Date(end)) : new Date(startDate.getTime() + 30 * 60000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pharaxis CP Portal//MSL Booking//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(startDate)}`,
    `DTEND:${toICSDate(endDate)}`,
    `SUMMARY:${esc(summary)}`,
    description ? `DESCRIPTION:${esc(description)}` : '',
    location ? `LOCATION:${esc(location)}` : '',
    organizerEmail ? `ORGANIZER:mailto:${organizerEmail}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

module.exports = { buildEvent };
