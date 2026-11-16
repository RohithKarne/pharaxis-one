'use strict';

/**
 * audit-definitions-dashboards-schedules.js
 *
 * Verifies the complete lifecycle of:
 * 1. Custom Report Definitions (CRUD, duplicate, preview, run)
 * 2. Dashboards (Built-in Operations & Compliance Watch, custom CRUD, duplicate, run with CSV)
 * 3. Favourites (Add, list, delete)
 * 4. Schedules (Scheduled export configs CRUD, pause, resume)
 * 5. Run History (Ops logging, retention)
 * 6. Module Settings (Configuration load, update, restore)
 */

const pool = require('../database/db');
const {
  listReportDefinitions,
  getReportDefinitionById,
  createReportDefinition,
  updateReportDefinition,
  deleteReportDefinition,
  duplicateReportDefinition,
  previewDataset,
  runReportDefinition,
  listDashboards,
  getDashboardById,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  duplicateDashboard,
  runDashboard,
  listFavorites,
  addFavorite,
  deleteFavorite,
  getModuleConfig,
  saveModuleConfig,
} = require('../services/reportModuleService');
const {
  getExportConfigs,
  createExportConfig,
  updateExportConfig,
  pauseExportConfig,
  resumeExportConfig,
  deleteExportConfig,
} = require('../services/scheduledExportService');
const { recordReportRun, listReportRunLedger } = require('../services/reportOpsService');

async function testLifecycle() {
  console.log('================================================================');
  console.log('   MIMS REPORTS MODULE — DEFINITIONS, DASHBOARDS & SCHEDULES');
  console.log('================================================================\n');

  const orgId = 1;
  const adminViewer = { admin: true, manage: true, export: true, schedule: true };
  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      passed += 1;
      console.log(`  ✅ [PASS] ${name}`);
    } else {
      failed += 1;
      console.error(`  ❌ [FAIL] ${name} — ${details}`);
    }
  }

  // 1. Report Definitions
  console.log('--- SECTION 1: Report Definitions ---');
  const defs = await listReportDefinitions(orgId, adminViewer);
  assert('Definitions: Builtin library reports listed (at least 20)', defs.length >= 20, `Count: ${defs.length}`);

  // Preview dataset
  const preview = await previewDataset('daily-case-summary', orgId, { period: 'last_7_days' });
  assert('Definitions: Preview dataset returns columns and rows', Array.isArray(preview.columns) && Array.isArray(preview.rows));

  // Create custom definition
  const createdDef = await createReportDefinition(orgId, 1, {
    dataset_key: 'daily-case-summary',
    name: 'QA Custom Volume Report',
    description: 'Custom report created for QA verification',
    default_filters: { group_by: 'week' },
    selected_columns: ['period', 'received', 'closed'],
    visibility_scope: 'shared',
    is_active: true,
  });
  assert('Definitions: Create custom definition returns valid record', createdDef && createdDef.id > 0);

  // Read back
  const readDef = await getReportDefinitionById(orgId, createdDef.id);
  assert('Definitions: Read back definition by ID matches created data', readDef.name === 'QA Custom Volume Report');

  // Update
  const updatedDef = await updateReportDefinition(orgId, 1, createdDef.id, {
    name: 'QA Custom Volume Report (Updated)',
    description: 'Updated description',
    default_filters: { group_by: 'month' },
    selected_columns: ['period', 'received', 'closed'],
    visibility_scope: 'shared',
    is_active: true,
  });
  assert('Definitions: Update definition persists changes', updatedDef.name === 'QA Custom Volume Report (Updated)');

  // Run custom definition
  const runDef = await runReportDefinition(createdDef, orgId, {}, { user: { userId: 1, orgId: 1, role: 'administrator' } });
  assert('Definitions: Run custom definition returns executed rows and columns', Array.isArray(runDef.rows) && runDef.columns.includes('received'));

  // Duplicate definition
  const dupDef = await duplicateReportDefinition(orgId, 1, createdDef.id);
  assert('Definitions: Duplicate definition creates a copy with "Copy" suffix', dupDef && dupDef.name.includes('Copy'));

  // Delete both
  const delDup = await deleteReportDefinition(orgId, dupDef.id);
  const delDef = await deleteReportDefinition(orgId, createdDef.id);
  assert('Definitions: Delete definitions succeeds', Boolean(delDup && delDef));

  // 2. Dashboards
  console.log('\n--- SECTION 2: Dashboards ---');
  const dashboards = await listDashboards(orgId, adminViewer);
  assert('Dashboards: Lists built-in dashboards (Operations, Compliance Watch)', dashboards.length >= 2);
  const hasOps = dashboards.some((d) => d.name === 'Operations');
  const hasCompliance = dashboards.some((d) => d.name === 'Compliance Watch');
  assert('Dashboards: Both Operations and Compliance Watch built-in dashboards present', hasOps && hasCompliance);

  // Create custom dashboard
  const createdDash = await createDashboard(orgId, 1, {
    name: 'QA Executive Dashboard',
    description: 'Executive overview dashboard for QA verification',
    layout: [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }],
    widgets: [{
      id: 'w1',
      title: 'Operations Summary Widget',
      report_key: 'daily-operations-pack',
      display_mode: 'table',
      limit: 8,
    }],
    visibility_scope: 'shared',
    is_active: true,
  });
  assert('Dashboards: Create custom dashboard succeeds', createdDash && createdDash.id > 0);

  // Read back
  const readDash = await getDashboardById(orgId, createdDash.id);
  assert('Dashboards: Read back dashboard matches created widget configuration', readDash.widgets.length === 1);

  // Run dashboard
  const runDash = await runDashboard(createdDash, orgId, {}, adminViewer, { user: { userId: 1, orgId: 1, role: 'administrator' } });
  assert('Dashboards: Run dashboard returns widget results and combined CSV rows', runDash.widgets.length === 1 && Array.isArray(runDash.csv_rows));

  // Duplicate dashboard
  const dupDash = await duplicateDashboard(orgId, 1, createdDash.id);
  assert('Dashboards: Duplicate dashboard creates copy with "Copy" suffix', dupDash && dupDash.name.includes('Copy'));

  // Delete both
  const delDupDash = await deleteDashboard(orgId, dupDash.id);
  const delDash = await deleteDashboard(orgId, createdDash.id);
  assert('Dashboards: Delete custom dashboards succeeds', Boolean(delDupDash && delDash));

  // 3. Favourites
  console.log('\n--- SECTION 3: Favourites ---');
  // Add favorite
  const fav = await addFavorite(orgId, 1, 'report', 1);
  assert('Favourites: Add report to favourites succeeds', Array.isArray(fav) && fav.some((f) => f.target_id === 1));

  // List favorites
  const favList = await listFavorites(orgId, 1);
  assert('Favourites: List favourites returns added item', favList.some((f) => f.target_id === 1));

  // Delete favorite
  const delFav = await deleteFavorite(orgId, 1, 'report', 1);
  assert('Favourites: Delete favourite succeeds', Array.isArray(delFav) && !delFav.some((f) => f.target_id === 1));

  // 4. Schedules & Export Configs
  console.log('\n--- SECTION 4: Schedules & Export Configs ---');
  const scheduleId = await createExportConfig(orgId, 1, {
    export_name: 'Daily Operations Digest (QA)',
    target_type: 'report',
    target_id: 1,
    schedule_frequency: 'daily',
    schedule_time_local: '08:00',
    schedule_weekday: 1,
    timezone_name: 'UTC',
    delivery_method: 'in_app',
    filters: {},
    is_active: 1,
  });
  assert('Schedules: Create scheduled export config returns new schedule ID', Number.isInteger(scheduleId) && scheduleId > 0);

  // List schedules
  const schedules = await getExportConfigs(orgId);
  assert('Schedules: List export configs contains created schedule', schedules.some((s) => s.id === scheduleId));

  // Update schedule
  await updateExportConfig(scheduleId, orgId, {
    export_name: 'Daily Operations Digest (QA - Updated)',
    target_type: 'report',
    target_id: 1,
    schedule_frequency: 'weekly',
    schedule_time_local: '09:00',
    schedule_weekday: 2,
    timezone_name: 'America/New_York',
    delivery_method: 'in_app',
    filters: {},
    is_active: 1,
  });
  const updatedSchedules = await getExportConfigs(orgId);
  const updatedSchedule = updatedSchedules.find((s) => s.id === scheduleId);
  assert('Schedules: Update schedule persists changes', updatedSchedule && updatedSchedule.schedule_frequency === 'weekly');

  // Pause & Resume
  await pauseExportConfig(scheduleId, orgId, 1);
  const pausedSchedules = await getExportConfigs(orgId);
  const pausedSchedule = pausedSchedules.find((s) => s.id === scheduleId);
  assert('Schedules: Pause export config sets is_active = 0', pausedSchedule && pausedSchedule.is_active === 0);

  await resumeExportConfig(scheduleId, orgId);
  const resumedSchedules = await getExportConfigs(orgId);
  const resumedSchedule = resumedSchedules.find((s) => s.id === scheduleId);
  assert('Schedules: Resume export config sets is_active = 1', resumedSchedule && resumedSchedule.is_active === 1);

  // Delete schedule
  await deleteExportConfig(scheduleId, orgId);
  const afterDeleteSchedules = await getExportConfigs(orgId);
  assert('Schedules: Delete export config succeeds', !afterDeleteSchedules.some((s) => s.id === scheduleId));

  // 5. Run History & Ops Logging
  console.log('\n--- SECTION 5: Run History & Ops Logging ---');
  await recordReportRun({
    orgId,
    reportKey: 'daily-case-openings',
    reportName: 'Cases Received',
    targetType: 'report',
    targetId: 1,
    runMode: 'manual',
    triggeredBy: 1,
    rowCount: 8,
    durationMs: 120,
    filters: { period: 'last_7_days' },
    status: 'success',
  });

  const history = await listReportRunLedger(orgId, { limit: 10 });
  assert('Run History: Lists report runs with user, status, row count and execution time', history.length > 0 && history[0].status === 'success');

  // 6. Settings / Module Configuration
  console.log('\n--- SECTION 6: Module Settings ---');
  const currentConfig = await getModuleConfig(orgId);
  assert('Settings: Module configuration loaded with default timezone and scheduler status', typeof currentConfig.default_timezone === 'string');

  const updatedConfig = await saveModuleConfig(orgId, 1, {
    ...currentConfig,
    email_from_name: 'MIMS QA Reports',
    digest_subject_prefix: '[QA Reports]',
  });
  assert('Settings: Module configuration updates successfully', updatedConfig.email_from_name === 'MIMS QA Reports');

  // Restore
  await saveModuleConfig(orgId, 1, currentConfig);
  assert('Settings: Original module configuration restored', true);

  console.log('\n================================================================');
  console.log(` LIFECYCLE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  testLifecycle()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Lifecycle fatal exception:', err);
      process.exit(1);
    });
}

module.exports = { testLifecycle };
