'use strict';

/**
 * Migration 083 — Division Parameters P2/P3 config columns
 *
 * Extends division_parameters with the configuration captured by the remaining
 * wizard tabs: Case Entry/Resp Letters, Email/PDF/Fax, AE, PC, Case Completion.
 * All columns are config storage. The up-to-10 custom client fields (Case/AE/PC)
 * are NOT columns here — they ride field_setup reserved sections.
 *
 * Idempotent: each ALTER is wrapped so re-runs are harmless.
 */

const COLUMNS = [
  // ── Case Entry / Resp Letters (tab 2) ──
  // Customizable actions (9 checkboxes)
  `ce_lookup_city_zip            TINYINT(1) NOT NULL DEFAULT 0`,
  `ce_lookup_rep_zip             TINYINT(1) NOT NULL DEFAULT 0`,
  `ce_lookup_msl                 TINYINT(1) NOT NULL DEFAULT 0`,
  `ce_suppress_ae                TINYINT(1) NOT NULL DEFAULT 0`,
  `ce_suppress_pc                TINYINT(1) NOT NULL DEFAULT 0`,
  `ce_lock_entered_date          TINYINT(1) NOT NULL DEFAULT 0`,
  `ce_sort_product_by_status     TINYINT(1) NOT NULL DEFAULT 0`,
  `ce_allow_new_qa_case          TINYINT(1) NOT NULL DEFAULT 0`,
  `ce_allow_field_translation    TINYINT(1) NOT NULL DEFAULT 0`,
  // Case entry maxes
  `ce_max_contacts               INT`,
  `ce_max_questions              INT`,
  // Numbering options
  `num_case_number               VARCHAR(100)`,
  `num_ae_mode                   ENUM('same','new') NOT NULL DEFAULT 'same'`,
  `num_pc_mode                   ENUM('same','new') NOT NULL DEFAULT 'same'`,
  // Response options
  `resp_allow_letters            TINYINT(1) NOT NULL DEFAULT 0`,
  `resp_custom_letters_mode      ENUM('auto_on','auto_on_off','manual_on_off') NOT NULL DEFAULT 'manual_on_off'`,
  `resp_store_secured_pdf        TINYINT(1) NOT NULL DEFAULT 0`,
  `resp_allow_email              TINYINT(1) NOT NULL DEFAULT 0`,

  // ── Email / PDF / Fax (tab 4) ──
  `email_attachment_format       ENUM('native','secured_pdf','unsecured_pdf','secured_package','unsecured_package') NOT NULL DEFAULT 'secured_pdf'`,
  `fax_server_domain             VARCHAR(255)`,
  `fax_out_address_mask          VARCHAR(255)`,
  `fax_out_subject               VARCHAR(255)`,
  `fax_out_success_phrase        VARCHAR(255)`,

  // ── AE (tab 6) — general ──
  `ae_auto_snapshot_on_referral  ENUM('yes','no') NOT NULL DEFAULT 'no'`,
  `ae_country_of_occurrence      ENUM('yes','no') NOT NULL DEFAULT 'no'`,
  `ae_delete_cancel_mode         ENUM('delete','cancel') NOT NULL DEFAULT 'cancel'`,
  `ae_med_types                  VARCHAR(255)`, // CSV multiselect
  `ae_require_death_date         ENUM('yes','no') NOT NULL DEFAULT 'no'`,
  `ae_contact_type_to_occupation ENUM('yes','no') NOT NULL DEFAULT 'no'`,
  `ae_default_report_type        ENUM('yes','no') NOT NULL DEFAULT 'no'`,
  `ae_force_commit_cancel        ENUM('on','off') NOT NULL DEFAULT 'off'`,
  `ae_product_mode               ENUM('default','force') NOT NULL DEFAULT 'default'`,
  `ae_seriousness                ENUM('yes','no') NOT NULL DEFAULT 'no'`,
  // AE integrations
  `ae_include_attachments        ENUM('yes','no') NOT NULL DEFAULT 'no'`,
  `ae_integration_method         ENUM('e2b_r2','none') NOT NULL DEFAULT 'none'`,

  // ── PC (tab 7) ──
  `pc_auto_snapshot_on_referral  ENUM('yes','no') NOT NULL DEFAULT 'no'`,
  `pc_delete_cancel_mode         ENUM('delete','cancel') NOT NULL DEFAULT 'cancel'`,
  `pc_force_commit_cancel        ENUM('on','off') NOT NULL DEFAULT 'off'`,
  `pc_validate_case_entry        ENUM('yes','no') NOT NULL DEFAULT 'no'`,

  // ── Case Completion (tab 8) — completion notification ──
  `comp_notif_active             TINYINT(1) NOT NULL DEFAULT 0`,
  `comp_notif_require_ae         TINYINT(1) NOT NULL DEFAULT 0`,
  `comp_notif_include_letter     TINYINT(1) NOT NULL DEFAULT 0`,
  `comp_notif_email_template     VARCHAR(120)`,
  `comp_notif_email_to           VARCHAR(255)`,
  `comp_notif_require_pc         TINYINT(1) NOT NULL DEFAULT 0`,
  `comp_notif_include_snapshot   TINYINT(1) NOT NULL DEFAULT 0`,
  `comp_notif_save_attachment    TINYINT(1) NOT NULL DEFAULT 0`,
  // sales rep notification
  `comp_rep_active               TINYINT(1) NOT NULL DEFAULT 0`,
  `comp_rep_email_template       VARCHAR(120)`,
  `comp_rep_trigger              ENUM('initial','all') NOT NULL DEFAULT 'initial'`,
  `comp_rep_types                VARCHAR(255)`, // CSV
  // MSL notification
  `comp_msl_active               TINYINT(1) NOT NULL DEFAULT 0`,
  `comp_msl_email_template       VARCHAR(120)`,
  `comp_msl_trigger              ENUM('initial','all') NOT NULL DEFAULT 'initial'`,
];

async function up(conn) {
  for (const colDef of COLUMNS) {
    const colName = colDef.trim().split(/\s+/)[0];
    try {
      await conn.execute(`ALTER TABLE division_parameters ADD COLUMN ${colDef}`);
    } catch (e) {
      // Ignore "duplicate column" so re-runs are safe; rethrow anything else.
      if (!/duplicate column/i.test(e.message)) throw e;
    }
    void colName;
  }
}

async function down(_conn) {}

module.exports = { up, down };
