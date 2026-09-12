const ioClient = require('socket.io-client');
const assert = require('assert');
const http = require('http');

const SERVER_URL = 'http://localhost:4000';

async function createClient() {
  const socket = ioClient(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
  if (socket.connected) return socket;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(t);
      resolve();
    });
    socket.once('connect_error', reject);
  });
  return socket;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function createEventCollector(socket) {
  const soldEvents = [];
  const unsoldEvents = [];
  const stateEvents = [];

  socket.on('player_sold', (d) => soldEvents.push(d));
  socket.on('player_unsold', (d) => unsoldEvents.push(d));
  socket.on('room_state', (d) => stateEvents.push(d));

  return {
    soldEvents,
    unsoldEvents,
    stateEvents,

    async waitForState(predicate, timeoutMs = 25000) {
      const existing = stateEvents.find(predicate);
      if (existing) return existing;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for room_state')), timeoutMs);
        const onState = (s) => {
          if (predicate(s)) {
            clearTimeout(timer);
            socket.off('room_state', onState);
            resolve(s);
          }
        };
        socket.on('room_state', onState);
      });
    }
  };
}

async function playSingleMatch({
  matchIndex,
  category,
  participantCount,
  aiDifficulty,
  humanStrategy, // 'NORMAL', 'WIN_HEAVILY', 'LOSE_HEAVILY', 'CONSERVATIVE_UNSOLD', 'AGGRESSIVE'
  poolSize = 3,
  humanUser
}) {
  const socket = await createClient();
  const collector = createEventCollector(socket);
  let roomId = null;

  await new Promise((resolve) => {
    socket.on('room_created', (data) => {
      roomId = data.roomId;
      resolve();
    });
    socket.emit('create_room', {
      user: humanUser,
      category,
      mode: 'computer',
      participantCount,
      aiDifficulty,
      poolSize,
      lotDurationMs: 400,
      pauseDurationMs: 200
    });
  });

  // State: BUDGET_SELECTION -> Vote budget
  socket.emit('vote_budget', { roomId, userId: humanUser.id, agreed: true });
  await collector.waitForState(s => s.state === 'LOBBY');

  // State: LOBBY -> Toggle ready and start auction
  socket.emit('toggle_ready', { roomId, userId: humanUser.id });
  socket.emit('start_auction', { roomId, userId: humanUser.id });

  // Handle active lots according to human strategy
  const lotsHandled = new Set();
  socket.on('room_state', (state) => {
    if (state.state === 'AUCTION_ACTIVE' && state.currentPlayer) {
      const p = state.participants.find(x => x.id === humanUser.id);
      const remainingPurse = p ? p.purse : 100;

      if (humanStrategy === 'WIN_HEAVILY') {
        if (state.currentLeader?.id !== humanUser.id) {
          const nextBid = state.currentBid === 0 ? state.currentPlayer.basePrice : Math.round((state.currentBid + 1.0) * 10) / 10;
          if (nextBid <= remainingPurse) {
            socket.emit('place_bid', {
              roomId,
              userId: humanUser.id,
              amount: nextBid,
              requestId: `win_heavy_${Date.now()}_${state.currentLotNumber}_${Math.random()}`
            });
          }
        }
      } else if (!lotsHandled.has(state.currentLotNumber)) {
        lotsHandled.add(state.currentLotNumber);
        const item = state.currentPlayer;
        const base = item.basePrice || 2.0;

        if (humanStrategy === 'LOSE_HEAVILY' || humanStrategy === 'CONSERVATIVE_UNSOLD') {
          // Human places zero bids, letting AI sweep or items go unsold
        } else if (humanStrategy === 'AGGRESSIVE') {
          // Human bids moderately high
          socket.emit('place_bid', {
            roomId,
            userId: humanUser.id,
            amount: Math.round((base + 8.0) * 10) / 10,
            requestId: `aggr_${Date.now()}_${state.currentLotNumber}`
          });
        } else {
          // NORMAL: Human bids on odd lots
          if (state.currentLotNumber % 2 === 1) {
            socket.emit('place_bid', {
              roomId,
              userId: humanUser.id,
              amount: Math.round((base + 2.0) * 10) / 10,
              requestId: `norm_${Date.now()}_${state.currentLotNumber}`
            });
          }
        }
      }
    }
  });

  const finalState = await collector.waitForState(s => s.state === 'RESULTS', 25000);

  // Assertions for match integrity
  assert.ok(finalState.analysis, 'Must have AI analysis');
  assert.ok(Array.isArray(finalState.participants), 'Must list participants');
  for (const p of finalState.participants) {
    const totalSpent = p.squad.reduce((sum, item) => sum + (item.soldPrice || 0), 0);
    const expected = Math.round((p.startingBudget - totalSpent) * 10) / 10;
    assert.strictEqual(p.purse, expected, `Purse invariant failed for ${p.name}`);
  }

  socket.disconnect();
  return { finalState, soldCount: collector.soldEvents.length, unsoldCount: collector.unsoldEvents.length };
}

async function runMultiMatchTournamentStressTest() {
  console.log('===============================================================');
  console.log('🏆 QA TEST SUITE 5: 8-MATCH CONTINUOUS TOURNAMENT & STRESS TEST');
  console.log('===============================================================');

  let totalScenarios = 0;
  let passedScenarios = 0;

  const tournamentHuman = {
    id: `user_tourney_${Date.now()}`,
    name: 'Tournament Champion',
    uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    avatar: 'avatar_5'
  };

  const matchesConfig = [
    { name: 'Match 1: Normal Gameplay', category: 'ipl_cricket', participants: 4, ai: 'MEDIUM', strategy: 'NORMAL' },
    { name: 'Match 2: Different Category', category: 'fifa_football', participants: 3, ai: 'HIGH', strategy: 'NORMAL' },
    { name: 'Match 3: Different Participant Count', category: 'formula_1', participants: 2, ai: 'LOW', strategy: 'NORMAL' },
    { name: 'Match 4: Human Wins Heavily', category: 'nba', participants: 4, ai: 'MEDIUM', strategy: 'WIN_HEAVILY' },
    { name: 'Match 5: Human Loses Heavily (AI Sweep)', category: 'movie_stars', participants: 3, ai: 'HIGH', strategy: 'LOSE_HEAVILY' },
    { name: 'Match 6: Conservative / Unsold Lots', category: 'luxury_cars', participants: 2, ai: 'LOW', strategy: 'CONSERVATIVE_UNSOLD' },
    { name: 'Match 7: Aggressive Bidding War', category: 'luxury_collection', participants: 4, ai: 'HIGH', strategy: 'AGGRESSIVE' },
    { name: 'Match 8: Final Championship Match', category: 'ipl_cricket', participants: 4, ai: 'HIGH', strategy: 'NORMAL' }
  ];

  const initialMemory = process.memoryUsage();
  console.log(`\n  [Memory Baseline] Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB | RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB\n`);

  for (let i = 0; i < matchesConfig.length; i++) {
    const cfg = matchesConfig[i];
    console.log(`--- [SECTION 17] Executing ${cfg.name} ---`);
    console.log(`    Category: ${cfg.category.toUpperCase()} | Participants: ${cfg.participants} | AI: ${cfg.ai} | Strategy: ${cfg.strategy}`);
    totalScenarios++;

    const startTime = Date.now();
    const result = await playSingleMatch({
      matchIndex: i + 1,
      category: cfg.category,
      participantCount: cfg.participants,
      aiDifficulty: cfg.ai,
      humanStrategy: cfg.strategy,
      poolSize: 3,
      humanUser: tournamentHuman
    });

    const elapsed = Date.now() - startTime;
    const winner = result.finalState.analysis?.winner?.name || 'Unknown';
    console.log(`    ✓ Completed in ${elapsed}ms | Winner: ${winner} | SOLD: ${result.soldCount} | UNSOLD: ${result.unsoldCount}`);

    // Verify Strategy Outcomes
    if (cfg.strategy === 'WIN_HEAVILY') {
      const humanParticipant = result.finalState.participants.find(p => p.id === tournamentHuman.id);
      assert.ok(humanParticipant.squad.length > 0, 'Human must win items under WIN_HEAVILY');
      console.log(`    ✓ Verified Human won ${humanParticipant.squad.length} assets.`);
    } else if (cfg.strategy === 'LOSE_HEAVILY') {
      const humanParticipant = result.finalState.participants.find(p => p.id === tournamentHuman.id);
      assert.strictEqual(humanParticipant.squad.length, 0, 'Human must have 0 assets under LOSE_HEAVILY');
      console.log('    ✓ Verified Human preserved 100% budget and won 0 assets.');
    }

    passedScenarios++;
    await delay(150); // brief inter-match cooldown
  }

  // Final Memory and Performance Audit
  const finalMemory = process.memoryUsage();
  const heapDeltaMb = ((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2);
  console.log('\n--- [SECTION 19] Performance, Memory & Stability Audit ---');
  console.log(`  Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Final Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB (Delta: ${heapDeltaMb} MB)`);
  console.log(`  Final RSS: ${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB`);
  assert.ok(Math.abs(Number(heapDeltaMb)) < 150, 'Heap growth across 8 matches must be within safe boundary (<150MB)');
  console.log('  ✅ Memory and performance remain exceptionally stable after 8 consecutive matches!');
  totalScenarios++;
  passedScenarios++;

  // Profile History & Persistent Record Audit
  console.log('\n--- [SECTION 15 & 20] Profile Match History & Trophy Audit ---');
  totalScenarios++;
  await delay(300);
  const profile = await fetchJson(`${SERVER_URL}/api/profile/${tournamentHuman.uniqueId}`);
  const history = profile.matchHistory || profile.history || [];

  console.log(`  Player BID ID: ${tournamentHuman.uniqueId}`);
  console.log(`  Total Saved Matches: ${history.length} / 8`);

  assert.strictEqual(history.length, 8, 'Player profile must have exactly 8 saved matches');

  // Verify all categories exist in history
  const recordedCategories = history.map(h => h.category);
  assert.ok(recordedCategories.includes('ipl_cricket'), 'Must include ipl_cricket');
  assert.ok(recordedCategories.includes('fifa_football'), 'Must include fifa_football');
  assert.ok(recordedCategories.includes('formula_1'), 'Must include formula_1');
  assert.ok(recordedCategories.includes('nba'), 'Must include nba');
  assert.ok(recordedCategories.includes('movie_stars'), 'Must include movie_stars');
  assert.ok(recordedCategories.includes('luxury_cars'), 'Must include luxury_cars');
  assert.ok(recordedCategories.includes('luxury_collection'), 'Must include luxury_collection');

  console.log('  ✅ All 7 categories successfully verified in persistent match history!');
  passedScenarios++;

  console.log('\n===============================================================');
  console.log(`📊 SUITE 5 SUMMARY: ${passedScenarios}/${totalScenarios} Scenarios Passed (100%)`);
  console.log('===============================================================\n');
  return { totalScenarios, passedScenarios };
}

if (require.main === module) {
  runMultiMatchTournamentStressTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL TEST FAILURE:', err);
      process.exit(1);
    });
}

module.exports = { runMultiMatchTournamentStressTest };
