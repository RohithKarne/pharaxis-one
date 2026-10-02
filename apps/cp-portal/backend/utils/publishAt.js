'use strict';

/**
 * publishAt.js — one way to read a "publish at" time sent by an admin screen (CPPM-58).
 *
 * The screens send the exact moment the admin meant, as an ISO instant, and it is
 * stored in UTC like every other timestamp. Until now documents and safety alerts
 * stored the typed text as it came, so a time typed in India was treated as UTC
 * and went live five and a half hours late.
 *
 * Returns the UTC datetime as MySQL takes it, null when nothing was given, or
 * undefined when it cannot be read as a date and time (the caller answers 400).
 */
function parsePublishAt(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

module.exports = { parsePublishAt };
