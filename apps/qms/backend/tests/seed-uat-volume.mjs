const BASE_URL = process.env.QMS_API_BASE || 'http://127.0.0.1:3145/api';
const ORG_CODE = process.env.QMS_ORG_CODE || 'PHA_DEV';
const USER_ID = process.env.QMS_USER_ID || 'admin';
const PASSWORD = process.env.QMS_PASSWORD || 'Admin@123';

const COUNTS = {
  capa: Number(process.env.QMS_UAT_CAPA_COUNT || 20),
  deviations: Number(process.env.QMS_UAT_DEVIATION_COUNT || 20),
  changes: Number(process.env.QMS_UAT_CHANGE_COUNT || 20)
};

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
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${payload.error || text}`);
  }
  return payload;
}

async function login() {
  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgCode: ORG_CODE, userId: USER_ID, password: PASSWORD })
  });

  if (login.accessToken) return login.accessToken;

  if (login.otpRequired && login.devOtp && login.challengeId) {
    const verify = await request('/auth/login/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: login.challengeId, otp: login.devOtp })
    });
    if (verify.accessToken) return verify.accessToken;
  }

  throw new Error('Unable to obtain access token for UAT seeding');
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function seedCapas(token) {
  for (let i = 0; i < COUNTS.capa; i += 1) {
    await request('/capa', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        title: `UAT CAPA ${Date.now()}-${i}`,
        sourceType: 'Manual',
        classification: 'Corrective',
        severity: 3,
        occurrence: 3,
        detectability: 3
      })
    });
  }
}

async function seedDeviations(token) {
  for (let i = 0; i < COUNTS.deviations; i += 1) {
    await request('/deviations', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        title: `UAT Deviation ${Date.now()}-${i}`,
        description: 'Generated for UAT volume',
        deviationType: 'Process',
        classification: 'Major'
      })
    });
  }
}

async function seedChanges(token) {
  for (let i = 0; i < COUNTS.changes; i += 1) {
    await request('/change-control', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        title: `UAT Change ${Date.now()}-${i}`,
        changeType: 'Planned',
        reason: 'Generated for UAT volume',
        riskLevel: 'Medium'
      })
    });
  }
}

async function run() {
  const token = await login();
  console.log(`[seed-uat-volume] token acquired for ${USER_ID}`);

  await seedCapas(token);
  console.log(`[seed-uat-volume] created ${COUNTS.capa} CAPA records`);

  await seedDeviations(token);
  console.log(`[seed-uat-volume] created ${COUNTS.deviations} Deviation records`);

  await seedChanges(token);
  console.log(`[seed-uat-volume] created ${COUNTS.changes} Change records`);

  console.log('[seed-uat-volume] completed');
}

run().catch((error) => {
  console.error(`[seed-uat-volume] FAILED: ${error.message}`);
  process.exit(1);
});
