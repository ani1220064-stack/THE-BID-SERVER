const assert = require('assert');
const RoomManager = require('./src/rooms/RoomManager');
const { CategoryRegistry } = require('./src/categories/CategoryRegistry');

console.log('====================================================');
console.log('🧪 THE BID - BIDDING STATE SYNCHRONIZATION TEST SUITE');
console.log('====================================================\n');

// Mock socket.io instance to inspect emitted events
class MockIO {
  constructor() {
    this.emittedEvents = [];
  }

  to(target) {
    return {
      emit: (event, payload) => {
        this.emittedEvents.push({ target, event, payload, timestamp: Date.now() });
      }
    };
  }

  emit(event, payload) {
    this.emittedEvents.push({ target: 'broadcast', event, payload, timestamp: Date.now() });
  }

  clear() {
    this.emittedEvents = [];
  }
}

const mockIO = new MockIO();
const rm = new RoomManager(mockIO);

const hostUser = {
  id: 'user_host_1',
  name: 'Anirudh',
  displayName: 'Anirudh',
  uniqueId: 'TB-H001',
  avatar: 'avatar_1',
  teamId: 'csk',
  teamName: 'Chennai Super Kings'
};

const friendUser = {
  id: 'user_friend_2',
  name: 'Vikram',
  displayName: 'Vikram',
  uniqueId: 'TB-F002',
  avatar: 'avatar_2',
  teamId: 'rcb',
  teamName: 'Royal Challengers Bengaluru'
};

// Create a computer room with host + 3 bots
const room = rm.createRoom({
  roomId: 'test_sync_room_1',
  hostUser,
  category: 'ipl_cricket',
  mode: 'friends',
  participantCount: 2,
  poolSize: 15,
  aiDifficulty: 'HIGH'
});

// Add friend
rm.joinRoom(room.id, friendUser);

// Start auction
rm.startAuction(room.id, hostUser.id);

assert.strictEqual(room.state, 'AUCTION_ACTIVE', 'Room must be AUCTION_ACTIVE');
assert.strictEqual(room.currentLotNumber, 1, 'Lot number should be 1');
assert.strictEqual(room.bidVersion, 0, 'Initial bidVersion must be 0');

console.log(`✅ Room started: Lot ${room.currentLotNumber} (${room.currentPlayer.name}), Base Price: ₹${room.currentPlayer.basePrice} Cr\n`);

// ----------------------------------------------------
// TEST 1: 50+ Consecutive Rapid Alternating Bids
// ----------------------------------------------------
console.log('TEST 1: Running 50+ Consecutive Rapid Bids (Monotonic Version Advancement)...');
mockIO.clear();

let currentExpectedBid = room.currentPlayer.basePrice;
let lastVersion = 0;

for (let i = 1; i <= 52; i++) {
  const bidder = i % 2 === 1 ? hostUser : friendUser;
  const increment = 0.2;
  currentExpectedBid = Math.round((currentExpectedBid + increment) * 10) / 10;
  const requestId = `test_bid_req_${i}_${Date.now()}`;

  const res = rm.placeBid(room.id, bidder.id, currentExpectedBid, {
    requestId,
    clientTimestamp: Date.now()
  });

  assert.strictEqual(res.success, true, `Bid #${i} failed: ${res.message}`);
  assert.strictEqual(res.bidVersion, i, `Bid #${i} must have bidVersion ${i}, got ${res.bidVersion}`);
  assert.strictEqual(res.amount, currentExpectedBid, `Bid #${i} amount mismatch: expected ${currentExpectedBid}, got ${res.amount}`);
  assert.strictEqual(room.currentBid, currentExpectedBid, `Room currentBid must match ${currentExpectedBid}`);
  assert.strictEqual(room.currentLeader.id, bidder.id, `Leader must be ${bidder.id}`);
  assert.strictEqual(room.timerSeconds, 10, 'Timer must reset to 10s on valid bid');
  assert(room.timerEndTimestamp > Date.now() + 9000, 'Timer end timestamp must be ~10s in the future');

  // Verify monotonic increase
  assert(res.bidVersion > lastVersion, `bidVersion must strictly increase: ${res.bidVersion} > ${lastVersion}`);
  lastVersion = res.bidVersion;
}

console.log(`✅ 52 consecutive bids processed! Final bid: ₹${room.currentBid} Cr, Final bidVersion: ${room.bidVersion}\n`);

// ----------------------------------------------------
// TEST 2: Duplicate Requests & Accidental Rapid Taps
// ----------------------------------------------------
console.log('TEST 2: Testing Duplicate Request & Already Leader Rejections...');

// Host attempts to bid again at the same amount while already leading
const duplicateBidAmount = room.currentBid;
const leadingRes = rm.placeBid(room.id, friendUser.id, duplicateBidAmount, {
  requestId: 'req_already_leading'
});
// friendUser was the 52nd bidder, so friendUser is leading at this amount
assert.strictEqual(leadingRes.success, false, 'Self-outbidding at same amount should be rejected');
assert.strictEqual(leadingRes.code, 'ALREADY_LEADER', 'Rejection code must be ALREADY_LEADER');

// Strict Rule: A player cannot submit any new bid while already holding the top position!
const higherSelfBid = Math.round((room.currentBid + 0.2) * 10) / 10;
const selfHigherRes = rm.placeBid(room.id, friendUser.id, higherSelfBid, {
  requestId: 'req_self_increment_1'
});
assert.strictEqual(selfHigherRes.success, false, 'Self-bidding while leading must be strictly rejected');
assert.strictEqual(selfHigherRes.code, 'ALREADY_LEADER', 'Rejection code must be ALREADY_LEADER');

// Now host bids validly
const validHostBid = Math.round((room.currentBid + 0.5) * 10) / 10;
const hostRes = rm.placeBid(room.id, hostUser.id, validHostBid, {
  requestId: 'req_host_unique_1'
});
assert.strictEqual(hostRes.success, true, 'Host valid bid should succeed');

// Now host immediately sends the EXACT same requestId (duplicate network packet)
const dupPacketRes = rm.placeBid(room.id, hostUser.id, validHostBid, {
  requestId: 'req_host_unique_1'
});
assert.strictEqual(dupPacketRes.success, false, 'Duplicate requestId must be rejected');
assert.strictEqual(dupPacketRes.code, 'DUPLICATE_REQUEST', 'Rejection code must be DUPLICATE_REQUEST');

console.log('✅ Duplicate request and self-outbid rejections verified!\n');

// ----------------------------------------------------
// TEST 3: Concurrent Race Condition (Simultaneous Equal Bids)
// ----------------------------------------------------
console.log('TEST 3: Testing Concurrent Race Condition (Simultaneous Same-Amount Bids)...');

const targetRaceBid = Math.round((room.currentBid + 1.0) * 10) / 10;

// Participant 2 bids targetRaceBid
const winnerRes = rm.placeBid(room.id, friendUser.id, targetRaceBid, {
  requestId: 'race_req_friend'
});
assert.strictEqual(winnerRes.success, true, 'First arriving bid must win');
const winningVersion = winnerRes.bidVersion;

// Participant 1's packet for the same targetRaceBid arrives immediately after
const loserRes = rm.placeBid(room.id, hostUser.id, targetRaceBid, {
  requestId: 'race_req_host'
});
assert.strictEqual(loserRes.success, false, 'Second arriving bid for same amount must be rejected');
assert.strictEqual(loserRes.code, 'OUTBID', 'Rejection code must be OUTBID');
assert(loserRes.message.includes('outbid'), 'Rejection message must mention outbid');
assert.strictEqual(loserRes.bidVersion, winningVersion, 'Rejection should return latest bidVersion');

console.log(`✅ Race condition handled: Winner accepted at v${winningVersion}, Loser rejected with OUTBID.\n`);

// ----------------------------------------------------
// TEST 4: Out-of-Order / Stale Version Discard Simulation
// ----------------------------------------------------
console.log('TEST 4: Simulating Out-of-Order Socket Events Guard...');

let clientStateVersion = 0;
let clientCurrentBid = 0;

function simulateClientEventProcessing(event) {
  if (event.bidVersion !== undefined) {
    if (event.bidVersion < clientStateVersion) {
      // Discard stale!
      return false;
    }
    clientStateVersion = event.bidVersion;
    clientCurrentBid = event.amount;
    return true;
  }
  return false;
}

// Event 4 arrives
simulateClientEventProcessing({ bidVersion: 4, amount: 60.0 });
assert.strictEqual(clientStateVersion, 4);
assert.strictEqual(clientCurrentBid, 60.0);

// Event 3 arrives LATE after Event 4
const processedLate = simulateClientEventProcessing({ bidVersion: 3, amount: 50.0 });
assert.strictEqual(processedLate, false, 'Late older event must be discarded');
assert.strictEqual(clientStateVersion, 4, 'Version must remain 4');
assert.strictEqual(clientCurrentBid, 60.0, 'Bid amount must NOT regress to 50.0');

// Event 5 arrives
simulateClientEventProcessing({ bidVersion: 5, amount: 70.0 });
assert.strictEqual(clientStateVersion, 5);
assert.strictEqual(clientCurrentBid, 70.0);

console.log('✅ Client out-of-order guard guarantees monotonic state progression!\n');

// ----------------------------------------------------
// TEST 5: Strict Budget & Purse Integrity on SOLD
// ----------------------------------------------------
console.log('TEST 5: Testing Authoritative Purse Calculation (No Double Counting)...');

const initialHostPurse = hostUser.startingBudget || 100.0;
const initialFriendPurse = friendUser.startingBudget || 100.0;

// Resolve Lot 1: Friend was the highest bidder at targetRaceBid
const winningLot1Price = room.currentBid;
const winnerId = room.currentLeader.id;
const winnerParticipant = room.participants.get(winnerId);

rm.resolveCurrentPlayer(room);

assert.strictEqual(room.state, 'SOLD', 'Lot 1 must resolve to SOLD');
assert.strictEqual(winnerParticipant.squad.length, 1, 'Winner squad must contain 1 player');
assert.strictEqual(winnerParticipant.squad[0].soldPrice, winningLot1Price, 'Sold price must match winning bid');

// Strict calculation check: startingBudget - sum(squad.soldPrice)
const expectedWinnerPurse = Math.round((winnerParticipant.startingBudget - winningLot1Price) * 10) / 10;
assert.strictEqual(winnerParticipant.purse, expectedWinnerPurse, `Purse mismatch! Expected ${expectedWinnerPurse}, got ${winnerParticipant.purse}`);

console.log(`✅ Lot 1 SOLD: Winning Bid ₹${winningLot1Price} Cr, Remaining Purse: ₹${winnerParticipant.purse} Cr (Formula: ${winnerParticipant.startingBudget} - ${winningLot1Price} = ${expectedWinnerPurse})\n`);

// ----------------------------------------------------
// TEST 6: Next Lot Transition & Monotonic Version Reset
// ----------------------------------------------------
console.log('TEST 6: Testing Lot Transition & bidVersion Reset per Lot...');

room.currentPlayerIndex += 1;
rm.startPlayerAuction(room);

assert.strictEqual(room.state, 'AUCTION_ACTIVE');
assert.strictEqual(room.currentLotNumber, 2, 'Lot number must be 2');
assert.strictEqual(room.bidVersion, 0, 'bidVersion must reset to 0 for new lot');
assert.strictEqual(room.currentBid, 0, 'currentBid must reset to 0');
assert.strictEqual(room.currentLeader, null, 'currentLeader must reset to null');

// Place bid on Lot 2
const lot2Bid = room.currentPlayer.basePrice + 0.2;
const lot2Res = rm.placeBid(room.id, hostUser.id, lot2Bid, { requestId: 'lot2_req_1' });
assert.strictEqual(lot2Res.success, true);
assert.strictEqual(lot2Res.bidVersion, 1, 'First bid on Lot 2 must have bidVersion 1');
assert.strictEqual(room.currentBid, lot2Bid);

// Resolve Lot 2 as SOLD to Host
rm.resolveCurrentPlayer(room);
const hostParticipant = room.participants.get(hostUser.id);
const expectedHostPurse = Math.round((hostParticipant.startingBudget - lot2Bid) * 10) / 10;
assert.strictEqual(hostParticipant.purse, expectedHostPurse, 'Host purse must be strictly startingBudget - lot2Bid');

console.log(`✅ Lot 2 SOLD: Bid ₹${lot2Bid} Cr, Host Purse: ₹${hostParticipant.purse} Cr\n`);

// ----------------------------------------------------
// TEST 7: Budget Exceeded Rejection
// ----------------------------------------------------
console.log('TEST 7: Testing Budget Exceeded Rejection...');
room.currentPlayerIndex += 1;
rm.startPlayerAuction(room);

// Friend attempts to bid more than remaining purse
const impossibleBid = winnerParticipant.purse + 10.0;
const overBudgetRes = rm.placeBid(room.id, winnerId, impossibleBid, { requestId: 'impossible_bid' });
assert.strictEqual(overBudgetRes.success, false, 'Over-budget bid must be rejected');
assert.strictEqual(overBudgetRes.code, 'INSUFFICIENT_PURSE', 'Code must be INSUFFICIENT_PURSE');

console.log(`✅ Over-budget bid correctly rejected with INSUFFICIENT_PURSE.\n`);

console.log('====================================================');
console.log('🎉 ALL 7 BID SYNCHRONIZATION TESTS PASSED PERFECTLY!');
console.log('====================================================');
