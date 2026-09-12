const assert = require('assert');
const http = require('http');

const SERVER_URL = 'http://localhost:4000';

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, text: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'GET'
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runGoogleAuthDiagnostic() {
  console.log('===============================================================');
  console.log('🔍 GOOGLE SIGN-IN & ZERO-404 OAUTH REDIRECT DIAGNOSTIC SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function check(name, condition, details = '') {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${name} ${details ? '(' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${details ? '(' + details + ')' : ''}`);
      throw new Error(`Assertion failed for: ${name}`);
    }
  }

  // 1. Diagnose Callback Redirect Bridge (Zero 404 Verification)
  console.log('--- Step 1: OAuth Callback Redirect Bridge Audit ---');
  const callbackRes = await fetchHtml(`${SERVER_URL}/api/auth/google/callback?id_token=sample_token_123`);
  check('Callback endpoint returns HTTP 200 (NOT 404)', callbackRes.status === 200, `Status: ${callbackRes.status}`);
  check('Callback serves valid HTML Content-Type', callbackRes.headers['content-type'].includes('text/html'));
  check('Callback embeds native deep-link thebid://oauth', callbackRes.text.includes('thebid://oauth'));
  check('Callback contains fallback return link', callbackRes.text.includes('RETURN TO THE BID'));

  const shortCallbackRes = await fetchHtml(`${SERVER_URL}/auth/google/callback`);
  check('/auth/google/callback alias returns HTTP 200 (NOT 404)', shortCallbackRes.status === 200);

  // 2. Test End-to-End Account Creation with Verified Google ID
  console.log('\n--- Step 2: Google Authentication -> Permanent BID ID Creation ---');
  const googleAccountA = `google_sub_user_${Date.now()}_A`;
  const tokenA = `test_token:${googleAccountA}:Anirudh%20Player:anirudh@gmail.com`;

  const authResA = await fetchJson(`${SERVER_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: tokenA })
  });

  check('Authentication request succeeded', authResA.status === 200);
  check('Response marked success', authResA.body.success === true);
  const userA = authResA.body.user;
  check('Permanent THE BID Player ID generated', typeof userA.uniqueId === 'string' && userA.uniqueId.startsWith('BID-'), `ID: ${userA.uniqueId}`);
  check('Display name derived from Google profile', userA.name === 'Anirudh Player');
  check('Verified Google identity recorded', userA.googleId === googleAccountA);

  // Add trophies to verify persistence
  await fetchJson(`${SERVER_URL}/api/profile/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uniqueId: userA.uniqueId, trophies: 25 })
  });

  // 3. Test Logout and Login Again with Same Google Account
  console.log('\n--- Step 3: Logout & Re-Login Identity Consistency Audit ---');
  console.log('  Simulating sign-out and clearing local cache...');
  // Re-authenticate with the exact same Google token/identity
  const reAuthRes = await fetchJson(`${SERVER_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: tokenA })
  });

  check('Re-authentication request succeeded', reAuthRes.status === 200);
  const reUserA = reAuthRes.body.user;
  check('Re-login returns EXACT SAME permanent THE BID Player ID', reUserA.uniqueId === userA.uniqueId, `Expected: ${userA.uniqueId}, Got: ${reUserA.uniqueId}`);
  check('Re-login returns EXACT SAME database user ID', reUserA.id === userA.id);
  check('Re-login preserves trophies across sessions', reUserA.trophies === 25, `Trophies: ${reUserA.trophies}`);

  // 4. Test Cloud Restoration Endpoint
  console.log('\n--- Step 4: Cloud Session Restore Audit ---');
  const restoreRes = await fetchJson(`${SERVER_URL}/api/account/restore/${userA.uniqueId}`);
  check('Cloud restore returns HTTP 200', restoreRes.status === 200);
  check('Restored profile matches original Player ID', restoreRes.body.user.uniqueId === userA.uniqueId);

  // 5. Test Second Independent Google Account (Multi-Tenancy Isolation)
  console.log('\n--- Step 5: Second Google Account Isolation & Uniqueness Audit ---');
  const googleAccountB = `google_sub_user_${Date.now()}_B`;
  const tokenB = `test_token:${googleAccountB}:Vikram%20Rathore:vikram@gmail.com`;

  const authResB = await fetchJson(`${SERVER_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: tokenB })
  });

  check('Second account creation succeeded', authResB.status === 200);
  const userB = authResB.body.user;
  check('Second account receives DIFFERENT Player ID', userB.uniqueId !== userA.uniqueId, `User B ID: ${userB.uniqueId}`);
  check('Second account has distinct Google ID', userB.googleId === googleAccountB);

  // 6. Test Invalid / Empty Token Rejection
  console.log('\n--- Step 6: Security & Validation Boundary Audit ---');
  const emptyRes = await fetchJson(`${SERVER_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  check('Empty token request rejected with HTTP 400', emptyRes.status === 400);

  const invalidRes = await fetchJson(`${SERVER_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: 'invalid_malformed_token_xyz' })
  });
  check('Malformed token rejected with HTTP 401', invalidRes.status === 401);

  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passed}/${total} DIAGNOSTIC CHECKS PASSED (100%)`);
  console.log('===============================================================\n');
}

if (require.main === module) {
  runGoogleAuthDiagnostic()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL DIAGNOSTIC FAILURE:', err);
      process.exit(1);
    });
}
