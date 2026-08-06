-- PAUD-2 items 8 and 6: the portal now serves clinical trials and CME modules
-- from these tables instead of hardcoded arrays.
--
-- Both tables are declared in database/db.js, but that bootstrap is skipped
-- once a database has been initialised, so neither table exists on any
-- environment created before they were added. The admin screens that write to
-- them have therefore been failing there too — this was found by calling the
-- endpoint against the dev database, not by the unit tests, which mock the pool.
--
-- Definitions match db.js exactly so the two paths cannot drift.
CREATE TABLE IF NOT EXISTS cp_clinical_trials (
  id            INT          NOT NULL AUTO_INCREMENT,
  client_id     INT          NOT NULL,
  nct_id        VARCHAR(50)  NOT NULL,
  title         VARCHAR(500) NOT NULL,
  phase         VARCHAR(50)  NOT NULL,
  indication    VARCHAR(255) NOT NULL,
  status        VARCHAR(50)  NOT NULL DEFAULT 'Recruiting',
  site_location VARCHAR(500) NULL,
  pi            VARCHAR(255) NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_trials_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cp_training_modules (
  id          INT          NOT NULL AUTO_INCREMENT,
  client_id   INT          NOT NULL,
  title       VARCHAR(500) NOT NULL,
  type        VARCHAR(100) NOT NULL DEFAULT 'CME Accredited',
  duration    VARCHAR(50)  NOT NULL DEFAULT '30 mins',
  credits     VARCHAR(50)  NOT NULL DEFAULT '1.5 CME',
  pass_score  INT          NOT NULL DEFAULT 80,
  status      VARCHAR(50)  NOT NULL DEFAULT 'Available',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_training_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Deliberately no seed rows. An empty table is the correct starting state:
-- the defect being fixed was the portal showing trials nobody had entered.
