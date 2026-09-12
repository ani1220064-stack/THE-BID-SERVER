const ioClient = require('socket.io-client');
const assert = require('assert');
const { AuctionBot } = require('../src/ai/AuctionBot');

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

async function runAIIntelligenceLevelsStressTest() {
  console.log('===============================================================');
  console.log('🤖 QA TEST SUITE 2: AI INTELLIGENCE LEVELS (LOW, MEDIUM, HIGH)');
  console.log('===============================================================');

  let totalScenarios = 0;
  let passedScenarios = 0;

  // -------------------------------------------------------------
  // Test 1: Algorithmic Comparative Valuation Test
  // -------------------------------------------------------------
  console.log('\n--- [AI SECTION 1] Algorithmic Valuation & Decision Comparative Analysis ---');
  totalScenarios++;

  const lowBot = new AuctionBot({ id: 'bot_low', name: 'Low AI', difficulty: 'LOW' });
  const medBot = new AuctionBot({ id: 'bot_med', name: 'Med AI', difficulty: 'MEDIUM' });
  const highBot = new AuctionBot({ id: 'bot_high', name: 'High AI', difficulty: 'HIGH' });

  // Test player: Top Tier S-rank Marquee Cricketer
  const marqueePlayer = {
    id: 'ipl-01',
    name: 'Virat Kohli',
    role: 'Batsman',
    tier: 'S',
    rating: 94,
    basePrice: 2.0,
    estimatedValuation: { min: 14.0, max: 20.0 } // Mid = 17.0
  };

  const currentSquadEmpty = [];
  const totalStartingBudget = 100.0;
  const purse = 100.0;

  const context = {
    remainingPool: [
      { id: 'ipl-02', name: 'Rohit Sharma', role: 'Batsman' },
      { id: 'ipl-03', name: 'Jasprit Bumrah', role: 'Bowler' },
      { id: 'ipl-04', name: 'Hardik Pandya', role: 'All-Rounder' }
    ],
    currentLotIndex: 1,
    totalPoolSize: 10,
    opponents: [
      { id: 'human_1', purse: 40.0 }, // Opponents are cash-starved
      { id: 'bot_2', purse: 35.0 }
    ]
  };

  const lowMax = lowBot.calculateMaxBid(marqueePlayer, purse, currentSquadEmpty, totalStartingBudget, context);
  const medMax = medBot.calculateMaxBid(marqueePlayer, purse, currentSquadEmpty, totalStartingBudget, context);
  const highMax = highBot.calculateMaxBid(marqueePlayer, purse, currentSquadEmpty, totalStartingBudget, context);

  console.log(`  Valuation for Marquee Asset (${marqueePlayer.name}):`);
  console.log(`    🟢 LOW AI Max Willingness:   ₹${lowMax} Cr`);
  console.log(`    🟡 MEDIUM AI Max Willingness: ₹${medMax} Cr`);
  console.log(`    🔴 HIGH AI Max Willingness:  ₹${highMax} Cr`);

  // Assertive Validation: HIGH must value marquee assets significantly higher than LOW
  assert.ok(lowMax < medMax, `LOW AI (${lowMax}) must bid more conservatively than MEDIUM (${medMax})`);
  assert.ok(medMax < highMax, `MEDIUM AI (${medMax}) must bid more conservatively than HIGH (${highMax})`);
  assert.ok(highMax > lowMax * 1.25, `HIGH AI should have at least 25% higher willingness for marquee S-tier asset than LOW AI`);

  console.log('  ✅ Marquee Asset Comparative Valuation Passed!');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 2: Budget Protection & Reserve Discipline
  // -------------------------------------------------------------
  console.log('\n--- [AI SECTION 2] Budget Protection & Scarcity Reserve Discipline ---');
  totalScenarios++;

  const depletedPurse = 12.0; // Low remaining purse
  const smallSquad = [{ id: 'p1', role: 'Batsman' }]; // Needs 3 more spots

  const cheapPlayer = {
    id: 'ipl-99',
    name: 'Young Talent',
    role: 'Bowler',
    tier: 'B',
    basePrice: 0.5,
    estimatedValuation: { min: 2.0, max: 4.0 }
  };

  const lowDepleted = lowBot.calculateMaxBid(cheapPlayer, depletedPurse, smallSquad, totalStartingBudget, context);
  const highDepleted = highBot.calculateMaxBid(cheapPlayer, depletedPurse, smallSquad, totalStartingBudget, context);

  console.log(`  Purse Protection with Low Budget (₹${depletedPurse} Cr remaining):`);
  console.log(`    🟢 LOW AI Cap:  ₹${lowDepleted} Cr`);
  console.log(`    🔴 HIGH AI Cap: ₹${highDepleted} Cr`);

  // HIGH AI must protect its reserve more strictly to ensure remaining spots are filled
  assert.ok(highDepleted <= depletedPurse * 0.85, `HIGH AI must enforce strict ceiling when purse is depleted`);
  console.log('  ✅ Budget Protection & Reserve Discipline Passed!');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 3: Self-Bidding Prevention & Disciplined Stopping
  // -------------------------------------------------------------
  console.log('\n--- [AI SECTION 3] Self-Bidding Prevention & Disciplined Drop-Out ---');
  totalScenarios++;

  // Bot is current leader: evaluateBid MUST return null
  const selfLeadingDecision = highBot.evaluateBid(
    marqueePlayer,
    15.0,
    highBot.id, // HighBot is currently leading!
    90.0,
    [],
    100.0,
    8,
    context
  );
  assert.strictEqual(selfLeadingDecision, null, `Bot must NEVER outbid itself`);

  // Proposed bid exceeds bot's maximum willingness: MUST return null (Drop out)
  const excessiveBidDecision = highBot.evaluateBid(
    marqueePlayer,
    80.0, // Bid already reached 80 Cr (well above max bid)
    'other_user',
    90.0,
    [],
    100.0,
    8,
    context
  );
  assert.strictEqual(excessiveBidDecision, null, `Bot must cleanly drop out when bid exceeds valuation`);

  console.log('  ✅ Self-Bidding Prevention & Disciplined Drop-Out Passed!');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 4: Reaction Delay Variance (Timing Heuristics)
  // -------------------------------------------------------------
  console.log('\n--- [AI SECTION 4] Reaction Speed & Timing Analysis ---');
  totalScenarios++;

  let lowTotalDelay = 0;
  let highTotalDelay = 0;
  const samples = 100;

  for (let i = 0; i < samples; i++) {
    const dLow = lowBot.evaluateBid(marqueePlayer, 2.0, 'other', 100.0, [], 100.0, 9, context);
    const dHigh = highBot.evaluateBid(marqueePlayer, 2.0, 'other', 100.0, [], 100.0, 9, context);
    if (dLow) lowTotalDelay += dLow.delayMs;
    if (dHigh) highTotalDelay += dHigh.delayMs;
  }

  const avgLowDelay = Math.round(lowTotalDelay / samples);
  const avgHighDelay = Math.round(highTotalDelay / samples);

  console.log(`  Reaction Delays over ${samples} decisions:`);
  console.log(`    🟢 LOW AI Average Reaction:  ${avgLowDelay} ms`);
  console.log(`    🔴 HIGH AI Average Reaction: ${avgHighDelay} ms`);

  assert.ok(avgHighDelay < avgLowDelay, `HIGH AI (${avgHighDelay}ms) must react faster on average than LOW AI (${avgLowDelay}ms)`);
  console.log('  ✅ Reaction Timing Variance Passed!');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 5: Live Auction Behavioral Difference (LOW vs HIGH Rooms)
  // -------------------------------------------------------------
  console.log('\n--- [AI SECTION 5] Live Auction Gameplay: LOW AI vs HIGH AI Room Test ---');

  for (const testDiff of ['LOW', 'HIGH']) {
    totalScenarios++;
    console.log(`\n▶ [LIVE AI MATCH] Starting Live Auction with Difficulty: ${testDiff}`);
    const host = createClient();

    try {
      const hostUser = {
        id: `user_ai_${testDiff.toLowerCase()}_${Date.now()}`,
        name: `Host vs ${testDiff}`,
        uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        avatar: 'avatar_3'
      };

      let lotsConducted = 0;
      let totalBidsRecorded = 0;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout in ${testDiff} AI match`)), 40000);

        host.on('connect', () => {
          host.emit('create_room', {
            user: hostUser,
            category: 'ipl_cricket',
            mode: 'computer',
            participantCount: 3, // 1 host + 2 bots
            poolSize: 3,
            aiDifficulty: testDiff,
            lotDurationMs: 300,
            pauseDurationMs: 100
          });
        });

        host.on('room_state', (state) => {
          if (state.state === 'BUDGET_SELECTION') {
            host.emit('vote_budget', { roomId: state.id, userId: hostUser.id, agreed: true });
          } else if (state.state === 'LOBBY') {
            host.emit('toggle_ready', { roomId: state.id, userId: hostUser.id });
            host.emit('start_auction', { roomId: state.id, userId: hostUser.id });
          }
        });

        host.on('outbid_event', (event) => {
          totalBidsRecorded++;
        });

        host.on('player_sold', () => {
          lotsConducted++;
        });

        host.on('player_unsold', () => {
          lotsConducted++;
        });

        host.on('auction_finished', (analysis) => {
          clearTimeout(timeout);
          resolve(analysis);
        });
      });

      console.log(`  ✅ [LIVE AI MATCH] ${testDiff} Auction Finished: ${lotsConducted} lots conducted, ${totalBidsRecorded} live bids placed.`);
      assert.strictEqual(lotsConducted, 3, `All 3 lots must be resolved`);
      passedScenarios++;
    } catch (err) {
      console.error(`❌ [LIVE AI MATCH] Failed for ${testDiff}:`, err.message);
      throw err;
    } finally {
      host.disconnect();
    }
  }

  console.log('\n===============================================================');
  console.log(`📊 SUITE 2 SUMMARY: ${passedScenarios}/${totalScenarios} Scenarios Passed (100%)`);
  console.log('===============================================================\n');
  return { totalScenarios, passedScenarios };
}

if (require.main === module) {
  runAIIntelligenceLevelsStressTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL TEST FAILURE:', err);
      process.exit(1);
    });
}

module.exports = { runAIIntelligenceLevelsStressTest };
