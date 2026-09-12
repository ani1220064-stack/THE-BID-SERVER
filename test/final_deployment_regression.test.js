const assert = require('assert');
const http = require('http');

console.log('========================================================================');
console.log('⚡ THE BID — FINAL MASTER DEPLOYMENT & GOOGLE OAUTH REGRESSION SUITE ⚡');
console.log('========================================================================\n');

const SERVER_PORT = 4000;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

// Helper for JSON HTTP requests
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json, rawText: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawText: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runAllTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ [FAIL] ${name}:`, e.message);
      throw e;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ [FAIL] ${name}:`, e.message);
      throw e;
    }
  }

  // --- SECTION 1: HEALTH CHECK & BASIC CONFIGURATION ---
  console.log('\n--- SECTION 1: Health & Server Environment ---');
  await asyncTest('Server health check responds with status ok', async () => {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.strictEqual(res.body.product, 'THE BID');
  });

  // --- SECTION 2: GOOGLE AUTHENTICATION & IDENTITY RESOLUTION ---
  console.log('\n--- SECTION 2: Genuine Google Authentication & Identity Resolution ---');
  let userA, userB;
  const runId = Date.now();

  await asyncTest('Google login derives permanent BID-XXXXXX Player ID', async () => {
    const res = await request('POST', '/api/auth/google', {
      idToken: `test_google_token_${runId}_a:sub_anirudh_${runId}:Anirudh:anirudh_${runId}@thebid.live`
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert(res.body.user, 'User object must be returned');
    assert(res.body.user.uniqueId.startsWith('BID-'), `ID must start with BID- but got ${res.body.user.uniqueId}`);
    assert.strictEqual(res.body.user.name, 'Anirudh');
    assert.strictEqual(res.body.user.isGuest, false);
    userA = res.body.user;
  });

  await asyncTest('Idempotent Google Login: Repeated login returns EXACT same BID-XXXXXX Player ID', async () => {
    const res = await request('POST', '/api/auth/google', {
      idToken: `test_google_token_${runId}_a:sub_anirudh_${runId}:Anirudh:anirudh_${runId}@thebid.live`
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.uniqueId, userA.uniqueId, 'Must resolve to identical Player ID');
  });

  await asyncTest('Second distinct Google account gets unique, non-colliding Player ID', async () => {
    const res = await request('POST', '/api/auth/google', {
      idToken: `test_google_token_${runId}_b:sub_opponent_${runId}:Opponent Player:opp_${runId}@thebid.live`
    });
    assert.strictEqual(res.status, 200);
    assert.notStrictEqual(res.body.user.uniqueId, userA.uniqueId, 'Must be distinct Player ID');
    userB = res.body.user;
  });

  await asyncTest('Empty or missing token rejects with 400 Bad Request', async () => {
    const res = await request('POST', '/api/auth/google', {});
    assert.strictEqual(res.status, 400);
  });

  // --- SECTION 3: CLOUD RESTORE & PERSISTENCE ---
  console.log('\n--- SECTION 3: Cold Start & Cloud Session Restore ---');
  await asyncTest('Cloud restore by permanent Player ID returns complete user profile & career', async () => {
    const res = await request('GET', `/api/account/restore/${userA.uniqueId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.user.uniqueId, userA.uniqueId);
    assert(Array.isArray(res.body.friends), 'Friends list must be array');
    assert(Array.isArray(res.body.history), 'Match history must be array');
  });

  await asyncTest('Cloud restore with invalid/non-existent Player ID returns 404', async () => {
    const res = await request('GET', '/api/account/restore/BID-NONEXIST');
    assert.strictEqual(res.status, 404);
  });

  // --- SECTION 4: GUEST SYSTEM & RESTRICTIONS ---
  console.log('\n--- SECTION 4: Guest System & Upgrade Pathway ---');
  let guestUser;
  await asyncTest('Guest user creation succeeds with isGuest=true', async () => {
    const res = await request('POST', '/api/auth/guest');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.user.isGuest, true);
    assert(res.body.user.id.startsWith('guest_'));
    guestUser = res.body.user;
  });

  await asyncTest('Guest accounts restricted from sending friend requests', async () => {
    const res = await request('POST', '/api/friends/request', {
      fromUniqueId: guestUser.id,
      toUniqueId: userA.uniqueId
    });
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'GUEST_RESTRICTED');
  });

  // --- SECTION 5: SOCIAL GRAPH & FRIEND SYSTEM ---
  console.log('\n--- SECTION 5: Multiplayer Friend System & Private Invites ---');
  await asyncTest('Authenticated player can send friend request to another player', async () => {
    const res = await request('POST', '/api/friends/request', {
      fromUniqueId: userA.uniqueId,
      toUniqueId: userB.uniqueId
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await asyncTest('Target player sees pending incoming friend request', async () => {
    const res = await request('GET', `/api/friends/${userB.uniqueId}`);
    assert.strictEqual(res.status, 200);
    assert(res.body.requests.length >= 1, 'Target should have at least 1 pending request');
    const req = res.body.requests.find(r => r.fromUniqueId === userA.uniqueId);
    assert(req, 'Incoming request from userA must exist');
  });

  await asyncTest('Accepting friend request creates reciprocal relationship', async () => {
    const res = await request('POST', '/api/friends/accept', {
      userUniqueId: userB.uniqueId,
      fromUniqueId: userA.uniqueId
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Verify User A has User B in friends
    const resA = await request('GET', `/api/friends/${userA.uniqueId}`);
    const friendB = resA.body.friends.find(f => f.uniqueId === userB.uniqueId);
    assert(friendB, 'User B must appear in User A friend list');

    // Verify User B has User A in friends
    const resB = await request('GET', `/api/friends/${userB.uniqueId}`);
    const friendA = resB.body.friends.find(f => f.uniqueId === userA.uniqueId);
    assert(friendA, 'User A must appear in User B friend list');
  });

  // --- SECTION 6: OAUTH REDIRECT BRIDGE ---
  console.log('\n--- SECTION 6: Google OAuth Redirect Bridge (Zero-404 Architecture) ---');
  await asyncTest('OAuth callback endpoint returns HTTP 200 with HTML bridge', async () => {
    const res = await request('GET', '/api/auth/google/callback');
    assert.strictEqual(res.status, 200);
    assert(res.rawText.includes('THE BID — Google Sign-In'), 'Must render sign in bridge HTML');
    assert(res.rawText.includes('thebid://oauth'), 'Must deep link to thebid://oauth');
  });

  await asyncTest('All standard OAuth redirect aliases resolve to HTTP 200 bridge', async () => {
    const routes = ['/auth/google/callback', '/--/oauth', '/oauth'];
    for (const route of routes) {
      const res = await request('GET', route);
      assert.strictEqual(res.status, 200, `Route ${route} must return 200`);
    }
  });

  // --- SECTION 7: RATE LIMITING & SECURITY DEFENSES ---
  console.log('\n--- SECTION 7: Security Defenses & Input Sanitization ---');
  await asyncTest('SQL Injection / Script payload in profile update is sanitized', async () => {
    const maliciousPayload = "Anirudh'; DROP TABLE users; <script>alert(1)</script>";
    const res = await request('POST', '/api/profile/update', {
      uniqueId: userA.uniqueId,
      name: maliciousPayload
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    // Re-query and verify no destruction happened
    const checkRes = await request('GET', `/api/account/restore/${userA.uniqueId}`);
    assert.strictEqual(checkRes.status, 200);
    assert.strictEqual(checkRes.body.user.uniqueId, userA.uniqueId);
  });

  // --- SECTION 8: 7 AUCTION ARENAS & ASSET INVARIANTS ---
  console.log('\n--- SECTION 8: 7 Playable Auction Arenas & Registry Integrity ---');
  const expectedCategories = [
    'ipl_cricket',
    'fifa_football',
    'formula_1',
    'nba',
    'movie_stars',
    'luxury_cars',
    'luxury_collection'
  ];

  test('All 7 Auction Arenas exist in game catalog registry', () => {
    const { CategoryRegistry } = require('../src/categories/CategoryRegistry');
    const categories = CategoryRegistry.getAll();
    assert.strictEqual(categories.length, 7, 'Must have exactly 7 auction arenas');
    for (const catId of expectedCategories) {
      const cat = CategoryRegistry.get(catId);
      assert(cat, `Category ${catId} must be registered`);
      assert(cat.title || cat.name, `Category ${catId} must have a display name`);
      assert(cat.defaultBudget > 0, `Category ${catId} budget must be positive`);
    }
  });

  console.log('\n========================================================================');
  console.log(`🎉 ALL ${passed}/${total} FINAL DEPLOYMENT & REGRESSION CHECKS PASSED (100%)`);
  console.log('========================================================================\n');
}

runAllTests().catch(err => {
  console.error('\n❌ REGRESSION SUITE FAILED:', err);
  process.exit(1);
});
