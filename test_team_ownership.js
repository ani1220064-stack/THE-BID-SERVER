const assert = require('assert');
const RoomManager = require('./src/rooms/RoomManager');
const { IPL_FRANCHISES, getFranchiseById } = require('./src/data/iplFranchises');

// Mock Socket.io
class MockIO {
  to() {
    return {
      emit: () => {}
    };
  }
  emit() {}
}

async function runTests() {
  console.log('🧪 Starting IPL Team Ownership & Unique Franchise Test Suite...\n');
  const io = new MockIO();
  let testsPassed = 0;

  // TEST 1: Play with Computer — Host selects RCB, bots get unique remaining franchises
  {
    console.log('Test 1: Play with Computer — Single Franchise Ownership');
    const rm = new RoomManager(io);
    const hostUser = {
      id: 'host_user_1',
      uniqueId: 'TB-HOST1',
      name: 'Host Player',
      avatar: 'avatar_1',
      teamId: 'rcb',
      teamName: 'Royal Challengers Bengaluru',
      socketId: 'sock_host_1'
    };

    const room = rm.createRoom({
      roomId: 'room_comp_1',
      hostUser,
      mode: 'computer'
    });

    assert.strictEqual(room.teamOwnership.get('rcb'), 'host_user_1', 'Host must own RCB');
    const participants = Array.from(room.participants.values());
    assert.strictEqual(participants.length, 4, 'Should have Host + 3 bots');

    const hostParticipant = participants.find(p => p.id === 'host_user_1');
    assert.strictEqual(hostParticipant.teamId, 'rcb');
    assert.strictEqual(hostParticipant.teamName, 'Royal Challengers Bengaluru');

    const botParticipants = participants.filter(p => p.isAI);
    const teamIds = participants.map(p => p.teamId);
    const uniqueTeamIds = new Set(teamIds);

    assert.strictEqual(uniqueTeamIds.size, participants.length, 'Every participant in the room must have a unique teamId');
    assert.ok(!botParticipants.some(b => b.teamId === 'rcb'), 'No computer bot should ever have Host\'s RCB');
    assert.ok(!botParticipants.some(b => b.teamName === 'Royal Challengers Bengaluru'), 'No bot should have RCB teamName');

    console.log('  ✓ Host has RCB. Bots received unique remaining franchises:', botParticipants.map(b => b.teamName).join(', '));
    testsPassed++;
  }

  // TEST 2: Play with Computer with Custom Participants (Host picks CSK, 9 bots = 10 total)
  {
    console.log('\nTest 2: Maximum Room Capacity (10 Participants: Host + 9 Bots)');
    const rm = new RoomManager(io);
    const hostUser = {
      id: 'host_user_2',
      uniqueId: 'TB-HOST2',
      name: 'Host Player 2',
      avatar: 'avatar_1',
      teamId: 'csk',
      teamName: 'Chennai Super Kings',
      socketId: 'sock_host_2'
    };

    const customParticipants = [
      { id: hostUser.id, name: hostUser.name, teamId: 'csk', type: 'HOST' },
      { id: 'bot_1', name: 'Bot 1', type: 'COMPUTER' },
      { id: 'bot_2', name: 'Bot 2', type: 'COMPUTER' },
      { id: 'bot_3', name: 'Bot 3', type: 'COMPUTER' },
      { id: 'bot_4', name: 'Bot 4', type: 'COMPUTER' },
      { id: 'bot_5', name: 'Bot 5', type: 'COMPUTER' },
      { id: 'bot_6', name: 'Bot 6', type: 'COMPUTER' },
      { id: 'bot_7', name: 'Bot 7', type: 'COMPUTER' },
      { id: 'bot_8', name: 'Bot 8', type: 'COMPUTER' },
      { id: 'bot_9', name: 'Bot 9', type: 'COMPUTER' },
    ];

    const room = rm.createRoom({
      roomId: 'room_comp_max',
      hostUser,
      mode: 'computer',
      customParticipants
    });

    const participants = Array.from(room.participants.values());
    assert.strictEqual(participants.length, 10, 'Should have exactly 10 participants (1 host + 9 bots)');

    const allTeamIds = participants.map(p => p.teamId);
    const uniqueTeamIds = new Set(allTeamIds);
    assert.strictEqual(uniqueTeamIds.size, 10, 'All 10 participants must have 10 unique authentic IPL franchises');
    assert.strictEqual(room.teamOwnership.get('csk'), 'host_user_2', 'Host must own CSK');

    // Confirm every single authentic IPL franchise is claimed
    IPL_FRANCHISES.forEach(franchise => {
      assert.ok(uniqueTeamIds.has(franchise.id), `Franchise ${franchise.name} (${franchise.id}) must be claimed`);
    });

    console.log('  ✓ 10 participants verified with 0 duplicates (10/10 IPL franchises assigned):');
    participants.forEach(p => console.log(`     - [${p.teamId.toUpperCase()}] ${p.name}: ${p.teamName}`));
    testsPassed++;
  }

  // TEST 3: Play with Friends — Real-time team selection and conflict rejection
  {
    console.log('\nTest 3: Play with Friends — Real-time selection & Conflict Rejection');
    const rm = new RoomManager(io);
    const hostUser = {
      id: 'friend_host',
      uniqueId: 'TB-FHOST',
      name: 'Host Friend',
      avatar: 'avatar_1',
      teamId: 'rcb',
      teamName: 'Royal Challengers Bengaluru',
      socketId: 'sock_fhost'
    };

    const room = rm.createRoom({
      roomId: 'room_friends_1',
      hostUser,
      mode: 'friends'
    });

    // Friend 1 joins
    const friend1 = {
      id: 'friend_user_1',
      uniqueId: 'TB-F1',
      name: 'Aditya',
      avatar: 'avatar_3',
      socketId: 'sock_f1'
    };
    const joinRes1 = rm.joinRoom(room.id, friend1);
    assert.ok(joinRes1.success, 'Friend 1 should join successfully');

    // Friend 1 attempts to select RCB (Host's team)
    const conflictRes = rm.selectTeam(room.id, friend1.id, 'rcb');
    assert.strictEqual(conflictRes.success, false, 'Selecting RCB must fail because Host owns RCB');
    assert.ok(conflictRes.message.includes('already been selected'), 'Error message must inform that team is taken');
    console.log('  ✓ Confirmed rejection message:', conflictRes.message);

    // Friend 1 selects CSK (available)
    const validRes = rm.selectTeam(room.id, friend1.id, 'csk');
    assert.ok(validRes.success, 'Friend 1 selecting available CSK must succeed');
    assert.strictEqual(room.teamOwnership.get('csk'), friend1.id, 'Friend 1 must now own CSK');

    // Friend 2 joins and tries to select CSK
    const friend2 = {
      id: 'friend_user_2',
      uniqueId: 'TB-F2',
      name: 'Pooja',
      avatar: 'avatar_4',
      socketId: 'sock_f2'
    };
    rm.joinRoom(room.id, friend2);
    const conflictRes2 = rm.selectTeam(room.id, friend2.id, 'csk');
    assert.strictEqual(conflictRes2.success, false, 'Selecting CSK must fail because Friend 1 owns CSK');
    assert.ok(conflictRes2.message.includes('Aditya'), 'Error message should mention Aditya owns CSK');
    console.log('  ✓ Confirmed conflict with another friend:', conflictRes2.message);

    testsPassed++;
  }

  // TEST 4: Simultaneous / Sequential selection race condition
  {
    console.log('\nTest 4: Simultaneous Selection Race Resolution');
    const rm = new RoomManager(io);
    const hostUser = { id: 'host_race', uniqueId: 'TB-HR', name: 'Host Race', socketId: 's_hr' };
    const room = rm.createRoom({ roomId: 'room_race', hostUser, mode: 'friends' });

    const userA = { id: 'user_a', uniqueId: 'TB-UA', name: 'User A', socketId: 's_ua' };
    const userB = { id: 'user_b', uniqueId: 'TB-UB', name: 'User B', socketId: 's_ub' };
    rm.joinRoom(room.id, userA);
    rm.joinRoom(room.id, userB);

    // Both attempt to claim unclaimed 'kkr'
    const resA = rm.selectTeam(room.id, userA.id, 'kkr');
    const resB = rm.selectTeam(room.id, userB.id, 'kkr');

    assert.strictEqual(resA.success, true, 'First request must claim KKR');
    assert.strictEqual(resB.success, false, 'Second request must be rejected');
    assert.strictEqual(room.teamOwnership.get('kkr'), userA.id, 'Owner must remain User A');

    console.log('  ✓ User A successfully claimed KKR, User B rejected');
    testsPassed++;
  }

  // TEST 5: Pre-auction Room Leave Releases Franchise
  {
    console.log('\nTest 5: Pre-auction Room Leave Releases Franchise');
    const rm = new RoomManager(io);
    const hostUser = { id: 'host_leave', uniqueId: 'TB-HL', name: 'Host Leave', socketId: 's_hl' };
    const room = rm.createRoom({ roomId: 'room_leave', hostUser, mode: 'friends' });

    const friend = { id: 'friend_leaver', uniqueId: 'TB-FL', name: 'Friend Leaver', socketId: 's_fl' };
    rm.joinRoom(room.id, friend);
    rm.selectTeam(room.id, friend.id, 'kkr');
    assert.strictEqual(room.teamOwnership.get('kkr'), friend.id, 'Friend owns KKR');

    // Friend leaves room
    rm.leaveRoom(room.id, friend.id);
    assert.strictEqual(room.teamOwnership.get('kkr'), undefined, 'KKR must be released after user leaves');

    // Another user can now claim KKR
    const newUser = { id: 'new_user', uniqueId: 'TB-NU', name: 'New User', socketId: 's_nu' };
    rm.joinRoom(room.id, newUser);
    const claimRes = rm.selectTeam(room.id, newUser.id, 'kkr');
    assert.strictEqual(claimRes.success, true, 'New user should now be able to claim released KKR');
    assert.strictEqual(room.teamOwnership.get('kkr'), newUser.id, 'New user is now owner of KKR');

    console.log('  ✓ KKR was cleanly released upon leaving and claimed by new user');
    testsPassed++;
  }

  // TEST 6: Multi-room isolation
  {
    console.log('\nTest 6: Multi-Room Isolation (Same franchise in different rooms is allowed)');
    const rm = new RoomManager(io);
    const host1 = { id: 'h1', uniqueId: 'TB-H1', name: 'Host 1', teamId: 'rcb', socketId: 's1' };
    const host2 = { id: 'h2', uniqueId: 'TB-H2', name: 'Host 2', teamId: 'rcb', socketId: 's2' };

    const room1 = rm.createRoom({ roomId: 'r1', hostUser: host1, mode: 'computer' });
    const room2 = rm.createRoom({ roomId: 'r2', hostUser: host2, mode: 'computer' });

    assert.strictEqual(room1.teamOwnership.get('rcb'), 'h1');
    assert.strictEqual(room2.teamOwnership.get('rcb'), 'h2');
    console.log('  ✓ Multi-room isolation verified: Host 1 owns RCB in Room 1, Host 2 owns RCB in Room 2');
    testsPassed++;
  }

  console.log(`\n==============================================`);
  console.log(`🎉 ALL ${testsPassed} TEST SUITES PASSED!`);
  console.log(`   Rule: 1 IPL Franchise = 1 Owner in 1 Room`);
  console.log(`   Integrity: Zero duplicate franchises verified.`);
  console.log(`==============================================\n`);
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
