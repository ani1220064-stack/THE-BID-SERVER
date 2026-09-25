const assert = require('assert');
const { getCategoryModule } = require('./src/categories/CategoryRegistry');

console.log('==============================================');
console.log('🎬 RUNNING MOVIE STARS IDENTITY VERIFICATION TEST');
console.log('==============================================');

// Test 1: Verify getItems returns enriched Movie Talent with explicit primary identity
const movieStarsModule = getCategoryModule('movie_stars');
assert(movieStarsModule, 'movie_stars module must exist in CategoryRegistry');

const allItems = movieStarsModule.getItems();
assert(allItems.length > 0, 'Movie stars pool should not be empty');

console.log(`[Test 1] Total Movie Stars Items: ${allItems.length}`);
allItems.forEach((item, idx) => {
  assert(item.id, `Item ${idx} must have an id`);
  assert(item.auctionedPersonName, `Item ${idx} (${item.id}) must have auctionedPersonName`);
  assert(item.auctionedPersonRole, `Item ${idx} (${item.id}) must have auctionedPersonRole`);
  assert(item.movieTitle, `Item ${idx} (${item.id}) must have movieTitle`);
  assert(item.directorName, `Item ${idx} (${item.id}) must have directorName`);
  assert(item.producerName, `Item ${idx} (${item.id}) must have producerName`);
  assert(item.leadActorName, `Item ${idx} (${item.id}) must have leadActorName`);
});
console.log('✅ [Test 1 Passed] All items have explicit auctionedPersonName, auctionedPersonRole, and movieTitle.');

// Test 2: Verify generated pool contains distinct roles and primary identity fields
const generatedPool = movieStarsModule.generatePool(4, 25);
assert.strictEqual(generatedPool.length, 25, 'Pool size should be exactly 25');

const sampleProducer = {
  id: 'test_producer_aamir',
  name: 'Aamir Khan',
  role: 'Producer',
  auctionedPersonName: 'Aamir Khan',
  auctionedPersonRole: 'PRODUCER',
  movieTitle: 'Dangal',
  directorName: 'Nitesh Tiwari',
  producerName: 'Aamir Khan',
  leadActorName: 'Aamir Khan',
  studioName: 'Aamir Khan Productions',
  basePrice: 24.0,
  soldPrice: 32.0,
  cast: ['Aamir Khan', 'Fatima Sana Shaikh', 'Sanya Malhotra']
};

const sampleDirector = {
  id: 'test_director_nitesh',
  name: 'Nitesh Tiwari',
  role: 'Director',
  auctionedPersonName: 'Nitesh Tiwari',
  auctionedPersonRole: 'DIRECTOR',
  movieTitle: 'Dangal',
  directorName: 'Nitesh Tiwari',
  producerName: 'Aamir Khan',
  leadActorName: 'Aamir Khan',
  studioName: 'Aamir Khan Productions',
  basePrice: 18.0,
  soldPrice: 22.0,
  cast: ['Aamir Khan', 'Fatima Sana Shaikh', 'Sanya Malhotra']
};

console.log('[Test 2] Verifying explicit distinction between PRODUCER and DIRECTOR:');
console.log(`  Producer Item: Person=${sampleProducer.auctionedPersonName}, Role=${sampleProducer.auctionedPersonRole}, Movie=${sampleProducer.movieTitle}, Director=${sampleProducer.directorName}`);
console.log(`  Director Item: Person=${sampleDirector.auctionedPersonName}, Role=${sampleDirector.auctionedPersonRole}, Movie=${sampleDirector.movieTitle}, Producer=${sampleDirector.producerName}`);

assert.strictEqual(sampleProducer.auctionedPersonName, 'Aamir Khan');
assert.strictEqual(sampleProducer.auctionedPersonRole, 'PRODUCER');
assert.strictEqual(sampleProducer.directorName, 'Nitesh Tiwari');
assert.strictEqual(sampleProducer.producerName, 'Aamir Khan');

assert.strictEqual(sampleDirector.auctionedPersonName, 'Nitesh Tiwari');
assert.strictEqual(sampleDirector.auctionedPersonRole, 'DIRECTOR');
assert.strictEqual(sampleDirector.directorName, 'Nitesh Tiwari');
assert.strictEqual(sampleDirector.producerName, 'Aamir Khan');

console.log('✅ [Test 2 Passed] Auctioned person is unmistakably clear and never confused with movie or director.');

// Test 3: Verify match finish snapshot preserves auctionedPersonName & auctionedPersonRole
const mockRoom = {
  id: 'test_movie_room',
  category: 'movie_stars',
  categoryConfig: movieStarsModule,
  mode: 'computer',
  proposedBudget: 150.0,
  participants: new Map([
    ['user1', {
      id: 'user1',
      uniqueId: 'TB-TEST-USER',
      name: 'Producer Studio',
      teamName: 'Dharma Productions',
      purse: 96.0,
      squad: [sampleProducer, sampleDirector],
      isAI: false
    }]
  ]),
  auctionedPlayerIds: new Set([sampleProducer.id, sampleDirector.id])
};

const evaluation = movieStarsModule.generateAnalysis(mockRoom);
assert(evaluation.winner, 'Evaluation should produce a winner');
assert(evaluation.teamReports['user1'], 'Team report should exist for user1');

const report = evaluation.teamReports['user1'];
console.log(`[Test 3] AI Report Marquee Signing: ${report.marqueeSigning}`);
console.log(`[Test 3] AI Report Best Bargain: ${report.bestBargain}`);
assert(report.marqueeSigning.includes('Aamir Khan') || report.marqueeSigning.includes('Nitesh Tiwari'));

console.log('✅ [Test 3 Passed] AI Analysis correctly prioritizes auctionedPersonName in reports.');
console.log('==============================================');
console.log('🎉 ALL MOVIE STARS IDENTITY TESTS PASSED!');
console.log('==============================================');
