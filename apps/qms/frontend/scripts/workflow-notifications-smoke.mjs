import { findClientRbacRule } from '../src/config/apiRbacRules.js';
import { FEATURE_FLAGS } from '../src/config/featureFlags.js';
import { MODULE_ACCESS, canReadModule } from '../src/config/rbac.js';

function pass(step, detail = '') {
  console.log(`PASS ${step}${detail ? `: ${detail}` : ''}`);
}

function fail(step, detail = '') {
  console.error(`FAIL ${step}${detail ? `: ${detail}` : ''}`);
  process.exitCode = 1;
}

function check(step, condition, detail) {
  if (condition) pass(step, detail);
  else fail(step, detail);
}

check('module-workflow-inbox', Boolean(MODULE_ACCESS.workflowInbox), 'workflowInbox module access configured');
check('module-notifications-center', Boolean(MODULE_ACCESS.notificationsCenter), 'notificationsCenter module access configured');

check(
  'viewer-can-read-workflow-inbox',
  canReadModule('workflowInbox', ['viewer']) === true,
  'viewer should read workflow inbox'
);

check(
  'patch-notification-rule-exists',
  Boolean(findClientRbacRule('/platform/notifications/read-all', 'PATCH')),
  'PATCH notification read-all rule is present'
);

check('feature-workflow-inbox-flag', typeof FEATURE_FLAGS.workflowInbox === 'boolean', `value=${FEATURE_FLAGS.workflowInbox}`);
check(
  'feature-notifications-center-flag',
  typeof FEATURE_FLAGS.notificationsCenter === 'boolean',
  `value=${FEATURE_FLAGS.notificationsCenter}`
);

if (process.exitCode) {
  console.error('workflow-notifications frontend smoke: FAILED');
  process.exit(process.exitCode);
}

console.log('workflow-notifications frontend smoke: PASSED');
