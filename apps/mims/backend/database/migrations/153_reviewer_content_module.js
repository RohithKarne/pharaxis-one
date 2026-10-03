'use strict';

/**
 * Migration 153 — reviewers can open Content Management (MIPM-176).
 *
 * The privilege catalog and the Reviewer group template let a reviewer review
 * content, but the reviewer role's Content Management module was off, so a
 * reviewer asked to review a document could not reach the review. Authoring
 * stays closed to them: content changes need content.author (MIPM-175).
 */

async function up(conn) {
  await conn.execute("UPDATE role_permissions SET can_access = 1 WHERE role = 'reviewer' AND module = 'content_mgmt' AND can_access = 0");
}

async function down(_conn) {}

module.exports = { up, down };
