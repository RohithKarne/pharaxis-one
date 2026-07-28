'use strict';

const pool = require('../database/db');
const { bootstrapOrgWithConnection } = require('./orgBootstrapService');
const { logAudit } = require('../utils/auditLog');

async function copyTableDynamic(conn, tableName, sourceOrgId, newOrgId, fkMappings = {}, idColumnName = 'id') {
  try {
    const [cols] = await conn.execute(`SHOW COLUMNS FROM ${tableName}`);
    const colNames = cols.map(c => c.Field).filter(f => f !== idColumnName && f !== 'org_id');
    
    if (colNames.length === 0) return { affectedRows: 0, idMap: {} };

    // Get source rows
    const [rows] = await conn.execute(`SELECT * FROM ${tableName} WHERE org_id = ?`, [sourceOrgId]);
    if (rows.length === 0) return { affectedRows: 0, idMap: {} };

    const insertCols = ['org_id', ...colNames].map(c => `\`${c}\``).join(', ');
    const placeholders = ['?', ...colNames.map(() => '?')].join(', ');
    const query = `INSERT INTO ${tableName} (${insertCols}) VALUES (${placeholders})`;

    let affectedRows = 0;
    const idMap = {};

    for (const row of rows) {
      const values = [newOrgId];
      for (const col of colNames) {
        let val = row[col];
        if (fkMappings[col]) {
          const map = fkMappings[col];
          val = map[val] || val; // translate if mapping exists
        }
        values.push(val);
      }
      const [res] = await conn.execute(query, values);
      affectedRows++;
      if (row[idColumnName]) {
        idMap[row[idColumnName]] = res.insertId;
      }
    }

    return { affectedRows, idMap };
  } catch (e) {
    console.warn(`Could not clone ${tableName}:`, e.message);
    return { affectedRows: 0, idMap: {} };
  }
}

async function cloneOrgConfig({ sourceOrgId, targetName, createdByUserId, createdByEmail }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Create org
    const [orgResult] = await conn.execute(
      'INSERT INTO organisations (name, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())',
      [targetName]
    );
    const newOrgId = orgResult.insertId;

    // 2. Bootstrap baseline tables
    await bootstrapOrgWithConnection(conn, newOrgId, createdByUserId);
    
    // Clear bootstrapped workflow_states and case_number_config to avoid duplicates since we're cloning
    try { await conn.execute('DELETE FROM workflow_states WHERE org_id = ?', [newOrgId]); } catch(e){}
    try { await conn.execute('DELETE FROM case_number_config WHERE org_id = ?', [newOrgId]); } catch(e){}
    try { await conn.execute('DELETE FROM field_setup WHERE org_id = ?', [newOrgId]); } catch(e){}

    let clonedTablesCount = 0;

    // 3. Copy tenant_picklists or picklists
    const p1 = await copyTableDynamic(conn, 'tenant_picklists', sourceOrgId, newOrgId);
    const p2 = await copyTableDynamic(conn, 'picklists', sourceOrgId, newOrgId);
    if (p1.affectedRows > 0 || p2.affectedRows > 0) clonedTablesCount++;

    // 4. Copy case_form_rules / field_setup
    const f1 = await copyTableDynamic(conn, 'field_setup', sourceOrgId, newOrgId);
    const f2 = await copyTableDynamic(conn, 'case_form_rules', sourceOrgId, newOrgId);
    if (f1.affectedRows > 0 || f2.affectedRows > 0) clonedTablesCount++;

    // 5. Copy security_groups & security_group_privileges
    const sg = await copyTableDynamic(conn, 'security_groups', sourceOrgId, newOrgId);
    if (sg.affectedRows > 0) {
      clonedTablesCount++;
      const sgp = await copyTableDynamic(conn, 'security_group_privileges', sourceOrgId, newOrgId, {
        group_id: sg.idMap
      });
      if (sgp.affectedRows > 0) clonedTablesCount++;
    }

    // 6. Copy workflow_states & workflow_transitions
    const ws = await copyTableDynamic(conn, 'workflow_states', sourceOrgId, newOrgId);
    if (ws.affectedRows > 0) {
      clonedTablesCount++;
      const wt = await copyTableDynamic(conn, 'workflow_transitions', sourceOrgId, newOrgId, {
        from_state_id: ws.idMap,
        to_state_id: ws.idMap
      });
      if (wt.affectedRows > 0) clonedTablesCount++;
    }

    // 7. Copy case_number_config
    const cnc = await copyTableDynamic(conn, 'case_number_config', sourceOrgId, newOrgId);
    if (cnc.affectedRows > 0) clonedTablesCount++;

    // 8. Copy tenant_feature_flags or feature_flags
    const ff1 = await copyTableDynamic(conn, 'tenant_feature_flags', sourceOrgId, newOrgId);
    const ff2 = await copyTableDynamic(conn, 'feature_flags', sourceOrgId, newOrgId);
    if (ff1.affectedRows > 0 || ff2.affectedRows > 0) clonedTablesCount++;

    await conn.commit();
    
    await logAudit(createdByUserId, createdByEmail, 'CLONE', 'organisation', newOrgId, {
      sourceOrgId,
      targetName,
      clonedTablesCount
    });

    return { newOrgId, targetName, clonedTablesCount };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { cloneOrgConfig };
