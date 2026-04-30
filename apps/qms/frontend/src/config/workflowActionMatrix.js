import { normalizeRoles } from './rbac';

const APPROVAL_ROLES = ['approver', 'qa_reviewer', 'admin', 'superadmin'];

const MATRIX = {
  CAPA: [
    { matches: /approval|investigation/i, actions: ['approveActionPlan', 'rejectActionPlan', 'viewTimeline'] },
    { matches: /effectiveness|execution|closure/i, actions: ['approveClosure', 'rejectClosure', 'viewTimeline'] },
    { matches: /.*/, actions: ['viewTimeline'] }
  ],
  'Change Control': [
    { matches: /pending|review|approved|cab/i, actions: ['approveChange', 'rejectChange', 'viewTimeline'] },
    { matches: /.*/, actions: ['viewTimeline'] }
  ],
  Deviation: [{ matches: /.*/, actions: ['viewTimeline'] }],
  Audit: [{ matches: /.*/, actions: ['viewTimeline'] }]
};

function roleAllowsAction(actionKey, userRoles) {
  if (actionKey === 'viewTimeline') return true;
  return APPROVAL_ROLES.some((role) => userRoles.includes(role));
}

export function resolveWorkflowActions({ moduleName, status, userRoles }) {
  const normalizedRoles = normalizeRoles(userRoles);
  const moduleRules = MATRIX[moduleName] || [];
  const statusText = String(status || '');
  const matchedRule = moduleRules.find((rule) => rule.matches.test(statusText)) || { actions: ['viewTimeline'] };
  return matchedRule.actions.filter((action) => roleAllowsAction(action, normalizedRoles));
}
