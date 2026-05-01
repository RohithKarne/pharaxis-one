import http from 'node:http';
const baseUrl = process.env.QMS_BACKEND_URL || `http://127.0.0.1:${process.env.PORT || 3145}`;
const url = new URL('/api/health', baseUrl);
const req = http.request(url, { method: 'GET', timeout: 5000 }, res => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`QMS health smoke failed: HTTP ${res.statusCode}`);
      console.error(body.slice(0, 500));
      process.exit(1);
    }
    let payload;
    try { payload = JSON.parse(body); } catch (error) { console.error(`QMS health smoke failed: ${error.message}`); process.exit(1); }
    if (!(payload.ok || payload.status === 'ok')) {
      console.error('QMS health smoke failed: status is not ok');
      console.error(JSON.stringify(payload, null, 2));
      process.exit(1);
    }
    console.log(`QMS health smoke passed: ${url.href}`);
  });
});
req.on('timeout', () => req.destroy(new Error('request timed out')));
req.on('error', error => { console.error(`QMS health smoke failed: ${error.message}`); console.error('Start the app first with: npm run dev:clean'); process.exit(1); });
req.end();
