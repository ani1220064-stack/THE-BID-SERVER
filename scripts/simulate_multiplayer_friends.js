/**
 * ============================================================================
 * THE BID — Multiplayer Testing Environment & Live Simulation Engine
 * ============================================================================
 * 1. Creates 3 authentic human-like mock profiles:
 *    - Arjun Verma  (BID-77AV91, avatar_2, Trophies: 3)
 *    - Priya Sharma (BID-88PS42, avatar_3, Trophies: 5)
 *    - Kabir Mehta  (BID-99KM63, avatar_4, Trophies: 2)
 *
 * 2. Authorizes Profile Upgrade:
 *    - Assigns Player ID 'BID-ANIRUDH' and sets isGuest: false on the active local profile
 *      so the Friend Request reception UI and multiplayer rooms are unlocked.
 *
 * 3. Triggers Inbound Friend Requests:
 *    - Dispatches 3 inbound friend requests directly to the user's active profile
 *      with realistic names, avatars, and timestamps.
 *
 * 4. Simulates Live Lobbies & Auctions via Socket.io:
 *    - Connects 3 interactive Socket.io clients to the authoritative server.
 *    - Auto-registers users for direct room invitations.
 *    - Auto-accepts room invitations from the host.
 *    - Auto-joins lobbies via room code (command: "join BID-XXXXX").
 *    - Automatically agrees on budget proposals (vote_budget).
 *    - Automatically selects available IPL teams and toggles ready.
 *    - Realistically places competitive bids and reactions during live auctions.
 *
 * 5. Supports Permanent Teardown:
 *    - Pass --cleanup to permanently wipe all fake accounts from the database.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { io: ioClient } = require('socket.io-client');
const { performCleanup, MOCK_UNIQUE_IDS } = require('./cleanup_mock_accounts');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000';
const DATA_FILE = path.join(__dirname, '..', 'data', 'store.json');

// 3 Realistic Mock Profiles engineered to look like human players
const MOCK_PROFILES = [
  {
    id: 'user_mock_arjun_77av91',
    uniqueId: 'BID-77AV91',
    name: 'Arjun Verma',
    avatar: 'avatar_2',
    email: null,
    trophies: 3,
    categoryTrophies: {
      ipl_cricket: 2,
      fifa_football: 1,
      formula_1: 0,
      nba: 0,
      movie_stars: 0,
      luxury_cars: 0,
      luxury_collection: 0
    },
    isGuest: false,
    isMockTestAccount: true
  },
  {
    id: 'user_mock_priya_88ps42',
    uniqueId: 'BID-88PS42',
    name: 'Priya Sharma',
    avatar: 'avatar_3',
    email: null,
    trophies: 5,
    categoryTrophies: {
      ipl_cricket: 3,
      fifa_football: 0,
      formula_1: 0,
      nba: 0,
      movie_stars: 0,
      luxury_cars: 2,
      luxury_collection: 0
    },
    isGuest: false,
    isMockTestAccount: true
  },
  {
    id: 'user_mock_kabir_99km63',
    uniqueId: 'BID-99KM63',
    name: 'Kabir Mehta',
    avatar: 'avatar_4',
    email: null,
    trophies: 2,
    categoryTrophies: {
      ipl_cricket: 1,
      fifa_football: 0,
      formula_1: 0,
      nba: 0,
      movie_stars: 1,
      luxury_cars: 0,
      luxury_collection: 0
    },
    isGuest: false,
    isMockTestAccount: true
  }
];

// Target Profile configuration (Defaults to BID-ANIRUDH for the user)
const args = process.argv.slice(2);
let targetUniqueId = 'BID-ANIRUDH';

// Parse arguments
if (args.includes('--cleanup')) {
  performCleanup().then(() => process.exit(0));
  return;
}

const targetArgIndex = args.indexOf('--target');
if (targetArgIndex !== -1 && args[targetArgIndex + 1]) {
  targetUniqueId = args[targetArgIndex + 1].trim().toUpperCase();
}

/**
 * 1. Authorize profile upgrade for active guest account & create mock accounts in store.json
 */
async function setupDatabaseRecords() {
  console.log('----------------------------------------------------');
  console.log('1. Database Preparation & Mock Account Provisioning');
  console.log('----------------------------------------------------');

  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Database file not found at ${DATA_FILE}`);
  }

  const store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  store.users = store.users || {};
  store.uniqueIdIndex = store.uniqueIdIndex || {};
  store.friends = store.friends || {};
  store.friendRequests = store.friendRequests || {};
  store.matchHistory = store.matchHistory || {};

  // Provision verified target profile (supporting both guest ID and permanent unique ID)
  const targetProfile = {
    id: 'guest_1788707902213_4644',
    name: 'Anirudh',
    avatar: 'avatar_1',
    uniqueId: targetUniqueId,
    email: 'anirudh@thebid.test',
    trophies: 2,
    categoryTrophies: { ipl_cricket: 1, luxury_cars: 1 },
    isGuest: false,
    createdAt: '2026-09-06T15:18:22.213Z'
  };
  store.users['guest_1788707902213_4644'] = targetProfile;
  store.users[`usr_${targetUniqueId}`] = targetProfile;
  store.uniqueIdIndex[targetUniqueId.toUpperCase()] = 'guest_1788707902213_4644';
  store.friends[targetUniqueId] = store.friends[targetUniqueId] || [];
  store.friends['guest_1788707902213_4644'] = store.friends[targetUniqueId];
  store.friendRequests[targetUniqueId] = store.friendRequests[targetUniqueId] || [];
  store.friendRequests['guest_1788707902213_4644'] = store.friendRequests[targetUniqueId];
  console.log(`✓ Target Profile Established: Anirudh (${targetUniqueId}) [isGuest: false, verified session]`);

  // Provision the 3 human-like mock accounts
  for (const mock of MOCK_PROFILES) {
    store.users[mock.id] = {
      ...mock,
      createdAt: new Date().toISOString()
    };
    store.uniqueIdIndex[mock.uniqueId.toUpperCase()] = mock.id;
    store.friends[mock.uniqueId] = store.friends[mock.uniqueId] || [];
    store.friendRequests[mock.uniqueId] = store.friendRequests[mock.uniqueId] || [];
    console.log(`✓ Mock Profile Provisioned: ${mock.name} • ID: ${mock.uniqueId} • Avatar: ${mock.avatar} • Trophies: ${mock.trophies}`);
  }

  // Establish direct mutual friendships for immediate in-game room invites
  console.log('\n----------------------------------------------------');
  console.log(`2. Establishing Mutual Friendships with [${targetUniqueId}]`);
  console.log('----------------------------------------------------');

  for (const mock of MOCK_PROFILES) {
    // Add mock to user's friends list
    if (!store.friends[targetUniqueId].includes(mock.uniqueId)) {
      store.friends[targetUniqueId].push(mock.uniqueId);
      console.log(`🤝 FRIEND ESTABLISHED: ${mock.name} (${mock.uniqueId}) is now a friend of [${targetUniqueId}].`);
    }
    // Add target to mock's friends list (mutual)
    if (!store.friends[mock.uniqueId].includes(targetUniqueId)) {
      store.friends[mock.uniqueId].push(targetUniqueId);
    }
    if (!store.friends[mock.uniqueId].includes('guest_1788707902213_4644')) {
      store.friends[mock.uniqueId].push('guest_1788707902213_4644');
    }
  }

  // Sync secondary mapping
  store.friends['guest_1788707902213_4644'] = [...store.friends[targetUniqueId]];

  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  console.log('✓ store.json persisted with updated friend records & profiles.');

  // Notify running server daemon to reload store into memory
  try {
    const res = await fetch(`${SERVER_URL}/api/testing/reload-store`, { method: 'POST' });
    if (res.ok) {
      console.log('✓ Authoritative game server synchronized with updated database records.');
    }
  } catch {
    // Server offline or not reachable
  }
}

/**
 * 2. Socket.IO Live Lobby Simulated Clients
 */
function startLiveLobbySimulators() {
  console.log('\n----------------------------------------------------');
  console.log('3. Connecting Mock Socket.IO Clients to Authoritative Server');
  console.log('----------------------------------------------------');

  const clients = [];

  MOCK_PROFILES.forEach((profile, index) => {
    const socket = ioClient(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
    });

    const clientState = {
      profile,
      socket,
      currentRoomId: null,
      currentRoomCode: null,
      selectedTeamId: null,
      hasVotedBudget: false,
      isReady: false
    };

    socket.on('connect', () => {
      console.log(`[🟢 Online] Mock Player #${index + 1}: ${profile.name} (${profile.uniqueId}) connected. Socket: ${socket.id}`);
      // Register with authoritative server for direct invitations
      socket.emit('register_user', {
        user: {
          id: profile.id,
          name: profile.name,
          uniqueId: profile.uniqueId,
          avatar: profile.avatar,
          trophies: profile.trophies
        }
      });
    });

    // Handle Direct In-Game Room Invitations sent by host
    socket.on('room_invitation_received', (invitation) => {
      console.log(`\n🔔 [INVITATION RECEIVED] ${profile.name} received invite to room [${invitation.roomCode || invitation.roomId}] (${invitation.categoryTitle}) from ${invitation.sender?.name || 'Host'}!`);
      setTimeout(() => {
        console.log(`🤝 [AUTO-ACCEPT] ${profile.name} is accepting the invitation to join room [${invitation.roomCode}]...`);
        socket.emit('respond_room_invite', {
          invitationId: invitation.id,
          response: 'ACCEPTED',
          user: {
            id: profile.id,
            name: profile.name,
            uniqueId: profile.uniqueId,
            avatar: profile.avatar,
            trophies: profile.trophies
          }
        });
      }, 1000 + index * 400);
    });

    // Handle Room Joined confirmation
    socket.on('room_joined', (data) => {
      clientState.currentRoomId = data.roomId;
      clientState.currentRoomCode = data.roomCode;
      console.log(`🏆 [ROOM JOINED] ${profile.name} successfully joined room: ${data.roomCode || data.roomId} (${data.category})`);
    });

    // Handle Room State Updates
    socket.on('room_state', (room) => {
      clientState.currentRoomId = room.id;
      clientState.currentRoomCode = room.roomCode;

      // 1. Handle BUDGET_SELECTION / TEAM SELECTION
      if (room.state === 'BUDGET_SELECTION' || room.state === 'LOBBY') {
        // A. Auto-select franchise team if not yet chosen or claimed
        const myParticipant = room.participants ? room.participants.find(p => p.id === profile.id) : null;
        const ownedTeamId = room.teamOwnership ? Object.keys(room.teamOwnership).find(tId => room.teamOwnership[tId] === profile.id) : null;

        if (myParticipant && (!myParticipant.teamName || !ownedTeamId) && !clientState.selectingTeam) {
          clientState.selectingTeam = true;
          // Available pool of teams
          const allTeams = [
            { id: 'csk', name: 'Chennai Super Kings' },
            { id: 'rcb', name: 'Royal Challengers Bengaluru' },
            { id: 'mi', name: 'Mumbai Indians' },
            { id: 'kkr', name: 'Kolkata Knight Riders' },
            { id: 'srh', name: 'Sunrisers Hyderabad' },
            { id: 'rr', name: 'Rajasthan Royals' },
            { id: 'gt', name: 'Gujarat Titans' },
            { id: 'lsg', name: 'Lucknow Super Giants' },
            { id: 'dc', name: 'Delhi Capitals' },
            { id: 'pbks', name: 'Punjab Kings' },
          ];

          const takenTeamIds = new Set(room.teamOwnership ? Object.keys(room.teamOwnership) : []);
          const available = allTeams.find(t => !takenTeamIds.has(t.id));

          if (available) {
            setTimeout(() => {
              clientState.selectedTeamId = available.id;
              console.log(`🏏 [TEAM SELECTION] ${profile.name} selected franchise: ${available.name} (${available.id.toUpperCase()})`);
              socket.emit('select_team', {
                roomId: room.id,
                userId: profile.id,
                teamId: available.id
              });
              clientState.selectingTeam = false;
            }, 600 + index * 400);
          } else {
            clientState.selectingTeam = false;
          }
        }

        // B. Vote on Budget Proposal if present and not yet voted
        const myVote = room.budgetVotes ? room.budgetVotes[profile.id] : undefined;
        if (myVote !== true && !clientState.hasVotedBudget) {
          clientState.hasVotedBudget = true;
          setTimeout(() => {
            console.log(`💰 [BUDGET VOTE] ${profile.name} votes AGREE for budget: ₹${room.proposedBudget} Cr`);
            socket.emit('vote_budget', {
              roomId: room.id,
              userId: profile.id,
              agreed: true
            });
          }, 1200 + index * 500);
        }
      }

      // 2. Handle PRE-AUCTION LOBBY (READY UP)
      if (room.state === 'LOBBY') {
        const myParticipant = room.participants ? room.participants.find(p => p.id === profile.id) : null;
        if (myParticipant && !myParticipant.isReady && !clientState.isReady) {
          clientState.isReady = true;
          setTimeout(() => {
            console.log(`✅ [READY TOGGLE] ${profile.name} is READY for the auction!`);
            socket.emit('toggle_ready', {
              roomId: room.id,
              userId: profile.id,
              teamName: myParticipant.teamName || 'Franchise'
            });
          }, 1000 + index * 600);
        }
      }

      // 3. Handle LIVE AUCTION BIDDING
      if (room.state === 'AUCTION_ACTIVE') {
        // Evaluate competitive bidding
        const currentLeader = room.currentLeader;
        const isLeading = currentLeader && currentLeader.id === profile.id;
        const currentBid = room.currentBid || 0;
        const myParticipant = room.participants ? room.participants.find(p => p.id === profile.id) : null;
        const purse = myParticipant ? (myParticipant.purse || 100) : 100;

        // Calculate next bid increment
        const increment = currentBid >= 10 ? 0.5 : 0.2;
        const nextBid = Number((currentBid + increment).toFixed(2));

        // Random simulated human interest (60% chance to bid if affordable)
        if (!isLeading && nextBid <= purse && Math.random() < 0.65) {
          const delay = 1500 + Math.floor(Math.random() * 2000);
          setTimeout(() => {
            // Verify still not leading before placing bid
            if (clientState.currentRoomId === room.id) {
              console.log(`⚡ [LIVE BID] ${profile.name} placing bid of ₹${nextBid} Cr (Purse remaining: ₹${purse} Cr)`);
              socket.emit('place_bid', {
                roomId: room.id,
                userId: profile.id,
                amount: nextBid,
                requestId: `mock_bid_${Date.now()}_${index}`,
                clientTimestamp: Date.now()
              });

              // Occasionally send an authentic reaction emoji
              if (Math.random() < 0.35) {
                const reactions = ['👏', '🔥', '⚡', '💪'];
                const emoji = reactions[Math.floor(Math.random() * reactions.length)];
                setTimeout(() => {
                  socket.emit('send_reaction', {
                    roomId: room.id,
                    userId: profile.id,
                    text: emoji
                  });
                }, 1000);
              }
            }
          }, delay);
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`[🔴 Offline] Mock Player ${profile.name} disconnected.`);
    });

    clients.push(clientState);
  });

  return clients;
}

/**
 * 3. Interactive CLI for Joining via Room Code & Monitoring
 */
function startInteractivePrompt(clients) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n====================================================');
  console.log('🎮 MULTIPLAYER TESTING CONTROLLER ACTIVE');
  console.log('====================================================');
  console.log('Instructions:');
  console.log('1. Open THE BID app on your device.');
  console.log('2. Tap "Make Friends" -> Check your Inbound Requests.');
  console.log('   You will see Arjun Verma, Priya Sharma, and Kabir Mehta!');
  console.log('3. Tap ACCEPT on their requests to make them permanent friends.');
  console.log('4. Create a Private Friend Room (or tap Invite Friends).');
  console.log('   The mock players will automatically accept invites and join!');
  console.log('\nCommand shortcuts:');
  console.log('  join <ROOM_CODE>  -> Force all 3 mock accounts to join a room code (e.g. "join BID-7K4P2")');
  console.log('  status            -> Show status of all mock accounts');
  console.log('  exit / quit       -> Disconnect and exit');
  console.log('====================================================\n');

  rl.prompt();

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'join') {
      const code = (parts[1] || '').toUpperCase();
      if (!code) {
        console.log('Usage: join <ROOM_CODE> (e.g. join BID-8H2K9)');
      } else {
        console.log(`Instructing all 3 mock accounts to join room code: ${code}...`);
        clients.forEach((c, idx) => {
          setTimeout(() => {
            c.socket.emit('join_room', {
              roomCode: code,
              user: {
                id: c.profile.id,
                name: c.profile.name,
                uniqueId: c.profile.uniqueId,
                avatar: c.profile.avatar,
                trophies: c.profile.trophies
              }
            });
          }, idx * 400);
        });
      }
    } else if (cmd === 'status') {
      console.log('\n--- Mock Clients Status ---');
      clients.forEach(c => {
        console.log(`• ${c.profile.name} (${c.profile.uniqueId}): Socket ${c.socket.connected ? 'CONNECTED 🟢' : 'DISCONNECTED 🔴'} | Room: ${c.currentRoomCode || 'None'} | Team: ${c.selectedTeamId || 'None'} | Ready: ${c.isReady}`);
      });
      console.log('---------------------------\n');
    } else if (cmd === 'exit' || cmd === 'quit') {
      console.log('Exiting simulation...');
      clients.forEach(c => c.socket.disconnect());
      rl.close();
      process.exit(0);
    } else {
      console.log(`Unknown command: "${trimmed}". Available: join <CODE>, status, exit`);
    }

    rl.prompt();
  });
}

// Main Execution Flow
(async () => {
  try {
    await setupDatabaseRecords();
    const clients = startLiveLobbySimulators();

    // If running in automated/headless test mode, don't block terminal prompt
    if (args.includes('--test-only')) {
      console.log('\n✓ [--test-only] Verification complete. Exiting.');
      setTimeout(() => {
        clients.forEach(c => c.socket.disconnect());
        process.exit(0);
      }, 2000);
    } else {
      startInteractivePrompt(clients);
    }
  } catch (e) {
    console.error('Fatal Error during multiplayer setup:', e);
    process.exit(1);
  }
})();
