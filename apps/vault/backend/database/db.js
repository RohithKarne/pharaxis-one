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
    )`
  ]

  for (const query of queries) {
    await pool.execute(query)
  }
  console.log('Pharaxis Vault database initialized — all 21 tables ready')
}

module.exports = { pool, initializeDatabase }
