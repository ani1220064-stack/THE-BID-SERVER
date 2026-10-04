const { server, app, io: serverIo, roomManager } = require('./src/index');
const store = require('./src/services/store');
const io = require('socket.io-client');
const http = require('http');

const PORT = process.env.PORT || 4000;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let bodyStr = '';
      res.on('data', chunk => bodyStr += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(bodyStr);
          parsed.statusCode = res.statusCode;
          resolve(parsed);
        } catch (e) {
          resolve({ raw: bodyStr, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`${SERVER_URL}${path}`, (res) => {
      let bodyStr = '';
      res.on('data', chunk => bodyStr += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(bodyStr));
        } catch (e) {
          resolve({ raw: bodyStr, statusCode: res.statusCode });
        }
      });
    }).on('error', reject);
  });
}

async function runCompleteSuite() {
  console.log('================================================================');
  console.log(' THE BID — PRODUCTION FRIEND SYSTEM & TWO-DEVICE TEST SUITE');
  console.log(' Tests A through N: Comprehensive Realtime & Durable Verification');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Setup Test Users: Player A and Player B
  const userA = {
    id: 'user_suite_a',
    name: 'Player Alpha',
    uniqueId: 'BID-TESTA',
    avatar: 'avatar_1',
    trophies: 12,
    isGuest: false
  };

  const userB = {
    id: 'user_suite_b',
    name: 'Player Beta',
    uniqueId: 'BID-TESTB',
    avatar: 'avatar_2',
    trophies: 20,
    isGuest: false
  };

  // User C for mutual concurrency & offline tests
  const userC = {
    id: 'user_suite_c',
    name: 'Player Charlie',
    uniqueId: 'BID-TESTC',
    avatar: 'avatar_3',
    trophies: 15,
    isGuest: false
  };

  const userD = {
    id: 'user_suite_d',
    name: 'Player Delta',
    uniqueId: 'BID-TESTD',
    avatar: 'avatar_4',
    trophies: 8,
    isGuest: false
  };

  // Clean mock test accounts if any existed
  store.purgeMockTestAccounts(['BID-TESTA', 'BID-TESTB', 'BID-TESTC', 'BID-TESTD']);

  // Register all test users in store
  store.getOrCreateUser(userA);
  store.getOrCreateUser(userB);
  store.getOrCreateUser(userC);
  store.getOrCreateUser(userD);

  // Connect WebSockets for A and B
  let socketA = io(SERVER_URL, { reconnection: false, forceNew: true });
  let socketB = io(SERVER_URL, { reconnection: false, forceNew: true });

  await new Promise(r => socketA.on('connect', r));
  await new Promise(r => socketB.on('connect', r));

  socketA.emit('register_user', { user: userA });
  socketB.emit('register_user', { user: userB });
  await wait(300);

  // ==================================================================
  // TEST A: A searches B by Player ID. B appears correctly.
  // ==================================================================
  console.log('\n--- TEST A: Search B by Player ID ---');
  // Exact match
  const search1 = await postJson('/api/friends/search', { uniqueId: 'BID-TESTB', searcherUniqueId: 'BID-TESTA' });
  assert(search1.name === 'Player Beta' && search1.uniqueId === 'BID-TESTB', 'A searches B with exact uppercase ID -> profile returned');

  // Case-insensitive match & whitespace trim
  const search2 = await postJson('/api/friends/search', { uniqueId: '  bid-testb  ', searcherUniqueId: 'BID-TESTA' });
  assert(search2.name === 'Player Beta' && search2.uniqueId === 'BID-TESTB', 'A searches B with lowercase + spaces -> profile returned');

  // Non-existent player
  const search3 = await postJson('/api/friends/search', { uniqueId: 'BID-NONEXIST', searcherUniqueId: 'BID-TESTA' });
  assert(search3.error && search3.statusCode === 404, 'Searching non-existent ID returns clear 404 NOT FOUND');

  // Self search
  const selfRel = store.getPlayerRelationship('BID-TESTA', 'BID-TESTA');
  assert(selfRel === 'SELF', 'Self relationship correctly identified as SELF');

  // ==================================================================
  // TEST B: A sends friend request. B receives it immediately.
  // ==================================================================
  console.log('\n--- TEST B: Send Friend Request & Realtime Delivery ---');
  let receivedReqOnB = null;
  socketB.on('friend_request_received', (req) => {
    receivedReqOnB = req;
  });

  const sendRes = await postJson('/api/friends/request', { fromUniqueId: 'BID-TESTA', toUniqueId: 'BID-TESTB' });
  assert(sendRes.success === true && sendRes.request && sendRes.request.status === 'PENDING', 'Request created with durable status PENDING in database');

  // Check database persistence directly
  const pendingRequestsInDb = store.getFriendRequests('BID-TESTB');
  assert(pendingRequestsInDb.some(r => r.fromUniqueId === 'BID-TESTA' && r.status === 'PENDING'), 'Database has PENDING request for B');

  await wait(300);
  assert(receivedReqOnB !== null && receivedReqOnB.fromUniqueId === 'BID-TESTA', 'B received realtime socket event friend_request_received immediately');

  // ==================================================================
  // TEST C: B accepts. Both friend lists show the friendship.
  // ==================================================================
  console.log('\n--- TEST C: B Accepts & Canonical Friendship Established ---');
  let acceptEventOnA = null;
  let acceptEventOnB = null;
  socketA.on('friend_request_accepted', (payload) => { acceptEventOnA = payload; });
  socketB.on('friend_request_accepted', (payload) => { acceptEventOnB = payload; });

  const acceptRes = await postJson('/api/friends/accept', { userUniqueId: 'BID-TESTB', fromUniqueId: 'BID-TESTA' });
  assert(acceptRes.success === true, 'Accept request succeeded authoritatively');

  // Verify canonical pair in store
  const canonicalPair = store.getCanonicalPair('BID-TESTA', 'BID-TESTB');
  assert(store.data.friendships && store.data.friendships[canonicalPair], `Canonical unordered pair [${canonicalPair}] stored in database`);

  // Verify reciprocal areFriends
  assert(store.areFriends('BID-TESTA', 'BID-TESTB') === true, 'areFriends(A, B) is true');
  assert(store.areFriends('BID-TESTB', 'BID-TESTA') === true, 'areFriends(B, A) is true');

  // Verify REST friend list for both users
  const listA = await getJson('/api/friends/BID-TESTA');
  const listB = await getJson('/api/friends/BID-TESTB');
  assert(listA.friends.some(f => f.uniqueId === 'BID-TESTB'), 'A\'s friend list contains B');
  assert(listB.friends.some(f => f.uniqueId === 'BID-TESTA'), 'B\'s friend list contains A');

  await wait(300);
  assert(acceptEventOnA !== null && acceptEventOnB !== null, 'Realtime accept notification delivered to both players');

  // ==================================================================
  // TEST D: B sends request to A when already friends.
  // ==================================================================
  console.log('\n--- TEST D: Duplicate Request When Already Friends ---');
  const sendResD = await postJson('/api/friends/request', { fromUniqueId: 'BID-TESTB', toUniqueId: 'BID-TESTA' });
  assert(sendResD.success === false && sendResD.error === 'ALREADY_FRIENDS', 'Request rejected cleanly with ALREADY_FRIENDS');

  // ==================================================================
  // TEST E: A closes app. B sends request. A opens app. A still receives pending request.
  // ==================================================================
  console.log('\n--- TEST E: Offline Friend Request & Reconnect Sync ---');
  // Use user C and user D for this clean isolated flow
  // Socket D is connected, Socket C disconnects (A closes app)
  let socketD = io(SERVER_URL, { reconnection: false, forceNew: true });
  await new Promise(r => socketD.on('connect', r));
  socketD.emit('register_user', { user: userD });

  // D sends request to C while C has no active socket
  const sendResE = await postJson('/api/friends/request', { fromUniqueId: 'BID-TESTD', toUniqueId: 'BID-TESTC' });
  assert(sendResE.success === true && sendResE.request.status === 'PENDING', 'Request created while recipient offline');

  // Now C opens app tomorrow (connects and registers)
  let socketC = io(SERVER_URL, { reconnection: false, forceNew: true });
  await new Promise(r => socketC.on('connect', r));

  let batchReceivedOnC = null;
  socketC.on('friend_requests_batch', (reqs) => {
    batchReceivedOnC = reqs;
  });

  socketC.emit('register_user', { user: userC });
  await wait(400);

  assert(batchReceivedOnC && batchReceivedOnC.some(r => r.fromUniqueId === 'BID-TESTD'), 'C received pending request via friend_requests_batch upon reconnect');

  // C accepts D's request
  await postJson('/api/friends/accept', { userUniqueId: 'BID-TESTC', fromUniqueId: 'BID-TESTD' });
  assert(store.areFriends('BID-TESTC', 'BID-TESTD'), 'C and D are now permanent friends');

  // ==================================================================
  // TEST F: A creates private room. A invites B directly. B accepts. B joins.
  // ==================================================================
  console.log('\n--- TEST F: Direct Room Invitation & Safe Join ---');
  let roomCreatedOnA = null;
  socketA.on('room_created', (data) => { roomCreatedOnA = data; });

  socketA.emit('create_room', {
    user: userA,
    category: 'ipl_cricket',
    mode: 'friends'
  });
  await wait(400);
  assert(roomCreatedOnA && roomCreatedOnA.roomId, `A created private room: ${roomCreatedOnA?.roomId}`);

  let inviteReceivedOnB = null;
  socketB.on('room_invitation_received', (inv) => {
    inviteReceivedOnB = inv;
  });

  socketA.emit('send_room_invite', {
    roomId: roomCreatedOnA.roomId,
    friendUniqueId: 'BID-TESTB',
    user: userA
  });
  await wait(400);

  assert(inviteReceivedOnB && inviteReceivedOnB.roomId === roomCreatedOnA.roomId, 'B received direct room invitation via socket');

  // B accepts room invitation
  let roomJoinedOnB = null;
  socketB.on('room_joined', (data) => {
    roomJoinedOnB = data;
  });

  socketB.emit('respond_room_invite', {
    invitationId: inviteReceivedOnB.id,
    response: 'ACCEPTED',
    user: userB
  });
  await wait(400);

  assert(roomJoinedOnB && roomJoinedOnB.roomId === roomCreatedOnA.roomId, 'B successfully joined A\'s room without room code');
  const currentRoom = roomManager.getRoom(roomCreatedOnA.roomId);
  assert(currentRoom && currentRoom.participants.has(userB.id), 'Room participants map includes B');

  // ==================================================================
  // TEST G: B is inside game -> presence shows BUSY. Cannot be invited again falsely.
  // ==================================================================
  console.log('\n--- TEST G: Presence Shows BUSY During Active Game ---');
  const presenceB = roomManager.getUserPresence('BID-TESTB', true);
  assert(presenceB === 'BUSY', 'B\'s authoritative presence is BUSY while inside room');

  // A checks B via friends REST API
  const aFriendsApi = await getJson('/api/friends/BID-TESTA');
  const bInFriendsList = aFriendsApi.friends.find(f => f.uniqueId === 'BID-TESTB');
  assert(bInFriendsList && bInFriendsList.status === 'BUSY', 'Friends REST API accurately shows B as BUSY');

  // ==================================================================
  // TEST H: B leaves game -> presence immediately becomes AVAILABLE.
  // ==================================================================
  console.log('\n--- TEST H: Leave Room & Presence Transitions to AVAILABLE ---');
  socketB.emit('leave_room', {
    roomId: roomCreatedOnA.roomId,
    userId: userB.id,
    uniqueId: 'BID-TESTB'
  });
  await wait(400);

  const presenceBAfterLeave = roomManager.getUserPresence('BID-TESTB', true);
  assert(presenceBAfterLeave === 'AVAILABLE', 'B\'s presence returned to AVAILABLE immediately upon leaving room');

  // ==================================================================
  // TEST I: B disconnects completely -> presence becomes OFFLINE.
  // ==================================================================
  console.log('\n--- TEST I: Complete Disconnect -> Presence OFFLINE ---');
  socketB.disconnect();
  await wait(400);

  const presenceBOffline = roomManager.getUserPresence('BID-TESTB', false);
  assert(presenceBOffline === 'OFFLINE', 'B\'s presence is OFFLINE when socket disconnected');

  // ==================================================================
  // TEST J: B reconnects -> presence returns to AVAILABLE.
  // ==================================================================
  console.log('\n--- TEST J: Reconnect -> Presence Returns to AVAILABLE ---');
  socketB = io(SERVER_URL, { reconnection: false, forceNew: true });
  await new Promise(r => socketB.on('connect', r));
  socketB.emit('register_user', { user: userB });
  await wait(400);

  const presenceBReconnected = roomManager.getUserPresence('BID-TESTB', true);
  assert(presenceBReconnected === 'AVAILABLE', 'B returns to ONLINE / AVAILABLE after reconnect');

  // ==================================================================
  // TEST K: Idempotent Friendship: A tries to re-add B.
  // ==================================================================
  console.log('\n--- TEST K: Duplicate Friendship Protection ---');
  const initialFriendshipsCount = Object.keys(store.data.friendships || {}).length;
  const reAddRes = await postJson('/api/friends/request', { fromUniqueId: 'BID-TESTA', toUniqueId: 'BID-TESTB' });
  const finalFriendshipsCount = Object.keys(store.data.friendships || {}).length;
  assert(reAddRes.success === false && reAddRes.error === 'ALREADY_FRIENDS', 'Re-add request rejected');
  assert(initialFriendshipsCount === finalFriendshipsCount, 'No duplicate friendship record created');

  // ==================================================================
  // TEST L: Duplicate Room Invitation Delivery & Deduplication.
  // ==================================================================
  console.log('\n--- TEST L: Duplicate Room Invitation Deduplication ---');
  // A is still host of roomCreatedOnA.roomId
  const inv1 = store.createOrUpdateInvitation({
    sender: userA,
    recipientUniqueId: 'BID-TESTB',
    roomId: roomCreatedOnA.roomId,
    roomCode: 'BID-12345',
    category: 'ipl_cricket'
  });
  // Simulate duplicate send immediately
  const inv2 = store.createOrUpdateInvitation({
    sender: userA,
    recipientUniqueId: 'BID-TESTB',
    roomId: roomCreatedOnA.roomId,
    roomCode: 'BID-12345',
    category: 'ipl_cricket'
  });
  assert(inv1.invitation.id === inv2.invitation.id, 'Duplicate invitation reuses same stable invitation ID');
  assert(inv2.isDuplicate === true, 'Duplicate invitation correctly flagged isDuplicate: true');

  // ==================================================================
  // TEST M: Room is closed while an invitation is pending -> becomes invalid.
  // ==================================================================
  console.log('\n--- TEST M: Room Closed While Invitation Pending ---');
  // Create a new room and invitation for testing room cancellation
  const tempRoom = roomManager.createRoom({
    roomId: 'room_temp_m',
    hostUser: userA,
    category: 'ipl_cricket',
    mode: 'friends'
  });

  const tempInv = store.createOrUpdateInvitation({
    sender: userA,
    recipientUniqueId: 'BID-TESTB',
    roomId: tempRoom.id,
    roomCode: tempRoom.roomCode,
    category: 'ipl_cricket'
  });

  assert(tempInv.invitation.status === 'PENDING', 'Temporary invitation is PENDING');

  // A leaves or closes the room
  roomManager.leaveRoom(tempRoom.id, userA.id, userA.uniqueId);

  // Invitation in store should now be CANCELLED
  const cancelledInv = store.getInvitation(tempInv.invitation.id);
  assert(cancelledInv && cancelledInv.status === 'CANCELLED', 'Invitation marked CANCELLED when room was closed');

  // B attempts to accept cancelled invitation
  let errorReceivedOnB = null;
  socketB.on('error_message', (err) => { errorReceivedOnB = err; });
  socketB.emit('respond_room_invite', {
    invitationId: tempInv.invitation.id,
    response: 'ACCEPTED',
    user: userB
  });
  await wait(400);

  assert(errorReceivedOnB !== null, 'Player cannot join a dead or cancelled room');

  // ==================================================================
  // TEST N: Near-Simultaneous Mutual Requests Converge to Single Friendship.
  // ==================================================================
  console.log('\n--- TEST N: Concurrent Mutual Requests Converge Safely ---');
  // Use two fresh user IDs
  const userN1 = { id: 'user_n1', name: 'User N1', uniqueId: 'BID-TESTN1', trophies: 5 };
  const userN2 = { id: 'user_n2', name: 'User N2', uniqueId: 'BID-TESTN2', trophies: 5 };
  store.purgeMockTestAccounts(['BID-TESTN1', 'BID-TESTN2']);
  store.getOrCreateUser(userN1);
  store.getOrCreateUser(userN2);

  // Simultaneously fire request N1 -> N2 and N2 -> N1
  const [reqN1, reqN2] = await Promise.all([
    postJson('/api/friends/request', { fromUniqueId: 'BID-TESTN1', toUniqueId: 'BID-TESTN2' }),
    postJson('/api/friends/request', { fromUniqueId: 'BID-TESTN2', toUniqueId: 'BID-TESTN1' })
  ]);

  assert(store.areFriends('BID-TESTN1', 'BID-TESTN2') === true, 'Both users are now permanent friends');
  const canonicalN = store.getCanonicalPair('BID-TESTN1', 'BID-TESTN2');
  const matchingFriendships = Object.values(store.data.friendships || {}).filter(f => 
    (f.userA === 'BID-TESTN1' && f.userB === 'BID-TESTN2') || (f.userA === 'BID-TESTN2' && f.userB === 'BID-TESTN1')
  );
  assert(matchingFriendships.length === 1, 'Exactly ONE canonical friendship record was created (no duplicates)');

  // Clean up sockets
  socketA.disconnect();
  socketB.disconnect();
  socketC.disconnect();
  socketD.disconnect();

  // Clean mock test accounts from DB
  store.purgeMockTestAccounts(['BID-TESTA', 'BID-TESTB', 'BID-TESTC', 'BID-TESTD', 'BID-TESTN1', 'BID-TESTN2']);

  console.log('\n================================================================');
  console.log(` SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Allow server to listen then run
setTimeout(() => {
  runCompleteSuite().catch(err => {
    console.error('Test Suite Exception:', err);
    process.exit(1);
  });
}, 1000);
