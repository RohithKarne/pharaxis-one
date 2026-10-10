-- Bridge plan P6 (approved by Rohith 10 Oct 2026; decision 4: hourly for side
-- effects, nightly for everything): each time the portal compares its list of
-- reports with MIMS, one run row, and one item row for every report MIMS did not
-- hold or held from a different version. Sync Health reads the latest run; the
-- monthly CSV export reads both.
CREATE TABLE IF NOT EXISTS cp_mims_reconciliations (
  id              INT          NOT NULL AUTO_INCREMENT,
  client_id       INT          NOT NULL,
  integration_id  INT          NOT NULL,
  scope           VARCHAR(20)  NOT NULL,
  started_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at     DATETIME     NULL,
  checked         INT          NOT NULL DEFAULT 0,
  missing         INT          NOT NULL DEFAULT 0,
  different       INT          NOT NULL DEFAULT 0,
  resent          INT          NOT NULL DEFAULT 0,
  error           VARCHAR(1000) NULL,
  PRIMARY KEY (id),
  KEY idx_reconcile_client (client_id, scope, started_at),
  CONSTRAINT fk_reconcile_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cp_mims_reconciliation_items (
  id              INT          NOT NULL AUTO_INCREMENT,
  run_id          INT          NOT NULL,
  submission_id   INT          NOT NULL,
  problem         VARCHAR(20)  NOT NULL,
  action          VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_reconcile_item_run (run_id),
  CONSTRAINT fk_reconcile_item_run FOREIGN KEY (run_id) REFERENCES cp_mims_reconciliations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
