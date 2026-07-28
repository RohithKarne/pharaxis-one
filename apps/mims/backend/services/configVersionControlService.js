const db = require('../db');

class ConfigVersionControlService {
  async createSnapshot({ orgId, snapshotName, configType, createdByUserId }) {
    return await db.transaction(async (trx) => {
      // Mock fetching config data based on configType
      let snapshotPayload = {};
      
      const newSnapshot = await trx('config_snapshots').insert({
        org_id: orgId,
        snapshot_name: snapshotName,
        configuration_type: configType,
        snapshot_payload: JSON.stringify(snapshotPayload),
        created_by: createdByUserId,
        created_at: new Date()
      }).returning('*');
      
      return newSnapshot[0];
    });
  }

  async listSnapshots({ orgId, configType }) {
    let query = db('config_snapshots')
      .where({ org_id: orgId })
      .orderBy('created_at', 'desc');
      
    if (configType) {
      query = query.where({ configuration_type: configType });
    }
    
    return await query;
  }

  async rollbackToSnapshot({ orgId, snapshotId, restoredByUserId }) {
    return await db.transaction(async (trx) => {
      const snapshot = await trx('config_snapshots')
        .where({ id: snapshotId, org_id: orgId })
        .first();
        
      if (!snapshot) {
        throw new Error('Snapshot not found');
      }

      // Restore logic would go here, applying snapshot.snapshot_payload to config tables
      
      // Audit log
      await trx('audit_logs').insert({
        org_id: orgId,
        action: 'CONFIG_ROLLBACK',
        details: JSON.stringify({ snapshot_id: snapshotId, snapshot_name: snapshot.snapshot_name }),
        performed_by: restoredByUserId,
        created_at: new Date()
      });
      
      return { success: true, message: `Rolled back to snapshot ${snapshot.snapshot_name}` };
    });
  }
}

module.exports = new ConfigVersionControlService();
