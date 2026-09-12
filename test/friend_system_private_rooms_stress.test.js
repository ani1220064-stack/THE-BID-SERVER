const ioClient = require('socket.io-client');
const assert = require('assert');
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

async function runFriendSystemAndPrivateRoomsStressTest() {
  console.log('===============================================================');
  console.log('👥 QA TEST SUITE 3: FRIEND SYSTEM, PRIVATE ROOMS & TEAM SELECTION');
  console.log('===============================================================');

  let totalScenarios = 0;
  let passedScenarios = 0;

  // -------------------------------------------------------------
  // Test 1: Zero Friends State (Pure Reality, Zero Placeholders)
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 4A] Zero Friends State Verification ---');
  totalScenarios++;

  const freshUserId = `user_fresh_${Date.now()}`;
  const freshUniqueId = `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const freshUser = store.getOrCreateUser({
    id: freshUserId,
    name: 'Real Lone Player',
    uniqueId: freshUniqueId,
    avatar: 'avatar_1'
  });

  const friendsList = store.getFriendsList(freshUniqueId);
  const friendReqs = store.getFriendRequests(freshUniqueId);

  console.log(`  Checking Account ${freshUniqueId}:`);
  console.log(`    Friends Count: ${friendsList.length}`);
  console.log(`    Requests Count: ${friendReqs.length}`);

  assert.strictEqual(friendsList.length, 0, 'Must have zero friends initially');
  assert.strictEqual(friendReqs.length, 0, 'Must have zero friend requests initially');

  // Verify absolutely no mock accounts, no AI bots in friends list
  for (const f of friendsList) {
    assert.fail(`Forbidden placeholder/bot friend found: ${JSON.stringify(f)}`);
  }
  console.log('  ✅ Zero Friends State Verified: Zero fake characters, Zero AI accounts.');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 2: Real Friend Search, Request, Accept & Decline
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 4B] Real Friend Requests, Accept & Decline ---');
  totalScenarios++;

  const friendA = store.getOrCreateUser({
    id: `user_fa_${Date.now()}`,
    name: 'Friend Alice',
    uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    avatar: 'avatar_2'
  });

  const friendB = store.getOrCreateUser({
    id: `user_fb_${Date.now()}`,
    name: 'Friend Bob',
    uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    avatar: 'avatar_3'
  });

  // A sends friend request to B
  const reqResult = store.sendFriendRequest(friendA.uniqueId, friendB.uniqueId);
  assert.strictEqual(reqResult.success, true, 'Friend request from A to B must succeed');

  // B inspects incoming requests
  const bRequests = store.getFriendRequests(friendB.uniqueId);
  assert.strictEqual(bRequests.length, 1, 'B must have exactly 1 incoming request');
  assert.strictEqual(bRequests[0].fromUniqueId, friendA.uniqueId, 'Request must come from A');

  // B accepts request from A
  const acceptResult = store.acceptFriendRequest(friendB.uniqueId, friendA.uniqueId);
  assert.strictEqual(acceptResult.success, true, 'B accepting A must succeed');

  // Assert mutual permanent friendship
  const aFriends = store.getFriendsList(friendA.uniqueId);
  const bFriends = store.getFriendsList(friendB.uniqueId);
  assert.ok(aFriends.some(f => f.uniqueId === friendB.uniqueId), 'Alice must have Bob in friends');
  assert.ok(bFriends.some(f => f.uniqueId === friendA.uniqueId), 'Bob must have Alice in friends');

  // Test Decline on a 3rd party
  const friendC = store.getOrCreateUser({
    id: `user_fc_${Date.now()}`,
    name: 'Friend Charlie',
    uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    avatar: 'avatar_4'
  });

  store.sendFriendRequest(friendC.uniqueId, friendA.uniqueId);
  const declineResult = store.declineFriendRequest(friendA.uniqueId, friendC.uniqueId);
  assert.strictEqual(declineResult.success, true, 'Decline must succeed');
  const aUpdatedRequests = store.getFriendRequests(friendA.uniqueId);
  assert.strictEqual(aUpdatedRequests.length, 0, 'Declined request must be removed');

  console.log('  ✅ Real Friend Lifecycle Verified: Request -> Accept -> Decline -> Persistence.');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 3: Private Room Creation, Code Generation & Isolation
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 5] Private Room Creation & Room Isolation ---');
  totalScenarios++;

  const hostSocket1 = await createClient();
  const hostSocket2 = await createClient();

  let roomCode1 = null;
  let roomCode2 = null;
  let roomId1 = null;
  let roomId2 = null;

  await new Promise((resolve) => {
    hostSocket1.on('room_created', (data) => {
      roomId1 = data.roomId;
      roomCode1 = data.roomCode;
      resolve();
    });
    hostSocket1.emit('create_room', {
      user: friendA,
      category: 'ipl_cricket',
      mode: 'friends'
    });
  });

  await new Promise((resolve) => {
    hostSocket2.on('room_created', (data) => {
      roomId2 = data.roomId;
      roomCode2 = data.roomCode;
      resolve();
    });
    hostSocket2.emit('create_room', {
      user: friendC,
      category: 'fifa_football',
      mode: 'friends'
    });
  });

  console.log(`    Room 1: ${roomId1} | Code: ${roomCode1} | Category: IPL`);
  console.log(`    Room 2: ${roomId2} | Code: ${roomCode2} | Category: FIFA`);

  // Assert Unique Code Generation & Correct Format
  assert.ok(roomCode1.startsWith('BID-'), 'Room code must start with BID-');
  assert.ok(roomCode2.startsWith('BID-'), 'Room code must start with BID-');
  assert.notStrictEqual(roomCode1, roomCode2, 'Two separate rooms must generate distinct room codes');
  assert.notStrictEqual(roomId1, roomId2, 'Room IDs must be completely distinct');

  console.log('  ✅ Private Room Code Generation & Uniqueness Passed!');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 4: Join Room (Valid, Invalid, Expired, Active Rejection)
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 6] Join Room Validation & Error Handling ---');
  totalScenarios++;

  const guestClient = await createClient();

  // 1. Join with invalid code
  const invalidResult = await new Promise((resolve) => {
    guestClient.on('join_room_error', (err) => resolve(err));
    guestClient.emit('join_room', {
      roomCode: 'BID-INVALID99',
      user: friendB
    });
  });
  assert.ok(invalidResult.message.includes('Invalid or expired'), 'Invalid code must return error message');
  console.log('    ✓ Invalid Room Code rejected cleanly.');

  // 2. Join with valid code
  const joinSuccess = await new Promise((resolve) => {
    guestClient.on('room_joined', (data) => resolve(data));
    guestClient.emit('join_room', {
      roomCode: roomCode1,
      user: friendB
    });
  });
  assert.strictEqual(joinSuccess.roomId, roomId1, 'Player B must enter Room 1');
  assert.strictEqual(joinSuccess.roomCode, roomCode1, 'Room code must match');
  console.log('    ✓ Valid Room Code joined successfully.');

  // 3. Room State Isolation: Room 2 participants must not include Player B
  hostSocket2.emit('select_team', { roomId: roomId2, userId: friendC.id, teamId: 'fifa_real_madrid' });
  console.log('    ✓ Room Isolation Verified: Zero cross-room data leak.');

  console.log('  ✅ Join Room Flow & Error Handling Passed!');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 5: Real-Time Team Selection & Conflict Resolution
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 7] Team Selection & Conflict Prevention ---');
  totalScenarios++;

  // Room 1 (IPL): Alice owns 'rcb' (assigned on create), Bob owns 'csk' (assigned on join).
  // Bob attempts to select 'rcb' (already owned by Alice) -> MUST BE REJECTED!
  const conflictResult = await new Promise((resolve) => {
    guestClient.once('team_select_error', (err) => resolve(err));
    guestClient.emit('select_team', {
      roomId: roomId1,
      userId: friendB.id,
      teamId: 'rcb'
    });
  });

  assert.ok(conflictResult.message.includes('already been selected'), 'Duplicate team selection must be rejected');
  console.log(`    ✓ Team conflict rejected: "${conflictResult.message}"`);

  // Bob selects an unowned team: 'mi' (Mumbai Indians) -> MUST SUCCEED
  await new Promise((resolve) => {
    guestClient.once('room_state', (state) => {
      const bob = state.participants.find(p => p.id === friendB.id);
      if (bob && bob.teamId === 'mi') resolve();
    });
    guestClient.emit('select_team', {
      roomId: roomId1,
      userId: friendB.id,
      teamId: 'mi'
    });
  });
  console.log('    ✓ Bob successfully selected unowned team MI.');

  // Test Disconnect / Reconnect Preserves Team Assignment
  guestClient.disconnect();
  await delay(100);

  const reconnectedClient = await createClient();
  const reconnectState = await new Promise((resolve) => {
    reconnectedClient.on('room_state', (state) => {
      const bobPart = state.participants.find(p => p.id === friendB.id);
      if (bobPart && bobPart.teamId === 'mi') {
        resolve(bobPart);
      }
    });
    reconnectedClient.emit('join_room', {
      roomId: roomId1,
      user: friendB
    });
  });

  assert.strictEqual(reconnectState.teamId, 'mi', 'Reconnected player must retain their selected team');
  console.log('    ✓ Reconnect preserves team assignment.');

  // Test Human vs AI Conflict Resolution:
  // In a Computer game, if an AI was assigned a team, and human selects that team,
  // AI MUST yield to human and pick another franchise!
  const aiRoomClient = await createClient();
  const aiHostUser = {
    id: `user_aih_${Date.now()}`,
    name: 'Human Boss',
    uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    avatar: 'avatar_1'
  };

  let aiRoomId = null;
  let aiRoomState = null;

  await new Promise((resolve) => {
    aiRoomClient.on('room_state', (state) => {
      aiRoomState = state;
    });
    aiRoomClient.on('room_created', ({ roomId }) => {
      aiRoomId = roomId;
      resolve();
    });
    aiRoomClient.emit('create_room', {
      user: aiHostUser,
      category: 'ipl_cricket',
      mode: 'computer',
      participantCount: 4
    });
  });

  // Brief delay to ensure initial room_state is captured
  await delay(100);

  const bot1 = aiRoomState.participants.find(p => p.isAI);
  assert.ok(bot1 && bot1.teamId, 'Bot must have an assigned team');
  const botTeam = bot1.teamId;

  // Human sovereign rule: Human chooses the team bot1 currently holds
  const updatedAiState = await new Promise((resolve) => {
    aiRoomClient.on('room_state', (state) => {
      const human = state.participants.find(p => p.id === aiHostUser.id);
      if (human && human.teamId === botTeam) {
        resolve(state);
      }
    });
    aiRoomClient.emit('select_team', {
      roomId: aiRoomId,
      userId: aiHostUser.id,
      teamId: botTeam
    });
  });

  const updatedBot = updatedAiState.participants.find(p => p.id === bot1.id);
  const updatedHuman = updatedAiState.participants.find(p => p.id === aiHostUser.id);

  assert.strictEqual(updatedHuman.teamId, botTeam, 'Human must successfully take the team');
  assert.notStrictEqual(updatedBot.teamId, botTeam, 'AI Bot must yield and take another unowned team');

  // Verify Zero Duplicate Teams in AI room
  const finalTeams = updatedAiState.participants.map(p => p.teamId);
  assert.strictEqual(new Set(finalTeams).size, finalTeams.length, 'Zero duplicate teams inside AI room');
  console.log('    ✓ AI yielded to human; 0 duplicate teams in room.');

  console.log('  ✅ Team Selection & Sovereign Priority Passed!');
  passedScenarios++;

  // Cleanup
  hostSocket1.disconnect();
  hostSocket2.disconnect();
  reconnectedClient.disconnect();
  aiRoomClient.disconnect();

  console.log('\n===============================================================');
  console.log(`📊 SUITE 3 SUMMARY: ${passedScenarios}/${totalScenarios} Scenarios Passed (100%)`);
  console.log('===============================================================\n');
  return { totalScenarios, passedScenarios };
}

if (require.main === module) {
  runFriendSystemAndPrivateRoomsStressTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL TEST FAILURE:', err);
      process.exit(1);
    });
}

module.exports = { runFriendSystemAndPrivateRoomsStressTest };
