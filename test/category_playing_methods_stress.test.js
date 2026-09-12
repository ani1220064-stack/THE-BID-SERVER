const ioClient = require('socket.io-client');
const assert = require('assert');
const store = require('../src/services/store');

const SERVER_URL = 'http://localhost:4000';

function createClient() {
  return ioClient(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCategoryAndPlayingMethodsTest() {
  console.log('===============================================================');
  console.log('🚀 QA TEST SUITE 1: CATEGORIES & PLAYING METHODS STRESS TEST');
  console.log('===============================================================');

  const categoriesToTest = [
    'ipl_cricket',
    'fifa_football',
    'formula_1',
    'nba',
    'movie_stars',
    'luxury_cars',
    'luxury_collection'
  ];

  const participantConfigs = [
    { count: 2, label: 'MINIMUM (2 Players)' },
    { count: 4, label: 'MEDIUM (4 Players)' },
    { count: 10, label: 'MAXIMUM (10 Players)' }
  ];

  let totalScenarios = 0;
  let passedScenarios = 0;

  // -------------------------------------------------------------
  // Test 1: Test Every Entry Category (All 7 playable worlds)
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 1] Testing All 7 Playable Worlds / Categories ---');

  for (const catId of categoriesToTest) {
    totalScenarios++;
    console.log(`\n▶ [CATEGORY TEST] Initializing Category: ${catId.toUpperCase()}`);
    const host = createClient();

    try {
      const hostUser = {
        id: `user_cat_${catId}_${Date.now()}`,
        name: `Host ${catId}`,
        uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        avatar: 'avatar_1'
      };

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout joining ${catId}`)), 5000);

        host.on('connect', () => {
          host.emit('create_room', {
            user: hostUser,
            category: catId,
            mode: 'computer',
            participantCount: 3,
            poolSize: 3, // 3 lots for quick full-lifecycle test
            lotDurationMs: 300,
            pauseDurationMs: 100
          });
        });

        host.on('room_created', ({ roomId }) => {
          clearTimeout(timeout);
          resolve(roomId);
        });
      });

      // Listen for room states and auction finish
      const matchResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Auction did not finish for ${catId}`)), 40000);
        let roomData = null;

        host.on('room_state', (state) => {
          roomData = state;
          if (state.state === 'BUDGET_SELECTION') {
            // Propose and agree budget
            host.emit('propose_budget', {
              roomId: state.id,
              userId: hostUser.id,
              amount: state.categoryConfig.defaultBudget || 100
            });
          } else if (state.state === 'LOBBY') {
            // Select franchise / team if available
            const availableFranchises = state.categoryConfig.franchises || [];
            if (availableFranchises.length > 0) {
              host.emit('select_team', {
                roomId: state.id,
                userId: hostUser.id,
                teamId: availableFranchises[0].id
              });
            }
            host.emit('toggle_ready', { roomId: state.id, userId: hostUser.id });
            host.emit('start_auction', { roomId: state.id, userId: hostUser.id });
          } else if (state.state === 'AUCTION_ACTIVE') {
            // Place a bid if we haven't yet
            if (state.currentBid === 0 && state.currentLeader?.id !== hostUser.id) {
              const base = state.currentPlayer ? state.currentPlayer.basePrice : 5;
              host.emit('place_bid', {
                roomId: state.id,
                userId: hostUser.id,
                amount: Math.round((base + 1) * 10) / 10
              });
            }
          }
        });

        host.on('auction_finished', (analysis) => {
          clearTimeout(timeout);
          resolve({ analysis, roomData });
        });
      });

      // Verify Assertions for Category Lifecycle
      assert.ok(matchResult.analysis, `Category ${catId} must produce AI analysis`);
      assert.ok(Array.isArray(matchResult.analysis.rankings), `Category ${catId} must produce rankings`);
      assert.strictEqual(matchResult.analysis.rankings.length, 3, `Must have 3 ranked participants`);

      // Allow brief moment for disk flush and query authoritative server REST API
      await delay(300);
      const res = await fetch(`http://localhost:4000/api/profile/${encodeURIComponent(hostUser.uniqueId)}`);
      const profileData = await res.json();
      const history = profileData.history || [];
      assert.ok(Array.isArray(history) && history.length >= 1, `Category ${catId} match must be saved to history`);
      assert.strictEqual(history[0].category, catId, `History category must match ${catId}`);

      console.log(`✅ [CATEGORY TEST] ${catId.toUpperCase()} completed full end-to-end lifecycle successfully!`);
      passedScenarios++;
    } catch (err) {
      console.error(`❌ [CATEGORY TEST] Failed for ${catId}:`, err.message);
      throw err;
    } finally {
      host.disconnect();
    }
  }

  // -------------------------------------------------------------
  // Test 2: Test Participant Configurations (Min: 2, Med: 4, Max: 10)
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 2] Testing Participant Counts: Min (2), Med (4), Max (10) ---');

  for (const config of participantConfigs) {
    totalScenarios++;
    console.log(`\n▶ [PARTICIPANT CONFIG] Testing: ${config.label}`);
    const host = createClient();

    try {
      const hostUser = {
        id: `user_pcount_${config.count}_${Date.now()}`,
        name: `Host ${config.count}P`,
        uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        avatar: 'avatar_2'
      };

      let finalState = null;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout on ${config.label}`)), 50000);

        host.on('connect', () => {
          host.emit('create_room', {
            user: hostUser,
            category: 'ipl_cricket',
            mode: 'computer',
            participantCount: config.count,
            poolSize: 3,
            lotDurationMs: 300,
            pauseDurationMs: 100
          });
        });

        host.on('room_state', (state) => {
          finalState = state;
          if (state.state === 'BUDGET_SELECTION') {
            host.emit('vote_budget', { roomId: state.id, userId: hostUser.id, agreed: true });
          } else if (state.state === 'LOBBY') {
            host.emit('toggle_ready', { roomId: state.id, userId: hostUser.id });
            host.emit('start_auction', { roomId: state.id, userId: hostUser.id });
          }
        });

        host.on('auction_finished', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Assertions on Participant Counts & Entity Assignments
      assert.strictEqual(finalState.participants.length, config.count, `Total participants must match config count ${config.count}`);
      
      const human = finalState.participants.find(p => p.id === hostUser.id);
      assert.ok(human, `Human host must be present`);
      assert.strictEqual(human.type, 'HOST', `Human must be HOST type`);

      const ais = finalState.participants.filter(p => p.isAI);
      assert.strictEqual(ais.length, config.count - 1, `AI participants must equal ${config.count - 1}`);

      // Verify No Duplicate Team Ownership
      const teamIds = finalState.participants.map(p => p.teamId).filter(Boolean);
      const uniqueTeams = new Set(teamIds);
      assert.strictEqual(teamIds.length, uniqueTeams.size, `No duplicate teams allowed among ${config.count} participants`);

      console.log(`✅ [PARTICIPANT CONFIG] ${config.label} verified: ${config.count} participants, 0 duplicate teams, 100% synchronized.`);
      passedScenarios++;
    } catch (err) {
      console.error(`❌ [PARTICIPANT CONFIG] Failed for ${config.label}:`, err.message);
      throw err;
    } finally {
      host.disconnect();
    }
  }

  console.log('\n===============================================================');
  console.log(`📊 SUITE 1 SUMMARY: ${passedScenarios}/${totalScenarios} Scenarios Passed (100%)`);
  console.log('===============================================================\n');
  return { totalScenarios, passedScenarios };
}

if (require.main === module) {
  runCategoryAndPlayingMethodsTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL TEST FAILURE:', err);
      process.exit(1);
    });
}

module.exports = { runCategoryAndPlayingMethodsTest };
