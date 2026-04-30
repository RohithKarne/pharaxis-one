import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertAnyRole, hasAnyRole, normalizeRoles } from '../src/middleware/rbac.js';

const ROLES = ['viewer', 'author', 'qa_reviewer', 'approver', 'admin', 'superadmin'];

const endpointMatrix = [
  { key: 'document-control:create-document', roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { key: 'document-control:approve-document', roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { key: 'capa:create-record', roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { key: 'capa:approve-closure', roles: ['approver', 'qa_reviewer', 'admin', 'superadmin'] },
  { key: 'deviations:create-record', roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { key: 'deviations:close-record', roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { key: 'audits:create-audit', roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { key: 'audits:issue-closure', roles: ['qa_reviewer', 'admin', 'superadmin', 'approver'] },
  { key: 'validation:create-system', roles: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { key: 'validation:approve-protocol', roles: ['approver', 'admin', 'superadmin'] },
  { key: 'change-control:create-change', roles: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { key: 'change-control:close-change', roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { key: 'complaints:create-complaint', roles: ['author', 'qa_reviewer', 'admin', 'superadmin'] },
  { key: 'complaints:close-complaint', roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { key: 'nonconformance:create-case', roles: ['author', 'qa_reviewer', 'admin', 'superadmin'] },
  { key: 'nonconformance:close-case', roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { key: 'supplier-quality:save-scorecard', roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { key: 'risk-management:save-risk', roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { key: 'management-review:save-cycle', roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { key: 'platform:retry-email', roles: ['admin', 'superadmin', 'qa_reviewer'] },
  { key: 'platform:mark-email-sent', roles: ['admin', 'superadmin'] },
  { key: 'platform:run-alerts', roles: ['admin', 'superadmin', 'qa_reviewer'] }
];

const migratedRouteFiles = [
  'documentControl.js',
  'capa.js',
  'deviations.js',
  'audits.js',
  'validation.js',
  'changeControl.js',
  'platform.js',
  'complaints.js',
  'nonconformance.js',
  'supplierQuality.js',
  'riskManagement.js',
  'managementReview.js',
  'integrations.js',
  'aiInsights.js'
];

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

check('endpoint-matrix-size', endpointMatrix.length >= 20, 'expected broad endpoint RBAC coverage');
check('normalizeRoles-dedupe', normalizeRoles(['Admin', 'admin', 'ADMIN']).length === 1, 'normalizeRoles should dedupe case-insensitively');
check('superadmin-bypass-baseline', hasAnyRole(['superadmin'], ['admin']) === true, 'superadmin should bypass checks');

for (const item of endpointMatrix) {
  for (const role of ROLES) {
    const shouldAllow = hasAnyRole([role], item.roles);
    try {
      assertAnyRole({ authContext: { roles: [role] } }, item.roles);
      check(`allow-${item.key}-${role}`, shouldAllow, `${role} should be denied for ${item.key}`);
    } catch (error) {
      check(
        `deny-${item.key}-${role}`,
        !shouldAllow && error?.statusCode === 403,
        `${role} deny result mismatch for ${item.key}`
      );
    }
  }
}

for (const fileName of migratedRouteFiles) {
  const filePath = resolve('src/routes', fileName);
  const source = await readFile(filePath, 'utf8');

  check(
    `route-import-assertAnyRole-${fileName}`,
    source.includes("import { assertAnyRole } from '../middleware/rbac.js';"),
    `${fileName} missing shared RBAC import`
  );

  check(
    `route-no-local-assertRole-${fileName}`,
    !source.includes('function assertRole('),
    `${fileName} still defines local assertRole`
  );
}

if (process.exitCode) {
  console.error('RBAC backend role matrix: FAILED');
  process.exit(process.exitCode);
}

console.log('RBAC backend role matrix: PASSED');
