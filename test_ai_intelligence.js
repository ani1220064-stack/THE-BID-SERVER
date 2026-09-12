const assert = require('assert');
const { AuctionBot } = require('./src/ai/AuctionBot');
const RoomManager = require('./src/rooms/RoomManager');
const store = require('./src/services/store');

console.log('--- STARTING AI INTELLIGENCE & FRIEND VERIFICATION TESTS ---');

// ==========================================
// TEST 1: Strict Friend System (No Fake Friends)
// ==========================================
console.log('\n[TEST 1] Strict Friend System & Invitations:');
const testUser = store.getOrCreateUser({ id: 'real_user_001', name: 'Real Human' });
const initialFriends = store.getFriendsList(testUser.uniqueId);
assert.strictEqual(initialFriends.length, 0, 'New user must have exactly 0 friends (no mock or fake friends)');
console.log('  ✔ Verified zero friends returns empty array [] (clean empty state)');

// Test authentic invitation generation
const testFriend = store.getOrCreateUser({ id: 'real_friend_002', name: 'Real Friend 2' });
const { invitation: inv } = store.createOrUpdateInvitation({
  sender: testUser,
  recipientUniqueId: testFriend.uniqueId,
  roomId: 'BID-TEST-ROOM',
  roomCode: 'BID-TEST',
  category: 'ipl_cricket',
  categoryTitle: 'IPL Auction'
});
assert(inv && inv.id, 'Authentic invitation created');
const pendingInvs = store.getPendingInvitations(testFriend.uniqueId);
assert.strictEqual(pendingInvs.length, 1, 'Invitee has exactly 1 authentic invitation');
console.log('  ✔ Verified authentic invitation creation and storage');

// ==========================================
// TEST 2: Human-First Franchise Priority & AI Yield
// ==========================================
console.log('\n[TEST 2] Human-First Franchise Selection & AI Yield:');
const mockIo = { to: () => ({ emit: () => {} }) };
const roomManager = new RoomManager(mockIo);

const hostUser = { id: 'host_001', name: 'Host Player', teamId: 'csk' };
const room = roomManager.createRoom({
  roomId: 'test-room-priority',
  hostUser,
  category: 'ipl_cricket',
  mode: 'computer',
  participantCount: 4,
  aiDifficulty: 'HIGH'
});

const hostPart = room.participants.get(hostUser.id);
assert.strictEqual(hostPart.teamId, 'csk', 'Host team must be CSK');
console.log(`  ✔ Host franchise correctly reserved: ${hostPart.teamName} (${hostPart.teamId})`);

// Verify no AI bot was assigned CSK
room.bots.forEach(bot => {
  assert.notStrictEqual(bot.teamId, 'csk', `AI Bot ${bot.name} cannot be assigned host's team CSK`);
});
console.log('  ✔ Confirmed 0 AI bots were assigned host franchise');

// Test Human switching team to a franchise currently held by an AI bot
const firstBot = room.bots[0];
const targetTeamId = firstBot.teamId;
console.log(`  Bot 1 currently owns: ${targetTeamId}. Host now switches to ${targetTeamId}...`);

const switchResult = roomManager.selectTeam(room.id, hostUser.id, targetTeamId);
assert.strictEqual(switchResult.success, true, 'Host switch to bot-owned team must succeed');
assert.strictEqual(room.teamOwnership.get(targetTeamId), hostUser.id, 'Host now owns target team');
assert.notStrictEqual(firstBot.teamId, targetTeamId, 'Bot must have yielded the franchise');
console.log(`  ✔ Bot successfully yielded franchise. Host now owns ${targetTeamId}, bot reassigned to ${firstBot.teamId}`);

// ==========================================
// TEST 3: AI Intelligence Decision Quality (LOW vs MEDIUM vs HIGH)
// ==========================================
console.log('\n[TEST 3] AI Decision Quality across LOW, MEDIUM, and HIGH:');

// Test asset: Top-tier Star Batter
const starPlayer = {
  id: 'star_01',
  name: 'Virat Kohli',
  role: 'Batter',
  tier: 'S',
  rating: 94,
  basePrice: 2.0,
  estimatedPrice: 16.0
};

// Test asset: Role scarcity context
const remainingPoolScarce = [
  { id: 'p2', name: 'Bowler 1', role: 'Bowler', tier: 'B', basePrice: 1.0, estimatedPrice: 4.0 },
  { id: 'p3', name: 'All-Rounder 1', role: 'All-Rounder', tier: 'B', basePrice: 1.0, estimatedPrice: 5.0 }
]; // 0 remaining batters in pool!

const opponents = [
  { id: 'opp_1', name: 'Player 1', purse: 40.0 },
  { id: 'opp_2', name: 'Player 2', purse: 35.0 }
];

const lowBot = new AuctionBot({ id: 'bot_low', name: 'Low AI', difficulty: 'LOW', strategy: 'balanced' });
const medBot = new AuctionBot({ id: 'bot_med', name: 'Med AI', difficulty: 'MEDIUM', strategy: 'balanced' });
const highBot = new AuctionBot({ id: 'bot_high', name: 'High AI', difficulty: 'HIGH', strategy: 'balanced' });

const lowValuation = lowBot.calculateMaxBid(starPlayer, 90.0, [], 100.0, { remainingPool: remainingPoolScarce, opponents, aiDifficulty: 'LOW' });
const medValuation = medBot.calculateMaxBid(starPlayer, 90.0, [], 100.0, { remainingPool: remainingPoolScarce, opponents, aiDifficulty: 'MEDIUM' });
const highValuation = highBot.calculateMaxBid(starPlayer, 90.0, [], 100.0, { remainingPool: remainingPoolScarce, opponents, aiDifficulty: 'HIGH' });

console.log(`  Valuation for Star Player (${starPlayer.name}, Tier: ${starPlayer.tier}):`);
console.log(`    - LOW (Easy AI):     ₹${lowValuation} Cr  (weaker valuation, underestimates premium)`);
console.log(`    - MEDIUM (Balanced): ₹${medValuation} Cr  (standard balanced valuation)`);
console.log(`    - HIGH (Expert AI):  ₹${highValuation} Cr (strong valuation + role scarcity awareness)`);

assert(lowValuation < medValuation, `LOW valuation (${lowValuation}) must be lower than MEDIUM (${medValuation})`);
assert(highValuation > medValuation, `HIGH valuation (${highValuation}) must be higher than MEDIUM (${medValuation}) due to tier premium + role scarcity`);
console.log('  ✔ Verified decision quality tier hierarchy: LOW < MEDIUM < HIGH for scarce top-tier lot');

// Test Disciplined Stopping & Budget Protection
console.log('\n[TEST 4] Disciplined Stopping & Budget Awareness:');
const cashStrappedPurse = 5.0;
const expensiveLot = { id: 'p4', name: 'Expensive Player', role: 'Batter', tier: 'A', basePrice: 4.0, estimatedPrice: 12.0 };
const highBotLowPurse = highBot.calculateMaxBid(expensiveLot, cashStrappedPurse, [{ role: 'Batter' }], 100.0, { remainingPool: remainingPoolScarce, opponents });
console.log(`  High Bot Max Willingness with ₹5.0 Cr purse remaining: ₹${highBotLowPurse} Cr`);
assert(highBotLowPurse <= cashStrappedPurse, 'High bot must never bid more than available spend');
console.log('  ✔ Verified disciplined budget reserve protection');

console.log('\n======================================================');
console.log('ALL AI INTELLIGENCE & FRIEND SPECIFICATION TESTS PASSED!');
console.log('======================================================\n');
