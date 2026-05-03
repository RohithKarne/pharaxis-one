require('dotenv').config()
const mysql = require('mysql2/promise')

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  database: process.env.MYSQL_DATABASE || 'pharaxis_vault_dev',
  waitForConnections: true,
  connectionLimit: 10
})

async function initializeDatabase() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS superadmin_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS orgs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      logo_url VARCHAR(500),
      status ENUM('active','inactive') DEFAULT 'active',
      storage_quota_mb INT DEFAULT 10240,
      doc_number_prefix VARCHAR(10) NOT NULL,
      created_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','author','reviewer','approver','viewer') NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME,
      UNIQUE KEY uq_users_email_org (email, org_id),
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS content_types (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(20) NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_content_type_org (org_id, code),
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS content_subtypes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_type_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (content_type_id) REFERENCES content_types(id)
    )`,
    `CREATE TABLE IF NOT EXISTS classifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_subtype_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (content_subtype_id) REFERENCES content_subtypes(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vault_folders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      parent_id INT DEFAULT NULL,
      name VARCHAR(150) NOT NULL,
      path VARCHAR(1000) NOT NULL,
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (parent_id) REFERENCES vault_folders(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vault_content (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      doc_number VARCHAR(50) NOT NULL UNIQUE,
      title VARCHAR(300) NOT NULL,
      folder_id INT,
      content_type_id INT NOT NULL,
      content_subtype_id INT,
      classification_id INT,
      current_version_id INT DEFAULT NULL,
      lifecycle_state ENUM('draft','in_review','approved','published','archived') DEFAULT 'draft',
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (folder_id) REFERENCES vault_folders(id),
      FOREIGN KEY (content_type_id) REFERENCES content_types(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vault_versions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_id INT NOT NULL,
      version_number VARCHAR(10) NOT NULL,
      file_name VARCHAR(300) NOT NULL,
      file_path VARCHAR(1000) NOT NULL,
      s3_key VARCHAR(1000) NOT NULL,
      file_size_kb INT,
      mime_type VARCHAR(100),
      checksum VARCHAR(64),
      uploaded_by INT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (content_id) REFERENCES vault_content(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vault_metadata (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_id INT NOT NULL UNIQUE,
      description TEXT,
      language VARCHAR(50),
      country_region VARCHAR(100),
      audience ENUM('internal','external','hcp','patient','regulator'),
      confidentiality ENUM('public','internal','confidential','restricted') DEFAULT 'internal',
      regulated TINYINT(1) DEFAULT 0,
      therapeutic_area VARCHAR(100),
      product_brand VARCHAR(100),
      department VARCHAR(100),
      keywords TEXT,
      effective_date DATE,
      expiry_date DATE,
      review_cycle_months INT,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (content_id) REFERENCES vault_content(id)
    )`,
    `CREATE TABLE IF NOT EXISTS doc_number_sequences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_type_id INT NOT NULL,
      year YEAR NOT NULL,
      last_sequence INT DEFAULT 0,
      UNIQUE KEY uq_seq (org_id, content_type_id, year),
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS checkout_locks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_id INT NOT NULL UNIQUE,
      locked_by INT NOT NULL,
      locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      force_released_by INT DEFAULT NULL,
      force_released_at DATETIME DEFAULT NULL,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (content_id) REFERENCES vault_content(id)
    )`,
    `CREATE TABLE IF NOT EXISTS lifecycle_states (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_type_id INT NOT NULL,
      state_name VARCHAR(50) NOT NULL,
      state_code VARCHAR(30) NOT NULL,
      is_initial TINYINT(1) DEFAULT 0,
      is_terminal TINYINT(1) DEFAULT 0,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS lifecycle_transitions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_type_id INT NOT NULL,
      from_state VARCHAR(30) NOT NULL,
      to_state VARCHAR(30) NOT NULL,
      allowed_roles VARCHAR(200) NOT NULL,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vault_dossiers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      title VARCHAR(300) NOT NULL,
      description TEXT,
      status ENUM('draft','final','archived') DEFAULT 'draft',
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS dossier_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      dossier_id INT NOT NULL,
      content_id INT NOT NULL,
      position INT DEFAULT 0,
      added_by INT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (dossier_id) REFERENCES vault_dossiers(id),
      FOREIGN KEY (content_id) REFERENCES vault_content(id)
    )`,
    `CREATE TABLE IF NOT EXISTS content_slots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      folder_id INT,
      dossier_id INT DEFAULT NULL,
      title VARCHAR(300) NOT NULL,
      expected_type_id INT,
      responsible_user_id INT,
      due_date DATE,
      status ENUM('pending','filled') DEFAULT 'pending',
      filled_content_id INT DEFAULT NULL,
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (folder_id) REFERENCES vault_folders(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vault_audit_log (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      user_id INT,
      user_type ENUM('org_user','superadmin') DEFAULT 'org_user',
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id INT,
      ip_address VARCHAR(45),
      before_value TEXT,
      after_value TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS login_audit (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT,
      user_id INT,
      user_type ENUM('org_user','superadmin') DEFAULT 'org_user',
      email VARCHAR(150),
      action ENUM('login_success','login_fail','logout') NOT NULL,
      ip_address VARCHAR(45),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS content_channels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      app_name VARCHAR(150) NOT NULL,
      api_key VARCHAR(100) NOT NULL UNIQUE,
      webhook_url VARCHAR(500),
      status ENUM('active','inactive') DEFAULT 'active',
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS org_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      config_key VARCHAR(100) NOT NULL,
      config_value TEXT,
      UNIQUE KEY uq_org_config (org_id, config_key),
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS integration_connectors (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      name VARCHAR(150) NOT NULL,
      connector_type ENUM('veeva_vault','mims','crm','safety','custom') DEFAULT 'custom',
      base_url VARCHAR(500) NOT NULL,
      auth_type ENUM('none','api_key','basic','oauth2') DEFAULT 'none',
      auth_value TEXT,
      status ENUM('active','inactive') DEFAULT 'active',
      last_test_status ENUM('unknown','pass','fail') DEFAULT 'unknown',
      last_test_message VARCHAR(500),
      last_tested_at DATETIME DEFAULT NULL,
      created_by INT NOT NULL,
      updated_by INT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_integration_connector_org_name (org_id, name),
      INDEX idx_integration_connector_status (org_id, status),
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS auth_mfa_challenges (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT DEFAULT NULL,
      user_id INT NOT NULL,
      user_type ENUM('org_user','superadmin') DEFAULT 'org_user',
      challenge_token VARCHAR(64) NOT NULL UNIQUE,
      one_time_code VARCHAR(12) NOT NULL,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME DEFAULT NULL,
      ip_address VARCHAR(45),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mfa_challenge_lookup (org_id, user_id, user_type, challenge_token),
      INDEX idx_mfa_challenge_expiry (expires_at),
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_instances (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_id INT NOT NULL,
      status ENUM('active','completed','cancelled') DEFAULT 'active',
      started_by INT NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME DEFAULT NULL,
      INDEX idx_workflow_instances_org_status (org_id, status),
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (content_id) REFERENCES vault_content(id)
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_tasks (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      workflow_instance_id BIGINT NOT NULL,
      org_id INT NOT NULL,
      content_id INT NOT NULL,
      assignee_user_id INT NOT NULL,
      assigned_by INT NOT NULL,
      task_type ENUM('review','approval','signature') DEFAULT 'approval',
      status ENUM('pending','completed','rejected','cancelled') DEFAULT 'pending',
      due_at DATETIME DEFAULT NULL,
      completed_at DATETIME DEFAULT NULL,
      comments TEXT,
      signature_id BIGINT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_workflow_tasks_assignee_status (assignee_user_id, status),
      INDEX idx_workflow_tasks_org_status (org_id, status),
      FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id),
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (content_id) REFERENCES vault_content(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vault_signatures (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      content_id INT NOT NULL,
      workflow_task_id BIGINT NOT NULL,
      signer_user_id INT NOT NULL,
      signature_meaning ENUM('reviewed','approved','rejected','acknowledged') NOT NULL,
      signature_comment TEXT,
      password_reverified TINYINT(1) DEFAULT 1,
      hash_snapshot CHAR(64) NOT NULL,
      signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address VARCHAR(45),
      INDEX idx_vault_signatures_org_content (org_id, content_id),
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (content_id) REFERENCES vault_content(id),
      FOREIGN KEY (workflow_task_id) REFERENCES workflow_tasks(id)
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_templates (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      is_active TINYINT(1) DEFAULT 1,
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_workflow_template_name_org (org_id, name),
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_template_steps (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      template_id BIGINT NOT NULL,
      org_id INT NOT NULL,
      step_order INT NOT NULL,
      task_type ENUM('review','approval','signature') DEFAULT 'approval',
      assignee_role ENUM('admin','author','reviewer','approver','viewer') NOT NULL,
      due_in_hours INT DEFAULT NULL,
      require_signature TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_workflow_template_steps_template (template_id, step_order),
      FOREIGN KEY (template_id) REFERENCES workflow_templates(id),
      FOREIGN KEY (org_id) REFERENCES orgs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_task_comments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      workflow_task_id BIGINT NOT NULL,
      content_id INT NOT NULL,
      user_id INT NOT NULL,
      comment_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_workflow_task_comments_task (workflow_task_id, created_at),
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (workflow_task_id) REFERENCES workflow_tasks(id),
      FOREIGN KEY (content_id) REFERENCES vault_content(id)
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_task_notifications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      workflow_task_id BIGINT NOT NULL,
      content_id INT NOT NULL,
      assignee_user_id INT NOT NULL,
      notification_type ENUM('due_soon','overdue') NOT NULL,
      due_at DATETIME DEFAULT NULL,
      message VARCHAR(500) NOT NULL,
      read_at DATETIME DEFAULT NULL,
      acknowledged_at DATETIME DEFAULT NULL,
      email_delivery_status ENUM('sent','skipped','failed') DEFAULT 'skipped',
      webhook_delivery_status ENUM('sent','skipped','failed') DEFAULT 'skipped',
      delivery_error TEXT,
      delivered_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_workflow_task_notifications_task (workflow_task_id, created_at),
      INDEX idx_workflow_task_notifications_org_type (org_id, notification_type, created_at),
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (workflow_task_id) REFERENCES workflow_tasks(id),
      FOREIGN KEY (content_id) REFERENCES vault_content(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vault_saved_searches (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      user_id INT NOT NULL,
      name VARCHAR(180) NOT NULL,
      filters_json JSON NOT NULL,
      is_shared TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_vault_saved_searches_owner (org_id, user_id, created_at),
      INDEX idx_vault_saved_searches_shared (org_id, is_shared, created_at),
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_webhook_retry_queue (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      workflow_task_notification_id BIGINT NOT NULL,
      content_channel_id INT NOT NULL,
      channel_name VARCHAR(150),
      webhook_url VARCHAR(500) NOT NULL,
      request_body_json JSON NOT NULL,
      signature_secret VARCHAR(255),
      attempt_count INT DEFAULT 0,
      max_attempts INT DEFAULT 5,
      status ENUM('pending','sent','failed') DEFAULT 'pending',
      next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_error TEXT,
      last_attempt_at DATETIME DEFAULT NULL,
      delivered_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_workflow_webhook_retry_due (status, next_attempt_at),
      INDEX idx_workflow_webhook_retry_notification (workflow_task_notification_id, status),
      FOREIGN KEY (org_id) REFERENCES orgs(id),
      FOREIGN KEY (workflow_task_notification_id) REFERENCES workflow_task_notifications(id)
    )`
  ]

  for (const query of queries) {
    await pool.execute(query)
  }

  // Forward-compatible schema safety for Sprint 1 updates.
  const [folderActiveColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'vault_folders'
       AND COLUMN_NAME = 'is_active'`
  )
  if (!folderActiveColumn[0].total) {
    await pool.execute('ALTER TABLE vault_folders ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER path')
  }

  const [taskActivationColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_tasks'
       AND COLUMN_NAME = 'activation_status'`
  )
  if (!taskActivationColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_tasks
       ADD COLUMN activation_status ENUM('ready','waiting') DEFAULT 'ready' AFTER status`
    )
  }

  const [taskStepOrderColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_tasks'
       AND COLUMN_NAME = 'step_order'`
  )
  if (!taskStepOrderColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_tasks
       ADD COLUMN step_order INT DEFAULT 1 AFTER workflow_instance_id`
    )
  }

  const [taskEscalatedAtColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_tasks'
       AND COLUMN_NAME = 'escalated_at'`
  )
  if (!taskEscalatedAtColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_tasks
       ADD COLUMN escalated_at DATETIME DEFAULT NULL AFTER completed_at`
    )
  }

  const [taskEscalationLevelColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_tasks'
       AND COLUMN_NAME = 'escalation_level'`
  )
  if (!taskEscalationLevelColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_tasks
       ADD COLUMN escalation_level INT DEFAULT 0 AFTER escalated_at`
    )
  }

  const [taskReassignedFromColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_tasks'
       AND COLUMN_NAME = 'reassigned_from_user_id'`
  )
  if (!taskReassignedFromColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_tasks
       ADD COLUMN reassigned_from_user_id INT DEFAULT NULL AFTER assignee_user_id`
    )
  }

  const [taskReassignedAtColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_tasks'
       AND COLUMN_NAME = 'reassigned_at'`
  )
  if (!taskReassignedAtColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_tasks
       ADD COLUMN reassigned_at DATETIME DEFAULT NULL AFTER reassigned_from_user_id`
    )
  }

  const [taskEscalationOwnerColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_tasks'
       AND COLUMN_NAME = 'escalation_owner_user_id'`
  )
  if (!taskEscalationOwnerColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_tasks
       ADD COLUMN escalation_owner_user_id INT DEFAULT NULL AFTER escalation_level`
    )
  }

  const [taskDelegatedFromColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_tasks'
       AND COLUMN_NAME = 'delegated_from_user_id'`
  )
  if (!taskDelegatedFromColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_tasks
       ADD COLUMN delegated_from_user_id INT DEFAULT NULL AFTER reassigned_from_user_id`
    )
  }

  const [taskDelegatedAtColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_tasks'
       AND COLUMN_NAME = 'delegated_at'`
  )
  if (!taskDelegatedAtColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_tasks
       ADD COLUMN delegated_at DATETIME DEFAULT NULL AFTER reassigned_at`
    )
  }

  const [notificationEmailStatusColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_task_notifications'
       AND COLUMN_NAME = 'email_delivery_status'`
  )
  if (!notificationEmailStatusColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_task_notifications
       ADD COLUMN email_delivery_status ENUM('sent','skipped','failed') DEFAULT 'skipped' AFTER message`
    )
  }

  const [notificationWebhookStatusColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_task_notifications'
       AND COLUMN_NAME = 'webhook_delivery_status'`
  )
  if (!notificationWebhookStatusColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_task_notifications
       ADD COLUMN webhook_delivery_status ENUM('sent','skipped','failed') DEFAULT 'skipped' AFTER email_delivery_status`
    )
  }

  const [notificationDeliveryErrorColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_task_notifications'
       AND COLUMN_NAME = 'delivery_error'`
  )
  if (!notificationDeliveryErrorColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_task_notifications
       ADD COLUMN delivery_error TEXT AFTER webhook_delivery_status`
    )
  }

  const [notificationDeliveredAtColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_task_notifications'
       AND COLUMN_NAME = 'delivered_at'`
  )
  if (!notificationDeliveredAtColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_task_notifications
       ADD COLUMN delivered_at DATETIME DEFAULT NULL AFTER delivery_error`
    )
  }

  const [notificationReadAtColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_task_notifications'
       AND COLUMN_NAME = 'read_at'`
  )
  if (!notificationReadAtColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_task_notifications
       ADD COLUMN read_at DATETIME DEFAULT NULL AFTER message`
    )
  }

  const [notificationAcknowledgedAtColumn] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'workflow_task_notifications'
       AND COLUMN_NAME = 'acknowledged_at'`
  )
  if (!notificationAcknowledgedAtColumn[0].total) {
    await pool.execute(
      `ALTER TABLE workflow_task_notifications
       ADD COLUMN acknowledged_at DATETIME DEFAULT NULL AFTER read_at`
    )
  }

  console.log('Pharaxis Vault database initialized — workflow and signature tables ready')
}

module.exports = { pool, initializeDatabase }
