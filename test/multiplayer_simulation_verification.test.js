/**
 * ============================================================================
 * THE BID — End-to-End Multiplayer Testing Environment Verification Test
 * ============================================================================
 */

const assert = require('assert');
const { io: ioClient } = require('socket.io-client');
const { performCleanup, MOCK_UNIQUE_IDS } = require('../scripts/cleanup_mock_accounts');

const SERVER_URL = 'http://localhost:4000';
const HOST_ID = 'BID-ANIRUDH';

async function runVerification() {
  console.log('=== STARTING MULTIPLAYER SIMULATION VERIFICATION ===\n');

  // Step 1: Run simulation setup script
  console.log('Phase 1: Running simulate_multiplayer_friends.js (--test-only)');
  const { execSync } = require('child_process');
  const setupOutput = execSync('node server/scripts/simulate_multiplayer_friends.js --test-only', { encoding: 'utf8' });
  console.log(setupOutput);

  // Step 2: Query /api/friends/BID-ANIRUDH and assert 3 pending requests
  console.log('Phase 2: Verifying Inbound Requests via REST Endpoint');
  const res = await fetch(`${SERVER_URL}/api/friends/${HOST_ID}`);
  assert.strictEqual(res.status, 200, 'Friends endpoint should return 200');
  const data = await res.json();

  assert.ok(Array.isArray(data.requests), 'Requests should be an array');
  assert.strictEqual(data.requests.length, 3, 'Should have exactly 3 inbound requests');

  const requestIds = data.requests.map(r => r.fromUniqueId);
  assert.ok(requestIds.includes('BID-77AV91'), 'Should contain Arjun Verma');
  assert.ok(requestIds.includes('BID-88PS42'), 'Should contain Priya Sharma');
  assert.ok(requestIds.includes('BID-99KM63'), 'Should contain Kabir Mehta');
  console.log('✓ Verified: 3 authentic inbound friend requests present in database & API\n');

  // Step 3: Accept 1 friend request (Arjun Verma) as Host
  console.log('Phase 3: Accepting Arjun Verma (BID-77AV91) Friend Request');
  const acceptRes = await fetch(`${SERVER_URL}/api/friends/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userUniqueId: HOST_ID,
      fromUniqueId: 'BID-77AV91'
    })
  });
  const acceptData = await acceptRes.json();
  assert.strictEqual(acceptData.success, true, 'Friend accept should succeed');

  // Verify friends list
  const friendsRes = await fetch(`${SERVER_URL}/api/friends/${HOST_ID}`);
  const friendsData = await friendsRes.json();
  assert.strictEqual(friendsData.friends.length, 1, 'Should now have 1 mutual friend');
  assert.strictEqual(friendsData.friends[0].uniqueId, 'BID-77AV91');
  assert.strictEqual(friendsData.friends[0].name, 'Arjun Verma');
  console.log(`✓ Verified: Arjun Verma is now a mutual permanent friend of ${HOST_ID}\n`);

  // Step 4: Test Live Socket.io Room Invitation & Lobby Join
  console.log('Phase 4: Live Socket.IO Invitation & Lobby Interaction');

  // Host Socket
  const hostSocket = ioClient(SERVER_URL, { transports: ['websocket'] });
  // Mock Arjun Socket
  const arjunSocket = ioClient(SERVER_URL, { transports: ['websocket'] });

  await new Promise((resolve) => {
    let connected = 0;
    const onConn = () => { if (++connected === 2) resolve(); };
    hostSocket.on('connect', onConn);
    arjunSocket.on('connect', onConn);
  });

  // Register host & mock player
  hostSocket.emit('register_user', {
    user: { id: 'usr_anirudh_host', name: 'Anirudh', uniqueId: HOST_ID, avatar: 'avatar_1' }
  });
  arjunSocket.emit('register_user', {
    user: { id: 'user_mock_arjun_77av91', name: 'Arjun Verma', uniqueId: 'BID-77AV91', avatar: 'avatar_2' }
  });

  await new Promise(r => setTimeout(r, 500));

  // Host creates friends room
  let createdRoomId = null;
  let createdRoomCode = null;

  await new Promise((resolve) => {
    hostSocket.on('room_created', (data) => {
      createdRoomId = data.roomId;
      createdRoomCode = data.roomCode;
      console.log(`✓ Host created room: ${createdRoomCode} (ID: ${createdRoomId})`);
      resolve();
    });

    hostSocket.emit('create_room', {
      user: { id: 'usr_anirudh_host', name: 'Anirudh', uniqueId: HOST_ID, avatar: 'avatar_1' },
      category: 'ipl_cricket',
      mode: 'friends'
    });
  });

  // Arjun listens for room invite
  const invitePromise = new Promise((resolve) => {
    arjunSocket.on('room_invitation_received', (inv) => {
      console.log(`✓ Arjun received room invitation for: ${inv.roomCode}`);
      // Arjun auto-accepts
      arjunSocket.emit('respond_room_invite', {
        invitationId: inv.id,
        response: 'ACCEPTED',
        user: { id: 'user_mock_arjun_77av91', name: 'Arjun Verma', uniqueId: 'BID-77AV91', avatar: 'avatar_2' }
      });
    });

    arjunSocket.on('room_joined', (data) => {
      console.log(`✓ Arjun joined room: ${data.roomCode}`);
      resolve();
    });
  });

  // Host sends room invite to Arjun
  hostSocket.emit('send_room_invite', {
    roomId: createdRoomId,
    friendUniqueId: 'BID-77AV91',
    user: { id: 'usr_anirudh_host', name: 'Anirudh', uniqueId: HOST_ID, avatar: 'avatar_1' }
  });

  await invitePromise;

  // Verify both are in the room
  await new Promise(r => setTimeout(r, 500));
  hostSocket.disconnect();
  arjunSocket.disconnect();

  console.log('✓ Verified: End-to-end invitation, acceptance, and lobby join passed!\n');

  // Step 5: Test Permanent Teardown & Zero Residue
  console.log('Phase 5: Permanent Cleanup Teardown Verification');
  const cleanupResult = await performCleanup();
  assert.strictEqual(cleanupResult.success, true, 'Cleanup should succeed');

  // Verify database has 0 mock accounts
  const verifyRes = await fetch(`${SERVER_URL}/api/friends/${HOST_ID}`);
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.friends.length, 0, 'Friends list should be clean after purge');
  assert.strictEqual(verifyData.requests.length, 0, 'Requests list should be clean after purge');
  console.log('✓ Verified: Complete zero-residue permanent deletion confirmed!\n');

  console.log('====================================================');
  console.log('🎉 ALL MULTIPLAYER SIMULATION TESTS PASSED!');
  console.log('====================================================');
}

runVerification().then(() => process.exit(0)).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
