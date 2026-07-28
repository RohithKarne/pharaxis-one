const express = require('express');
const router = express.Router();
const configVersionControlService = require('../../services/configVersionControlService');
const { authenticateAdmin } = require('../../middleware/auth'); // Assuming auth middleware exists

// GET /api/admin/config-versions
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { orgId } = req.user;
    const { configType } = req.query;
    const snapshots = await configVersionControlService.listSnapshots({ orgId, configType });
    res.json({ snapshots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/config-versions
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { orgId, userId: createdByUserId } = req.user;
    const { snapshotName, configType } = req.body;
    
    const snapshot = await configVersionControlService.createSnapshot({
      orgId,
      snapshotName,
      configType,
      createdByUserId
    });
    
    res.status(201).json({ snapshot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/config-versions/:id/rollback
router.post('/:id/rollback', authenticateAdmin, async (req, res) => {
  try {
    const { orgId, userId: restoredByUserId } = req.user;
    const snapshotId = req.params.id;
    
    const result = await configVersionControlService.rollbackToSnapshot({
      orgId,
      snapshotId,
      restoredByUserId
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
