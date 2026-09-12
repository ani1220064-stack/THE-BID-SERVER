const assert = require('assert');
const { iplPlayers } = require('./src/data/iplPlayers');
const { CategoryRegistry } = require('./src/categories/CategoryRegistry');
const RoomManager = require('./src/rooms/RoomManager');

console.log('====================================================');
console.log('🧪 THE BID - DUPLICATE AUCTION PLAYERS VERIFICATION TEST');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST 1: Master Roster Integrity (55 unique players)
// ----------------------------------------------------
console.log('TEST 1: Verifying Master 55-Player IPL Roster...');
assert.strictEqual(iplPlayers.length, 55, `Master roster should contain exactly 55 players, got ${iplPlayers.length}`);

const idMap = new Map();
const nameMap = new Map();
iplPlayers.forEach((p, idx) => {
  assert(p.id, `Player at index ${idx} missing ID`);
  assert(p.name, `Player at index ${idx} missing name`);
  
  if (idMap.has(p.id)) {
    throw new Error(`Duplicate player ID found in master roster: ${p.id} (${p.name}) matches index ${idMap.get(p.id)}`);
  }
  idMap.set(p.id, idx);

  const cleanName = p.name.trim().toLowerCase();
  if (nameMap.has(cleanName)) {
    throw new Error(`Duplicate player name found in master roster: ${p.name} matches index ${nameMap.get(cleanName)}`);
  }
  nameMap.set(cleanName, idx);
});
console.log(`✅ Master roster verified: 55 total players, 55 unique IDs, 55 unique names.\n`);

// ----------------------------------------------------
// TEST 2: CategoryRegistry.generatePool Uniqueness across all participant counts
// ----------------------------------------------------
console.log('TEST 2: Verifying Dynamic Pool Generation Uniqueness (1-6 participants)...');
const cat = CategoryRegistry.get('ipl_cricket');

const testParticipantTiers = [
  { count: 1, expectedSize: 15 },
  { count: 2, expectedSize: 15 },
  { count: 3, expectedSize: 25 },
  { count: 4, expectedSize: 30 },
  { count: 5, expectedSize: 35 },
  { count: 6, expectedSize: 40 }
];

testParticipantTiers.forEach(tier => {
  // Test 10 iterations per tier to guarantee random single-shuffle stability
  for (let iter = 1; iter <= 10; iter++) {
    const pool = cat.generatePool(tier.count);
    assert.strictEqual(pool.length, tier.expectedSize, `Tier ${tier.count} expected ${tier.expectedSize} players, got ${pool.length}`);
    
    const seenIds = new Set();
    const seenNames = new Set();
    pool.forEach(p => {
      assert(!seenIds.has(p.id), `Duplicate ID ${p.id} in generated pool for ${tier.count} participants!`);
      assert(!seenNames.has(p.name.trim().toLowerCase()), `Duplicate name ${p.name} in generated pool!`);
      seenIds.add(p.id);
      seenNames.add(p.name.trim().toLowerCase());
    });
  }
  console.log(`  ✅ Tier ${tier.count} participants: Exactly ${tier.expectedSize} unique cricketers selected with 0 duplicates (10/10 iterations passed).`);
});
console.log('');

// ----------------------------------------------------
// TEST 3: Full Auction Match Lifecycle Simulation (SOLD & UNSOLD)
// ----------------------------------------------------
console.log('TEST 3: Simulating Full Auction Match Lifecycle (40-Player / 6-Team Auction)...');

// Mock socket.io
const emittedEvents = [];
const mockIo = {
  to: (room) => ({
    emit: (event, payload) => {
      emittedEvents.push({ room, event, payload });
    }
  })
};

const rm = new RoomManager(mockIo);
const hostUser = {
  id: 'user_host_1',
  uniqueId: 'USER-HOST-1',
  name: 'Anirudh',
  avatar: 'avatar_1',
  teamName: 'Bangalore Blasters',
  socketId: 'sock_host_1'
};

const customParticipants = [
  { id: hostUser.id, type: 'HOST', name: hostUser.name },
  { id: 'bot_1', type: 'COMPUTER', name: 'Bot One', teamName: 'Delhi Dynamos', avatar: 'avatar_2' },
  { id: 'bot_2', type: 'COMPUTER', name: 'Bot Two', teamName: 'Mumbai Mavericks', avatar: 'avatar_3' },
  { id: 'bot_3', type: 'COMPUTER', name: 'Bot Three', teamName: 'Chennai Cobras', avatar: 'avatar_4' },
  { id: 'bot_4', type: 'COMPUTER', name: 'Bot Four', teamName: 'Kolkata Knights', avatar: 'avatar_5' },
  { id: 'bot_5', type: 'COMPUTER', name: 'Bot Five', teamName: 'Punjab Prowlers', avatar: 'avatar_6' }
];

const room = rm.createRoom({
  roomId: 'test_match_40',
  hostUser,
  category: 'ipl_cricket',
  customParticipants,
  poolSize: 40
});

assert.strictEqual(room.playerPool.length, 40, `Room pool should have 40 players, got ${room.playerPool.length}`);
assert.strictEqual(room.availablePlayerPool.length, 40, `Initial availablePlayerPool should match 40`);

// Transition through Budget Agreement to Lobby
rm.voteBudget(room.id, hostUser.id, true);
assert.strictEqual(room.state, 'LOBBY');

// Start Auction
rm.startAuction(room.id, hostUser.id);
assert.strictEqual(room.state, 'AUCTION_ACTIVE');
assert.strictEqual(room.auctionedPlayerIds.size, 1, 'First player should be immediately marked as auctioned before lot begins');
assert.strictEqual(room.availablePlayerPool.length, 39, 'Available pool should decrease by 1 immediately upon lot start');

// Step through all 40 lots: simulate alternating SOLD and UNSOLD
const lotRecords = [];
for (let lot = 1; lot <= 40; lot++) {
  const currentLotPlayer = room.currentPlayer;
  assert(currentLotPlayer, `Lot ${lot} should have an active current player`);
  assert(room.auctionedPlayerIds.has(currentLotPlayer.id), `Player ${currentLotPlayer.id} must be in auctionedPlayerIds`);

  lotRecords.push({
    lotNumber: lot,
    id: currentLotPlayer.id,
    name: currentLotPlayer.name
  });

  // Alternate: Even lots are SOLD, Odd lots are UNSOLD
  if (lot % 2 === 0) {
    // Place bid
    const bidResult = rm.placeBid(room.id, hostUser.id, currentLotPlayer.basePrice + 1.0);
    assert(bidResult.success, `Bid failed on lot ${lot}: ${bidResult.message}`);
  }

  // Resolve current player immediately
  rm.resolveCurrentPlayer(room);

  // Advance currentPlayerIndex and start next lot manually (skipping the 3.5s setTimeout)
  if (lot < 40) {
    room.currentPlayerIndex += 1;
    rm.startPlayerAuction(room);
  }
}

// Complete the auction
room.currentPlayerIndex += 1;
rm.startPlayerAuction(room);

assert.strictEqual(room.state, 'RESULTS', 'Room should be in RESULTS state');

// ----------------------------------------------------
// TEST 4: Verify Zero Duplicates in Auction Sequence
// ----------------------------------------------------
console.log('\nTEST 4: Verifying Match Lot Sequence for Duplicates...');
assert.strictEqual(lotRecords.length, 40, `Should have conducted 40 lots, got ${lotRecords.length}`);

const auctionedIds = new Set();
const auctionedNames = new Set();

lotRecords.forEach(record => {
  if (auctionedIds.has(record.id)) {
    throw new Error(`CRITICAL TEST FAILURE: Duplicate player ID ${record.id} (${record.name}) appeared in Lot ${record.lotNumber}!`);
  }
  if (auctionedNames.has(record.name.trim().toLowerCase())) {
    throw new Error(`CRITICAL TEST FAILURE: Duplicate player name ${record.name} appeared in Lot ${record.lotNumber}!`);
  }
  auctionedIds.add(record.id);
  auctionedNames.add(record.name.trim().toLowerCase());
});

console.log(`✅ 40 lots conducted.`);
console.log(`✅ 40 unique player IDs: ${auctionedIds.size}.`);
console.log(`✅ 0 duplicates detected across both SOLD and UNSOLD lots.`);

// ----------------------------------------------------
// TEST 5: Server-Side Duplicate Rejection Safety Check
// ----------------------------------------------------
console.log('\nTEST 5: Testing Server-Side Duplicate Rejection Safety Check...');
const safetyRoom = rm.createRoom({
  roomId: 'safety_test_room',
  hostUser,
  category: 'ipl_cricket',
  poolSize: 15
});
safetyRoom.state = 'LOBBY';
rm.startAuction(safetyRoom.id, hostUser.id);

// Artificially inject an already auctioned ID into available pool to trigger safety filter
const alreadyAuctionedPlayer = safetyRoom.currentPlayer;
safetyRoom.availablePlayerPool.unshift(alreadyAuctionedPlayer);

// Now trigger resolve and next lot
safetyRoom.currentPlayerIndex += 1;
rm.startPlayerAuction(safetyRoom);

// Candidate in next lot must NOT be the duplicated player
assert.notStrictEqual(safetyRoom.currentPlayer.id, alreadyAuctionedPlayer.id, 'Safety check must reject already auctioned player!');
console.log(`✅ Server-side safety check successfully rejected duplicate candidate!`);

console.log('\n====================================================');
console.log('🎉 ALL TESTS PASSED! ZERO DUPLICATE PLAYERS GUARANTEED.');
console.log('====================================================\n');
