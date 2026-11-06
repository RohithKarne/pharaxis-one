-- Rohith, 27 Oct 2026 (enhancement E2). Admins could not see what doctors search for,
-- or what they search for and do not find. One row per client, search term and day,
-- counted. Nobody's identity is stored with a term. A term can still contain what a
-- person typed (for example a patient's name), so rows are kept 90 days and removed
-- after that, as each new search is counted.
CREATE TABLE IF NOT EXISTS cp_search_terms (
  client_id          INT          NOT NULL,
  term               VARCHAR(100) NOT NULL,
  day                DATE         NOT NULL,
  searches           INT          NOT NULL DEFAULT 0,
  no_result_searches INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, term, day),
  KEY idx_cp_search_terms_day (client_id, day),
  CONSTRAINT fk_cp_search_terms_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
