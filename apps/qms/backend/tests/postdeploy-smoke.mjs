const BASE_URL = process.env.QMS_API_BASE || 'http://127.0.0.1:3145/api';
const FRONTEND_URL = process.env.QMS_FRONTEND_URL || 'http://127.0.0.1:3146/qms/login';

const CREDS = {
  orgCode: process.env.QMS_ORG_CODE || 'PHA_DEV',
  userId: process.env.QMS_USER_ID || 'admin',
  password: process.env.QMS_PASSWORD || 'Admin@123',
  superadminUserId: process.env.QMS_SUPERADMIN_USER_ID || 'superadmin',
  superadminPassword: process.env.QMS_SUPERADMIN_PASSWORD || 'Manager@123'
};

function logPass(step, details = '') {
  console.log(`PASS ${step}${details ? `: ${details}` : ''}`);
}

function logFail(step, details = '') {
  console.error(`FAIL ${step}${details ? `: ${details}` : ''}`);
  process.exitCode = 1;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  return { status: response.status, ok: response.ok, payload };
}

async function checkHealth() {
  const res = await request('/health');
  if (!res.ok || !res.payload?.ok) {
    logFail('health', `status=${res.status}`);
    return null;
  }
  logPass('health', `app=${res.payload.app}`);
  return res.payload;
}

async function checkOrgDirectory() {
  const res = await request('/auth/orgs');
  if (!res.ok) {
    logFail('auth-orgs', `status=${res.status}`);
    return false;
  }
  const exists = Array.isArray(res.payload?.orgs)
    && res.payload.orgs.some((org) => org.orgCode === CREDS.orgCode);
  if (!exists) {
    logFail('auth-orgs', `orgCode ${CREDS.orgCode} not found`);
    return false;
  }
  logPass('auth-orgs', `${CREDS.orgCode} found`);
  return true;
}

async function loginSuperadmin() {
  const res = await request('/auth/superadmin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: CREDS.superadminUserId,
      password: CREDS.superadminPassword
    })
  });

  if (!res.ok || !res.payload?.accessToken) {
    logFail('superadmin-login', `status=${res.status}`);
    return null;
  }

  logPass('superadmin-login', `status=${res.status}`);
  return res.payload.accessToken;
}

async function verifySuperadminOrgs(token) {
  const res = await request('/superadmin/orgs', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    logFail('superadmin-orgs', `status=${res.status}`);
    return false;
  }

  const exists = Array.isArray(res.payload?.orgs)
    && res.payload.orgs.some((org) => org.org_code === CREDS.orgCode);
  if (!exists) {
    logFail('superadmin-orgs', `orgCode ${CREDS.orgCode} missing`);
    return false;
  }

  logPass('superadmin-orgs', `${CREDS.orgCode} visible`);
  return true;
}

async function verifySuperadminReadiness(token) {
  const res = await request('/superadmin/platform/readiness', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    logFail('superadmin-readiness', `status=${res.status}`);
    return false;
  }

  const hasSnapshot = Boolean(res.payload?.readiness?.generatedAt);
  if (!hasSnapshot) {
    logFail('superadmin-readiness', 'missing readiness snapshot');
    return false;
  }

  logPass(
    'superadmin-readiness',
    `upload=${res.payload.readiness.policies?.uploadPolicyCoverage ?? 'n/a'}%, security=${res.payload.readiness.policies?.securityPolicyCoverage ?? 'n/a'}%`
  );
  return true;
}

async function loginUser() {
  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: CREDS.userId,
      password: CREDS.password,
      orgCode: CREDS.orgCode
    })
  });

  if (login.status === 200 && login.payload?.accessToken) {
    logPass('user-login', 'token issued directly');
    return login.payload.accessToken;
  }

  if (login.status === 202 && login.payload?.otpRequired) {
    logPass('user-login', 'otp challenge issued');

    if (login.payload?.devOtp && login.payload?.challengeId) {
      const verify = await request('/auth/login/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: login.payload.challengeId,
          otp: login.payload.devOtp
        })
      });
      if (verify.ok && verify.payload?.accessToken) {
        logPass('user-otp-verify', 'dev OTP verified');
        return verify.payload.accessToken;
      }
      logFail('user-otp-verify', `status=${verify.status}`);
      return null;
    }

    logPass('user-otp-verify', 'skipped (no devOtp exposed)');
    return null;
  }

  logFail('user-login', `status=${login.status}`);
  return null;
}

async function verifyProtectedMe(token) {
  if (!token) {
    logPass('protected-me', 'skipped (no user token)');
    return true;
  }

  const res = await request('/protected/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    logFail('protected-me', `status=${res.status}`);
    return false;
  }

  const authOrgId = res.payload?.auth?.orgId;
  const rlsOrgId = res.payload?.rls?.org_id;
  if (!authOrgId || !rlsOrgId || authOrgId !== rlsOrgId) {
    logFail('protected-me', 'RLS context mismatch');
    return false;
  }

  logPass('protected-me', `${res.payload?.auth?.email || 'user'} active`);
  return true;
}

async function verifyFrontendPage() {
  try {
    const response = await fetch(FRONTEND_URL, { method: 'GET' });
    if (!response.ok) {
      logFail('frontend-login-page', `status=${response.status}`);
      return false;
    }
    logPass('frontend-login-page', FRONTEND_URL);
    return true;
  } catch (error) {
    logFail('frontend-login-page', error.message);
    return false;
  }
}

async function run() {
  await checkHealth();
  await checkOrgDirectory();
  const superToken = await loginSuperadmin();
  if (superToken) {
    await verifySuperadminOrgs(superToken);
    await verifySuperadminReadiness(superToken);
  }
  const userToken = await loginUser();
  await verifyProtectedMe(userToken);
  await verifyFrontendPage();

  if (process.exitCode) {
    console.error('QMS postdeploy smoke: FAILED');
    process.exit(process.exitCode);
  }
  console.log('QMS postdeploy smoke: PASSED');
}

run().catch((error) => {
  console.error(`FAIL postdeploy-smoke: ${error.message}`);
  process.exit(1);
});
