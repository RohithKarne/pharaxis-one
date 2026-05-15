'use strict';

async function executeAction(action = {}, context = {}) {
  const type = action.type || action.action || 'noop';
  return { type, status: 'executed', simulated: Boolean(context.simulate), payload: action };
}

module.exports = { executeAction };
