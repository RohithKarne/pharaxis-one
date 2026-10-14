'use strict';

// Add working days (Monday to Friday) to a date, UTC. Public holidays are not
// known to MIMS and are not skipped. Returns YYYY-MM-DD.
function addWorkingDays(date, days) {
  const base = date instanceof Date ? date : new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  let left = Number(days) || 0;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

// Working days (Monday to Friday, UTC) after `from` up to and including `to`:
// a letter sent the next working day took 1. Same calendar as addWorkingDays.
function workingDaysBetween(from, to) {
  const day = (v) => new Date(`${String(v instanceof Date ? v.toISOString() : v).slice(0, 10)}T00:00:00Z`);
  const d = day(from), end = day(to);
  let count = 0;
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) count += 1;
  }
  return count;
}

module.exports = { addWorkingDays, workingDaysBetween };
