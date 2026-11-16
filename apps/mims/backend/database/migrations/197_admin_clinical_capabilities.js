'use strict';

/**
 * Migration 197 — Clinical Governance & Regulatory Capabilities for MIMS Admin.
 *
 * Tickets 5, 6, 7 (approved by Rohith, 2026-11-16):
 * 1. `product_regional_labels`: Regional prescribing information & SmPC registry
 *    linking products to jurisdictional label versions (US_PI, EU_SMPC, UK_SMPC).
 * 2. `emergency_safety_contacts`: 24/7 on-call medical safety physician directory
 *    for expedited serious adverse event hand-offs (0-day SLA).
 * 3. `mi_response_settings.enforce_safety_screening_gate`: Admin flag enforcing
 *    adverse event / product complaint screening before response completion or send.
 * 4. Seeds baseline records for Calder Therapeutics (org_id = 1).
 */

async function up(conn) {
  // 1. Regional labeling table
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS product_regional_labels (
      id              INT NOT NULL AUTO_INCREMENT,
      org_id          INT NOT NULL,
      product_id      BIGINT NOT NULL,
      region_code     VARCHAR(10) NOT NULL,
      label_type      ENUM('US_PI', 'EU_SMPC', 'UK_SMPC', 'HEALTH_CANADA_PM', 'SWISSMEDIC_PI', 'OTHER') NOT NULL DEFAULT 'US_PI',
      label_title     VARCHAR(255) NOT NULL,
      version         VARCHAR(50) NOT NULL DEFAULT '1.0',
      approval_date   DATE NULL,
      document_url    VARCHAR(500) NULL,
      is_active       TINYINT(1) NOT NULL DEFAULT 1,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY ix_regional_labels_org_prod (org_id, product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 2. Emergency safety contacts table
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS emergency_safety_contacts (
      id              INT NOT NULL AUTO_INCREMENT,
      org_id          INT NOT NULL,
      physician_name  VARCHAR(120) NOT NULL,
      medical_title   VARCHAR(120) NOT NULL DEFAULT 'Medical Safety Officer',
      email           VARCHAR(180) NOT NULL,
      phone_24h       VARCHAR(50) NOT NULL,
      time_zone       VARCHAR(50) NOT NULL DEFAULT 'UTC',
      is_primary      TINYINT(1) NOT NULL DEFAULT 0,
      is_active       TINYINT(1) NOT NULL DEFAULT 1,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY ix_emergency_contacts_org (org_id, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 3. Add enforce_safety_screening_gate to mi_response_settings
  const [colCheck] = await conn.execute(`
    SELECT COUNT(*) AS cnt
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'mi_response_settings'
       AND column_name = 'enforce_safety_screening_gate'
  `);
  if (!colCheck[0]?.cnt) {
    await conn.execute(`
      ALTER TABLE mi_response_settings
        ADD COLUMN enforce_safety_screening_gate TINYINT(1) NOT NULL DEFAULT 1 AFTER urgent_days
    `);
  }

  // 4. Seed baseline records for Calder Therapeutics (org_id = 1)
  const CALDER_ORG_ID = 1;

  // Baseline Regional Labels for Calder Products
  const labels = [
    {
      productId: 92, // Entresto 24/26 mg
      region: 'US',
      type: 'US_PI',
      title: 'Entresto (sacubitril/valsartan) Prescribing Information (FDA)',
      version: '2024.1',
      date: '2024-03-15',
      url: 'https://calderpharma.local/docs/pi/entresto-us-pi.pdf'
    },
    {
      productId: 92,
      region: 'EU',
      type: 'EU_SMPC',
      title: 'Entresto Summary of Product Characteristics (EMA)',
      version: '2024.2',
      date: '2024-05-20',
      url: 'https://calderpharma.local/docs/smpc/entresto-eu-smpc.pdf'
    },
    {
      productId: 94, // Kisqali 200 mg
      region: 'US',
      type: 'US_PI',
      title: 'Kisqali (ribociclib) Prescribing Information (FDA)',
      version: '2023.3',
      date: '2023-11-10',
      url: 'https://calderpharma.local/docs/pi/kisqali-us-pi.pdf'
    },
    {
      productId: 94,
      region: 'EU',
      type: 'EU_SMPC',
      title: 'Kisqali Summary of Product Characteristics (EMA)',
      version: '2023.4',
      date: '2023-12-05',
      url: 'https://calderpharma.local/docs/smpc/kisqali-eu-smpc.pdf'
    },
    {
      productId: 95, // Cosentyx 150 mg/mL
      region: 'US',
      type: 'US_PI',
      title: 'Cosentyx (secukinumab) Prescribing Information (FDA)',
      version: '2024.1',
      date: '2024-01-22',
      url: 'https://calderpharma.local/docs/pi/cosentyx-us-pi.pdf'
    },
    {
      productId: 95,
      region: 'EU',
      type: 'EU_SMPC',
      title: 'Cosentyx SmPC (EMA)',
      version: '2024.1',
      date: '2024-02-14',
      url: 'https://calderpharma.local/docs/smpc/cosentyx-eu-smpc.pdf'
    },
    {
      productId: 96, // Leqvio 284 mg
      region: 'US',
      type: 'US_PI',
      title: 'Leqvio (inclisiran) Prescribing Information (FDA)',
      version: '2023.1',
      date: '2023-09-01',
      url: 'https://calderpharma.local/docs/pi/leqvio-us-pi.pdf'
    },
    {
      productId: 96,
      region: 'EU',
      type: 'EU_SMPC',
      title: 'Leqvio SmPC (EMA)',
      version: '2023.2',
      date: '2023-10-18',
      url: 'https://calderpharma.local/docs/smpc/leqvio-eu-smpc.pdf'
    }
  ];

  for (const l of labels) {
    const [[exists]] = await conn.execute(
      'SELECT id FROM product_regional_labels WHERE org_id = ? AND product_id = ? AND region_code = ? AND label_type = ? LIMIT 1',
      [CALDER_ORG_ID, l.productId, l.region, l.type]
    );
    if (!exists) {
      await conn.execute(
        `INSERT INTO product_regional_labels
         (org_id, product_id, region_code, label_type, label_title, version, approval_date, document_url, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [CALDER_ORG_ID, l.productId, l.region, l.type, l.title, l.version, l.date, l.url]
      );
    }
  }

  // Baseline Emergency Safety Physician Contacts for Calder
  const contacts = [
    {
      name: 'Dr. Aris Thorne, MD',
      title: 'Global Safety Medical Director',
      email: 'aris.thorne@calderpharma.local',
      phone: '+1-800-555-0199',
      tz: 'America/New_York',
      isPrimary: 1
    },
    {
      name: 'Dr. Elena Rostova, MD, PhD',
      title: 'Senior Pharmacovigilance Physician',
      email: 'elena.rostova@calderpharma.local',
      phone: '+41-61-555-0144',
      tz: 'Europe/Zurich',
      isPrimary: 0
    }
  ];

  for (const c of contacts) {
    const [[exists]] = await conn.execute(
      'SELECT id FROM emergency_safety_contacts WHERE org_id = ? AND email = ? LIMIT 1',
      [CALDER_ORG_ID, c.email]
    );
    if (!exists) {
      await conn.execute(
        `INSERT INTO emergency_safety_contacts
         (org_id, physician_name, medical_title, email, phone_24h, time_zone, is_primary, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [CALDER_ORG_ID, c.name, c.title, c.email, c.phone, c.tz, c.isPrimary]
      );
    }
  }
}

async function down(conn) {
  await conn.execute('DROP TABLE IF EXISTS emergency_safety_contacts');
  await conn.execute('DROP TABLE IF EXISTS product_regional_labels');
  try {
    await conn.execute('ALTER TABLE mi_response_settings DROP COLUMN enforce_safety_screening_gate');
  } catch (_) {}
}

module.exports = { up, down };
