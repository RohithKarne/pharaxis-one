'use strict';

// The path an access check should compare (Varun's post-merge read, 2026-10-14).
// Express matches routes regardless of letter case and decodes %-escapes in
// parameters, so "/CASES/2/mi" or "/cases/ae/versions/%31/…" reach the same
// handler as "/cases/2/mi". A check matching the raw path let those through.
function gatePath(req) {
  let path = req.path || '';
  try { path = decodeURIComponent(path); } catch (_) { /* keep the raw path */ }
  return path.toLowerCase();
}

module.exports = { gatePath };
