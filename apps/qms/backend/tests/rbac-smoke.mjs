import { assertAnyRole, hasAnyRole } from '../src/middleware/rbac.js';

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

check('hasAnyRole-matches-admin', hasAnyRole(['admin'], ['admin', 'qa_reviewer']) === true, 'admin role should match');
check('hasAnyRole-denies-viewer', hasAnyRole(['viewer'], ['admin']) === false, 'viewer should not match admin');
check('hasAnyRole-superadmin-bypass', hasAnyRole(['superadmin'], ['admin']) === true, 'superadmin should bypass role checks');

try {
  assertAnyRole({ authContext: { roles: ['qa_reviewer'] } }, ['qa_reviewer', 'admin']);
  pass('assertAnyRole-allows-authorized');
} catch (error) {
  fail('assertAnyRole-allows-authorized', error.message);
}

try {
  assertAnyRole({ authContext: { roles: ['viewer'] } }, ['qa_reviewer', 'admin']);
  fail('assertAnyRole-denies-unauthorized', 'expected error but none thrown');
} catch (error) {
  check('assertAnyRole-denies-unauthorized', error.statusCode === 403, 'expected statusCode 403');
}

if (process.exitCode) {
  console.error('RBAC backend smoke: FAILED');
  process.exit(process.exitCode);
}

console.log('RBAC backend smoke: PASSED');
