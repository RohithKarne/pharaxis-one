-- CPPM-4: what the Portal tells a person about a report they have already made.
--
-- cp_submissions keeps only the CURRENT status, so the portal could show a word
-- and nothing else — no "when", no "what happened before". Every status change is
-- now appended here, and the portal builds the person's history from these rows.
-- `status` holds the internal value verbatim (submitted / pending_sync / synced /
-- failed_sync / closed); the portal decides which of those mean anything to a
-- member of the public. `source` says who moved it (portal, admin, mims-sync,
-- mims-close-sync) so an unexplained jump can be traced.
CREATE TABLE IF NOT EXISTS cp_submission_status_events (
  id            INT          NOT NULL AUTO_INCREMENT,
  submission_id INT          NOT NULL,
  client_id     INT          NOT NULL,
  status        VARCHAR(50)  NOT NULL,
  note          VARCHAR(500) NULL,
  source        VARCHAR(50)  NOT NULL DEFAULT 'system',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_sse_submission (submission_id, id),
  KEY idx_cp_sse_client (client_id, created_at),
  CONSTRAINT fk_sse_submission FOREIGN KEY (submission_id) REFERENCES cp_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sse_client     FOREIGN KEY (client_id)     REFERENCES cp_clients(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Submissions made before this table existed have no history. Give each one the
-- single entry we actually know to be true — it was received when it was
-- submitted — so an existing report does not show a blank timeline. Nothing that
-- happened afterwards is reconstructed, because we do not have the dates for it.
INSERT INTO cp_submission_status_events (submission_id, client_id, status, source, created_at)
  SELECT id, client_id, 'submitted', 'backfill', submitted_at FROM cp_submissions;
