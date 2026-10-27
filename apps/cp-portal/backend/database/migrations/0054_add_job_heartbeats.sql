-- CPPM-157 Bridge Heartbeat (Rohith, 27 Oct 2026). When each background job last
-- ran and whether that run finished. The "cannot reach MIMS" alert is raised by the
-- same jobs it reports on, so a job that stops raised nothing; this row is what lets
-- another job, or a person opening Sync Health, see that it stopped.
CREATE TABLE IF NOT EXISTS cp_job_heartbeats (
  job_key          VARCHAR(64)  NOT NULL,
  last_started_at  DATETIME     NULL,
  last_finished_at DATETIME     NULL,
  last_ok_at       DATETIME     NULL,
  last_error       TEXT         NULL,
  runs             INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (job_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
