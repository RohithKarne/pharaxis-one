import { MODULE_ACCESS, canReadModule, canWriteModule, hasAnyRole, normalizeRoles } from '../src/config/rbac.js';
import { CLIENT_RBAC_RULES, findClientRbacRule } from '../src/config/apiRbacRules.js';

const ROLES = ['viewer', 'author', 'qa_reviewer', 'approver', 'admin', 'superadmin'];

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

check('module-count', Object.keys(MODULE_ACCESS).length >= 16, 'expected full module matrix definitions');
check('rule-count', CLIENT_RBAC_RULES.length >= 29, 'expected full endpoint rule matrix');

for (const [moduleKey, access] of Object.entries(MODULE_ACCESS)) {
  for (const role of ROLES) {
    const expectedRead = hasAnyRole([role], normalizeRoles(access.readRoles || []));
    const expectedWrite = hasAnyRole([role], normalizeRoles(access.writeRoles || []));

    check(
      `module-read-${moduleKey}-${role}`,
      canReadModule(moduleKey, [role]) === expectedRead,
      `read mismatch for ${moduleKey}/${role}`
    );

    check(
      `module-write-${moduleKey}-${role}`,
      canWriteModule(moduleKey, [role]) === expectedWrite,
      `write mismatch for ${moduleKey}/${role}`
    );
  }

  check(
    `module-superadmin-write-${moduleKey}`,
    canWriteModule(moduleKey, ['superadmin']) === true,
    `superadmin should always write ${moduleKey}`
  );
}

const apiCases = [
  { method: 'GET', path: '/intelligence/quality-insights', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', path: '/document-control/documents', allowed: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PUT', path: '/document-control/documents/abc', allowed: ['admin', 'qa_reviewer', 'superadmin'] },
  { method: 'PATCH', path: '/document-control/workflow/abc', allowed: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', path: '/capa', allowed: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PUT', path: '/capa/123', allowed: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/capa/123/close', allowed: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', path: '/deviations', allowed: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/deviations/1/triage', allowed: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', path: '/audits', allowed: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/audits/1/findings/2', allowed: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', path: '/validation/systems', allowed: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/validation/systems/4/status', allowed: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PUT', path: '/validation/systems/4/traceability', allowed: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', path: '/change-control', allowed: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/change-control/5/workflow', allowed: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', path: '/complaints', allowed: ['author', 'qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/complaints/8', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', path: '/nonconformance', allowed: ['author', 'qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/nonconformance/8', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', path: '/supplier-quality/suppliers', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/supplier-quality/suppliers/1/risk', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', path: '/risk-management/register', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/risk-management/register/1/mitigations', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', path: '/management-review/cycles', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', path: '/management-review/cycles/1/close', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', path: '/platform/training/assignments', allowed: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PUT', path: '/integrations/adapters/lims', allowed: ['admin', 'superadmin'] },
  { method: 'POST', path: '/integrations/adapters/lims/sync', allowed: ['qa_reviewer', 'admin', 'superadmin'] }
];

for (const testCase of apiCases) {
  const rule = findClientRbacRule(testCase.path, testCase.method);
  check(
    `api-rule-found-${testCase.method}-${testCase.path}`,
    Boolean(rule),
    `missing client RBAC rule for ${testCase.method} ${testCase.path}`
  );

  if (!rule) continue;

  for (const role of ROLES) {
    const expected = hasAnyRole([role], testCase.allowed);
    const actual = hasAnyRole([role], rule.roles);
    check(
      `api-role-${testCase.method}-${testCase.path}-${role}`,
      actual === expected,
      `${role} permission mismatch for ${testCase.method} ${testCase.path}`
    );
  }
}

if (process.exitCode) {
  console.error('RBAC frontend role matrix: FAILED');
  process.exit(process.exitCode);
}

console.log('RBAC frontend role matrix: PASSED');
