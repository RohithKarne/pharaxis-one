export const CLIENT_RBAC_RULES = [
  { method: 'PATCH', pattern: /^\/platform\/notifications(?:\/|$)/, roles: ['viewer', 'author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'GET', pattern: /^\/intelligence\/quality-insights(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/document-control(?:\/|$)/, roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PUT', pattern: /^\/document-control(?:\/|$)/, roles: ['admin', 'qa_reviewer', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/document-control(?:\/|$)/, roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/capa(?:\/|$)/, roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PUT', pattern: /^\/capa(?:\/|$)/, roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/capa(?:\/|$)/, roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/deviations(?:\/|$)/, roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/deviations(?:\/|$)/, roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/audits(?:\/|$)/, roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/audits(?:\/|$)/, roles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/validation(?:\/|$)/, roles: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/validation(?:\/|$)/, roles: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PUT', pattern: /^\/validation(?:\/|$)/, roles: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/change-control(?:\/|$)/, roles: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/change-control(?:\/|$)/, roles: ['qa_reviewer', 'approver', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/complaints(?:\/|$)/, roles: ['author', 'qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/complaints(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/nonconformance(?:\/|$)/, roles: ['author', 'qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/nonconformance(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/supplier-quality(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/supplier-quality(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/risk-management(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/risk-management(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/management-review(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PATCH', pattern: /^\/management-review(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/platform\/training(?:\/|$)/, roles: ['qa_reviewer', 'admin', 'superadmin'] },
  { method: 'PUT', pattern: /^\/integrations\/adapters\/[^/]+$/, roles: ['admin', 'superadmin'] },
  { method: 'POST', pattern: /^\/integrations\/adapters\/[^/]+\/sync$/, roles: ['qa_reviewer', 'admin', 'superadmin'] }
];

export function findClientRbacRule(path, method) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  return CLIENT_RBAC_RULES.find((rule) => rule.method === normalizedMethod && rule.pattern.test(path));
}
