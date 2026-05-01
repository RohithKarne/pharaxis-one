const publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'http://127.0.0.1').replace(/\/$/, '');
const changedApps = String(process.env.CHANGED_APPS || 'vault,qms,cp-portal,mims,ai-agent')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const APP_CHECKS = {
  vault: {
    frontendPath: '/vault/',
    healthPath: '/vault/api/health',
    protectedPath: '/vault/api/users',
    protectedStatuses: [401, 403],
  },
  qms: {
    frontendPath: '/qms/',
    healthPath: '/qms/api/health',
    protectedPath: '/qms/api/protected/me',
    protectedStatuses: [401, 403],
  },
  'cp-portal': {
    frontendPath: '/cp-portal/',
    healthPath: '/cp-portal/api/health',
    protectedPath: '/cp-portal/api/admin/auth/me',
    protectedStatuses: [401, 403],
  },
  mims: {
    frontendPath: '/mims/',
    healthPath: '/mims/api/health',
    protectedPath: '/mims/api/users',
    protectedStatuses: [401, 403],
  },
  'ai-agent': {
    frontendPath: '/ai-agent/',
    healthPath: '/ai-agent/api/v1/agent/health',
    protectedPath: '/ai-agent/api/v1/agent/admin/keys',
    protectedStatuses: [401, 403],
  },
};

let failed = false;

function logPass(app, check, details = '') {
  console.log(`PASS [${app}] ${check}${details ? `: ${details}` : ''}`);
}

function logFail(app, check, details = '') {
  console.error(`FAIL [${app}] ${check}${details ? `: ${details}` : ''}`);
  failed = true;
}

async function fetchText(path, options = {}) {
  const response = await fetch(`${publicBaseUrl}${path}`, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  return { response, text, payload };
}

async function checkFrontend(app, config) {
  const { response, text } = await fetchText(config.frontendPath);
  if (!response.ok) {
    logFail(app, 'frontend', `status=${response.status}`);
    return;
  }

  const looksLikeHtml =
    text.includes('<!doctype html') ||
    text.includes('<html') ||
    text.includes('<div id="root"') ||
    text.includes('<div id="app"');

  if (!looksLikeHtml) {
    logFail(app, 'frontend', 'response did not look like app shell HTML');
    return;
  }

  logPass(app, 'frontend', config.frontendPath);
}

async function checkHealth(app, config) {
  const { response, payload, text } = await fetchText(config.healthPath);
  if (!response.ok) {
    logFail(app, 'health', `status=${response.status}`);
    return;
  }

  const statusValue = payload?.status ?? payload?.ok;
  if (!(statusValue === 'ok' || statusValue === true)) {
    logFail(app, 'health', `unexpected payload=${text.slice(0, 180)}`);
    return;
  }

  logPass(app, 'health', config.healthPath);
}

async function checkProtectedBarrier(app, config) {
  const { response } = await fetchText(config.protectedPath);
  if (!config.protectedStatuses.includes(response.status)) {
    logFail(
      app,
      'protected-barrier',
      `expected one of [${config.protectedStatuses.join(', ')}], got ${response.status}`
    );
    return;
  }

  logPass(app, 'protected-barrier', `status=${response.status}`);
}

async function runAppChecks(app) {
  const config = APP_CHECKS[app];
  if (!config) {
    logFail(app, 'config', 'no smoke config registered');
    return;
  }

  await checkFrontend(app, config);
  await checkHealth(app, config);
  await checkProtectedBarrier(app, config);
}

async function run() {
  console.log(`Postdeploy smoke base: ${publicBaseUrl}`);
  console.log(`Postdeploy smoke apps: ${changedApps.join(', ')}`);

  for (const app of changedApps) {
    await runAppChecks(app);
  }

  if (failed) {
    console.error('Postdeploy smoke: FAILED');
    process.exit(1);
  }

  console.log('Postdeploy smoke: PASSED');
}

run().catch((error) => {
  console.error(`FAIL [global] smoke-runner: ${error.message}`);
  process.exit(1);
});
