const BASE_URL = process.env.QMS_API_BASE || 'http://127.0.0.1:3145/api';
const ORG_CODE = process.env.QMS_ORG_CODE || 'PHA_DEV';
const USER_ID = process.env.QMS_USER_ID || 'admin';
const PASSWORD = process.env.QMS_PASSWORD || 'Admin@123';

function pass(step, detail = '') {
  console.log(`PASS ${step}${detail ? `: ${detail}` : ''}`);
}

function fail(step, detail = '') {
  console.error(`FAIL ${step}${detail ? `: ${detail}` : ''}`);
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
  return { ok: response.ok, status: response.status, payload };
}

async function login() {
  const res = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgCode: ORG_CODE, userId: USER_ID, password: PASSWORD })
  });

  if (res.ok && res.payload?.accessToken) return res.payload.accessToken;

  if (res.status === 202 && res.payload?.otpRequired && res.payload?.devOtp && res.payload?.challengeId) {
    const verify = await request('/auth/login/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: res.payload.challengeId,
        otp: res.payload.devOtp
      })
    });
    if (verify.ok && verify.payload?.accessToken) return verify.payload.accessToken;
  }

  return null;
}

async function run() {
  const health = await request('/health');
  if (!health.ok) {
    fail('health', `status=${health.status}`);
    process.exit(1);
  }
  pass('health');

  const token = await login();
  if (!token) {
    fail('login', 'no access token');
    process.exit(1);
  }
  pass('login');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [capaList, changeList, notificationList] = await Promise.all([
    request('/capa', { headers }),
    request('/change-control', { headers }),
    request('/platform/notifications', { headers })
  ]);

  if (!capaList.ok) fail('capa-list', `status=${capaList.status}`);
  else pass('capa-list', `count=${(capaList.payload?.capas || []).length}`);

  if (!changeList.ok) fail('change-list', `status=${changeList.status}`);
  else pass('change-list', `count=${(changeList.payload?.changes || []).length}`);

  if (!notificationList.ok) fail('notifications-list', `status=${notificationList.status}`);
  else pass('notifications-list', `inApp=${(notificationList.payload?.inApp || []).length}`);

  const firstUnread = (notificationList.payload?.inApp || []).find((item) => !item.is_read);
  if (firstUnread) {
    const markOne = await request(`/platform/notifications/${firstUnread.id}/read`, {
      method: 'PATCH',
      headers
    });
    if (!markOne.ok) fail('notifications-mark-read', `status=${markOne.status}`);
    else pass('notifications-mark-read');
  } else {
    pass('notifications-mark-read', 'skipped (no unread rows)');
  }

  const markAll = await request('/platform/notifications/read-all', {
    method: 'PATCH',
    headers
  });
  if (!markAll.ok) fail('notifications-mark-all-read', `status=${markAll.status}`);
  else pass('notifications-mark-all-read', `updated=${markAll.payload?.updatedCount ?? 'n/a'}`);

  if (process.exitCode) {
    console.error('workflow-notifications-smoke: FAILED');
    process.exit(process.exitCode);
  }
  console.log('workflow-notifications-smoke: PASSED');
}

run().catch((error) => {
  console.error(`FAIL workflow-notifications-smoke: ${error.message}`);
  process.exit(1);
});
