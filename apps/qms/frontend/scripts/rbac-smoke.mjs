import { MODULE_ACCESS, canReadModule, canWriteModule, hasAnyRole } from '../src/config/rbac.js';

function pass(name) {
  console.log(`PASS ${name}`);
}

function fail(name, details) {
  console.error(`FAIL ${name}: ${details}`);
  process.exitCode = 1;
}

function check(name, condition, details) {
  if (condition) pass(name);
  else fail(name, details);
}

check('modules-exist', Object.keys(MODULE_ACCESS).length >= 10, 'expected at least 10 module definitions');
check('viewer-can-read-dashboard', canReadModule('dashboard', ['viewer']) === true, 'viewer should read dashboard');
check('viewer-cannot-write-change-control', canWriteModule('changeControl', ['viewer']) === false, 'viewer should not write change control');
check('qa-can-write-quality-insights', canWriteModule('qualityInsights', ['qa_reviewer']) === true, 'qa_reviewer should write quality insights');
check('author-cannot-read-quality-insights', canReadModule('qualityInsights', ['author']) === false, 'author should not read quality insights');
check('qa-can-write-training-management', canWriteModule('trainingManagement', ['qa_reviewer']) === true, 'qa_reviewer should write training management');
check('viewer-cannot-write-training-management', canWriteModule('trainingManagement', ['viewer']) === false, 'viewer should not write training management');
check('admin-can-write-integrations', canWriteModule('integrations', ['admin']) === true, 'admin should write integrations');
check('superadmin-bypass', hasAnyRole(['superadmin'], ['admin']) === true, 'superadmin should satisfy admin role checks');

if (process.exitCode) {
  console.error('RBAC frontend smoke: FAILED');
  process.exit(process.exitCode);
}

console.log('RBAC frontend smoke: PASSED');
