const assert = require('assert');
const RoomManager = require('./src/rooms/RoomManager');
const store = require('./src/services/store');
const { getFeaturedFIFATeams, getAllFIFATeams } = require('./src/data/fifaTeams');
const { getFeaturedNBATeams, getAllNBATeams } = require('./src/data/nbaTeams');
const { getFeaturedF1Teams, getAllF1Teams } = require('./src/data/f1Teams');
const { getFeaturedFilmStudios, getAllFilmStudios } = require('./src/data/filmStudios');
const { IPL_FRANCHISES } = require('./src/data/iplFranchises');

class MockIO {
  to() {
    return { emit: () => {} };
  }
  emit() {}
}

async function runPreAuctionTestSuite() {
  console.log('🧪 Starting Universal Pre-Auction Verification Suite...\n');
  let passed = 0;

  // 1. Curation Size & Global Market Ordering Rules
  {
    console.log('Test 1: FIFA 48 selectable nations & Top 20 Featured Ordering');
    const allFIFA = getAllFIFATeams();
    const featuredFIFA = getFeaturedFIFATeams();

    assert.strictEqual(allFIFA.length, 48, 'FIFA complete registry must contain exactly 48 selectable nations');
    assert.strictEqual(featuredFIFA.length, 20, 'FIFA Featured must contain Top 20 national teams');
    assert.strictEqual(featuredFIFA[0].code, 'IND', 'India must be placed #1 in Featured');
    assert.strictEqual(featuredFIFA[1].code, 'CHN', 'China PR must be placed #2 in Featured');
    assert.strictEqual(featuredFIFA[2].code, 'USA', 'USA must be placed #3 in Featured');

    const morocco = allFIFA.find(t => t.id === 'mar');
    assert.ok(morocco, 'Morocco must be present');
    console.log('  ✓ FIFA Registry:', { total: allFIFA.length, featured: featuredFIFA.length, top3: featuredFIFA.slice(0, 3).map(t => t.name) });
    passed++;
  }

  // 2. NBA 30 Franchises & Top 15 Featured
  {
    console.log('\nTest 2: NBA 30 Franchises & Top 15 Featured');
    const allNBA = getAllNBATeams();
    const featuredNBA = getFeaturedNBATeams();

    assert.strictEqual(allNBA.length, 30, 'NBA registry must contain all 30 franchises');
    assert.strictEqual(featuredNBA.length, 15, 'NBA Featured must contain Top 15 franchises');
    console.log('  ✓ NBA Registry:', { total: allNBA.length, featured: featuredNBA.length });
    passed++;
  }

  // 3. F1 11 Constructors (2026 Season including Audi & Cadillac)
  {
    console.log('\nTest 3: F1 11 Constructors (2026 Grid with Audi & Cadillac)');
    const allF1 = getAllF1Teams();
    assert.strictEqual(allF1.length, 11, 'F1 grid must have 11 constructors');
    assert.ok(allF1.some(t => t.id === 'audi'), 'Audi must be present');
    assert.ok(allF1.some(t => t.id === 'cadillac'), 'Cadillac must be present');
    console.log('  ✓ F1 11 constructors verified:', allF1.map(t => t.name).join(', '));
    passed++;
  }

  // 4. Movie Stars 20 Curated Studios (10 Indian, 10 Global)
  {
    console.log('\nTest 4: Movie Stars Curated Studios');
    const allStudios = getAllFilmStudios();
    assert.strictEqual(allStudios.length, 20, 'Film studios must contain 20 curated studios');
    const indianStudios = allStudios.filter(s => s.region === 'Indian');
    const globalStudios = allStudios.filter(s => s.region === 'Global');
    assert.strictEqual(indianStudios.length, 10, 'Must have 10 Indian studios');
    assert.strictEqual(globalStudios.length, 10, 'Must have 10 Global studios');
    console.log('  ✓ Film studios verified: 10 Indian, 10 Global');
    passed++;
  }

  // 5. Custom Entity Creation, Persistence, Isolation & Non-destructive deletion
  {
    console.log('\nTest 5: Custom Entity CRUD & Isolation in store.js');
    const userA = 'BID-TEST-USER-A';
    const userB = 'BID-TEST-USER-B';

    const createRes = store.createCustomEntity({
      ownerUniqueId: userA,
      categoryId: 'ipl_cricket',
      name: 'Delhi Titans',
      entityType: 'FRANCHISE',
      badge: '⚡',
      primaryColor: '#FFA500',
    });

    assert.strictEqual(createRes.success, true);
    const customA = createRes.customEntity;
    assert.ok(customA.id, 'Custom entity must have generated ID');
    assert.strictEqual(customA.name, 'Delhi Titans');
    assert.strictEqual(customA.isCustom, true);

    // Isolation check: User A sees their custom entity; User B does not
    const entitiesA = store.getCustomEntities(userA);
    const entitiesB = store.getCustomEntities(userB);
    assert.ok(entitiesA.some(e => e.id === customA.id), 'User A must see custom entity');
    assert.ok(!entitiesB.some(e => e.id === customA.id), 'User B must NOT see User A custom entity');

    // Room selection with custom entity
    const io = new MockIO();
    const rm = new RoomManager(io);
    const hostUser = {
      id: 'h_custom_1',
      uniqueId: userA,
      name: 'Custom Builder',
      teamId: customA.id,
      socketId: 'sock_cust_1',
    };
    const room = rm.createRoom({
      roomId: 'room_custom_entity_test',
      hostUser,
      category: 'ipl_cricket',
      mode: 'friends',
    });

    const hostPart = room.participants.get('h_custom_1');
    assert.strictEqual(hostPart.teamId, customA.id);
    assert.strictEqual(hostPart.teamName, 'Delhi Titans');
    assert.strictEqual(hostPart.isCustom, true);

    // Deletion: removing custom entity does not mutate room participant snapshot
    const delRes = store.deleteCustomEntity(customA.id, userA);
    assert.strictEqual(delRes.success, true, 'Custom entity must be deletable');
    const entitiesAAfter = store.getCustomEntities(userA);
    assert.ok(!entitiesAAfter.some(e => e.id === customA.id), 'Custom entity must be removed from user inventory');
    assert.strictEqual(hostPart.teamName, 'Delhi Titans', 'Active match retains immutable snapshot');

    console.log('  ✓ Custom entity created, isolated to owner, selected in room, and cleanly deleted without breaking active matches');
    passed++;
  }

  // 6. Movie Stars Movie Title Assignment & Room Snapshot
  {
    console.log('\nTest 6: Movie Stars Movie Title Custom Input');
    const io = new MockIO();
    const rm = new RoomManager(io);
    const hostUser = {
      id: 'director_1',
      uniqueId: 'BID-DIR-1',
      name: 'Director Kabir',
      teamId: 'yrf',
      socketId: 'sock_dir_1',
    };
    const room = rm.createRoom({
      roomId: 'room_movie_test',
      hostUser,
      category: 'movie_stars',
      mode: 'friends',
    });

    const selRes = rm.selectTeam(room.id, 'director_1', 'yrf', 'War 3: Final Protocol');
    assert.strictEqual(selRes.success, true);
    const hostPart = room.participants.get('director_1');
    assert.strictEqual(hostPart.movieTitle, 'War 3: Final Protocol');
    console.log('  ✓ Movie title correctly attached to participant in room snapshot:', hostPart.movieTitle);
    passed++;
  }

  // 7. Budget Agreement Consensus Reset Rule
  {
    console.log('\nTest 7: Budget Agreement Unanimous Agreement & Reset upon New Proposal');
    const io = new MockIO();
    const rm = new RoomManager(io);
    const host = { id: 'u1', uniqueId: 'BID-1', name: 'User 1', socketId: 's1' };
    const guest = { id: 'u2', uniqueId: 'BID-2', name: 'User 2', socketId: 's2' };

    const room = rm.createRoom({ roomId: 'room_budget_test', hostUser: host, mode: 'friends' });
    rm.joinRoom(room.id, guest);

    // Both vote yes on default budget
    rm.voteBudget(room.id, 'u1', true);
    rm.voteBudget(room.id, 'u2', true);
    assert.strictEqual(room.state, 'LOBBY', 'Unanimous consensus advances room to LOBBY');

    // Host proposes a new budget from lobby / budget screen
    rm.proposeBudget(room.id, 'u1', 150);
    assert.strictEqual(room.proposedBudget, 150);
    assert.strictEqual(room.state, 'BUDGET_SELECTION', 'Room returns to BUDGET_SELECTION');
    assert.strictEqual(room.budgetVotes.get('u1'), true, 'Proposer automatically votes yes');
    assert.strictEqual(room.budgetVotes.get('u2'), undefined, 'All other votes are completely reset');

    console.log('  ✓ Budget consensus verified: unanimous advance + reset on new proposal');
    passed++;
  }

  console.log(`\n======================================================`);
  console.log(`🎉 ALL ${passed} UNIVERSAL PRE-AUCTION TESTS PASSED!`);
  console.log(`======================================================\n`);
}

runPreAuctionTestSuite().catch(err => {
  console.error('❌ Universal Pre-Auction Test Suite Failed:', err);
  process.exit(1);
});
