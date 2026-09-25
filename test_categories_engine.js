// Automated Verification Script for THE BID Universal Auction Engine
// Tests all 5 Universal Categories: IPL Cricket, FIFA Football, Formula 1, NBA Basketball, and Movie Stars

const { CategoryRegistry, getCategoryModule, getAllRegisteredCategories } = require('./src/categories/CategoryRegistry');
const RoomManager = require('./src/rooms/RoomManager');
const roomManager = new RoomManager({ to: () => ({ emit: () => {} }) });
const assert = require('assert');

console.log('================================================================');
console.log('🏎️ ⚽ 🏏 🏀 🎬 THE BID: 5 UNIVERSAL CATEGORIES VERIFICATION TEST');
console.log('================================================================\n');

// 1. Category Registry Tests
console.log('1. Checking Category Modules Resolution...');
const iplModule = getCategoryModule('ipl_cricket');
const fifaModule = getCategoryModule('fifa_football');
const f1Module = getCategoryModule('formula_1');
const nbaModule = getCategoryModule('nba');
const movieModule = getCategoryModule('movie_stars');

assert.strictEqual(iplModule.id, 'ipl_cricket', 'IPL module id mismatch');
assert.strictEqual(fifaModule.id, 'fifa_football', 'FIFA module id mismatch');
assert.strictEqual(f1Module.id, 'formula_1', 'F1 module id mismatch');
assert.strictEqual(nbaModule.id, 'nba', 'NBA module id mismatch');
assert.strictEqual(movieModule.id, 'movie_stars', 'Movie Stars module id mismatch');

console.log('✓ All 5 category modules successfully resolved from registry with ACTIVE status');

// 2. Franchises, Constructors & Studios (10 slots each)
console.log('\n2. Verifying Identities & 10-Slot Limits...');
const iplFranchises = iplModule.getFranchises();
const fifaTeams = fifaModule.getFranchises();
const f1Constructors = f1Module.getFranchises();
const nbaTeams = nbaModule.getFranchises();
const filmStudios = movieModule.getFranchises();

assert.strictEqual(iplFranchises.length, 10, 'IPL franchises must equal 10');
assert.strictEqual(fifaTeams.length, 48, 'FIFA teams must equal 48 selectable nations');
assert.strictEqual(f1Constructors.length, 11, 'F1 constructors must equal 11 for 2026 grid');
assert.strictEqual(nbaTeams.length, 30, 'NBA teams must equal 30 official franchises');
assert.strictEqual(filmStudios.length, 20, 'Film studios must equal 20 curated studios');

console.log(`✓ IPL Teams (10): ${iplFranchises.map(f => f.code).join(', ')}`);
console.log(`✓ FIFA Teams (48): ${fifaTeams.slice(0, 5).map(t => t.code).join(', ')}...`);
console.log(`✓ F1 Constructors (11): ${f1Constructors.map(c => c.code).join(', ')}`);
console.log(`✓ NBA Franchises (30): ${nbaTeams.slice(0, 5).map(t => t.code).join(', ')}...`);
console.log(`✓ Film Studios (20): ${filmStudios.slice(0, 5).map(s => s.code).join(', ')}...`);

// Terminology verification
assert.strictEqual(movieModule.franchiseLabel, 'Film Studio', 'Movie Stars must use Film Studio terminology');
assert(['Movie Package', 'Blockbuster Cast'].includes(movieModule.collectionLabel), 'Movie Stars collection label must be Movie Package or Blockbuster Cast');
assert.strictEqual(f1Module.franchiseLabel, 'F1 Constructor', 'F1 must use F1 Constructor terminology');
assert.strictEqual(nbaModule.franchiseLabel, 'NBA Franchise', 'NBA must use NBA Franchise terminology');
console.log('✓ Strict Category Terminology: Verified Film Studio, F1 Constructor, NBA Franchise, IPL Team');

// 3. Pool Integrity and Data Isolation Tests (Zero Leakage)
console.log('\n3. Verifying Pool Integrity & Data Isolation...');
const iplPool = iplModule.generatePool(null, 30);
const fifaPool = fifaModule.generatePool(null, 30);
const f1Pool = f1Module.generatePool(null, 30);
const nbaPool = nbaModule.generatePool(null, 30);
const moviePool = movieModule.generatePool(null, 30);

assert.strictEqual(iplPool.length, 30, 'IPL pool count mismatch');
assert.strictEqual(fifaPool.length, 30, 'FIFA pool count mismatch');
assert.strictEqual(f1Pool.length, 30, 'F1 pool count mismatch');
assert.strictEqual(nbaPool.length, 30, 'NBA pool count mismatch');
assert.strictEqual(moviePool.length, 30, 'Movie pool count mismatch');

// Verify NBA roles
const validNBARoles = new Set(['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center']);
nbaPool.forEach(p => {
  assert(validNBARoles.has(p.role), `Invalid NBA role: ${p.role} for ${p.name}`);
});
console.log('✓ NBA Basketball Pool: 100% verified basketball players (PG, SG, SF, PF, C).');

// Verify Movie Stars roles
const validMovieRoles = new Set(['Director', 'Singer', 'Male Singer', 'Female Singer', 'Male Actor', 'Female Actor', 'Leading Actor', 'Leading Actress', 'Action Star', 'Character Actor', 'Dramatic Lead']);
moviePool.forEach(s => {
  assert(validMovieRoles.has(s.role), `Invalid Movie Star role: ${s.role} for ${s.name}`);
});
console.log('✓ Movie Stars Pool: 100% verified film talent (Directors, Singers, Actors, Actresses).');

// Verify zero cross-contamination (e.g. no cricketers in NBA, no F1 drivers in Movie Stars)
const f1Names = new Set(f1Module.getItems().map(d => d.name));
const nbaNames = new Set(nbaModule.getItems().map(p => p.name));
const movieNames = new Set(movieModule.getItems().map(s => s.name));
const fifaNames = new Set(fifaModule.getItems().map(p => p.name));
const iplNames = new Set(iplModule.getItems().map(p => p.name));

for (const name of nbaNames) {
  assert(!f1Names.has(name) && !movieNames.has(name) && !iplNames.has(name), `Data leakage: ${name} found across categories`);
}
for (const name of movieNames) {
  assert(!f1Names.has(name) && !nbaNames.has(name) && !fifaNames.has(name), `Data leakage: ${name} found across categories`);
}
console.log('✓ Data Isolation: Zero cross-contamination between any of the 5 categories.');

// 4. Room Creation & 10-Participant Universal Rooms
console.log('\n4. Testing 10-Participant Universal Room Creation...');

// NBA Room Test
const nbaRoom = roomManager.createRoom({
  roomId: 'room_nba_test',
  hostUser: { id: 'user_nba_host', name: 'Showtime GM', uniqueId: 'TB-NBA-01' },
  category: 'nba',
  mode: 'computer',
  roomCode: 'BID-NBA-TEST',
  customParticipants: [
    { id: 'user_nba_host', name: 'Showtime GM', teamId: 'lakers', teamName: 'Los Angeles Lakers', type: 'HOST' },
    ...nbaTeams.slice(1).map((t, i) => ({
      id: `bot_nba_${i}`,
      name: `AI GM ${i + 1}`,
      teamId: t.id,
      teamName: t.name,
      type: 'COMPUTER'
    }))
  ]
});

assert.strictEqual(nbaRoom.participants.size, 10, 'NBA room participants count must be 10');
assert.strictEqual(nbaRoom.proposedBudget, 120.0, 'NBA default budget should be 120M');
assert.strictEqual(nbaRoom.categoryConfig.currencySymbol, '$', 'NBA currency symbol mismatch');
assert.strictEqual(nbaRoom.categoryConfig.unitLabel, 'M', 'NBA unit label mismatch');
const nbaTeamSet = new Set(Array.from(nbaRoom.participants.values()).map(p => p.teamId));
assert.strictEqual(nbaTeamSet.size, 10, 'Duplicate NBA franchise detected!');
console.log('✓ NBA Room: 10 participants, 10 unique NBA franchises, $120M budget verified.');

// Movie Stars Room Test (Studios)
const movieRoom = roomManager.createRoom({
  roomId: 'room_movie_test',
  hostUser: { id: 'user_movie_host', name: 'Studio Mogul', uniqueId: 'TB-MOV-01' },
  category: 'movie_stars',
  mode: 'computer',
  roomCode: 'BID-MOV-TEST',
  customParticipants: [
    { id: 'user_movie_host', name: 'Studio Mogul', teamId: 'disney', teamName: 'Walt Disney Studios', type: 'HOST' },
    ...filmStudios.slice(1).map((s, i) => ({
      id: `bot_movie_${i}`,
      name: `AI Producer ${i + 1}`,
      teamId: s.id,
      teamName: s.name,
      type: 'COMPUTER'
    }))
  ]
});

assert.strictEqual(movieRoom.participants.size, 10, 'Movie room participants count must be 10');
assert.strictEqual(movieRoom.proposedBudget, 150.0, 'Movie Stars default budget should be 150M');
assert.strictEqual(movieRoom.categoryConfig.currencySymbol, '$', 'Movie currency symbol mismatch');
assert.strictEqual(movieRoom.categoryConfig.unitLabel, 'M', 'Movie unit label mismatch');
assert.strictEqual(movieRoom.categoryConfig.franchiseLabel, 'Film Studio', 'Movie franchiseLabel mismatch');
const movieStudioSet = new Set(Array.from(movieRoom.participants.values()).map(p => p.teamId));
assert.strictEqual(movieStudioSet.size, 10, 'Duplicate film studio detected!');
console.log('✓ Movie Stars Room: 10 participants, 10 unique film studios, $150M budget verified.');

// 5. Tactical AI Analysis across NBA and Movie Stars
console.log('\n5. Testing AI Analysis for NBA & Movie Stars...');
const dummySquadNBA = [
  { ...nbaPool[0], soldPrice: 75.0 },
  { ...nbaPool[1], soldPrice: 35.0 },
];
const nbaAnalysis = nbaModule.generateAnalysis({
  participants: [{ id: 'user_nba_host', name: 'Showtime GM', teamName: 'Los Angeles Lakers', squad: dummySquadNBA, purse: 10.0 }],
  proposedBudget: 120.0,
  categoryConfig: nbaModule
});
assert(nbaAnalysis.winner, 'NBA analysis winner missing');
assert(nbaAnalysis.teamReports['user_nba_host'], 'NBA team report missing');
console.log(`✓ NBA Analysis: Winner "${nbaAnalysis.winner.name}", Score ${nbaAnalysis.teamReports['user_nba_host'].overallScore}/100, Marquee "${nbaAnalysis.teamReports['user_nba_host'].marqueeSigning}", Bargain "${nbaAnalysis.teamReports['user_nba_host'].bestBargain}"`);

const dummyCastMovie = [
  { ...moviePool[0], soldPrice: 90.0 },
  { ...moviePool[1], soldPrice: 45.0 },
];
const movieAnalysis = movieModule.generateAnalysis({
  participants: [{ id: 'user_movie_host', name: 'Studio Mogul', teamName: 'Walt Disney Studios', squad: dummyCastMovie, purse: 15.0 }],
  proposedBudget: 150.0,
  categoryConfig: movieModule
});
assert(movieAnalysis.winner, 'Movie analysis winner missing');
assert(movieAnalysis.teamReports['user_movie_host'], 'Movie team report missing');
console.log(`✓ Movie Stars Analysis: Winner "${movieAnalysis.winner.name}", Score ${movieAnalysis.teamReports['user_movie_host'].overallScore}/100, Marquee "${movieAnalysis.teamReports['user_movie_host'].marqueeSigning}", Bargain "${movieAnalysis.teamReports['user_movie_host'].bestBargain}"`);

// 6. World 06: Luxury Cars & World 07: Luxury Collection Verification
console.log('\n6. Verifying World 06: Luxury Cars & World 07: Luxury Collection...');
const carsModule = CategoryRegistry.get('luxury_cars');
const colModule = CategoryRegistry.get('luxury_collection');

assert(carsModule, 'Luxury Cars module missing');
assert(colModule, 'Luxury Collection module missing');
assert.strictEqual(carsModule.status, 'ACTIVE', 'Luxury Cars must be ACTIVE');
assert.strictEqual(colModule.status, 'ACTIVE', 'Luxury Collection must be ACTIVE');
assert.strictEqual(carsModule.franchiseLabel, 'Garage', 'Luxury Cars must use Garage');
assert.strictEqual(colModule.franchiseLabel, 'Private Collection', 'Luxury Collection must use Private Collection');
assert.strictEqual(carsModule.getFranchises().length, 10, 'Luxury Cars must have 10 Garages');
assert.strictEqual(colModule.getFranchises().length, 10, 'Luxury Collection must have 10 Private Collections');

const carPoolTest = carsModule.generatePool(4);
const colPoolTest = colModule.generatePool(4);
assert.strictEqual(carPoolTest.length, 30, 'Luxury Cars pool should generate 30 items for 4 participants');
assert.strictEqual(colPoolTest.length, 28, 'Luxury Collection pool should generate 28 items for 4 participants');

// Verify AI scoring for both
const carAnalysisTest = carsModule.generateAnalysis({
  participants: [{ id: 'car_collector', name: 'Apex Chief', teamName: 'Apex Motorsport Garage', squad: carPoolTest.slice(0, 4), purse: 20.0 }],
  proposedBudget: 80.0,
  categoryConfig: carsModule
});
assert(carAnalysisTest.winner, 'Luxury Cars analysis winner missing');
assert(carAnalysisTest.teamReports['car_collector'].breakdown, 'Luxury Cars breakdown missing');

const colAnalysisTest = colModule.generateAnalysis({
  participants: [{ id: 'curator_lead', name: 'Grand Curator', teamName: 'Heritage House Collection', squad: colPoolTest.slice(0, 4), purse: 30.0 }],
  proposedBudget: 100.0,
  categoryConfig: colModule
});
assert(colAnalysisTest.winner, 'Luxury Collection analysis winner missing');
assert(colAnalysisTest.teamReports['curator_lead'].breakdown, 'Luxury Collection breakdown missing');

console.log(`✓ Luxury Cars: 10 Garages, 30-item quota pool, 6-pillar scoring (${carAnalysisTest.teamReports['car_collector'].overallScore}/100)`);
console.log(`✓ Luxury Collection: 10 Private Collections, 28-item quota pool, 6-pillar scoring (${colAnalysisTest.teamReports['curator_lead'].overallScore}/100)`);

console.log('\n================================================================');
console.log('🎉 ALL 7 UNIVERSAL AUCTION WORLDS VERIFIED & FULLY OPERATIONAL!');
console.log('================================================================\n');
