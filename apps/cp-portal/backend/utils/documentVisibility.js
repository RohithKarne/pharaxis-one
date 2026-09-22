'use strict';

/**
 * documentVisibility.js — the single rule for whether a portal visitor may see
 * a document (CPPM-34).
 *
 * A document reaches a visitor only when it is published (or scheduled and its
 * date has arrived), its publish date has passed, and it has not expired. The
 * rule lived only in the document library, so search, the type-ahead, the
 * download and the saved list still served expired and unpublished documents.
 * Every surface now asks this module instead of writing the condition again.
 */

// For queries that select documents. Callers add their own client/feature filters.
const VISIBLE_DOCUMENT_SQL = `
        (status = 'published' OR (status = 'scheduled' AND publish_at <= NOW()))
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (publish_at IS NULL OR publish_at <= NOW())`;

// For a row already fetched by id. Returns why it is unavailable, or null when visible.
// 'expired' is disclosed to the reader; 'unpublished' must be indistinguishable
// from a document that never existed.
function documentUnavailableReason(doc, now = new Date()) {
  if (!doc) return 'unpublished';

  const publishAt = doc.publish_at ? new Date(doc.publish_at) : null;
  const expiresAt = doc.expires_at ? new Date(doc.expires_at) : null;

  const statusAllows = doc.status === 'published' || doc.status === 'scheduled';
  if (!statusAllows) return 'unpublished';
  if (publishAt && publishAt > now) return 'unpublished';
  if (expiresAt && expiresAt <= now) return 'expired';
  return null;
}

// The response a refused download gets. Expired is stated plainly; anything else
// looks exactly like a document that does not exist.
function unavailableResponse(reason) {
  return reason === 'expired'
    ? { status: 410, body: { error: 'This document is no longer available.' } }
    : { status: 404, body: { error: 'Document not found.' } };
}

module.exports = { VISIBLE_DOCUMENT_SQL, documentUnavailableReason, unavailableResponse };
