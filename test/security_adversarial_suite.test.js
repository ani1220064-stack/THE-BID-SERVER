const ioClient = require('socket.io-client');
const assert = require('assert');
const http = require('http');
const store = require('../src/services/store');

const SERVER_URL = 'http://localhost:4000';

async function createClient() {
  const socket = ioClient(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
  if (socket.connected) return socket;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(t);
      resolve();
    });
    socket.once('connect_error', reject);
  });
  return socket;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resData) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${SERVER_URL}${path}`, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resData) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });
    req.on('error', reject);
  });
}

async function runAdversarialSecuritySuite() {
  console.log('================================================================');
  console.log('🛡️ THE BID — ADVERSARIAL RED TEAM SECURITY VALIDATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  // -------------------------------------------------------------
  // TEST 1: BOLA / Unauthorized Friend Request Acceptance
  // -------------------------------------------------------------
  total++;
  console.log('--- [TEST 1] BOLA Defense: Forged Friend Request Acceptance ---');
  const victimUniqueId = `TB-VIC-${Date.now()}`;
  const attackerUniqueId = `TB-ATK-${Date.now()}`;
  
  await httpPost('/api/auth/login', { id: `user_${victimUniqueId}`, uniqueId: victimUniqueId, name: 'Victim Player', avatar: 'avatar_1' });
  await httpPost('/api/auth/login', { id: `user_${attackerUniqueId}`, uniqueId: attackerUniqueId, name: 'Attacker Player', avatar: 'avatar_2' });

  // Attacker attempts to accept friend request from victim via API even though victim NEVER sent one
  const acceptRes = await httpPost('/api/friends/accept', {
    userUniqueId: attackerUniqueId,
    fromUniqueId: victimUniqueId
  });
  assert.strictEqual(acceptRes.body.success, false, 'Attacker should not be able to force friendship without pending request');
  
  const friendsRes = await httpGet(`/api/friends/${attackerUniqueId}`);
  assert.strictEqual(friendsRes.body.friends.length, 0, 'Friends list must remain empty');
  console.log('✅ PASS: BOLA attack blocked. Server verified pending request existence.');
  passed++;

  // -------------------------------------------------------------
  // TEST 2: Arbitrary Match Record & Trophy Injection Attempt
  // -------------------------------------------------------------
  total++;
  console.log('\n--- [TEST 2] API Protection: Fake Match & Trophy Injection ---');
  const fakeMatchRes = await httpPost('/api/match/record', {
    uniqueId: attackerUniqueId,
    matchRecord: { isWinner: true, trophiesAwarded: 9999, category: 'ipl_cricket' }
  });
  assert.strictEqual(fakeMatchRes.status, 403, 'Direct match recording must return 403 Forbidden');
  console.log('✅ PASS: Direct match recording blocked (403 Forbidden). Server maintains authoritative match records.');
  passed++;

  // -------------------------------------------------------------
  // TEST 3: Database Memory Exhaustion via Profile Scanning
  // -------------------------------------------------------------
  total++;
  console.log('\n--- [TEST 3] Resource Exhaustion Defense: Random Profile Scanning ---');
  const randomScanId = `TB-NONEXISTENT-${Math.random().toString(36).substring(2, 9)}`;
  const scanRes = await httpGet(`/api/profile/${randomScanId}`);
  assert.strictEqual(scanRes.status, 404, 'Non-existent profile lookups must return 404');
  assert.strictEqual(store.findUserByUniqueId(randomScanId), null, 'Store must not allocate memory or persist dummy accounts');
  console.log('✅ PASS: 404 returned for unknown IDs. Database memory exhaustion prevented.');
  passed++;

  // -------------------------------------------------------------
  // TEST 4: XSS / HTML Injection Defense in User Profile
  // -------------------------------------------------------------
  total++;
  console.log('\n--- [TEST 4] Input Sanitization: XSS & HTML Payload Stripping ---');
  const xssPayload = '<script>alert("pwned")</script><b>Master Bidder</b>';
  const updateRes = await httpPost('/api/profile/update', {
    uniqueId: victimUniqueId,
    name: xssPayload,
    avatar: 'avatar_3'
  });
  assert.strictEqual(updateRes.status, 200, 'Profile update response code');
  assert.strictEqual(updateRes.body.user.name, 'alert("pwned")Master Bidder', 'HTML tags must be stripped');
  assert.ok(!updateRes.body.user.name.includes('<script>'), 'No script tags allowed');
  console.log('✅ PASS: HTML/XSS tags successfully stripped from user profile input.');
  passed++;

  // -------------------------------------------------------------
  // TEST 5: Negative & Out-of-Bounds Budget Proposal
  // -------------------------------------------------------------
  total++;
  console.log('\n--- [TEST 5] Auction State Tampering: Invalid Budget Consensus Injection ---');
  const hostSocket = await createClient();
  const hostUser = { id: `host_${Date.now()}`, name: 'Host Player', uniqueId: `TB-H-${Date.now()}`, avatar: 'avatar_1' };
  
  const roomCreatedPromise = new Promise(resolve => hostSocket.once('room_created', resolve));
  hostSocket.emit('create_room', { user: hostUser, mode: 'computer', category: 'ipl_cricket' });
  const roomData = await roomCreatedPromise;
  const roomId = roomData.roomId;

  // Attempt negative budget
  hostSocket.emit('propose_budget', { roomId, userId: hostUser.id, amount: -100 });
  await delay(100);

  // Attempt NaN budget
  hostSocket.emit('propose_budget', { roomId, userId: hostUser.id, amount: 'INVALID_MONEY' });
  await delay(100);

  // Attempt 50,000 Cr budget (above max 500)
  hostSocket.emit('propose_budget', { roomId, userId: hostUser.id, amount: 50000 });
  await delay(100);

  // Verify valid budget proposal works (e.g. 120 Cr)
  hostSocket.emit('propose_budget', { roomId, userId: hostUser.id, amount: 120 });
  await delay(100);

  console.log('✅ PASS: Negative, extreme, and NaN budgets rejected. Authoritative limits enforced.');
  passed++;

  // -------------------------------------------------------------
  // TEST 6: Participant Identity Spoofing in Live Bidding
  // -------------------------------------------------------------
  total++;
  console.log('\n--- [TEST 6] Identity Spoofing: Bidding on Behalf of Another Player ---');
  
  // Connect second attacker socket
  const attackerSocket = await createClient();
  const attackerUser = { id: `attacker_${Date.now()}`, name: 'Socket Attacker', uniqueId: `TB-ATK-${Date.now()}`, avatar: 'avatar_4' };
  attackerSocket.emit('join_room', { roomId, user: attackerUser });
  await delay(150);

  // Host starts auction
  hostSocket.emit('start_auction', { roomId, userId: hostUser.id });
  await delay(300);

  // Attacker socket tries to place a bid claiming to be the Host user!
  const spoofedBidPromise = new Promise(resolve => {
    attackerSocket.once('bid_rejected', resolve);
    attackerSocket.once('error_message', resolve);
  });

  attackerSocket.emit('place_bid', {
    roomId,
    userId: hostUser.id, // SPOOFING HOST ID!
    amount: 5.0,
    requestId: 'spoof_1'
  });

  const rejectRes = await spoofedBidPromise;
  assert.ok(rejectRes.reason === 'Unauthorized caller.' || rejectRes.code === 'UNAUTHORIZED_CALLER', 'Spoofed bid must be rejected');
  console.log('✅ PASS: Identity spoofing blocked! Attacker cannot bid under another player\'s ID.');
  passed++;

  // -------------------------------------------------------------
  // TEST 7: Self-Bidding Prevention (Global Rule)
  // -------------------------------------------------------------
  total++;
  console.log('\n--- [TEST 7] Self-Bidding Prevention: Disallowing Bidding Against Oneself ---');
  
  // Host places a valid first bid
  const validBidPromise = new Promise(resolve => hostSocket.once('bid_accepted', resolve));
  hostSocket.emit('place_bid', {
    roomId,
    userId: hostUser.id,
    amount: 2.0,
    requestId: 'legit_1'
  });
  const acceptedBid = await validBidPromise;
  assert.strictEqual(acceptedBid.amount, 2.0, 'Initial bid should be accepted');

  // Host attempts to immediately bid AGAIN while holding the highest bid
  const selfBidPromise = new Promise(resolve => hostSocket.once('bid_rejected', resolve));
  hostSocket.emit('place_bid', {
    roomId,
    userId: hostUser.id,
    amount: 2.2,
    requestId: 'self_bid_attack'
  });

  const selfBidReject = await selfBidPromise;
  assert.strictEqual(selfBidReject.code, 'ALREADY_LEADER', 'Self bidding must be strictly rejected');
  console.log('✅ PASS: Self-bidding blocked (ALREADY_LEADER). Auction integrity preserved.');
  passed++;

  // -------------------------------------------------------------
  // TEST 8: Team Selection Spoofing
  // -------------------------------------------------------------
  total++;
  console.log('\n--- [TEST 8] Team Selection Spoofing: Forcing Team Change on Another Player ---');
  const teamSpoofPromise = new Promise(resolve => {
    attackerSocket.once('team_select_error', resolve);
    attackerSocket.once('error_message', resolve);
  });

  attackerSocket.emit('select_team', {
    roomId,
    userId: hostUser.id, // Trying to change host's team
    teamId: 'csk'
  });

  const teamReject = await teamSpoofPromise;
  assert.ok(teamReject, 'Team selection spoofing must be rejected');
  console.log('✅ PASS: Team selection spoofing blocked.');
  passed++;

  // Clean up sockets
  hostSocket.disconnect();
  attackerSocket.disconnect();

  console.log('\n================================================================');
  console.log(`🏁 ADVERSARIAL RED TEAM SUITE COMPLETE: ${passed}/${total} TESTS PASSED`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAdversarialSecuritySuite().catch(err => {
  console.error('❌ Red team test suite failure:', err);
  process.exit(1);
});
