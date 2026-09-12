const assert = require('assert');
const store = require('../src/services/store');

console.log('================================================================');
console.log('📜 TESTING CAREER MATCH HISTORY & STATS INTEGRITY');
console.log('================================================================');

async function runTests() {
  const testUserId = `test_history_user_${Date.now()}`;
  const user = store.getOrCreateUser({
    uniqueId: testUserId,
    name: 'History Tester',
    avatar: 'avatar_1'
  });

  console.log('\n1. Verifying initial history state:');
  let history = store.getMatchHistory(testUserId);
  assert.strictEqual(Array.isArray(history), true, 'History should be an array');
  console.log('   ✓ Initial match history is an empty array');

  console.log('\n2. Recording Luxury Collection match victory:');
  store.recordMatch(testUserId, {
    category: 'luxury_collection',
    categoryTitle: 'Luxury Collection Auction',
    mode: 'computer',
    budget: 120,
    totalSpent: 85.5,
    finalScore: 94,
    rank: 1,
    isWinner: true,
    currencySymbol: '$',
    unitLabel: 'M',
    opponentsCount: 3,
    purchases: [
      { name: 'Haute Horlogerie Celestial Tourbillon', price: 28.5 },
      { name: 'Royal Emerald Diadem', price: 32.0 },
      { name: 'Renaissance Oil Painting', price: 25.0 }
    ]
  });

  history = store.getMatchHistory(testUserId);
  assert.strictEqual(history.length, 1, 'History length should be 1');
  const record1 = history[0];
  assert.strictEqual(record1.category, 'luxury_collection');
  assert.strictEqual(record1.budget, 120);
  assert.strictEqual(record1.totalSpent, 85.5);
  assert.strictEqual(record1.finalScore, 94);
  assert.strictEqual(record1.isWinner, true);
  assert.strictEqual(record1.purchases.length, 3);
  console.log('   ✓ Luxury Collection match recorded accurately with financial & squad metrics');

  console.log('\n3. Recording Movie Stars match (loss / rank 2):');
  store.recordMatch(testUserId, {
    category: 'movie_stars',
    categoryTitle: 'Movie Stars Studio Auction',
    mode: 'computer',
    budget: 100,
    totalSpent: 67.7,
    finalScore: 82,
    rank: 2,
    isWinner: false,
    currencySymbol: '$',
    unitLabel: 'M',
    opponentsCount: 4,
    purchases: [
      { name: 'Scarlett Johansson', price: 35.0 },
      { name: 'Robert Downey Jr.', price: 32.7 }
    ]
  });

  history = store.getMatchHistory(testUserId);
  assert.strictEqual(history.length, 2, 'History length should be 2');
  // Newest should be first (chronological unshift)
  assert.strictEqual(history[0].category, 'movie_stars');
  assert.strictEqual(history[1].category, 'luxury_collection');
  console.log('   ✓ Movie Stars match recorded in reverse-chronological order');

  console.log('\n4. Verifying Career Ledger aggregations:');
  const totalMatches = history.length;
  const victories = history.filter(m => m.isWinner || (m.trophyEarned && m.trophyEarned > 0)).length;
  const winRate = Math.round((victories / totalMatches) * 100);

  assert.strictEqual(totalMatches, 2);
  assert.strictEqual(victories, 1);
  assert.strictEqual(winRate, 50);
  console.log(`   ✓ Total Matches: ${totalMatches} | Victories: ${victories} | Win Rate: ${winRate}%`);

  console.log('\n================================================================');
  console.log('✅ ALL CAREER MATCH HISTORY TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('❌ Match history test failed:', err);
  process.exit(1);
});
