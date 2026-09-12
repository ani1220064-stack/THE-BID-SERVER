const assert = require('assert');
const http = require('http');
const store = require('../src/services/store');

const SERVER_URL = 'http://localhost:4000';

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${SERVER_URL}${path}`, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resData) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });
    req.on('error', reject);
  });
}

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resData) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runCategoryTrophiesTest() {
  console.log('================================================================');
  console.log('🏆 TESTING DYNAMIC CATEGORY TROPHY TRACKING ACROSS 7 ARENAS');
  console.log('================================================================\n');

  const testUniqueId = `TB-TRP-${Date.now()}`;
  const authRes = await httpPost('/api/auth/login', {
    id: `user_${testUniqueId}`,
    uniqueId: testUniqueId,
    name: 'Trophy Master',
    avatar: 'avatar_1'
  });
  assert.strictEqual(authRes.status, 200, 'User login should succeed');

  console.log('1. Verifying initial state:');
  const user = store.getOrCreateUser({
    id: `user_${testUniqueId}`,
    uniqueId: testUniqueId,
    name: 'Trophy Master',
    avatar: 'avatar_1'
  });
  assert.strictEqual(user.trophies, 0, 'Initial master trophies must be 0');
  assert.ok(user.categoryTrophies, 'categoryTrophies must exist');
  assert.strictEqual(user.categoryTrophies.ipl_cricket, 0);
  assert.strictEqual(user.categoryTrophies.luxury_cars, 0);
  console.log('   ✓ Initial categoryTrophies initialized with 0 across all arenas');

  console.log('2. Recording IPL Cricket Victory (1 win):');
  store.recordMatch(testUniqueId, { category: 'ipl_cricket', isWinner: true, categoryTitle: 'IPL Cricket Auction' });
  let fullProfile = store.getUserFullProfile(testUniqueId);
  assert.strictEqual(fullProfile.user.categoryTrophies.ipl_cricket, 1);
  assert.strictEqual(fullProfile.user.trophies, 1, 'Master tally must update to 1');
  console.log(`   ✓ IPL Cricket: ${fullProfile.user.categoryTrophies.ipl_cricket} | Master Tally: ${fullProfile.user.trophies}`);

  console.log('3. Recording Luxury Cars Victory (1 win):');
  store.recordMatch(testUniqueId, { category: 'luxury_cars', isWinner: true, categoryTitle: 'Luxury Cars Auction' });
  fullProfile = store.getUserFullProfile(testUniqueId);
  assert.strictEqual(fullProfile.user.categoryTrophies.luxury_cars, 1);
  assert.strictEqual(fullProfile.user.categoryTrophies.ipl_cricket, 1);
  assert.strictEqual(fullProfile.user.trophies, 2, 'Master tally must update to 2');
  console.log(`   ✓ Luxury Cars: ${fullProfile.user.categoryTrophies.luxury_cars} | IPL: ${fullProfile.user.categoryTrophies.ipl_cricket} | Master Tally: ${fullProfile.user.trophies}`);

  console.log('4. Recording 3 Formula 1 Victories:');
  store.recordMatch(testUniqueId, { category: 'formula_1', isWinner: true, categoryTitle: 'Formula 1 Drivers Auction' });
  store.recordMatch(testUniqueId, { category: 'formula_1', isWinner: true, categoryTitle: 'Formula 1 Drivers Auction' });
  store.recordMatch(testUniqueId, { category: 'formula_1', isWinner: true, categoryTitle: 'Formula 1 Drivers Auction' });
  fullProfile = store.getUserFullProfile(testUniqueId);
  assert.strictEqual(fullProfile.user.categoryTrophies.formula_1, 3);
  assert.strictEqual(fullProfile.user.trophies, 5, 'Master tally must be exactly sum (1 + 1 + 3 = 5)');
  console.log(`   ✓ F1: ${fullProfile.user.categoryTrophies.formula_1} | Master Tally: ${fullProfile.user.trophies}`);

  console.log('5. Recording a Loss in NBA Basketball (0 wins):');
  store.recordMatch(testUniqueId, { category: 'nba', isWinner: false, categoryTitle: 'NBA Basketball Auction' });
  fullProfile = store.getUserFullProfile(testUniqueId);
  assert.strictEqual(fullProfile.user.categoryTrophies.nba, 0, 'Loss must not increment trophies');
  assert.strictEqual(fullProfile.user.trophies, 5, 'Master tally must remain 5');
  console.log(`   ✓ NBA: ${fullProfile.user.categoryTrophies.nba} | Master Tally: ${fullProfile.user.trophies}`);

  console.log('6. Verifying all 7 Arena keys present:');
  const arenas = ['ipl_cricket', 'fifa_football', 'formula_1', 'nba', 'movie_stars', 'luxury_cars', 'luxury_collection'];
  for (const arena of arenas) {
    assert.ok(arena in fullProfile.user.categoryTrophies, `Arena ${arena} must be present in categoryTrophies`);
  }
  console.log('   ✓ All 7 auction arenas present in data model');

  console.log('\n================================================================');
  console.log('✅ ALL DYNAMIC CATEGORY TROPHY TRACKING TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runCategoryTrophiesTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
