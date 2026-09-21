'use strict';

/**
 * audience.js — the single rule for "may this person see this item?" (CPPM-25).
 *
 * Documents, news and safety alerts carry an audience list — e.g. ["hcp"].
 * An empty or missing list means everyone. The library and news pages applied
 * this rule; search and publish alerts did not, so restricted titles leaked.
 *
 * Fails closed: a list that cannot be read hides the item rather than
 * exposing it to everyone.
 */

function canSee(audienceJson, userType) {
  if (!audienceJson) return true;
  let audience;
  try {
    audience = JSON.parse(audienceJson);
  } catch {
    return false;
  }
  if (!Array.isArray(audience)) return false;
  return audience.length === 0 || audience.includes(userType);
}

module.exports = { canSee };
