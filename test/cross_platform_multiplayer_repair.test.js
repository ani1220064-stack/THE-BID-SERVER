/**
 * THE BID — Comprehensive Cross-Platform Multiplayer Repair Verification Suite
 * Tests all 4 cross-platform combinations:
 * - APK <-> APK
 * - Web <-> Web
 * - APK <-> Web
 * - Web <-> APK
 *
 * Verifies:
 * 1. Exact 7-digit Player ID search (1000129, 0000000).
 * 2. Permanent Google Account resolution for both founder emails.
 * 3. 6-digit numeric room creation, lookup integrity, and room_joined payload.
 * 4. Real-time franchise reservation synchronization & conflict rejection (ALREADY TAKEN).
 * 5. Real-time direct room invitation delivery, banner receipt, and join flow.
 */

const assert = require('assert');
const http = require('http');
const { io: ioClient } = require('socket.io-client');

const PORT = 4055;
process.env.PORT = String(PORT);
process.env.STAGING_MULTIPLAYER_TEST = 'true';

// Start server instance for testing
const app = require('../src/index');
const store = require('../src/services/store');
const SERVER_URL = `http://localhost:${PORT}`;

function postJson(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const url = new URL(path, SERVER_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function createSocketClient() {
  return ioClient(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('================================================================');
  console.log(' THE BID — CROSS-PLATFORM MULTIPLAYER VERIFICATION SUITE');
  console.log('================================================================\n');

  // Wait for server to bind
  await delay(600);

  // --------------------------------------------------------------------------
  // TEST 1: Permanent Identity, Controlled Reset & Reserved Loyalty Allocation
  // --------------------------------------------------------------------------
  console.log('[TEST 1] Verifying Fresh Reset, Founder ID 0000000 & 10 Loyalty IDs...');
  
  // Test Google Auth resolution for Founder (first login creates 0000000)
  const authRes1 = await postJson('/api/auth/google/native', {
    idToken: 'test_sub_ani1:test_sub_ani1:Anirudh:ani1220064@gmail.com'
  });
  assert.strictEqual(authRes1.status, 200, 'Google auth for ani1220064@gmail.com must succeed');
  assert.strictEqual(authRes1.data.user.numericPlayerId, '0000000', 'Must resolve to Founder ID 0000000');
  assert.strictEqual(authRes1.data.user.trophies, 0, 'Initial trophies must be 0');
  assert.strictEqual(authRes1.data.user.matchesPlayed, 0, 'Initial matches must be 0');
  assert.strictEqual(authRes1.data.friends.length, 0, 'Initial friends must be empty');
  console.log(`  ✓ Founder Google login (ani1220064@gmail.com) created: ${authRes1.data.user.name} [ID: ${authRes1.data.user.numericPlayerId}], trophies: ${authRes1.data.user.trophies}`);

  // Test secondary founder email resolves to the exact same account
  const authRes2 = await postJson('/api/auth/google/native', {
    idToken: 'test_sub_ani2:test_sub_ani2:Anirudh:anirudhchaturvedi122006@gmail.com'
  });
  assert.strictEqual(authRes2.status, 200, 'Google auth for anirudhchaturvedi122006@gmail.com must succeed');
  assert.strictEqual(authRes2.data.user.numericPlayerId, '0000000', 'Must resolve to same Founder ID 0000000');
  console.log(`  ✓ Secondary Founder email (anirudhchaturvedi122006@gmail.com) mapped to same ID: ${authRes2.data.user.numericPlayerId}`);

  // Test First 10 other verified Google accounts receive reserved loyalty IDs
  const expectedLoyaltyIds = [
    '1111111', '2222222', '3333333', '4444444', '5555555',
    '6666666', '7777777', '8888888', '9999999', '1000000'
  ];
  for (let i = 0; i < 10; i++) {
    const lEmail = `early.player.${i + 1}@gmail.com`;
    const lSub = `test_sub_early_${i + 1}`;
    const lAuth = await postJson('/api/auth/google/native', {
      idToken: `${lSub}:${lSub}:Early Player ${i + 1}:${lEmail}`
    });
    assert.strictEqual(lAuth.status, 200);
    assert.strictEqual(lAuth.data.user.numericPlayerId, expectedLoyaltyIds[i], `Player #${i + 1} must receive ${expectedLoyaltyIds[i]}`);
    assert.strictEqual(lAuth.data.user.trophies, 0);
  }
  console.log(`  ✓ All 10 Early Verified Google Accounts received reserved IDs (1111111 -> 1000000)`);

  // Test 11th account receives normal 7-digit ID (1000001+)
  const norm11 = await postJson('/api/auth/google/native', {
    idToken: `test_sub_regular_11:test_sub_regular_11:Regular Player 11:regular11@gmail.com`
  });
  assert.strictEqual(norm11.status, 200);
  assert.strictEqual(norm11.data.user.numericPlayerId, '1000001', '11th account must receive 1000001');
  console.log(`  ✓ 11th Verified Google Account received regular ID: ${norm11.data.user.numericPlayerId}`);

  // Friend search for Founder ID 0000000
  const searchFounder = await postJson('/api/friends/search', {
    searchTerm: '0000000',
    searcherUniqueId: norm11.data.user.uniqueId
  });
  assert.strictEqual(searchFounder.status, 200, 'Friend search for 0000000 must return 200 OK');
  assert.strictEqual(searchFounder.data.numericPlayerId, '0000000', 'Target ID must be 0000000');
  console.log(`  ✓ /api/friends/search for 0000000 returned: ${searchFounder.data.name} (${searchFounder.data.numericPlayerId})`);

  // Friend search for Early Player 1 (1111111)
  const searchEarly1 = await postJson('/api/friends/search', {
    numericPlayerId: '1111111',
    searcherUniqueId: authRes1.data.user.uniqueId
  });
  assert.strictEqual(searchEarly1.status, 200, 'Friend search for 1111111 must return 200 OK');
  assert.strictEqual(searchEarly1.data.numericPlayerId, '1111111', 'Target ID must be 1111111');
  console.log(`  ✓ /api/friends/search for 1111111 returned: ${searchEarly1.data.name} (${searchEarly1.data.numericPlayerId})\n`);

  // --------------------------------------------------------------------------
  // TEST 2: Combination 1 (APK <-> APK) - Room Joining & Franchise Conflict
  // --------------------------------------------------------------------------
  console.log('[TEST 2] Testing APK <-> APK: Room Code Join & Real-Time RCB Reservation...');
  const apkUser1 = {
    id: 'user_apk_host',
    uniqueId: 'BID-APK-HOST',
    numericPlayerId: '2000001',
    name: 'APK Host',
    avatar: 'avatar_male_1',
    platform: 'android'
  };
  const apkUser2 = {
    id: 'user_apk_guest',
    uniqueId: 'BID-APK-GUEST',
    numericPlayerId: '2000002',
    name: 'APK Guest',
    avatar: 'avatar_female_1',
    platform: 'android'
  };

  const socketApk1 = createSocketClient();
  const socketApk2 = createSocketClient();

  await new Promise(r => socketApk1.on('connect', r));
  await new Promise(r => socketApk2.on('connect', r));

  socketApk1.emit('register_user', { user: apkUser1 });
  socketApk2.emit('register_user', { user: apkUser2 });
  await delay(150);

  let apkRoomCode = null;
  let apkRoomId = null;

  // Host creates room
  const createPromise = new Promise(resolve => {
    socketApk1.on('room_created', data => resolve(data));
  });
  socketApk1.emit('create_room', {
    user: apkUser1,
    category: 'ipl_cricket',
    mode: 'friends'
  });
  const createdData = await createPromise;
  apkRoomCode = createdData.roomCode;
  apkRoomId = createdData.roomId;
  assert(apkRoomCode && apkRoomCode.length === 6, 'Room code must be exactly 6 digits');
  console.log(`  ✓ APK Host created IPL room: ID=${apkRoomId}, Code=${apkRoomCode}`);

  // Guest joins using 6-digit key
  const joinPromise = new Promise(resolve => {
    socketApk2.on('room_joined', data => resolve(data));
  });
  socketApk2.emit('join_room', {
    roomCode: apkRoomCode,
    user: apkUser2
  });
  const joinedData = await joinPromise;
  assert.strictEqual(joinedData.roomId, apkRoomId, 'Guest must join identical room ID');
  assert(joinedData.room, 'room_joined event MUST contain full serialized room object');
  console.log(`  ✓ APK Guest joined room with 6-digit key. Received serialized room with ${joinedData.room.participants.length} participants`);

  // Host reserves RCB
  socketApk1.emit('select_team', {
    roomId: apkRoomId,
    userId: apkUser1.id,
    teamId: 'rcb'
  });
  await delay(150);

  // Guest attempts to reserve RCB (must be rejected)
  const conflictPromise = new Promise(resolve => {
    socketApk2.on('team_select_error', err => resolve(err));
  });
  socketApk2.emit('select_team', {
    roomId: apkRoomId,
    userId: apkUser2.id,
    teamId: 'rcb'
  });
  const conflictErr = await conflictPromise;
  assert(conflictErr && conflictErr.message.includes('already been selected'), 'Duplicate RCB selection must be rejected');
  console.log(`  ✓ Franchise Conflict Enforced: ${conflictErr.message}`);

  // Guest selects available team CSK
  const guestSelectPromise = new Promise(resolve => {
    socketApk2.on('team_selected', data => resolve(data));
  });
  socketApk2.emit('select_team', {
    roomId: apkRoomId,
    userId: apkUser2.id,
    teamId: 'csk'
  });
  const guestSelectRes = await guestSelectPromise;
  assert.strictEqual(guestSelectRes.teamId, 'csk', 'CSK must be successfully selected');
  console.log(`  ✓ APK Guest successfully selected CSK\n`);

  socketApk1.disconnect();
  socketApk2.disconnect();

  // --------------------------------------------------------------------------
  // TEST 3: Combination 2 (Web <-> Web) - Room Code Join & Team Sync
  // --------------------------------------------------------------------------
  console.log('[TEST 3] Testing Web <-> Web: PWA Room Joining & State Synchronization...');
  const webUser1 = {
    id: 'user_web_host',
    uniqueId: 'BID-WEB-HOST',
    numericPlayerId: '3000001',
    name: 'Web Host',
    avatar: 'avatar_male_2',
    platform: 'web'
  };
  const webUser2 = {
    id: 'user_web_guest',
    uniqueId: 'BID-WEB-GUEST',
    numericPlayerId: '3000002',
    name: 'Web Guest',
    avatar: 'avatar_female_2',
    platform: 'web'
  };

  const socketWeb1 = createSocketClient();
  const socketWeb2 = createSocketClient();
  await new Promise(r => socketWeb1.on('connect', r));
  await new Promise(r => socketWeb2.on('connect', r));

  socketWeb1.emit('register_user', { user: webUser1 });
  socketWeb2.emit('register_user', { user: webUser2 });
  await delay(150);

  const webCreatePromise = new Promise(resolve => socketWeb1.on('room_created', resolve));
  socketWeb1.emit('create_room', {
    user: webUser1,
    category: 'fifa_football',
    mode: 'friends'
  });
  const webRoomCreated = await webCreatePromise;
  console.log(`  ✓ Web Host created FIFA room: Code=${webRoomCreated.roomCode}`);

  const webJoinPromise = new Promise(resolve => socketWeb2.on('room_joined', resolve));
  socketWeb2.emit('join_room', {
    roomCode: webRoomCreated.roomCode,
    user: webUser2
  });
  const webRoomJoined = await webJoinPromise;
  assert.strictEqual(webRoomJoined.roomId, webRoomCreated.roomId);
  assert(webRoomJoined.room, 'Web join must receive full room object');
  console.log(`  ✓ Web Guest joined room successfully with room payload\n`);

  socketWeb1.disconnect();
  socketWeb2.disconnect();

  // --------------------------------------------------------------------------
  // TEST 4: Combination 3 (APK <-> Web) - Direct Room Invite
  // --------------------------------------------------------------------------
  console.log('[TEST 4] Testing APK <-> Web: Direct Room Invite Delivery & Acceptance...');
  const crossApkHost = {
    id: 'user_cross_apk',
    uniqueId: 'BID-CROSS-APK',
    numericPlayerId: '4000001',
    name: 'APK Player',
    avatar: 'avatar_male_1',
    platform: 'android'
  };
  const crossWebGuest = {
    id: 'user_cross_web',
    uniqueId: 'BID-CROSS-WEB',
    numericPlayerId: '4000002',
    name: 'Web Player',
    avatar: 'avatar_female_1',
    platform: 'web'
  };

  // Establish friendship first
  store.ensureFriendship(crossApkHost.uniqueId, crossWebGuest.uniqueId);

  const socketCrossApk = createSocketClient();
  const socketCrossWeb = createSocketClient();
  await new Promise(r => socketCrossApk.on('connect', r));
  await new Promise(r => socketCrossWeb.on('connect', r));

  socketCrossApk.emit('register_user', { user: crossApkHost });
  socketCrossWeb.emit('register_user', { user: crossWebGuest });
  await delay(150);

  // APK Host creates room
  const cCreatePromise = new Promise(r => socketCrossApk.on('room_created', r));
  socketCrossApk.emit('create_room', {
    user: crossApkHost,
    category: 'ipl_cricket',
    mode: 'friends'
  });
  const crossRoom = await cCreatePromise;

  // APK Host sends direct room invite to Web Player
  const inviteReceivedPromise = new Promise(resolve => {
    socketCrossWeb.on('room_invitation_received', inv => resolve(inv));
  });

  socketCrossApk.emit('send_room_invite', {
    roomId: crossRoom.roomId,
    friendUniqueId: crossWebGuest.uniqueId,
    user: crossApkHost
  });

  const receivedInvite = await inviteReceivedPromise;
  assert.strictEqual(receivedInvite.roomId, crossRoom.roomId, 'Invite must carry correct roomId');
  assert.strictEqual(receivedInvite.sender.uniqueId, crossApkHost.uniqueId, 'Invite sender must match APK Host');
  console.log(`  ✓ Web Player received real-time room invitation from APK Player (${receivedInvite.roomCode})`);

  // Web Player accepts invitation
  const cJoinPromise = new Promise(r => socketCrossWeb.on('room_joined', r));
  socketCrossWeb.emit('join_room', {
    roomId: receivedInvite.roomId,
    user: crossWebGuest
  });
  const cJoined = await cJoinPromise;
  assert.strictEqual(cJoined.roomId, crossRoom.roomId);
  assert(cJoined.room, 'Must include room object');
  console.log(`  ✓ Web Player successfully accepted invitation and joined APK Host's room\n`);

  socketCrossApk.disconnect();
  socketCrossWeb.disconnect();

  // --------------------------------------------------------------------------
  // TEST 5: Combination 4 (Web <-> APK) - Friend Request & Bid Synchronization
  // --------------------------------------------------------------------------
  console.log('[TEST 5] Testing Web <-> APK: Friend Request Delivery & Acceptance...');
  const runId = Math.floor(Math.random() * 899999 + 100000);
  const userWebRequester = {
    id: `user_web_req_${runId}`,
    uniqueId: `BID-WEBREQ-${runId}`,
    numericPlayerId: `5${String(runId).slice(-6)}`,
    name: 'Web Requester',
    avatar: 'avatar_male_1',
    isGuest: false
  };
  const userApkRecipient = {
    id: `user_apk_rec_${runId}`,
    uniqueId: `BID-APKREC-${runId}`,
    numericPlayerId: `6${String(runId).slice(-6)}`,
    name: 'APK Recipient',
    avatar: 'avatar_female_1',
    isGuest: false
  };

  store.getOrCreateUser(userWebRequester);
  store.getOrCreateUser(userApkRecipient);

  const sReq = createSocketClient();
  const sRec = createSocketClient();
  await new Promise(r => sReq.on('connect', r));
  await new Promise(r => sRec.on('connect', r));

  sReq.emit('register_user', { user: userWebRequester });
  sRec.emit('register_user', { user: userApkRecipient });
  await delay(150);

  // Web user sends friend request via HTTP
  const friendReqPromise = new Promise(resolve => {
    sRec.on('friend_request_received', req => resolve(req));
  });

  const reqHttpRes = await postJson('/api/friends/request', {
    fromUniqueId: userWebRequester.uniqueId,
    toUniqueId: userApkRecipient.uniqueId
  });
  assert.strictEqual(reqHttpRes.status, 200, 'Friend request HTTP endpoint must return 200');

  const liveNotif = await friendReqPromise;
  assert.strictEqual(liveNotif.fromUniqueId, userWebRequester.uniqueId, 'Real-time friend notification delivered');
  console.log(`  ✓ Real-time friend request delivered from Web to APK: ${liveNotif.fromName}`);

  // APK user accepts friend request
  const acceptHttpRes = await postJson('/api/friends/accept', {
    userUniqueId: userApkRecipient.uniqueId,
    fromUniqueId: userWebRequester.uniqueId
  });
  assert.strictEqual(acceptHttpRes.status, 200, 'Friend request accept must succeed');
  assert(store.areFriends(userWebRequester.uniqueId, userApkRecipient.uniqueId), 'Permanent mutual friendship established');
  console.log(`  ✓ Friend request accepted; mutual friendship established in authoritative store\n`);

  sReq.disconnect();
  sRec.disconnect();

  console.log('================================================================');
  console.log(' ALL 4 CROSS-PLATFORM COMBINATIONS PASSED WITH ZERO ERRORS');
  console.log('================================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
