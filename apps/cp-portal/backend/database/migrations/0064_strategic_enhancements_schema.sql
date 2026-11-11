-- Migration 0064: Strategic Enhancements Schema
-- Feature 7: Doctor credential verification support on cp_portal_users
-- Feature 5: Field Medical Insight capture table (cp_field_insights)

ALTER TABLE cp_portal_users
  ADD COLUMN license_number VARCHAR(64) NULL,
  ADD COLUMN registry_type VARCHAR(32) NULL,
  ADD COLUMN license_verified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN license_verified_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS cp_field_insights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  reporter_name VARCHAR(255) NOT NULL,
  reporter_email VARCHAR(255) NULL,
  hcp_specialty VARCHAR(128) NULL,
  institution VARCHAR(255) NULL,
  product_name VARCHAR(128) NOT NULL,
  insight_type VARCHAR(64) NOT NULL,
  interaction_venue VARCHAR(128) NULL,
  content TEXT NOT NULL,
  urgency VARCHAR(32) NOT NULL DEFAULT 'normal',
  follow_up_requested TINYINT(1) NOT NULL DEFAULT 0,
  created_by_user_id INT NULL,
  sync_status VARCHAR(32) NOT NULL DEFAULT 'synced',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_field_insights_client (client_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
