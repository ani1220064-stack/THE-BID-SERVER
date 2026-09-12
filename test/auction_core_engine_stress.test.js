const ioClient = require('socket.io-client');
const assert = require('assert');
const http = require('http');
const store = require('../src/services/store');

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
  const outbidEvents = [];
  const stateEvents = [];

  socket.on('player_sold', (d) => soldEvents.push(d));
  socket.on('player_unsold', (d) => unsoldEvents.push(d));
  socket.on('outbid_event', (d) => outbidEvents.push(d));
  socket.on('room_state', (d) => stateEvents.push(d));

  return {
    soldEvents,
    unsoldEvents,
    outbidEvents,
    stateEvents,

    async waitForSold(lotNumber, timeoutMs = 12000) {
      const existing = soldEvents.find(e => e.lotNumber === lotNumber);
      if (existing) return existing;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for SOLD lot ${lotNumber}`)), timeoutMs);
        const onSold = (e) => {
          if (e.lotNumber === lotNumber) {
            clearTimeout(timer);
            socket.off('player_sold', onSold);
            resolve(e);
          }
        };
        socket.on('player_sold', onSold);
      });
    },

    async waitForUnsold(lotNumber, timeoutMs = 12000) {
      const existing = unsoldEvents.find(e => e.lotNumber === lotNumber);
      if (existing) return existing;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for UNSOLD lot ${lotNumber}`)), timeoutMs);
        const onUnsold = (e) => {
          if (e.lotNumber === lotNumber) {
            clearTimeout(timer);
            socket.off('player_unsold', onUnsold);
            resolve(e);
          }
        };
        socket.on('player_unsold', onUnsold);
      });
    },

    async waitForState(predicate, timeoutMs = 12000) {
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

async function runCoreAuctionEngineStressTest() {
  console.log('===============================================================');
  console.log('⚡ QA TEST SUITE 4: CORE LIVE AUCTION & ENGINE STRESS TEST');
  console.log('===============================================================');

  let totalScenarios = 0;
  let passedScenarios = 0;

  // -------------------------------------------------------------
  // Test 1: Bid Validation & Rejection Invariants
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 8A] Authoritative Bid Invariants & Increments ---');
  totalScenarios++;

  const hostSocket = await createClient();
  const guestSocket = await createClient();

  const hostCollector = createEventCollector(hostSocket);
  const guestCollector = createEventCollector(guestSocket);

  const userA = {
    id: `user_bid_a_${Date.now()}`,
    name: 'Bidder Alpha',
    uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    avatar: 'avatar_1'
  };

  const userB = {
    id: `user_bid_b_${Date.now()}`,
    name: 'Bidder Beta',
    uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    avatar: 'avatar_2'
  };

  let testRoomId = null;
  let testRoomCode = null;

  await new Promise((resolve) => {
    hostSocket.on('room_created', ({ roomId, roomCode }) => {
      testRoomId = roomId;
      testRoomCode = roomCode;
      resolve();
    });
    hostSocket.emit('create_room', {
      user: userA,
      category: 'ipl_cricket',
      mode: 'friends',
      lotDurationMs: 3000,
      pauseDurationMs: 1000
    });
  });

  await new Promise((resolve) => {
    guestSocket.on('room_joined', resolve);
    guestSocket.emit('join_room', { roomCode: testRoomCode, user: userB });
  });

  // Host starts the auction
  hostSocket.emit('start_auction', { roomId: testRoomId, userId: userA.id });
  await hostCollector.waitForState(s => s.state === 'AUCTION_ACTIVE');
  await delay(100);

  // Scenario 1: First Bid at Base Price (₹2.0 Cr)
  const firstBidResult = await new Promise((resolve) => {
    hostSocket.once('bid_accepted', resolve);
    hostSocket.emit('place_bid', {
      roomId: testRoomId,
      userId: userA.id,
      amount: 2.0,
      requestId: `req_${Date.now()}_1`
    });
  });

  assert.strictEqual(firstBidResult.amount, 2.0, 'Initial bid must be 2.0 Cr');
  assert.strictEqual(firstBidResult.bidderId, userA.id, 'Bidder must be Alpha');
  assert.strictEqual(firstBidResult.bidVersion, 1, 'First bid version must be 1');
  console.log('    ✓ Valid base price bid accepted (₹2.0 Cr, Version 1).');

  // Scenario 2: Bidder Alpha tries to bid against themselves at the same amount -> REJECTED (ALREADY_LEADER)
  const selfBidResult = await new Promise((resolve) => {
    hostSocket.once('bid_rejected', resolve);
    hostSocket.emit('place_bid', {
      roomId: testRoomId,
      userId: userA.id,
      amount: 2.0,
      requestId: `req_${Date.now()}_2`
    });
  });

  assert.strictEqual(selfBidResult.code, 'ALREADY_LEADER', 'Bidding against oneself must be rejected as ALREADY_LEADER');
  console.log('    ✓ Self-bidding at current amount cleanly rejected (ALREADY_LEADER).');

  // Scenario 3: Bidder Beta tries to bid lower than or equal to current bid -> REJECTED (OUTBID)
  const underbidResult = await new Promise((resolve) => {
    guestSocket.once('bid_rejected', resolve);
    guestSocket.emit('place_bid', {
      roomId: testRoomId,
      userId: userB.id,
      amount: 1.5,
      requestId: `req_${Date.now()}_3`
    });
  });

  assert.strictEqual(underbidResult.code, 'OUTBID', 'Underbidding must be rejected with OUTBID');
  console.log('    ✓ Underbid attempt (₹1.5 Cr vs ₹2.0 Cr) rejected (OUTBID).');

  // Scenario 4: Valid Increment +₹10 Lakh (+0.1 Cr) -> ₹2.1 Cr
  const inc10Lakh = await new Promise((resolve) => {
    guestSocket.once('bid_accepted', resolve);
    guestSocket.emit('place_bid', {
      roomId: testRoomId,
      userId: userB.id,
      amount: 2.1,
      requestId: `req_${Date.now()}_4`
    });
  });
  assert.strictEqual(inc10Lakh.amount, 2.1);
  assert.strictEqual(inc10Lakh.bidderId, userB.id);
  assert.strictEqual(inc10Lakh.bidVersion, 2, 'Monotonic bidVersion must increment to 2');
  console.log('    ✓ +₹10 Lakh increment accepted (₹2.1 Cr, Version 2).');

  // Scenario 5: Valid Increment +₹1 Crore (+1.0 Cr) -> ₹3.1 Cr
  const req5Id = `req_${Date.now()}_5`;
  const inc1Cr = await new Promise((resolve) => {
    hostSocket.once('bid_accepted', resolve);
    hostSocket.emit('place_bid', {
      roomId: testRoomId,
      userId: userA.id,
      amount: 3.1,
      requestId: req5Id
    });
  });
  assert.strictEqual(inc1Cr.amount, 3.1);
  assert.strictEqual(inc1Cr.bidderId, userA.id);
  assert.strictEqual(inc1Cr.bidVersion, 3, 'Monotonic bidVersion must increment to 3');
  console.log('    ✓ +₹1 Crore increment accepted (₹3.1 Cr, Version 3).');

  // Scenario 6: Exceeding Remaining Budget -> REJECTED (INSUFFICIENT_PURSE)
  const overPurseResult = await new Promise((resolve) => {
    guestSocket.once('bid_rejected', resolve);
    guestSocket.emit('place_bid', {
      roomId: testRoomId,
      userId: userB.id,
      amount: 250.0,
      requestId: `req_${Date.now()}_6`
    });
  });
  assert.strictEqual(overPurseResult.code, 'INSUFFICIENT_PURSE', 'Bidding over purse balance must be rejected');
  console.log('    ✓ Bid exceeding purse balance (₹250 Cr vs ₹100 Cr) rejected (INSUFFICIENT_PURSE).');

  // Scenario 7: Duplicate Request ID -> REJECTED (DUPLICATE_REQUEST)
  const dupReqResult = await new Promise((resolve) => {
    hostSocket.once('bid_rejected', resolve);
    hostSocket.emit('place_bid', {
      roomId: testRoomId,
      userId: userA.id,
      amount: 4.0,
      requestId: req5Id // Exact same requestId as Scenario 5
    });
  });
  assert.strictEqual(dupReqResult.code, 'DUPLICATE_REQUEST', 'Duplicate requestId must be rejected');
  console.log('    ✓ Duplicate request ID rejected (DUPLICATE_REQUEST).');

  console.log('  ✅ Bid Validation & Invariant Logic Passed 100%!');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 2: High-Concurrency Rapid-Tapping Bidding War
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 8B] High-Speed Concurrent Bidding War ---');
  totalScenarios++;

  // Launch rapid concurrent bids from both users over 50ms with increasing amounts
  const rapidRequests = [];
  let baseAmount = 4.0;
  for (let i = 0; i < 10; i++) {
    baseAmount += 0.5;
    const isUserA = i % 2 === 0;
    const u = isUserA ? userA : userB;
    const s = isUserA ? hostSocket : guestSocket;
    const reqAmount = Math.round(baseAmount * 10) / 10;
    const reqId = `burst_${Date.now()}_${i}`;

    rapidRequests.push(
      new Promise((res) => {
        let settled = false;
        const cleanup = () => {
          settled = true;
          clearTimeout(timeout);
          s.off('bid_accepted', onAccepted);
          s.off('bid_rejected', onRejected);
        };
        const timeout = setTimeout(() => {
          if (!settled) {
            cleanup();
            res({ status: 'TIMEOUT', amount: reqAmount });
          }
        }, 3000);

        const onAccepted = (data) => {
          if (data.requestId === reqId || data.amount === reqAmount) {
            cleanup();
            res({ status: 'ACCEPTED', amount: reqAmount, bidderId: u.id });
          }
        };
        const onRejected = (data) => {
          if (data.requestId === reqId || data.requestedAmount === reqAmount) {
            cleanup();
            res({ status: 'REJECTED', amount: reqAmount, reason: data.reason });
          }
        };

        s.on('bid_accepted', onAccepted);
        s.on('bid_rejected', onRejected);

        s.emit('place_bid', {
          roomId: testRoomId,
          userId: u.id,
          amount: reqAmount,
          requestId: reqId
        });
      })
    );
    await delay(10);
  }

  const results = await Promise.all(rapidRequests);
  const accepted = results.filter(r => r.status === 'ACCEPTED');
  const rejected = results.filter(r => r.status === 'REJECTED');

  console.log(`    Rapid Burst of 10 Bids: ${accepted.length} Accepted, ${rejected.length} Rejected (Outbid/Displaced).`);
  assert.ok(accepted.length > 0, 'At least one rapid bid must be accepted');

  const topAcceptedBid = accepted[accepted.length - 1];
  console.log(`    High Accepted Burst Bid: ₹${topAcceptedBid.amount} Cr`);

  console.log('  ✅ Rapid Concurrent Bidding War Stress Passed!');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 3: Timer Countdown, Resets & Resolution (SOLD & UNSOLD)
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 9] Timer Mechanics, Resets & Expiration ---');
  totalScenarios++;

  // A. Lot 1 Timer Expiration -> SOLD Resolution
  console.log('    Waiting for Lot 1 timer to expire and resolve as SOLD...');
  const soldEvent = await hostCollector.waitForSold(1);

  assert.strictEqual(soldEvent.amount, topAcceptedBid.amount, 'Sold price must match winning burst bid');
  assert.strictEqual(soldEvent.winner.id, topAcceptedBid.bidderId, 'Winner must match top bidder');
  console.log(`    ✓ Lot 1 correctly resolved as SOLD: ${soldEvent.player.name} to ${soldEvent.winner.name} for ₹${soldEvent.amount} Cr.`);

  // B. Exact Budget Formula Verification for Winner
  const postSoldState = await hostCollector.waitForState(s => s.state === 'SOLD' || s.currentLotNumber >= 2);
  const winningParticipant = postSoldState.participants.find(p => p.id === soldEvent.winner.id);
  const expectedPurse = Math.round((winningParticipant.startingBudget - soldEvent.amount) * 10) / 10;
  assert.strictEqual(winningParticipant.purse, expectedPurse, 'Winner purse must equal startingBudget - soldPrice');
  console.log(`    ✓ Exact Budget Formula Verified: ₹${winningParticipant.startingBudget} Cr - ₹${soldEvent.amount} Cr = ₹${winningParticipant.purse} Cr.`);

  // C. Lot 2: Timer Reset Verification
  console.log('    Waiting for Lot 2 to activate to test Timer Reset on Outbid...');
  await hostCollector.waitForState(s => s.currentLotNumber === 2 && s.state === 'AUCTION_ACTIVE');

  // User A places initial bid
  const lot2Base = 2.0;
  await new Promise((resolve) => {
    hostSocket.once('bid_accepted', resolve);
    hostSocket.emit('place_bid', {
      roomId: testRoomId,
      userId: userA.id,
      amount: lot2Base,
      requestId: `lot2_bid1_${Date.now()}`
    });
  });

  // User B places outbid and verifies outbid_event declared timerReset
  const timerResetState = await new Promise((resolve) => {
    guestSocket.once('outbid_event', resolve);
    guestSocket.emit('place_bid', {
      roomId: testRoomId,
      userId: userB.id,
      amount: lot2Base + 1.0,
      requestId: `lot2_bid2_${Date.now()}`
    });
  });

  assert.strictEqual(timerResetState.timerReset, 10, 'Outbid event must declare timer reset');
  console.log('    ✓ Valid outbid declared timer reset back to full duration.');

  // D. Lot 3: UNSOLD Resolution (Let timer expire with 0 bids)
  console.log('    Waiting for Lot 3 to activate to test UNSOLD lifecycle...');
  await hostCollector.waitForState(s => s.currentLotNumber === 3 && s.state === 'AUCTION_ACTIVE');

  const unsoldEvent = await hostCollector.waitForUnsold(3);
  assert.ok(unsoldEvent.player, 'Unsold event must specify player');
  assert.strictEqual(unsoldEvent.lotNumber, 3, 'Unsold lot must be Lot 3');
  console.log(`    ✓ Lot 3 correctly resolved as UNSOLD: ${unsoldEvent.player.name} (0 bids).`);

  // Verify UNSOLD player did not deduct anyone's purse
  const postUnsoldState = await hostCollector.waitForState(s => s.currentLotNumber >= 4 || s.state === 'UNSOLD');
  for (const p of postUnsoldState.participants) {
    const totalSpent = p.squad.reduce((sum, item) => sum + (item.soldPrice || 0), 0);
    const expected = Math.round((p.startingBudget - totalSpent) * 10) / 10;
    assert.strictEqual(p.purse, expected, `Participant ${p.name} purse must remain mathematically intact`);
  }
  console.log('    ✓ Zero purse deductions on UNSOLD lot.');

  console.log('  ✅ Timer Countdown, Resets & Resolution Passed 100%!');
  passedScenarios++;

  // -------------------------------------------------------------
  // Test 4: Mid-Auction Disconnect & State Resynchronization
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 18] Reconnect & Resynchronization Stress ---');
  totalScenarios++;

  // Wait for Lot 4 to start
  console.log('    Waiting for Lot 4 to activate...');
  await hostCollector.waitForState(s => s.currentLotNumber === 4 && s.state === 'AUCTION_ACTIVE');

  console.log('    Simulating Guest client sudden network disconnect during active auction lot...');
  guestSocket.disconnect();
  await delay(200);

  // Reconnect with new socket connection
  console.log('    Guest reconnecting with fresh socket...');
  const reconnectedGuest = await createClient();
  const reconnectedCollector = createEventCollector(reconnectedGuest);

  reconnectedGuest.emit('join_room', {
    roomId: testRoomId,
    user: userB
  });

  const reconnectedState = await reconnectedCollector.waitForState(s => s.id === testRoomId && s.currentLotNumber === 4);
  assert.strictEqual(reconnectedState.id, testRoomId, 'Must reconnect to same room');
  assert.strictEqual(reconnectedState.currentLotNumber, 4, 'Must maintain correct lot number');
  console.log(`    ✓ Reconnected cleanly to Lot 4. Active item: ${reconnectedState.currentItem.name}.`);

  // Place a valid bid from the reconnected socket to verify full bidirectional synchronization
  const reconnectBid = await new Promise((resolve) => {
    reconnectedGuest.once('bid_accepted', resolve);
    reconnectedGuest.emit('place_bid', {
      roomId: testRoomId,
      userId: userB.id,
      amount: reconnectedState.currentItem.basePrice || 2.0,
      requestId: `reconnect_bid_${Date.now()}`
    });
  });

  assert.strictEqual(reconnectBid.bidderId, userB.id, 'Bid from reconnected client must be accepted');
  console.log('    ✓ Reconnected client successfully placed authoritative bid.');

  console.log('  ✅ Reconnect & Mid-Auction Resync Passed 100%!');
  passedScenarios++;

  // Cleanup room 1
  hostSocket.disconnect();
  reconnectedGuest.disconnect();

  // -------------------------------------------------------------
  // Test 5: Full Computer Match & Duplicate Inventory Prevention
  // -------------------------------------------------------------
  console.log('\n--- [SECTION 12 & 14] Exhaustive Match Audit & Duplicate Item Prevention ---');
  totalScenarios++;

  const fullMatchClient = await createClient();
  const humanUser = {
    id: `user_full_${Date.now()}`,
    name: 'Auditor Human',
    uniqueId: `BID-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    avatar: 'avatar_3'
  };

  let fullRoomId = null;

  // Fast test configuration: lotDurationMs: 400ms, pauseDurationMs: 200ms
  // Conducts full 15 lots in ~9 seconds!
  await new Promise((resolve) => {
    fullMatchClient.on('room_created', ({ roomId }) => {
      fullRoomId = roomId;
      resolve();
    });
    fullMatchClient.emit('create_room', {
      user: humanUser,
      category: 'ipl_cricket',
      mode: 'computer',
      participantCount: 4,
      aiDifficulty: 'HIGH',
      poolSize: 4,
      lotDurationMs: 400,
      pauseDurationMs: 200
    });
  });

  const fullCollector = createEventCollector(fullMatchClient);

  // Track every lot auctioned
  const seenLotSequence = [];
  const auctionedItemIds = new Set();
  let duplicateItemsDetected = 0;

  fullMatchClient.on('player_sold', (data) => {
    seenLotSequence.push({ lot: data.lotNumber, status: 'SOLD', id: data.player.id, name: data.player.name });
    if (auctionedItemIds.has(data.player.id)) {
      duplicateItemsDetected++;
      console.error(`🚨 DUPLICATE PLAYER DETECTED IN LOT ${data.lotNumber}: ${data.player.name} (${data.player.id})`);
    } else {
      auctionedItemIds.add(data.player.id);
    }
  });

  fullMatchClient.on('player_unsold', (data) => {
    seenLotSequence.push({ lot: data.lotNumber, status: 'UNSOLD', id: data.player.id, name: data.player.name });
    if (auctionedItemIds.has(data.player.id)) {
      duplicateItemsDetected++;
      console.error(`🚨 DUPLICATE PLAYER DETECTED IN LOT ${data.lotNumber}: ${data.player.name} (${data.player.id})`);
    } else {
      auctionedItemIds.add(data.player.id);
    }
  });

  // Vote budget -> transitions to LOBBY
  fullMatchClient.emit('vote_budget', { roomId: fullRoomId, userId: humanUser.id, agreed: true });
  await fullCollector.waitForState(s => s.state === 'LOBBY');

  // Toggle ready & start auction -> transitions to AUCTION_ACTIVE
  fullMatchClient.emit('toggle_ready', { roomId: fullRoomId, userId: humanUser.id });
  fullMatchClient.emit('start_auction', { roomId: fullRoomId, userId: humanUser.id });

  // Wait for auction to complete
  console.log('    Running full 15-lot match with HIGH AI bots...');
  const finalResultsState = await fullCollector.waitForState(s => s.state === 'RESULTS', 35000);

  console.log(`    Total Lots Auctioned: ${seenLotSequence.length}`);
  console.log(`    Unique Items Auctioned: ${auctionedItemIds.size}`);
  console.log(`    Duplicate Count: ${duplicateItemsDetected}`);

  // CRITICAL AUDIT: Every lot item must be 100% unique!
  assert.strictEqual(duplicateItemsDetected, 0, 'Duplicate item count must be exactly 0');
  assert.strictEqual(auctionedItemIds.size, seenLotSequence.length, 'Unique item IDs must equal total lots');
  console.log('    ✓ Absolute Invariant Verified: Every item/player appeared exactly once.');

  // Results & AI Analysis Verification
  assert.ok(finalResultsState.participants.length >= 4, 'Must display all participants');
  for (const part of finalResultsState.participants) {
    const totalSpent = part.squad.reduce((sum, item) => sum + (item.soldPrice || 0), 0);
    const expectedRemaining = Math.round((part.startingBudget - totalSpent) * 10) / 10;
    assert.strictEqual(part.purse, expectedRemaining, `Participant ${part.name} purse must be mathematically exact`);
  }
  console.log('    ✓ Mathematical integrity verified for all 4 participants.');

  // Verify AI Analysis Generated
  assert.ok(finalResultsState.analysis, 'AI analysis must be generated on auction conclusion');
  assert.ok(finalResultsState.analysis.winner, 'AI analysis must declare winner');
  assert.ok(finalResultsState.analysis.rankings && finalResultsState.analysis.rankings.length > 0, 'Rankings must be populated');
  console.log(`    ✓ AI Analysis Verified: Winner "${finalResultsState.analysis.winner.name}" | MVP "${finalResultsState.analysis.mvp ? finalResultsState.analysis.mvp.name : 'N/A'}".`);

  // Verify Match History Saved in Backend Store
  await delay(300);
  const profile = await fetchJson(`${SERVER_URL}/api/profile/${humanUser.uniqueId}`);
  const history = profile.matchHistory || profile.history || [];
  assert.ok(Array.isArray(history) && history.length >= 1, 'Match history must be accessible');
  assert.strictEqual(history[0].category, 'ipl_cricket', 'Match category must be ipl_cricket');
  console.log('    ✓ Match persistently saved to player profile history.');

  console.log('  ✅ Exhaustive Match Audit & Duplicate Prevention Passed 100%!');
  passedScenarios++;

  fullMatchClient.disconnect();

  console.log('\n===============================================================');
  console.log(`📊 SUITE 4 SUMMARY: ${passedScenarios}/${totalScenarios} Scenarios Passed (100%)`);
  console.log('===============================================================\n');
  return { totalScenarios, passedScenarios };
}

if (require.main === module) {
  runCoreAuctionEngineStressTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL TEST FAILURE:', err);
      process.exit(1);
    });
}

module.exports = { runCoreAuctionEngineStressTest };
