const RoomManager = require('./src/rooms/RoomManager');
const assert = require('assert');

console.log('🧪 RUNNING COMPREHENSIVE FINISH AUCTION FEATURE TEST SUITE...');

const mockIo = {
  to: () => ({
    emit: (event, data) => {}
  }),
  sockets: {
    sockets: new Map()
  }
};

function createMockUser(id, name) {
  return {
    id,
    uniqueId: `TB-${id.toUpperCase()}`,
    name,
    avatar: 'avatar_1',
    socketId: `sock_${id}`
  };
}

function setupRoomWithParticipants(count) {
  const rm = new RoomManager(mockIo);
  const host = createMockUser('user_1', 'Host Player');
  mockIo.sockets.sockets.set(host.socketId, {});

  const customParticipants = [
    { id: host.id, name: host.name, type: 'HOST', uniqueId: host.uniqueId }
  ];

  for (let i = 2; i <= count; i++) {
    const u = createMockUser(`user_${i}`, `Player ${i}`);
    mockIo.sockets.sockets.set(u.socketId, {});
    customParticipants.push({
      id: u.id,
      name: u.name,
      type: 'FRIEND',
      uniqueId: u.uniqueId,
      socketId: u.socketId
    });
  }

  const room = rm.createRoom({
    roomId: `room_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    hostUser: host,
    category: 'ipl_cricket',
    mode: 'friends',
    customParticipants,
    budget: 100
  });

  // Advance room to AUCTION_ACTIVE
  room.state = 'LOBBY';
  rm.startAuction(room.id, host.id);

  assert.strictEqual(room.state, 'AUCTION_ACTIVE', 'Room should be in AUCTION_ACTIVE');
  assert.strictEqual(room.participants.size, count, `Room should have ${count} participants`);

  return { rm, room };
}

// TEST 1: 2-Player Room — Unanimous Agreement Finishes Room
(() => {
  console.log('--- TEST 1: 2-Player Room Unanimous Agreement ---');
  const { rm, room } = setupRoomWithParticipants(2);

  // Player 1 requests finish
  const reqRes = rm.requestFinishAuction(room.id, 'user_1');
  assert.strictEqual(reqRes.success, true);
  assert.strictEqual(room.finishVoteState, 'FINISH_REQUESTED');
  assert.strictEqual(room.finishVote.totalRequired, 2);
  assert.strictEqual(room.finishVote.agreedCount, 1);
  assert.strictEqual(room.state, 'AUCTION_ACTIVE', 'Auction state must remain AUCTION_ACTIVE during vote');

  // Player 2 agrees -> 2/2 unanimous
  const voteRes = rm.voteFinishAuction(room.id, 'user_2', true);
  assert.strictEqual(voteRes.success, true);
  assert.strictEqual(voteRes.finished, true);
  assert.strictEqual(room.state, 'RESULTS', 'Room must transition to RESULTS upon 100% agreement');
  assert.strictEqual(room.finishVoteState, 'FINISH_APPROVED');
  console.log('✅ TEST 1 PASSED: 2-player unanimous agreement finished auction cleanly.');
})();

// TEST 2: 5-Player Room — Single IGNORE Immediately Cancels Request
(() => {
  console.log('--- TEST 2: 5-Player Room IGNORE Behavior ---');
  const { rm, room } = setupRoomWithParticipants(5);

  // Player 1 requests finish
  rm.requestFinishAuction(room.id, 'user_1');
  assert.strictEqual(room.finishVoteState, 'FINISH_REQUESTED');
  assert.strictEqual(room.finishVote.totalRequired, 5);
  assert.strictEqual(room.finishVote.agreedCount, 1);

  // Player 2 and 3 agree -> 3/5
  rm.voteFinishAuction(room.id, 'user_2', true);
  rm.voteFinishAuction(room.id, 'user_3', true);
  assert.strictEqual(room.finishVote.agreedCount, 3);
  assert.strictEqual(room.state, 'AUCTION_ACTIVE');

  // Player 4 taps IGNORE
  const ignoreRes = rm.voteFinishAuction(room.id, 'user_4', false);
  assert.strictEqual(ignoreRes.success, true);
  assert.strictEqual(ignoreRes.cancelled, true);
  assert.strictEqual(room.finishVoteState, 'NORMAL', 'State must return to NORMAL after IGNORE');
  assert.strictEqual(room.finishVote, null, 'finishVote object must be cleared');
  assert.strictEqual(room.state, 'AUCTION_ACTIVE', 'Auction state remains AUCTION_ACTIVE');
  console.log('✅ TEST 2 PASSED: IGNORE immediately cancelled request and preserved auction state.');
})();

// TEST 3: Majority Voting is Never Sufficient (4/5 agreed does NOT finish)
(() => {
  console.log('--- TEST 3: Majority Rule Verification (4/5 never finishes) ---');
  const { rm, room } = setupRoomWithParticipants(5);

  rm.requestFinishAuction(room.id, 'user_1');
  rm.voteFinishAuction(room.id, 'user_2', true);
  rm.voteFinishAuction(room.id, 'user_3', true);
  const vote4 = rm.voteFinishAuction(room.id, 'user_4', true);

  assert.strictEqual(vote4.finished, false, 'Majority (4/5) must NOT finish auction');
  assert.strictEqual(room.finishVote.agreedCount, 4);
  assert.strictEqual(room.finishVote.totalRequired, 5);
  assert.strictEqual(room.state, 'AUCTION_ACTIVE', 'Room must remain in AUCTION_ACTIVE');

  // Only when 5th agrees does it finish
  const vote5 = rm.voteFinishAuction(room.id, 'user_5', true);
  assert.strictEqual(vote5.finished, true, '5/5 unanimous must finish auction');
  assert.strictEqual(room.state, 'RESULTS');
  console.log('✅ TEST 3 PASSED: Majority agreement correctly rejected; only 100% finished.');
})();

// TEST 4: Multiple Concurrent Finish Requests & Duplicate Vote Protection
(() => {
  console.log('--- TEST 4: Concurrent Finish Requests & Duplicate Vote Protection ---');
  const { rm, room } = setupRoomWithParticipants(4);

  // Player 1 requests finish
  const res1 = rm.requestFinishAuction(room.id, 'user_1');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(room.finishVote.agreedCount, 1);

  // Player 2 presses FINISH AUCTION at nearly the same time -> atomically counts as AGREE
  const res2 = rm.requestFinishAuction(room.id, 'user_2');
  assert.strictEqual(res2.success, true);
  assert.strictEqual(room.finishVote.agreedCount, 2, 'Concurrent press from Player 2 counts as AGREE vote');

  // Player 2 taps AGREE again (duplicate tap)
  const dupVote = rm.voteFinishAuction(room.id, 'user_2', true);
  assert.strictEqual(dupVote.alreadyVoted, true);
  assert.strictEqual(room.finishVote.agreedCount, 2, 'Agreed count must NOT increment on duplicate vote');

  // Player 1 taps request again -> already requested / agreed
  const dupReq1 = rm.requestFinishAuction(room.id, 'user_1');
  assert.strictEqual(dupReq1.success, true);
  assert.strictEqual(room.finishVote.agreedCount, 2);

  console.log('✅ TEST 4 PASSED: Concurrent finish requests & duplicate vote protection verified.');
})();

// TEST 5: Active Lot Resolution — With Active Bids (SOLD to Leader)
(() => {
  console.log('--- TEST 5: Lot Resolution with Active Bid (SOLD) ---');
  const { rm, room } = setupRoomWithParticipants(3);

  // Place a valid bid by Player 2
  const bidRes = rm.placeBid(room.id, 'user_2', 15.0);
  assert.strictEqual(bidRes.success, true);
  assert.strictEqual(room.currentBid, 15.0);
  assert.strictEqual(room.currentLeader.id, 'user_2');

  // Finish auction voted unanimously
  rm.requestFinishAuction(room.id, 'user_1');
  rm.voteFinishAuction(room.id, 'user_2', true);
  rm.voteFinishAuction(room.id, 'user_3', true);

  assert.strictEqual(room.state, 'RESULTS');
  const p2 = room.participants.get('user_2');
  assert.strictEqual(p2.squad.length, 1, 'Player 2 should have purchased the active lot');
  assert.strictEqual(p2.purse, 85.0, 'Player 2 purse should be reduced by 15.0');
  console.log('✅ TEST 5 PASSED: Active lot with bid correctly SOLD to leader before finishing.');
})();

// TEST 6: Active Lot Resolution — Zero Bids (UNSOLD)
(() => {
  console.log('--- TEST 6: Lot Resolution with Zero Bids (UNSOLD) ---');
  const { rm, room } = setupRoomWithParticipants(3);

  assert.strictEqual(room.currentBid, 0);
  assert.strictEqual(room.currentLeader, null);

  // Finish auction voted unanimously with 0 bids
  rm.requestFinishAuction(room.id, 'user_1');
  rm.voteFinishAuction(room.id, 'user_2', true);
  rm.voteFinishAuction(room.id, 'user_3', true);

  assert.strictEqual(room.state, 'RESULTS');
  const lastLot = room.lotSequence[room.lotSequence.length - 1];
  assert.strictEqual(lastLot.status, 'UNSOLD', 'Lot with zero bids must be recorded as UNSOLD');
  console.log('✅ TEST 6 PASSED: Active lot with zero bids correctly marked UNSOLD.');
})();

// TEST 7: Participant Leaves During Voting (Unanimity Re-Evaluated for Remaining)
(() => {
  console.log('--- TEST 7: Participant Leaves Mid-Vote ---');
  const { rm, room } = setupRoomWithParticipants(4);

  // Player 1 requests finish (1/4)
  rm.requestFinishAuction(room.id, 'user_1');
  // Player 2 agrees (2/4)
  rm.voteFinishAuction(room.id, 'user_2', true);
  // Player 3 agrees (3/4)
  rm.voteFinishAuction(room.id, 'user_3', true);
  assert.strictEqual(room.finishVote.agreedCount, 3);
  assert.strictEqual(room.finishVote.totalRequired, 4);

  // Player 4 (who hasn't voted) leaves the room
  rm.leaveRoom(room.id, 'user_4', 'TB-USER_4');

  // Now remaining active participants are 3, and all 3 agreed (3/3)
  assert.strictEqual(room.state, 'RESULTS', 'Departure of non-voted player should finish auction if remaining are 100% agreed');
  console.log('✅ TEST 7 PASSED: Mid-vote departure re-evaluated unanimity correctly.');
})();

// TEST 8: 10-Player Room Unanimous Agreement (10/10)
(() => {
  console.log('--- TEST 8: 10-Player Room Unanimous Agreement ---');
  const { rm, room } = setupRoomWithParticipants(10);

  rm.requestFinishAuction(room.id, 'user_1');
  assert.strictEqual(room.finishVote.totalRequired, 10);
  assert.strictEqual(room.finishVote.agreedCount, 1);

  for (let i = 2; i <= 9; i++) {
    const res = rm.voteFinishAuction(room.id, `user_${i}`, true);
    assert.strictEqual(res.finished, false, `Must not finish at ${i}/10`);
  }

  const finalVote = rm.voteFinishAuction(room.id, 'user_10', true);
  assert.strictEqual(finalVote.finished, true, 'Must finish at 10/10');
  assert.strictEqual(room.state, 'RESULTS');
  console.log('✅ TEST 8 PASSED: 10-player room completed with 10/10 unanimous agreement.');
})();

// TEST 9: Timer Invariant Verification — Finish Request Does NOT Pause or Alter Timer
(() => {
  console.log('--- TEST 9: Timer Invariant Verification ---');
  const { rm, room } = setupRoomWithParticipants(3);

  const initialEnd = room.timerEndTimestamp;
  const initialDuration = room.timerDurationMs;

  // Request finish auction
  rm.requestFinishAuction(room.id, 'user_1');

  // Assert timer parameters are 100% identical and unchanged
  assert.strictEqual(room.timerEndTimestamp, initialEnd, 'timerEndTimestamp must not be altered by finish request');
  assert.strictEqual(room.timerDurationMs, initialDuration, 'timerDurationMs must not be altered by finish request');

  // Participant 2 ignores
  rm.voteFinishAuction(room.id, 'user_2', false);

  assert.strictEqual(room.finishVoteState, 'NORMAL');
  assert.strictEqual(room.timerEndTimestamp, initialEnd, 'timerEndTimestamp must remain untouched after IGNORE');
  console.log('✅ TEST 9 PASSED: Timer invariant verified. Timer was not paused, modified, or reset.');
})();

// TEST 10: Socket Disconnect During Voting
(() => {
  console.log('--- TEST 10: Socket Disconnect Handling ---');
  const { rm, room } = setupRoomWithParticipants(3);

  rm.requestFinishAuction(room.id, 'user_1');
  rm.voteFinishAuction(room.id, 'user_2', true);
  assert.strictEqual(room.finishVote.agreedCount, 2);
  assert.strictEqual(room.finishVote.totalRequired, 3);

  // Player 3 socket disconnects
  rm.handleSocketDisconnect('sock_user_3');

  // Once player 3 disconnects, remaining active eligible is 2/2 -> finishes!
  assert.strictEqual(room.state, 'RESULTS');
  console.log('✅ TEST 10 PASSED: Socket disconnect correctly re-evaluated active eligible participants.');
})();

console.log('\n🎉 ALL 10 COMPREHENSIVE FINISH AUCTION TESTS COMPLETED SUCCESSFULLY WITH 100% PASS RATE!');
