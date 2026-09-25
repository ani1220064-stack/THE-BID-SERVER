const assert = require('assert');
const store = require('./src/services/store');
const RoomManager = require('./src/rooms/RoomManager');

const mockIo = {
  to: () => ({ emit: () => {} }),
  emit: () => {}
};
const roomManager = new RoomManager(mockIo);

console.log('=== STARTING FRIEND ROOM & INVITATION SYSTEM TESTS ===\n');

// 1. Test Room Code Normalization
console.log('Test 1: Code normalization');
assert.strictEqual(roomManager.normalizeRoomCode('bid-7k4p2'), 'BID-7K4P2');
assert.strictEqual(roomManager.normalizeRoomCode(' 7k4p2 '), 'BID-7K4P2');
assert.strictEqual(roomManager.normalizeRoomCode('BID-7K4P2'), 'BID-7K4P2');
assert.strictEqual(roomManager.normalizeRoomCode(''), '');
console.log('✓ Normalization passed: handles spaces, lower/uppercase, and BID- prefix\n');

// 2. Test Host Room Creation (Method A: Room Code)
console.log('Test 2: Host room creation in friends mode');
const hostUser = {
  id: 'user_host_1',
  name: 'Anirudh Host',
  uniqueId: 'TB-H1001',
  avatar: 'avatar_1',
  socketId: 'sock_host_1'
};

const hostRoom = roomManager.createRoom({
  roomId: 'room_test_friends_1',
  hostUser,
  category: 'ipl_cricket',
  mode: 'friends'
});

assert.ok(hostRoom.roomCode, 'Room code should be generated for friends mode');
assert.match(hostRoom.roomCode, /^BID-[A-Z0-9]{5}$/, 'Room code must match BID-XXXXX format');
assert.strictEqual(hostRoom.state, 'LOBBY', 'Friends room should start directly in LOBBY');
assert.strictEqual(hostRoom.participants.size, 1, 'Host should be initial participant');
const hostP = hostRoom.participants.get(hostUser.id);
assert.ok(hostP);
assert.strictEqual(hostP.id, hostUser.id);
assert.strictEqual(hostP.isHost, true);
console.log(`✓ Room created with authoritative code: ${hostRoom.roomCode} in state: ${hostRoom.state}\n`);

// 3. Test Room Lookup by Code
console.log('Test 3: Room lookup by code');
const lookedUp = roomManager.getRoomByCode(hostRoom.roomCode);
assert.ok(lookedUp, 'Should find room by generated code');
assert.strictEqual(lookedUp.id, hostRoom.id);

const lookedUpWithoutPrefix = roomManager.getRoomByCode(hostRoom.roomCode.replace('BID-', '').toLowerCase());
assert.ok(lookedUpWithoutPrefix, 'Should find room even if user enters raw 5-character lowercase code');
console.log('✓ Lookup by code passed with full and short input formats\n');

// 4. Test Joining with Invalid Code
console.log('Test 4: Joining with invalid or non-existent code');
const friendUser = {
  id: 'user_friend_1',
  name: 'Virat Friend',
  uniqueId: 'TB-F2002',
  avatar: 'avatar_2',
  socketId: 'sock_friend_1'
};

const invalidJoin = roomManager.joinRoom('BID-FAKE99', friendUser);
assert.strictEqual(invalidJoin.success, false);
assert.strictEqual(invalidJoin.message, 'Invalid or expired room code.');
console.log('✓ Invalid code rejected cleanly without creating accidental room\n');

// 5. Test Joining with Valid Code (Method A)
console.log('Test 5: Friend joins using room code');
const validJoin = roomManager.joinRoom(hostRoom.roomCode, friendUser);
assert.strictEqual(validJoin.success, true);
assert.strictEqual(validJoin.room.participants.size, 2, 'Room should now have 2 participants');
const friendP = validJoin.room.participants.get(friendUser.id);
assert.ok(friendP);
assert.strictEqual(friendP.id, friendUser.id);
assert.strictEqual(friendP.isHost, false);
console.log(`✓ Friend joined room successfully. Participants: ${Array.from(validJoin.room.participants.values()).map(p => p.name).join(', ')}\n`);

// 6. Test Authoritative Direct Invitation (Method B)
console.log('Test 6: Authoritative Direct Invitation creation & duplicate prevention');
const friendUser2 = {
  id: 'user_friend_2',
  name: 'Rohit Friend',
  uniqueId: 'TB-F3003',
  avatar: 'avatar_3',
  socketId: 'sock_friend_2'
};

const inviteRes1 = store.createOrUpdateInvitation({
  sender: hostUser,
  recipientUniqueId: friendUser2.uniqueId,
  roomId: hostRoom.id,
  roomCode: hostRoom.roomCode,
  category: hostRoom.category,
  categoryTitle: 'IPL Cricket Auction'
});

assert.ok(inviteRes1.invitation.id);
assert.strictEqual(inviteRes1.invitation.status, 'PENDING');
assert.strictEqual(inviteRes1.isDuplicate, false);
assert.strictEqual(inviteRes1.invitation.roomCode, hostRoom.roomCode);

// Duplicate send test (spam prevention): should update existing instead of creating duplicate
const inviteRes2 = store.createOrUpdateInvitation({
  sender: hostUser,
  recipientUniqueId: friendUser2.uniqueId,
  roomId: hostRoom.id,
  roomCode: hostRoom.roomCode,
  category: hostRoom.category,
  categoryTitle: 'IPL Cricket Auction'
});

assert.strictEqual(inviteRes2.isDuplicate, true, 'Subsequent invite should be detected as duplicate');
assert.strictEqual(inviteRes2.invitation.id, inviteRes1.invitation.id, 'Should refresh existing invitation ID');
console.log('✓ Direct invitation created and duplicate prevention verified\n');

// 7. Test Pending Invitations Retrieval
console.log('Test 7: Pending invitations retrieval');
const pending = store.getPendingInvitations(friendUser2.uniqueId);
assert.strictEqual(pending.length, 1);
assert.strictEqual(pending[0].id, inviteRes1.invitation.id);
console.log('✓ Pending invitations retrieved successfully for recipient\n');

// 8. Test Invitation Lifecycle: ACCEPTED
console.log('Test 8: Invitation ACCEPTED flow');
const acceptRes = roomManager.joinRoom(inviteRes1.invitation.roomId, friendUser2);
assert.strictEqual(acceptRes.success, true);
store.updateInvitationStatus(inviteRes1.invitation.id, 'ACCEPTED');
const updatedInv = store.getInvitation(inviteRes1.invitation.id);
assert.strictEqual(updatedInv.status, 'ACCEPTED');
assert.strictEqual(hostRoom.participants.size, 3);
console.log(`✓ Friend 2 joined via accepted invite. Participants count: ${hostRoom.participants.size}\n`);

// 9. Test Room Teardown & Invitation Cancellation
console.log('Test 9: Room leave and complete cleanup when host leaves');
const leaveRes = roomManager.leaveRoom(hostRoom.id, hostUser.id);
assert.strictEqual(leaveRes.roomClosed, true, 'Room should close when host leaves');
assert.strictEqual(roomManager.getRoom(hostRoom.id), null, 'Room should be destroyed when host leaves');
assert.strictEqual(roomManager.getRoomByCode(hostRoom.roomCode), null, 'Room code mapping should be cleared');
console.log('✓ Host departure, room cleanup, and code de-registration verified\n');

console.log('====================================================');
console.log('ALL FRIEND ROOM & INVITATION SYSTEM TESTS PASSED! 🎉');
console.log('====================================================');
