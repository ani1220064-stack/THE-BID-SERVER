const http = require('http');
const assert = require('assert');

const SERVER_PORT = 4000;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

function post(endpoint, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${endpoint}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('=== STARTING THE BID AUTHENTICATION & CLOUD RESTORE TESTS ===\n');

  // Test 1: Health Check
  console.log('[TEST 1] Checking server health...');
  const health = await get('/api/health');
  assert.strictEqual(health.status, 200, 'Health check should return 200');
  assert.strictEqual(health.body.status, 'ok', 'Status should be ok');
  console.log('✓ Health check passed');

  // Test 2: Server-Side Verified Google Authentication
  console.log('\n[TEST 2] Testing Google Auth with derived verified identity...');
  const subA = `google_stable_sub_${Date.now()}_A`;
  const tokenA = `test_token:${subA}:Vikram%20Rathore:vikram@test.com`;

  // Note: Client sends ONLY idToken. Server derives subA from tokenA
  const loginRes1 = await post('/api/auth/google', { idToken: tokenA });
  assert.strictEqual(loginRes1.status, 200, 'Google login should return 200');
  assert.strictEqual(loginRes1.body.success, true, 'success must be true');
  
  const userA = loginRes1.body.user;
  console.log(`  Assigned Player ID: ${userA.uniqueId} for Name: ${userA.name}`);
  assert.ok(userA.uniqueId.startsWith('BID-'), `Player ID must start with BID- (got: ${userA.uniqueId})`);
  assert.strictEqual(userA.uniqueId.length, 10, `BID-XXXXXX format must be 10 characters (got: ${userA.uniqueId})`);
  assert.strictEqual(userA.isGuest, false, 'Authenticated Google user must not be guest');
  assert.strictEqual(userA.name, 'Vikram Rathore', 'Name should be preserved from verified token');
  console.log('✓ Google Auth & BID ID format test passed');

  // Test 3: Idempotence & Anti-Duplicate (25 repeated logins with exact same Google identity)
  console.log('\n[TEST 3] Testing 25 repeated logins for identical BID ID & zero duplicates...');
  for (let i = 1; i <= 25; i++) {
    const res = await post('/api/auth/google', { idToken: tokenA });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.uniqueId, userA.uniqueId, `Iteration ${i}: ID mismatch! Expected ${userA.uniqueId} but got ${res.body.user.uniqueId}`);
  }
  console.log('✓ 25 repeated logins all resolved to the exact same BID ID');

  // Test 4: Simultaneous Account Resolution (Race Condition Prevention)
  console.log('\n[TEST 4] Testing parallel concurrent account resolutions...');
  const subB = `google_stable_sub_${Date.now()}_B`;
  const tokenB = `test_token:${subB}:Ananya%20Roy:ananya@test.com`;

  const parallelResults = await Promise.all([
    post('/api/auth/google', { idToken: tokenB }),
    post('/api/auth/google', { idToken: tokenB }),
    post('/api/auth/google', { idToken: tokenB }),
    post('/api/auth/google', { idToken: tokenB }),
    post('/api/auth/google', { idToken: tokenB })
  ]);

  const expectedIdB = parallelResults[0].body.user.uniqueId;
  for (let i = 1; i < parallelResults.length; i++) {
    assert.strictEqual(parallelResults[i].body.user.uniqueId, expectedIdB, `Parallel call ${i} yielded different ID!`);
  }
  console.log(`✓ 5 concurrent requests cleanly resolved to single BID ID: ${expectedIdB}`);

  // Test 5: Account Data Separation
  console.log('\n[TEST 5] Verifying complete separation between Account A and Account B...');
  assert.notStrictEqual(userA.uniqueId, expectedIdB, 'Account A and Account B must have distinct BID IDs');
  console.log(`  Account A: ${userA.uniqueId} !== Account B: ${expectedIdB}`);
  console.log('✓ Account separation passed');

  // Test 6: Friend Request & Acceptance using BID-XXXXXX
  console.log('\n[TEST 6] Testing real friend request and acceptance between Account A and Account B...');
  const friendReq = await post('/api/friends/request', {
    fromUniqueId: userA.uniqueId,
    toUniqueId: expectedIdB
  });
  assert.strictEqual(friendReq.status, 200);
  assert.strictEqual(friendReq.body.success, true);
  console.log(`  Friend request sent from ${userA.uniqueId} to ${expectedIdB}`);

  // Check Account B's pending requests
  const bRequests = await get(`/api/friends/${expectedIdB}`);
  assert.strictEqual(bRequests.status, 200);
  const foundReq = bRequests.body.requests.find(r => r.fromUniqueId === userA.uniqueId);
  assert.ok(foundReq, 'Account B must have incoming request from Account A');
  console.log('  Incoming friend request verified on Account B');

  // Account B accepts friend request
  const acceptRes = await post('/api/friends/accept', {
    userUniqueId: expectedIdB,
    fromUniqueId: userA.uniqueId
  });
  assert.strictEqual(acceptRes.body.success, true);

  // Verify mutual friendship
  const aFriends = await get(`/api/friends/${userA.uniqueId}`);
  const bFriends = await get(`/api/friends/${expectedIdB}`);
  assert.ok(aFriends.body.friends.some(f => f.uniqueId === expectedIdB), 'Account A must have Account B in friends');
  assert.ok(bFriends.body.friends.some(f => f.uniqueId === userA.uniqueId), 'Account B must have Account A in friends');
  console.log('✓ Mutual permanent friendship established and verified');

  // Test 7: Full Cloud Restore (Simulating App Uninstall / Device Switch)
  console.log('\n[TEST 7] Testing full cloud restore across fresh login / reinstall...');
  const restoreRes = await get(`/api/account/restore/${userA.uniqueId}`);
  assert.strictEqual(restoreRes.status, 200);
  assert.strictEqual(restoreRes.body.success, true);
  assert.strictEqual(restoreRes.body.user.uniqueId, userA.uniqueId);
  assert.ok(restoreRes.body.friends.some(f => f.uniqueId === expectedIdB), 'Restored profile must retain permanent friends');
  console.log('✓ Full cloud restore verified: BID ID, profile, and friends restored from authoritative backend');

  // Test 8: Guest Mode Isolation
  console.log('\n[TEST 8] Testing Guest mode restrictions...');
  const guestRes = await post('/api/auth/guest', {});
  assert.strictEqual(guestRes.status, 200);
  const guestUser = guestRes.body.user;
  assert.strictEqual(guestUser.isGuest, true, 'Guest must have isGuest: true');
  assert.ok(!guestUser.uniqueId, 'Guest must NOT have a unique ID until Google Sign-In');
  console.log('  Guest account created with no unique ID (correct)');

  // Guest attempts to send friend request -> MUST BE BLOCKED
  const guestFriendAttempt = await post('/api/friends/request', {
    fromUniqueId: guestUser.uniqueId || 'guest_id',
    toUniqueId: userA.uniqueId
  });
  assert.strictEqual(guestFriendAttempt.body.success, false, 'Guest friend request must be blocked');
  console.log('✓ Guest friend request properly rejected');

  console.log('\n======================================================');
  console.log('ALL 8 AUTHENTICATION & CLOUD RESTORE TESTS PASSED 100%');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
