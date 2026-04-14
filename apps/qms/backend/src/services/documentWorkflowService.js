const lifecycle = ['Draft', 'Review', 'Approved', 'Effective', 'Retired'];

const transitions = {
  Draft: ['Review'],
  Review: ['Approved'],
  Approved: ['Effective'],
  Effective: ['Retired'],
  Retired: []
};

const roleRules = {
  Review: ['author', 'admin', 'qa_reviewer', 'superadmin'],
  Approved: ['qa_reviewer', 'approver', 'admin', 'superadmin'],
  Effective: ['approver', 'admin', 'superadmin'],
  Retired: ['approver', 'admin', 'superadmin']
};

const signatureRequirements = {
  Approved: 'review',
  Effective: 'approve'
};

export function assertValidStatus(status) {
  if (!lifecycle.includes(status)) {
    const error = new Error(`Invalid lifecycle status: ${status}`);
    error.statusCode = 400;
    throw error;
  }
}

export function assertTransitionAllowed(fromStatus, toStatus) {
  assertValidStatus(fromStatus);
  assertValidStatus(toStatus);

  const allowed = transitions[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    const error = new Error(`Invalid transition: ${fromStatus} -> ${toStatus}`);
    error.statusCode = 400;
    throw error;
  }
}

export function assertRoleAllowedForTransition(toStatus, roles) {
  const normalizedRoles = Array.isArray(roles) ? roles : [];
  const required = roleRules[toStatus] || [];
  if (required.length === 0) return;

  const authorized = normalizedRoles.some((role) => required.includes(role));
  if (!authorized) {
    const error = new Error(
      `Transition to ${toStatus} requires one of roles: ${required.join(', ')}`
    );
    error.statusCode = 403;
    throw error;
  }
}

export function signatureMeaningForTransition(toStatus) {
  return signatureRequirements[toStatus] || null;
}
