const { CategoryRegistry } = require('../categories/CategoryRegistry');
const { AuctionBot, generateFictionalBots, DEFAULT_AI_PROFILES, getGenderForName, getBotAvatarForName } = require('../ai/AuctionBot');
const store = require('../services/store');

function getCategoryFranchise(catMod, idOrName, ownerUniqueId) {
  if (!idOrName) return null;
  const clean = String(idOrName).trim();

  // 1. Check if idOrName references a user-owned custom entity
  if (ownerUniqueId && store.getCustomEntities) {
    const userCustoms = store.getCustomEntities(ownerUniqueId, catMod ? catMod.id : null);
    const customMatch = userCustoms.find(c => 
      c.id === clean || 
      c.customEntityId === clean || 
      c.name.toLowerCase() === clean.toLowerCase()
    );
    if (customMatch) return { ...customMatch, isCustom: true };
  }

  // 2. Check official category module
  if (!catMod) return null;
  if (catMod.getFranchiseById) {
    const f = catMod.getFranchiseById(clean) || catMod.getFranchiseById(clean.replace(/_/g, ''));
    if (f) return { ...f, isOfficial: true };
  }
  if (catMod.getFranchiseByName) {
    const f = catMod.getFranchiseByName(clean) || catMod.getFranchiseByName(clean.replace(/_/g, ' '));
    if (f) return { ...f, isOfficial: true };
  }
  return null;
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> Room
    this.roomCodes = new Map(); // normalized roomCode -> roomId
    this.matchmakingQueues = new Map(); // categoryId -> Map<uniqueId, { socketId, socket, user, category, timestamp }>
    this.userLifecycle = new Map(); // normUniqueId -> 'ONLINE' | 'AVAILABLE_FOR_RANDOM' | 'MATCHED' | 'IN_GAME'
    this.userActivities = new Map(); // normUniqueId -> 'AT_HOME' | 'IN_SETUP' | 'IN_LOBBY' | 'IN_GAME'
    this.onPresenceChanged = null; // callback(normUniqueId) to broadcast real-time presence
  }

  // Normalizes code input: strictly 6 numeric digits (100000 - 999999)
  normalizeRoomCode(code) {
    if (!code) return '';
    const str = typeof code === 'string' ? code : String(code);
    return str.replace(/\D/g, '').slice(0, 6);
  }

  // Generates authoritative 6-digit numeric room code (100000 - 999999)
  // Guarantees uniqueness across at least 100,000 simultaneously active rooms
  generateRoomCode() {
    const MIN_CODE = 100000;
    const MAX_CODE = 999999;
    const RANGE = MAX_CODE - MIN_CODE + 1; // 900,000 possible codes

    // 1. Monte Carlo random probe: with 100,000 active rooms (~11% density),
    // average attempts to find an unoccupied code is 1 / (1 - 0.11) = 1.12 iterations.
    for (let attempts = 0; attempts < 5000; attempts++) {
      const num = (Math.floor(MIN_CODE + Math.random() * RANGE)).toString();
      if (!this.roomCodes.has(num) && (!store.isRoomKeyActive || !store.isRoomKeyActive(num))) {
        return num;
      }
    }

    // 2. Deterministic linear offset scan fallback if high density
    const randomStart = Math.floor(MIN_CODE + Math.random() * RANGE);
    for (let i = 0; i < RANGE; i++) {
      const num = (((randomStart - MIN_CODE + i) % RANGE) + MIN_CODE).toString();
      if (!this.roomCodes.has(num) && (!store.isRoomKeyActive || !store.isRoomKeyActive(num))) {
        return num;
      }
    }

    throw new Error('All 900,000 six-digit numeric room codes are currently occupied.');
  }

  getRoom(roomId) {
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  getRoomByCode(code) {
    if (!code) return null;
    const norm = this.normalizeRoomCode(code);
    if (norm && norm.length === 6) {
      const roomId = this.roomCodes.get(norm);
      if (roomId) {
        const room = this.rooms.get(roomId);
        if (room && room.state !== 'RESULTS') return room;
      }
    }
    const direct = this.rooms.get(code);
    if (direct && direct.state !== 'RESULTS') return direct;
    return null;
  }

  resolveRoom(roomIdOrCode) {
    if (!roomIdOrCode) return null;
    const str = String(roomIdOrCode).trim();
    // 1. Direct lookup by ID
    const direct = this.rooms.get(str);
    if (direct && direct.state !== 'RESULTS') return direct;

    // 2. Lookup by normalized 6-digit room code in roomCodes map
    const norm = this.normalizeRoomCode(str);
    if (norm && norm.length === 6) {
      const mappedId = this.roomCodes.get(norm);
      if (mappedId) {
        const found = this.rooms.get(mappedId);
        if (found && found.state !== 'RESULTS') return found;
      }
    }

    // 3. Fallback scan across all active rooms by roomCode or id
    for (const r of this.rooms.values()) {
      if (r && r.state !== 'RESULTS' && (r.id === str || r.roomCode === str || r.roomCode === norm)) {
        return r;
      }
    }

    return null;
  }

  createRoom({ roomId, hostUser, category = 'ipl_cricket', mode = 'computer', customParticipants, participantCount, poolSize, roomCode, aiDifficulty = 'MEDIUM', lotDurationMs, pauseDurationMs, budget }) {
    const categoryModule = CategoryRegistry.get(category || 'ipl_cricket');
    const actualRoomId = roomId || `room_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    let participantsCount;
    if (Array.isArray(customParticipants) && customParticipants.length > 0) {
      participantsCount = Math.max(1, Math.min(10, customParticipants.length));
    } else {
      participantsCount = mode === 'computer' ? 4 : 2;
    }

    // Generate match item pool dynamically from the category module
    const matchItems = categoryModule.generatePool(participantsCount, poolSize);

    // Authoritative 6-digit numeric room code generation for private & random rooms
    let finalRoomCode = null;
    if (mode === 'friends' || mode === 'random') {
      const candidateCode = roomCode ? this.normalizeRoomCode(roomCode) : null;
      if (candidateCode && candidateCode.length === 6 && !this.roomCodes.has(candidateCode) && (!store.isRoomKeyActive || !store.isRoomKeyActive(candidateCode))) {
        finalRoomCode = candidateCode;
      } else {
        finalRoomCode = this.generateRoomCode();
      }
      this.roomCodes.set(finalRoomCode, actualRoomId);
      if (store.reserveRoomKey) {
        store.reserveRoomKey(finalRoomCode, actualRoomId, hostUser?.uniqueId, categoryModule.id);
      }
    }
    const categoryFranchises = categoryModule.getFranchises ? categoryModule.getFranchises() : (categoryModule.franchises || []);

    const room = {
      id: actualRoomId,
      roomCode: finalRoomCode,
      category: categoryModule.id,
      categoryConfig: {
        id: categoryModule.id,
        title: categoryModule.title,
        shortTitle: categoryModule.shortTitle,
        tagline: categoryModule.tagline,
        icon: categoryModule.icon,
        franchiseLabel: categoryModule.franchiseLabel || 'Team',
        franchiseLabelPlural: categoryModule.franchiseLabelPlural || 'Teams',
        itemLabelSingle: categoryModule.itemLabelSingle,
        itemLabelPlural: categoryModule.itemLabelPlural,
        collectionLabel: categoryModule.collectionLabel,
        currencySymbol: categoryModule.currencySymbol,
        unitLabel: categoryModule.unitLabel,
        defaultBudget: categoryModule.defaultBudget,
        minBudget: categoryModule.minBudget,
        maxBudget: categoryModule.maxBudget,
        franchises: categoryFranchises
      },
      mode, // 'computer', 'random', 'friends'
      aiDifficulty: (aiDifficulty || 'MEDIUM').toUpperCase(),
      state: (mode === 'friends' || mode === 'random') ? 'LOBBY' : 'BUDGET_SELECTION',
      hostId: hostUser.id,
      hostUser,
      participants: new Map(), // userId -> participant
      bots: [],
      proposedBudget: (typeof budget === 'number' && budget >= 10 && budget <= 500) ? budget : (categoryModule.defaultBudget || 100.0),
      budgetVotes: new Map(), // userId -> boolean (true = agreed)
      playerPool: matchItems, // fixed unique sequence of cricketers for this match
      availablePlayerPool: [...matchItems], // active unauctioned player pool
      availablePlayerIds: new Set(matchItems.map(p => p.id)),
      auctionedPlayerIds: new Set(), // Set of player IDs that entered an auction lot
      lotHistoryByPlayerId: new Map(), // playerId -> lotNumber
      lotSequence: [], // Record of lots conducted in match
      currentPlayerIndex: 0,
      currentLotNumber: 0,
      currentPlayer: null,
      currentBid: 0,
      currentLeader: null,
      timerSeconds: Math.round((lotDurationMs || 10000) / 1000),
      lotDurationMs: lotDurationMs || 10000,
      pauseDurationMs: pauseDurationMs || 3500,
      timerInterval: null,
      lotTimeout: null,
      aiBidTimeout: null,
      pauseTimeout: null,
      isResolvingLot: false,
      finishVoteState: 'NORMAL', // 'NORMAL' | 'FINISH_REQUESTED' | 'FINISH_REJECTED' | 'FINISH_APPROVED'
      finishVote: null, // { requestedBy, requesterName, votes: {}, totalRequired, agreedCount }
      reactions: [],
      createdAt: Date.now()
    };

    room.teamOwnership = new Map(); // teamId -> userId

    // Slot #1 is always Host ("Me") — permanently locked & cannot be removed
    let hostFranchise = null;
    const hostUniqueId = hostUser ? (hostUser.uniqueId || hostUser.bidId || hostUser.id) : null;
    let hostCustom = null;
    if (Array.isArray(customParticipants)) {
      hostCustom = customParticipants.find(p => p.id === hostUser.id || p.type === 'HOST');
      if (hostCustom && (hostCustom.teamId || hostCustom.teamName)) {
        hostFranchise = getCategoryFranchise(categoryModule, hostCustom.teamId, hostUniqueId) || 
                        getCategoryFranchise(categoryModule, hostCustom.teamName, hostUniqueId);
      }
    }
    if (!hostFranchise && hostUser) {
      hostFranchise = getCategoryFranchise(categoryModule, hostUser.teamId, hostUniqueId) || 
                      getCategoryFranchise(categoryModule, hostUser.teamName, hostUniqueId);
    }
    const specifiedHostTeam = (hostCustom && hostCustom.teamName) || (hostUser && hostUser.teamName);
    if (!hostFranchise && specifiedHostTeam) {
      hostFranchise = {
        id: (hostCustom && hostCustom.teamId) || (hostUser && hostUser.teamId) || `custom_${Date.now().toString(36)}`,
        name: specifiedHostTeam,
        isCustom: true
      };
    } else if (!hostFranchise) {
      hostFranchise = categoryFranchises[0];
    }
    if (hostFranchise) {
      room.teamOwnership.set(hostFranchise.id, hostUser.id);
    }

    if (hostUser) {
      store.getOrCreateUser(hostUser);
    }

    const hostParticipant = {
      id: hostUser.id,
      uniqueId: hostUser.uniqueId || hostUser.bidId || hostUser.id,
      numericPlayerId: hostUser.numericPlayerId || (hostUser.uniqueId && hostUser.uniqueId.startsWith('BID-') ? hostUser.uniqueId.replace('BID-', '') : ''),
      name: hostUser.name,
      avatar: hostUser.avatar,
      teamId: hostFranchise ? hostFranchise.id : null,
      teamName: hostFranchise ? hostFranchise.name : (hostUser.teamName || 'Host Team'),
      isCustom: Boolean(hostFranchise && hostFranchise.isCustom),
      purse: room.proposedBudget,
      startingBudget: room.proposedBudget,
      squad: [],
      isReady: false,
      isHost: true,
      isAI: false,
      isStagingTestAccount: Boolean(hostUser && hostUser.isStagingTestAccount),
      type: 'HOST',
      socketId: hostUser.socketId
    };
    room.participants.set(hostUser.id, hostParticipant);

    if (Array.isArray(customParticipants) && customParticipants.length > 0) {
      // Add custom participants (up to 9 opponents: total <= 10)
      const opponents = customParticipants.filter(p => p.id !== hostUser.id && p.type !== 'HOST').slice(0, 9);

      opponents.forEach((p, idx) => {
        if (p.type === 'COMPUTER') {
          // Check if requested team is available
          let botFranchise = null;
          if (p.teamId && !room.teamOwnership.has(p.teamId)) {
            botFranchise = getCategoryFranchise(categoryModule, p.teamId);
          } else if (p.teamName) {
            const f = getCategoryFranchise(categoryModule, p.teamName);
            if (f && !room.teamOwnership.has(f.id)) {
              botFranchise = f;
            }
          }
          // If not specified or already taken, pick first remaining unowned franchise
          if (!botFranchise) {
            botFranchise = categoryFranchises.find(f => !room.teamOwnership.has(f.id));
          }

          const botId = p.id || `bot_${Date.now().toString(36)}_${idx}`;
          if (botFranchise) {
            room.teamOwnership.set(botFranchise.id, botId);
          }

          let botAvatar = p.avatar;
          if (!botAvatar) {
            botAvatar = getBotAvatarForName(p.name, idx);
          } else {
            const gender = getGenderForName(p.name);
            const isFemale = ['avatar_6', 'avatar_7', 'avatar_8', 'avatar_9', 'avatar_female_1', 'avatar_female_2', 'avatar_female_3', 'avatar_female_4'].includes(botAvatar);
            if (gender === 'male' && isFemale) {
              botAvatar = getBotAvatarForName(p.name, idx);
            } else if (gender === 'female' && !isFemale) {
              botAvatar = getBotAvatarForName(p.name, idx);
            }
          }

          const bot = new AuctionBot({
            id: botId,
            name: p.name,
            teamId: botFranchise ? botFranchise.id : null,
            teamName: botFranchise ? botFranchise.name : p.teamName,
            strategy: p.strategy || 'balanced',
            avatar: botAvatar,
            difficulty: room.aiDifficulty
          });
          room.bots.push(bot);
          room.participants.set(bot.id, {
            id: bot.id,
            uniqueId: p.uniqueId || `AI-${bot.id.toUpperCase()}`,
            name: bot.name,
            avatar: bot.avatar,
            teamId: botFranchise ? botFranchise.id : null,
            teamName: botFranchise ? botFranchise.name : p.teamName,
            purse: categoryModule.defaultBudget || 100.0,
            startingBudget: categoryModule.defaultBudget || 100.0,
            squad: [],
            isReady: true,
            isHost: false,
            isAI: true,
            type: 'COMPUTER'
          });
          // Computer opponents automatically agree to proposed budget
          room.budgetVotes.set(bot.id, true);
        } else if (p.type === 'FRIEND') {
          let friendFranchise = null;
          if (p.teamId && !room.teamOwnership.has(p.teamId)) {
            friendFranchise = getCategoryFranchise(categoryModule, p.teamId);
          } else if (p.teamName) {
            const f = getCategoryFranchise(categoryModule, p.teamName);
            if (f && !room.teamOwnership.has(f.id)) {
              friendFranchise = f;
            }
          }
          if (!friendFranchise && p.teamName) {
            friendFranchise = {
              id: p.teamId || `custom_${Date.now().toString(36)}_${idx}`,
              name: p.teamName,
              isCustom: true
            };
          }
          if (friendFranchise) {
            room.teamOwnership.set(friendFranchise.id, p.id);
          }

          room.participants.set(p.id, {
            id: p.id,
            uniqueId: p.uniqueId,
            name: p.name,
            avatar: p.avatar,
            teamId: friendFranchise ? friendFranchise.id : null,
            teamName: friendFranchise ? friendFranchise.name : (p.teamName || `${p.name}'s XI`),
            purse: categoryModule.defaultBudget || 100.0,
            startingBudget: categoryModule.defaultBudget || 100.0,
            squad: [],
            isReady: false,
            isHost: false,
            isAI: false,
            type: 'FRIEND',
            socketId: p.socketId
          });
          // Friend must independently agree; DO NOT auto-agree
        }
      });
    } else if (mode === 'computer') {
      // Configurable or default bot opponents (up to 9 opponents: 1 host + 9 bots = 10 total)
      const countToGenerate = Math.min(9, Math.max(1, (participantCount ? participantCount - 1 : 3)));
      const categoryManagers = categoryModule.fictionalManagers || [];
      const fictionalBots = generateFictionalBots(countToGenerate, [], [], room.aiDifficulty, categoryManagers);
      fictionalBots.forEach((botProfile, idx) => {
        const botFranchise = categoryFranchises.find(f => !room.teamOwnership.has(f.id));
        const botId = botProfile.id || `bot_${Date.now().toString(36)}_${idx}`;
        if (botFranchise) {
          room.teamOwnership.set(botFranchise.id, botId);
        }

        const bot = new AuctionBot({
          ...botProfile,
          id: botId,
          teamId: botFranchise ? botFranchise.id : null,
          teamName: botFranchise ? botFranchise.name : botProfile.teamName,
          difficulty: room.aiDifficulty
        });
        room.bots.push(bot);
        room.participants.set(bot.id, {
          id: bot.id,
          uniqueId: `AI-${bot.id.toUpperCase()}`,
          name: bot.name,
          avatar: bot.avatar,
          teamId: botFranchise ? botFranchise.id : null,
          teamName: botFranchise ? botFranchise.name : botProfile.teamName,
          purse: categoryModule.defaultBudget || 100.0,
          startingBudget: categoryModule.defaultBudget || 100.0,
          squad: [],
          isReady: true,
          isHost: false,
          isAI: true,
          type: 'COMPUTER'
        });
        // Bots automatically agree to budget
        room.budgetVotes.set(bot.id, true);
      });
    }

    this.rooms.set(actualRoomId, room);
    const hostNorm = (hostUser.uniqueId || hostUser.bidId || hostUser.id || '').trim().toUpperCase();
    if (this.onPresenceChanged && hostNorm) {
      this.onPresenceChanged(hostNorm);
    }
    return room;
  }

  joinRoom(roomIdOrCode, user) {
    if (!roomIdOrCode) {
      return { success: false, message: 'Please enter a valid 6-digit room code.' };
    }

    const cleanDigits = String(roomIdOrCode).replace(/\D/g, '');
    let room = null;
    if (cleanDigits.length === 6) {
      room = this.getRoomByCode(cleanDigits);
    } else {
      room = this.rooms.get(roomIdOrCode);
    }

    if (!room) {
      return { success: false, message: 'Room not found or auction has already closed.' };
    }

    const normUnique = (user.uniqueId || '').trim().toUpperCase();
    const existingParticipant = room.participants.get(user.id) || 
      (normUnique ? Array.from(room.participants.values()).find(p => p.uniqueId && p.uniqueId.toUpperCase() === normUnique) : null);

    // Reconnection handling: update socketId and return room without adding duplicate
    if (existingParticipant) {
      existingParticipant.socketId = user.socketId;
      return { success: true, room };
    }

    if (room.state !== 'SETUP' && room.state !== 'BUDGET_SELECTION' && room.state !== 'LOBBY') {
      return { success: false, message: 'Auction is already underway.' };
    }

    if (room.participants.size >= 10) {
      return { success: false, message: 'Room is full (Maximum 10 participants).' };
    }

    if (!room.teamOwnership) {
      room.teamOwnership = new Map();
    }

    const categoryModule = CategoryRegistry.get(room.category);
    const categoryFranchises = categoryModule.getFranchises ? categoryModule.getFranchises() : (categoryModule.franchises || []);

    let userFranchise = null;
    if (user.teamId && !room.teamOwnership.has(user.teamId)) {
      userFranchise = getCategoryFranchise(categoryModule, user.teamId);
    } else if (user.teamName) {
      const f = getCategoryFranchise(categoryModule, user.teamName);
      if (f && !room.teamOwnership.has(f.id)) {
        userFranchise = f;
      }
    }
    // Only claim franchise if user explicitly requested one that was available; do not auto-claim for new joiners
    if (userFranchise) {
      room.teamOwnership.set(userFranchise.id, user.id);
    }

    if (user) {
      store.getOrCreateUser(user);
    }

    room.participants.set(user.id, {
      id: user.id,
      uniqueId: user.uniqueId || user.bidId || user.id,
      numericPlayerId: user.numericPlayerId || (user.uniqueId && user.uniqueId.startsWith('BID-') ? user.uniqueId.replace('BID-', '') : ''),
      name: user.name,
      avatar: user.avatar || 'avatar_1',
      teamId: userFranchise ? userFranchise.id : null,
      teamName: userFranchise ? userFranchise.name : null,
      purse: room.proposedBudget,
      startingBudget: room.proposedBudget,
      squad: [],
      isReady: false,
      isHost: false,
      isAI: false,
      isStagingTestAccount: Boolean(user && user.isStagingTestAccount),
      type: 'FRIEND',
      socketId: user.socketId
    });

    // Recalculate pool if in BUDGET_SELECTION or LOBBY
    const cat = CategoryRegistry.get(room.category);
    room.playerPool = cat.generatePool(room.participants.size);
    room.availablePlayerPool = [...room.playerPool];
    room.availablePlayerIds = new Set(room.playerPool.map(p => p.id));
    room.auctionedPlayerIds = new Set();
    room.lotSequence = [];
    room.lotHistoryByPlayerId = new Map();

    // Reset budget consensus when a new human joins in BUDGET_SELECTION
    if (room.state === 'BUDGET_SELECTION') {
      room.budgetVotes.clear();
      room.bots.forEach(b => room.budgetVotes.set(b.id, true));
    }

    if (this.onPresenceChanged && normUnique) {
      this.onPresenceChanged(normUnique);
    }

    return { success: true, room };
  }

  // Active match detection across all rooms
  isUserInActiveMatch(userId, uniqueId) {
    const normUnique = (uniqueId || '').trim().toUpperCase();
    for (const room of this.rooms.values()) {
      if (room && room.state !== 'RESULTS' && room.participants) {
        for (const p of room.participants.values()) {
          if (!p.isAI && !p.isDisconnected) {
            if (p.id === userId || (p.uniqueId && normUnique && p.uniqueId.toUpperCase() === normUnique)) {
              return room;
            }
          }
        }
      }
    }
    return null;
  }

  findActiveRoomForUser(userId, uniqueId) {
    return this.isUserInActiveMatch(userId, uniqueId);
  }

  isUserInMatchmakingQueue(uniqueId) {
    if (!uniqueId) return false;
    const norm = uniqueId.trim().toUpperCase();
    for (const queueMap of this.matchmakingQueues.values()) {
      if (queueMap.has(norm)) return true;
    }
    return false;
  }

  getUserPresence(uniqueId, hasActiveSockets = false) {
    if (!hasActiveSockets) {
      return 'OFFLINE';
    }
    const norm = (uniqueId || '').trim().toUpperCase();
    if (!norm) return 'OFFLINE';

    // 1. Check if currently waiting in matchmaking queue
    if (this.isUserInMatchmakingQueue(norm)) {
      return 'BUSY';
    }

    // 2. Check if currently in an active room (ALL states including RESULTS until player explicitly leaves)
    const activeRoom = this.isUserInActiveMatch(null, norm);
    if (activeRoom) {
      return 'BUSY';
    }

    // 3. Check explicit client activity state (e.g. IN_SETUP, IN_LOBBY)
    if (this.userActivities && this.userActivities.has(norm)) {
      const act = this.userActivities.get(norm);
      if (act && act !== 'AT_HOME') {
        return 'BUSY';
      }
    }

    return 'AVAILABLE';
  }

  setUserActivity(uniqueId, activity) {
    if (!uniqueId) return;
    const norm = uniqueId.trim().toUpperCase();
    if (!this.userActivities) this.userActivities = new Map();
    this.userActivities.set(norm, activity);
    if (this.onPresenceChanged) {
      this.onPresenceChanged(norm);
    }
  }

  leaveRoom(roomId, userId, uniqueId) {
    const room = this.resolveRoom(roomId);
    if (!room) return { success: false, message: 'Room not found' };

    const normUnique = (uniqueId || '').trim().toUpperCase();
    let participantId = null;

    for (const [pId, p] of room.participants.entries()) {
      if (pId === userId || (p.uniqueId && normUnique && p.uniqueId.toUpperCase() === normUnique)) {
        participantId = pId;
        break;
      }
    }

    if (!participantId) {
      return { success: false, message: 'Participant not in room' };
    }

    const leavingParticipant = room.participants.get(participantId);
    const wasHost = leavingParticipant?.isHost || room.hostId === participantId;
    const effectiveUniqueId = leavingParticipant?.uniqueId || uniqueId;

    // Release team ownership
    if (room.teamOwnership) {
      for (const [teamId, ownerId] of room.teamOwnership.entries()) {
        if (ownerId === participantId) {
          room.teamOwnership.delete(teamId);
        }
      }
    }

    // Release budget vote if in budget selection
    if (room.budgetVotes) {
      room.budgetVotes.delete(participantId);
    }

    const isLiveAuction = room.state === 'AUCTION_ACTIVE' || room.state === 'SOLD' || room.state === 'UNSOLD' || room.state === 'PAUSED';

    // Remove or convert participant
    if (isLiveAuction && !wasHost) {
      // In live auction with remaining humans, convert leaving player to computer bot
      // to maintain competitive roster integrity without breaking squad allocations or current leader bids
      leavingParticipant.isAI = true;
      leavingParticipant.type = 'COMPUTER';
      leavingParticipant.name = `${leavingParticipant.name} (AI)`;

      const bot = new AuctionBot({
        id: leavingParticipant.id,
        name: leavingParticipant.name,
        teamId: leavingParticipant.teamId,
        teamName: leavingParticipant.teamName,
        strategy: 'balanced',
        avatar: leavingParticipant.avatar,
        difficulty: room.aiDifficulty || 'MEDIUM'
      });
      room.bots.push(bot);
    } else {
      room.participants.delete(participantId);
    }

    // Update lifecycle state of leaving user to AVAILABLE
    if (effectiveUniqueId) {
      const normU = effectiveUniqueId.trim().toUpperCase();
      this.userLifecycle.set(normU, 'AVAILABLE');
      if (this.userActivities) {
        this.userActivities.set(normU, 'AT_HOME');
      }
      if (this.onPresenceChanged) {
        this.onPresenceChanged(normU);
      }
    }

    console.log(`[RoomManager] User ${participantId} (${effectiveUniqueId}) left room ${roomId}. Remaining participants: ${room.participants.size}`);

    // If host leaves or no human participants remain:
    const remainingHumans = Array.from(room.participants.values()).filter(p => !p.isAI);
    if (wasHost || remainingHumans.length === 0) {
      // Safest existing room behavior: close room when host leaves or when empty
      if (room.timerInterval) clearInterval(room.timerInterval);
      if (room.lotTimeout) clearTimeout(room.lotTimeout);
      if (room.aiBidTimeout) clearTimeout(room.aiBidTimeout);
      if (room.pauseTimeout) clearTimeout(room.pauseTimeout);

      if (room.roomCode) {
        this.roomCodes.delete(this.normalizeRoomCode(room.roomCode));
        if (store.releaseRoomKey) {
          store.releaseRoomKey(room.roomCode);
        }
      }
      store.cancelInvitationsForRoom(roomId);
      this.rooms.delete(roomId);

      // Notify presence change for all human participants in the room
      for (const p of room.participants.values()) {
        if (!p.isAI && p.uniqueId) {
          const normU = p.uniqueId.trim().toUpperCase();
          this.userLifecycle.set(normU, 'AVAILABLE');
          if (this.onPresenceChanged) {
            this.onPresenceChanged(normU);
          }
        }
      }

      // Notify any remaining sockets in the room that room has closed
      this.io.to(roomId).emit('room_closed', {
        roomId,
        message: 'Host has closed or left the room.'
      });
      console.log(`[RoomManager] Room ${roomId} closed and cleaned up.`);
      return { success: true, roomClosed: true };
    } else {
      // If a finish auction request is currently pending, update voting tally
      if (room.finishVoteState === 'FINISH_REQUESTED' && room.finishVote) {
        if (leavingParticipant.isAI) {
          // Converted to bot: AI bots auto-agree to finish requests
          room.finishVote.votes[participantId] = true;
        } else {
          delete room.finishVote.votes[participantId];
        }

        const eligible = this.getActiveEligibleParticipants(room);
        const eligibleIds = eligible.map(e => e.id);
        room.finishVote.eligibleParticipantIds = eligibleIds;
        room.finishVote.totalRequired = eligibleIds.length;
        const agreedCount = eligibleIds.filter(id => room.finishVote.votes[id] === true).length;
        room.finishVote.agreedCount = agreedCount;

        // If remaining participants now reach 100% agreement
        if (agreedCount >= room.finishVote.totalRequired && room.finishVote.totalRequired > 0) {
          this.resolveAndFinishAuction(room);
          return { success: true, roomClosed: false, room };
        }
      }

      // Room continues with remaining participants: broadcast updated room state
      this.broadcastRoomState(room);
      return { success: true, roomClosed: false, room };
    }
  }

  // Real-time Global Matchmaking
  joinRandomQueue(user, category = 'ipl_cricket', socket) {
    if (!user || (!user.uniqueId && !user.id)) {
      return { success: false, message: 'Authentication required for matchmaking.' };
    }
    const normUniqueId = (user.uniqueId || user.id).trim().toUpperCase();
    const catId = category || 'ipl_cricket';

    // Verify user is not already in an active match
    const activeMatch = this.isUserInActiveMatch(user.id, user.uniqueId);
    if (activeMatch) {
      return { success: false, message: 'Already in an active game session.', activeRoomId: activeMatch.id };
    }

    // Ensure only ONE active queue entry per user across all categories
    for (const [cId, queueMap] of this.matchmakingQueues.entries()) {
      queueMap.delete(normUniqueId);
    }

    if (!this.matchmakingQueues.has(catId)) {
      this.matchmakingQueues.set(catId, new Map());
    }

    const queueMap = this.matchmakingQueues.get(catId);
    queueMap.set(normUniqueId, {
      socketId: socket.id,
      user,
      category: catId,
      timestamp: Date.now()
    });

    this.userLifecycle.set(normUniqueId, 'AVAILABLE_FOR_RANDOM');
    console.log(`[Matchmaking] User ${normUniqueId} joined queue for ${catId}. Queue size: ${queueMap.size}`);

    if (this.onPresenceChanged) {
      this.onPresenceChanged(normUniqueId);
    }

    // Immediately check if an atomic match can be made
    this.processMatchmakingQueue(catId);

    return { success: true, queueSize: queueMap.size };
  }

  leaveRandomQueue(uniqueId, category) {
    const normUniqueId = (uniqueId || '').trim().toUpperCase();
    if (!normUniqueId) return;

    if (category && this.matchmakingQueues.has(category)) {
      this.matchmakingQueues.get(category).delete(normUniqueId);
    } else {
      for (const queueMap of this.matchmakingQueues.values()) {
        queueMap.delete(normUniqueId);
      }
    }
    this.userLifecycle.set(normUniqueId, 'ONLINE');
    console.log(`[Matchmaking] User ${normUniqueId} left queue`);
    if (this.onPresenceChanged) {
      this.onPresenceChanged(normUniqueId);
    }
  }

  removeSocketFromMatchmaking(socketId) {
    for (const queueMap of this.matchmakingQueues.values()) {
      for (const [uId, entry] of queueMap.entries()) {
        if (entry.socketId === socketId) {
          queueMap.delete(uId);
          this.userLifecycle.delete(uId);
          console.log(`[Matchmaking] Removed disconnected socket ${socketId} (user ${uId}) from queue`);
          if (this.onPresenceChanged) {
            this.onPresenceChanged(uId);
          }
        }
      }
    }
  }

  processMatchmakingQueue(catId) {
    const queueMap = this.matchmakingQueues.get(catId);
    if (!queueMap || queueMap.size < 2) return;

    // Filter out disconnected sockets
    for (const [uId, entry] of queueMap.entries()) {
      const sock = this.io.sockets.sockets.get(entry.socketId);
      if (!sock || !sock.connected) {
        queueMap.delete(uId);
        this.userLifecycle.delete(uId);
        if (this.onPresenceChanged) {
          this.onPresenceChanged(uId);
        }
      }
    }

    if (queueMap.size < 2) return;

    // Get first two eligible distinct players (strictly prevent self-matching)
    const queueEntries = Array.from(queueMap.values());
    let entryA = null;
    let entryB = null;

    for (let i = 0; i < queueEntries.length; i++) {
      for (let j = i + 1; j < queueEntries.length; j++) {
        const a = queueEntries[i];
        const b = queueEntries[j];
        const idA = (a.user.uniqueId || a.user.id || '').trim().toUpperCase();
        const idB = (b.user.uniqueId || b.user.id || '').trim().toUpperCase();
        if (idA !== idB && a.socketId !== b.socketId) {
          entryA = a;
          entryB = b;
          break;
        }
      }
      if (entryA && entryB) break;
    }

    if (!entryA || !entryB) return;

    const normA = (entryA.user.uniqueId || entryA.user.id).trim().toUpperCase();
    const normB = (entryB.user.uniqueId || entryB.user.id).trim().toUpperCase();

    // Atomically remove both players from queue
    queueMap.delete(normA);
    queueMap.delete(normB);
    this.userLifecycle.set(normA, 'MATCHED');
    this.userLifecycle.set(normB, 'MATCHED');

    if (this.onPresenceChanged) {
      this.onPresenceChanged(normA);
      this.onPresenceChanged(normB);
    }

    console.log(`[Matchmaking] ATOMIC MATCH: ${normA} vs ${normB} in ${catId}`);

    // Create random multiplayer room
    const roomId = `room_rand_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
    const roomCode = this.generateRoomCode();

    const room = this.createRoom({
      roomId,
      hostUser: entryA.user,
      category: catId,
      mode: 'random',
      roomCode,
      participantCount: 4
    });

    room.state = 'BUDGET_SELECTION';
    room.proposedBudget = room.categoryConfig?.defaultBudget || 100.0;
    room.budgetVotes = new Map();
    // Bots auto-agree to default purse
    room.bots.forEach(b => room.budgetVotes.set(b.id, true));

    // Add Player B to the room
    this.joinRoom(roomId, entryB.user);

    // Join sockets to room
    const socketA = this.io.sockets.sockets.get(entryA.socketId);
    const socketB = this.io.sockets.sockets.get(entryB.socketId);

    if (socketA) socketA.join(roomId);
    if (socketB) socketB.join(roomId);

    this.userLifecycle.set(normA, 'IN_GAME');
    this.userLifecycle.set(normB, 'IN_GAME');

    const matchPayload = {
      roomId: room.id,
      roomCode: room.roomCode,
      category: room.category,
      categoryTitle: room.categoryConfig?.title || 'Auction Arena'
    };

    if (socketA) {
      socketA.emit('random_match_found', {
        ...matchPayload,
        opponent: {
          name: entryB.user.name,
          uniqueId: entryB.user.uniqueId,
          avatar: entryB.user.avatar
        }
      });
    }

    if (socketB) {
      socketB.emit('random_match_found', {
        ...matchPayload,
        opponent: {
          name: entryA.user.name,
          uniqueId: entryA.user.uniqueId,
          avatar: entryA.user.avatar
        }
      });
    }

    // Broadcast authoritative room state
    this.broadcastRoomState(room);
  }

  // Handle Starting Budget Negotiation (Screens 12 & 13 & Lobby Re-negotiation)
  proposeBudget(roomId, userId, newBudget, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room || (room.state !== 'SETUP' && room.state !== 'BUDGET_SELECTION' && room.state !== 'LOBBY')) return;

    const participant = room.participants.get(userId);
    if (!participant) return;
    if (options.callerSocketId && participant.socketId && participant.socketId !== options.callerSocketId) {
      return;
    }

    // Security Hardening: Validate proposed budget within legitimate bounds
    const budget = Math.round(Number(newBudget) * 10) / 10;
    if (isNaN(budget) || !isFinite(budget) || budget < 10 || budget > 500) {
      return;
    }

    room.proposedBudget = budget;
    room.state = 'BUDGET_SELECTION';
    room.budgetVotes.clear();
    room.budgetVotes.set(userId, true); // Proposer votes agree
    room.bots.forEach(b => room.budgetVotes.set(b.id, true));

    room.participants.forEach(p => {
      p.purse = room.proposedBudget;
      p.startingBudget = room.proposedBudget;
      p.isReady = false; // Reset ready states when budget is renegotiated
    });

    // Check if unanimous agreement reached (e.g. 1-player room or only bots)
    const allAgreed = Array.from(room.participants.keys()).every(id => room.budgetVotes.get(id) === true);
    if (allAgreed) {
      // Direct transition: Budget agreed -> Live Auction starts directly
      this.startAuction(room.id, room.hostId);
      return;
    }

    this.broadcastRoomState(room);
  }

  voteBudget(roomId, userId, agreed, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room || room.state !== 'BUDGET_SELECTION') return;

    const participant = room.participants.get(userId);
    if (!participant) return;
    if (options.callerSocketId && participant.socketId && participant.socketId !== options.callerSocketId) {
      return;
    }

    room.budgetVotes.set(userId, !!agreed);

    // Ensure bots and staging test accounts remain agreed
    room.bots.forEach(b => room.budgetVotes.set(b.id, true));
    Array.from(room.participants.values()).forEach(p => {
      if (p.isAI || p.isStagingTestAccount) {
        room.budgetVotes.set(p.id, true);
      }
    });

    // Check if unanimous agreement reached among all participants
    const allAgreed = Array.from(room.participants.keys()).every(id => room.budgetVotes.get(id) === true);

    if (allAgreed) {
      // Lock budget for all participants
      room.participants.forEach(p => {
        p.purse = room.proposedBudget;
        p.startingBudget = room.proposedBudget;
      });
      // Direct transition: Budget agreed -> Live Auction starts directly
      this.startAuction(room.id, room.hostId);
      return;
    }

    this.broadcastRoomState(room);
  }

  // Live Roster Sync: Host adds bot in SETUP phase
  addBot(roomId, userId, botData = {}, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room || room.state !== 'SETUP') return { success: false, message: 'Invalid room state.' };
    const hostPart = room.participants.get(userId);
    if (room.hostId !== userId && (!hostPart || !hostPart.isHost)) return { success: false, message: 'Only host can add bots.' };
    if (options.callerSocketId && hostPart && hostPart.socketId && hostPart.socketId !== options.callerSocketId) {
      return { success: false, message: 'Unauthorized caller.' };
    }
    if (room.participants.size >= 10) return { success: false, message: 'Maximum 10 participants reached.' };

    const categoryModule = CategoryRegistry.get(room.category);
    const categoryFranchises = categoryModule.getFranchises ? categoryModule.getFranchises() : (categoryModule.franchises || []);

    let botFranchise = null;
    if (botData.teamId && !room.teamOwnership.has(botData.teamId)) {
      botFranchise = getCategoryFranchise(categoryModule, botData.teamId);
    }
    if (!botFranchise) {
      botFranchise = categoryFranchises.find(f => !room.teamOwnership.has(f.id));
    }

    const botId = botData.id || `bot_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    if (botFranchise) {
      room.teamOwnership.set(botFranchise.id, botId);
    }

    const botName = botData.name || `AI Manager ${room.participants.size + 1}`;
    let botAvatar = botData.avatar;
    if (!botAvatar) {
      botAvatar = getBotAvatarForName(botName, room.participants.size);
    } else {
      const gender = getGenderForName(botName);
      const isFemale = ['avatar_6', 'avatar_7', 'avatar_8', 'avatar_9', 'avatar_female_1', 'avatar_female_2', 'avatar_female_3', 'avatar_female_4'].includes(botAvatar);
      if (gender === 'male' && isFemale) {
        botAvatar = getBotAvatarForName(botName, room.participants.size);
      } else if (gender === 'female' && !isFemale) {
        botAvatar = getBotAvatarForName(botName, room.participants.size);
      }
    }

    const bot = new AuctionBot({
      id: botId,
      name: botName,
      teamId: botFranchise ? botFranchise.id : null,
      teamName: botFranchise ? botFranchise.name : (botData.teamName || 'Bot Team'),
      strategy: botData.strategy || 'balanced',
      avatar: botAvatar,
      difficulty: room.aiDifficulty
    });
    room.bots.push(bot);
    room.participants.set(botId, {
      id: botId,
      uniqueId: botData.uniqueId || `AI-${botId.toUpperCase()}`,
      name: bot.name,
      avatar: bot.avatar,
      teamId: botFranchise ? botFranchise.id : null,
      teamName: botFranchise ? botFranchise.name : (botData.teamName || 'Bot Team'),
      purse: room.proposedBudget,
      startingBudget: room.proposedBudget,
      squad: [],
      isReady: true,
      isHost: false,
      isAI: true,
      type: 'COMPUTER'
    });
    room.budgetVotes.set(botId, true);

    // Update dynamic pool
    room.playerPool = categoryModule.generatePool(room.participants.size);
    room.availablePlayerPool = [...room.playerPool];
    room.availablePlayerIds = new Set(room.playerPool.map(item => item.id));

    this.broadcastRoomState(room);
    return { success: true, room };
  }

  // Live Roster Sync: Host removes participant/bot in SETUP phase
  removeParticipant(roomId, userId, participantId, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room || room.state !== 'SETUP') return { success: false, message: 'Invalid room state.' };
    const hostPart = room.participants.get(userId);
    if (room.hostId !== userId && (!hostPart || !hostPart.isHost)) return { success: false, message: 'Only host can remove participants.' };
    if (options.callerSocketId && hostPart && hostPart.socketId && hostPart.socketId !== options.callerSocketId) {
      return { success: false, message: 'Unauthorized caller.' };
    }
    if (participantId === room.hostId) return { success: false, message: 'Cannot remove host.' };

    const part = room.participants.get(participantId);
    if (!part) return { success: false, message: 'Participant not found.' };

    if (room.teamOwnership) {
      for (const [tId, uId] of room.teamOwnership.entries()) {
        if (uId === participantId) {
          room.teamOwnership.delete(tId);
        }
      }
    }
    room.bots = room.bots.filter(b => b.id !== participantId);
    room.participants.delete(participantId);
    room.budgetVotes.delete(participantId);

    const categoryModule = CategoryRegistry.get(room.category);
    room.playerPool = categoryModule.generatePool(room.participants.size);
    room.availablePlayerPool = [...room.playerPool];
    room.availablePlayerIds = new Set(room.playerPool.map(item => item.id));

    this.broadcastRoomState(room);
    return { success: true, room };
  }

  // Confirm Participant & Room Setup -> Advance directly to Lobby
  confirmSetup(roomId, userId, { budget, participants, poolSize, aiDifficulty } = {}, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room) return { success: false, message: 'Room not found.' };
    const hostPart = room.participants.get(userId);
    if (room.hostId !== userId && (!hostPart || !hostPart.isHost)) {
      return { success: false, message: 'Only the room host can confirm setup.' };
    }
    if (options.callerSocketId && hostPart && hostPart.socketId && hostPart.socketId !== options.callerSocketId) {
      return { success: false, message: 'Unauthorized caller.' };
    }

    if (budget && typeof budget === 'number' && budget >= 10 && budget <= 500) {
      room.proposedBudget = budget;
      room.participants.forEach(p => {
        p.purse = budget;
        p.startingBudget = budget;
      });
    }

    if (aiDifficulty) {
      room.aiDifficulty = String(aiDifficulty).toUpperCase();
    }

    const categoryModule = CategoryRegistry.get(room.category);
    const categoryFranchises = categoryModule.getFranchises ? categoryModule.getFranchises() : (categoryModule.franchises || []);

    if (Array.isArray(participants) && participants.length > 0) {
      participants.forEach((p, idx) => {
        if (p.type === 'COMPUTER' && !room.participants.has(p.id)) {
          let botFranchise = null;
          if (p.teamId && !room.teamOwnership.has(p.teamId)) {
            botFranchise = getCategoryFranchise(categoryModule, p.teamId);
          }
          if (!botFranchise) {
            botFranchise = categoryFranchises.find(f => !room.teamOwnership.has(f.id));
          }
          const botId = p.id || `bot_${Date.now()}_${idx}`;
          if (botFranchise) {
            room.teamOwnership.set(botFranchise.id, botId);
          }

          let botAvatar = p.avatar;
          if (!botAvatar) {
            botAvatar = getBotAvatarForName(p.name, idx);
          } else {
            const gender = getGenderForName(p.name);
            const isFemale = ['avatar_6', 'avatar_7', 'avatar_8', 'avatar_9', 'avatar_female_1', 'avatar_female_2', 'avatar_female_3', 'avatar_female_4'].includes(botAvatar);
            if (gender === 'male' && isFemale) {
              botAvatar = getBotAvatarForName(p.name, idx);
            } else if (gender === 'female' && !isFemale) {
              botAvatar = getBotAvatarForName(p.name, idx);
            }
          }

          const bot = new AuctionBot({
            id: botId,
            name: p.name,
            teamId: botFranchise ? botFranchise.id : null,
            teamName: botFranchise ? botFranchise.name : p.teamName,
            strategy: p.strategy || 'balanced',
            avatar: botAvatar,
            difficulty: room.aiDifficulty
          });
          room.bots.push(bot);
          room.participants.set(botId, {
            id: botId,
            uniqueId: p.uniqueId || `AI-${botId.toUpperCase()}`,
            name: p.name,
            avatar: botAvatar,
            teamId: botFranchise ? botFranchise.id : null,
            teamName: botFranchise ? botFranchise.name : p.teamName,
            purse: room.proposedBudget,
            startingBudget: room.proposedBudget,
            squad: [],
            isReady: true,
            isHost: false,
            isAI: true,
            type: 'COMPUTER'
          });
          room.budgetVotes.set(botId, true);
        }
      });

      // Recalculate dynamic pool
      room.playerPool = categoryModule.generatePool(room.participants.size, poolSize);
      room.availablePlayerPool = [...room.playerPool];
      room.availablePlayerIds = new Set(room.playerPool.map(item => item.id));
    }

    room.state = 'BUDGET_SELECTION';
    room.bots.forEach(b => room.budgetVotes.set(b.id, true));
    Array.from(room.participants.values()).forEach(p => {
      if (p.isAI || p.isStagingTestAccount) {
        room.budgetVotes.set(p.id, true);
      }
    });
    this.broadcastRoomState(room);
    this.io.to(room.id).emit('setup_complete', {
      roomId: room.id,
      state: 'BUDGET_SELECTION',
      proposedBudget: room.proposedBudget
    });
    return { success: true, room };
  }

  // Real-time server-authoritative team selection (Screen 14 Lobby & Team Selection)
  selectTeam(roomId, userId, teamId, options = {}) {
    const opts = typeof options === 'string' ? { movieTitle: options } : (options || {});
    const room = this.resolveRoom(roomId);
    if (!room) return { success: false, message: 'Room not found.' };
    if (room.state !== 'SETUP' && room.state !== 'BUDGET_SELECTION' && room.state !== 'LOBBY') {
      return { success: false, message: 'Teams cannot be changed once the auction has started.' };
    }

    const participant = room.participants.get(userId);
    if (options.callerSocketId) {
      if (participant && participant.isAI) {
        return { success: false, message: 'Unauthorized: Cannot select team for an AI participant.' };
      }
      if (participant && participant.socketId && participant.socketId !== options.callerSocketId) {
        return { success: false, message: 'Unauthorized: Cannot select team for another participant.' };
      }
    }

    const categoryModule = CategoryRegistry.get(room.category);
    const userUniqueId = participant?.uniqueId || userId;
    const franchise = getCategoryFranchise(categoryModule, teamId, userUniqueId);
    if (!franchise) {
      return { success: false, message: 'Invalid team or franchise selected.' };
    }

    if (!room.teamOwnership) {
      room.teamOwnership = new Map();
    }

    // Official entities require strict 1-participant-per-room reservation
    // Custom entities are identified by instance id (e.g. custom_xxx) and private to creator
    if (!franchise.isCustom) {
      const currentOwnerId = room.teamOwnership.get(franchise.id);
      const isSameUser = currentOwnerId === userId ||
                         (participant && (currentOwnerId === participant.uniqueId || currentOwnerId === participant.id));
      if (currentOwnerId && !isSameUser) {
        let ownerParticipant = room.participants.get(currentOwnerId);
        if (!ownerParticipant) {
          for (const p of room.participants.values()) {
            if (p.id === currentOwnerId || p.uniqueId === currentOwnerId) {
              ownerParticipant = p;
              break;
            }
          }
        }
        if (ownerParticipant && ownerParticipant.isAI) {
          // Human is sovereign: AI bot yields and reassigns to an unowned franchise
          const categoryFranchises = categoryModule.getFranchises ? categoryModule.getFranchises() : (categoryModule.franchises || []);
          const unowned = categoryFranchises.find(f => f.id !== franchise.id && !room.teamOwnership.has(f.id));
          if (unowned) {
            room.teamOwnership.set(unowned.id, currentOwnerId);
            ownerParticipant.teamId = unowned.id;
            ownerParticipant.teamName = unowned.name;
            const botObj = room.bots.find(b => b.id === currentOwnerId);
            if (botObj) {
              botObj.teamId = unowned.id;
              botObj.teamName = unowned.name;
            }
          } else {
            room.teamOwnership.delete(franchise.id);
          }
        } else {
          const ownerName = ownerParticipant ? ownerParticipant.name : 'Another player';
          return {
            success: false,
            message: `${franchise.name} has already been selected by ${ownerName}. Please choose another team.`
          };
        }
      }
    }

    // Release any previous official team owned by this user
    for (const [tId, uId] of room.teamOwnership.entries()) {
      if (uId === userId || (participant && (uId === participant.uniqueId || uId === participant.id))) {
        room.teamOwnership.delete(tId);
      }
    }

    // Claim the new team
    room.teamOwnership.set(franchise.id, userId);

    // Update participant's team information
    if (participant) {
      participant.teamId = franchise.id;
      participant.teamName = franchise.name;
      participant.isCustom = !!franchise.isCustom;
      if (opts.movieTitle && typeof opts.movieTitle === 'string') {
        participant.movieTitle = opts.movieTitle.trim().slice(0, 80);
      }
    }

    // In staging test mode: if host is a test account, auto-advance setup/lobby to budget selection
    if (room.hostUser && room.hostUser.isStagingTestAccount && (room.state === 'SETUP' || room.state === 'LOBBY')) {
      setTimeout(() => {
        if (room.state === 'SETUP' || room.state === 'LOBBY') {
          this.confirmSetup(room.id, room.hostId, {
            budget: room.proposedBudget || 100,
            poolSize: 15,
            aiDifficulty: 'MEDIUM'
          });
        }
      }, 500);
    }

    this.broadcastRoomState(room);
    return { success: true, franchise };
  }

  // Pre-Auction Lobby (Screen 14)
  toggleReady(roomId, userId, teamName, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room || room.state !== 'LOBBY') return;

    const p = room.participants.get(userId);
    if (!p) return;
    if (options.callerSocketId && p.socketId && p.socketId !== options.callerSocketId) {
      return;
    }
    p.isReady = !p.isReady;
    if (teamName) {
      const categoryModule = CategoryRegistry.get(room.category);
      const franchise = getCategoryFranchise(categoryModule, teamName);
      if (franchise) {
        const currentOwner = room.teamOwnership ? room.teamOwnership.get(franchise.id) : null;
        const isSame = currentOwner === userId || (p && (currentOwner === p.uniqueId || currentOwner === p.id));
        if (currentOwner && !isSame) {
          let ownerPart = room.participants.get(currentOwner);
          if (!ownerPart) {
            for (const part of room.participants.values()) {
              if (part.id === currentOwner || part.uniqueId === currentOwner) {
                ownerPart = part;
                break;
              }
            }
          }
          if (ownerPart && ownerPart.isAI) {
            const categoryFranchises = categoryModule.getFranchises ? categoryModule.getFranchises() : (categoryModule.franchises || []);
            const unowned = categoryFranchises.find(f => f.id !== franchise.id && !room.teamOwnership.has(f.id));
            if (unowned) {
              room.teamOwnership.set(unowned.id, currentOwner);
              ownerPart.teamId = unowned.id;
              ownerPart.teamName = unowned.name;
              const botObj = room.bots.find(b => b.id === currentOwner);
              if (botObj) {
                botObj.teamId = unowned.id;
                botObj.teamName = unowned.name;
              }
            }
          }
        }
        const updatedOwner = room.teamOwnership ? room.teamOwnership.get(franchise.id) : null;
        const isOwnerOrAvailable = !updatedOwner || updatedOwner === userId || (p && (updatedOwner === p.uniqueId || updatedOwner === p.id));
        if (isOwnerOrAvailable) {
          if (room.teamOwnership) {
            for (const [tId, uId] of room.teamOwnership.entries()) {
              if (uId === userId || (p && (uId === p.uniqueId || uId === p.id))) room.teamOwnership.delete(tId);
            }
            room.teamOwnership.set(franchise.id, userId);
          }
          p.teamId = franchise.id;
          p.teamName = franchise.name;
        }
      } else {
        p.teamName = teamName;
      }
    }

    this.broadcastRoomState(room);
  }

  startAuction(roomId, userId, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room || (room.state !== 'LOBBY' && room.state !== 'SETUP' && room.state !== 'BUDGET_SELECTION')) return;
    const hostPart = room.participants.get(userId);
    const isHost = (room.hostId === userId) || (hostPart && hostPart.isHost === true);
    if (!isHost) return;
    if (options.callerSocketId && hostPart && hostPart.socketId && hostPart.socketId !== options.callerSocketId) {
      return;
    }

    room.state = 'AUCTION_ACTIVE';
    room.currentPlayerIndex = 0;
    room.currentLotNumber = 0;
    room.isResolvingLot = false;

    // Fixed sequence of unique players for this match: ensure clean state
    room.availablePlayerPool = [...room.playerPool];
    room.availablePlayerIds = new Set(room.playerPool.map(p => p.id));
    room.auctionedPlayerIds = new Set();
    room.lotSequence = [];
    room.lotHistoryByPlayerId = new Map();

    this.startPlayerAuction(room);
  }

  // Live Auction Logic (Screens 15-26)
  startPlayerAuction(room) {
    clearInterval(room.timerInterval);
    clearTimeout(room.lotTimeout);
    clearTimeout(room.aiBidTimeout);
    room.isResolvingLot = false;

    // 🔒 ONE PLAYER = ONE APPEARANCE PER AUCTION
    // Filter available pool to ensure NO auctioned player is ever selected
    const unauctioned = room.availablePlayerPool.filter(p => !room.auctionedPlayerIds.has(p.id));

    // If no unauctioned players remain or lot index exceeds pool, finish auction
    if (unauctioned.length === 0 || room.currentPlayerIndex >= room.playerPool.length) {
      this.finishAuction(room);
      return;
    }

    // Select next player from the unauctioned pool
    let candidate = unauctioned[0];
    const lotNumber = (room.currentLotNumber || 0) + 1;

    // Server-Side Safety Check:
    // Reject any candidate whose ID already exists in auctionedPlayerIds
    if (room.auctionedPlayerIds.has(candidate.id)) {
      const previousLot = room.lotHistoryByPlayerId.get(candidate.id) || 'UNKNOWN_LOT';
      console.error('🚨 DUPLICATE AUCTION PLAYER DETECTED:');
      console.error(`  playerId: ${candidate.id}`);
      console.error(`  playerName: ${candidate.name}`);
      console.error(`  lotNumber: ${lotNumber}`);
      console.error(`  previousLot: ${previousLot}`);
      console.error(`  currentLot: ${lotNumber}`);

      // Reject selection and pick another completely unused player
      const safeCandidate = room.availablePlayerPool.find(p => !room.auctionedPlayerIds.has(p.id));
      if (!safeCandidate) {
        console.warn(`[Room ${room.id}] No more unauctioned players available. Completing auction.`);
        this.finishAuction(room);
        return;
      }
      candidate = safeCandidate;
    }

    // Authoritative development assertion: Candidate MUST NOT have been auctioned
    if (room.auctionedPlayerIds.has(candidate.id)) {
      throw new Error(`CRITICAL INTEGRITY FAILURE: Attempted to auction already-used player ${candidate.id} (${candidate.name}) in lot ${lotNumber}`);
    }

    // 🔒 ONE PLAYER = ONE APPEARANCE PER AUCTION
    // Immediately mark player as auctioned BEFORE the lot begins (prevents race conditions, re-entries, timer events)
    room.auctionedPlayerIds.add(candidate.id);
    room.currentLotNumber = lotNumber;
    room.lotHistoryByPlayerId.set(candidate.id, lotNumber);

    // Remove permanently from availablePlayerPool and availablePlayerIds
    room.availablePlayerPool = room.availablePlayerPool.filter(p => p.id !== candidate.id);
    room.availablePlayerIds.delete(candidate.id);

    // Set authoritative current player for this lot
    const player = candidate;
    room.currentPlayer = player;
    room.state = 'AUCTION_ACTIVE';
    room.currentBid = 0; // Starts at base price on first bid
    room.currentLeader = null;
    room.bidVersion = 0; // Monotonically increasing sequence per lot
    room.processedRequestIds = new Set(); // Prevent duplicate processing
    const lotDuration = room.lotDurationMs || 10000;
    room.timerDurationMs = lotDuration;
    room.timerEndTimestamp = Date.now() + lotDuration;
    room.timerSeconds = Math.round(lotDuration / 1000);
    room.reactions = [];

    // Track lot sequence for end-of-match verification
    room.currentLotRecord = {
      lotNumber,
      playerId: player.id,
      playerName: player.name,
      basePrice: player.basePrice,
      startTime: Date.now()
    };

    console.log(`[Auction Lot ${lotNumber}] Started: ${player.name} (${player.id}) • Base: ₹${player.basePrice} Cr • Remaining pool: ${room.availablePlayerPool.length}`);

    this.broadcastRoomState(room);

    // Authoritative Timer without 1Hz network tick spam
    room.lotTimeout = setTimeout(() => {
      if (room.state === 'AUCTION_ACTIVE') {
        this.resolveCurrentPlayer(room);
      }
    }, lotDuration);

    // Trigger AI bots to evaluate bid
    this.scheduleAIBidding(room);
  }

  placeBid(roomId, userId, proposedAmount, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room || room.state !== 'AUCTION_ACTIVE' || room.isResolvingLot) {
      const reason = 'Auction lot is not active or is currently concluding.';
      console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: proposedAmount, reason, userId }));
      return { success: false, message: reason, code: 'AUCTION_NOT_ACTIVE' };
    }

    const { requestId, clientTimestamp } = options;

    // Deduplication check
    if (requestId && room.processedRequestIds && room.processedRequestIds.has(requestId)) {
      const reason = 'Duplicate request already processed.';
      console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: proposedAmount, reason, requestId }));
      return { success: false, message: reason, code: 'DUPLICATE_REQUEST' };
    }

    const participant = room.participants.get(userId);
    if (!participant) {
      const reason = 'Participant not found in room.';
      console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: proposedAmount, reason, userId }));
      return { success: false, message: reason, code: 'PARTICIPANT_NOT_FOUND' };
    }

    // Security Hardening (Anti-Spoofing): Ensure socket caller actually owns this participant identity
    if (options.callerSocketId) {
      if (participant.isAI) {
        const reason = 'Unauthorized: Human client cannot submit bids on behalf of an AI participant.';
        console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: proposedAmount, reason, userId, caller: options.callerSocketId }));
        return { success: false, message: reason, code: 'UNAUTHORIZED_CALLER' };
      }
      if (!participant.socketId || participant.socketId !== options.callerSocketId) {
        const reason = 'Unauthorized: You cannot submit bids on behalf of another participant.';
        console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: proposedAmount, reason, userId, caller: options.callerSocketId }));
        return { success: false, message: reason, code: 'UNAUTHORIZED_CALLER' };
      }
    }

    const player = room.currentPlayer || room.playerPool[room.currentPlayerIndex];
    if (!player) {
      const reason = 'No active player in this lot.';
      console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: proposedAmount, reason, userId }));
      return { success: false, message: reason, code: 'NO_ACTIVE_PLAYER' };
    }

    const amount = Math.round(Number(proposedAmount) * 10) / 10;
    if (isNaN(amount) || amount <= 0) {
      const reason = 'Invalid bid amount.';
      console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: proposedAmount, reason }));
      return { success: false, message: reason, code: 'INVALID_AMOUNT' };
    }

    // Rule: Strict validation check - A player cannot submit a new bid if they are already the current leader
    if (room.currentLeader && (room.currentLeader.id === userId || (participant && room.currentLeader.id === participant.id))) {
      const reason = 'You already hold the highest bid.';
      console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: proposedAmount, reason, userId, currentBid: room.currentBid }));
      return { success: false, message: reason, code: 'ALREADY_LEADER', currentBid: room.currentBid, currentLeader: room.currentLeader, bidVersion: room.bidVersion };
    }

    // Validation:
    // 1. Must be >= base price if first bid, or >= currentBid + minimum allowable increment
    const isCr = Boolean(room.categoryConfig && room.categoryConfig.unitLabel && room.categoryConfig.unitLabel.toLowerCase() === 'cr');
    const minIncrement = isCr ? (room.currentBid < 1.0 ? 0.1 : 0.2) : 1.0;
    const minBid = room.currentBid === 0 ? player.basePrice : Math.round((room.currentBid + minIncrement) * 10) / 10;
    if (amount < minBid) {
      const reason = `Bid of ₹${amount} was outbid. Current minimum bid is ₹${minBid}.`;
      console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: amount, reason, currentBid: room.currentBid, minBid, bidVersion: room.bidVersion }));
      return { success: false, message: reason, code: 'OUTBID', currentBid: room.currentBid, minBid, bidVersion: room.bidVersion };
    }

    // 2. Must not exceed remaining purse
    if (amount > participant.purse) {
      const reason = `Insufficient purse balance! Bid (₹${amount}) exceeds remaining purse (₹${participant.purse}).`;
      console.log('[BID_REJECTED]', JSON.stringify({ auctionId: roomId, requestedAmount: amount, reason, participantPurse: participant.purse }));
      return { success: false, message: reason, code: 'INSUFFICIENT_PURSE', participantPurse: participant.purse };
    }

    // Mark requestId as processed
    if (requestId) {
      if (!room.processedRequestIds) room.processedRequestIds = new Set();
      room.processedRequestIds.add(requestId);
    }

    // 3. Increment monotonic bidVersion
    room.bidVersion = (room.bidVersion || 0) + 1;
    const currentBidVersion = room.bidVersion;

    // 4. Atomic update of auction state
    room.currentBid = amount;
    room.currentLeader = {
      id: participant.id,
      name: participant.name,
      teamName: participant.teamName,
      avatar: participant.avatar,
      amount
    };

    // 5. Timer Reset Rule (Screen 19): "Every valid bid resets the countdown"
    const lotDuration = room.lotDurationMs || 10000;
    room.timerDurationMs = lotDuration;
    room.timerEndTimestamp = Date.now() + lotDuration;
    room.timerSeconds = Math.round(lotDuration / 1000);

    clearTimeout(room.lotTimeout);
    room.lotTimeout = setTimeout(() => {
      if (room.state === 'AUCTION_ACTIVE') {
        this.resolveCurrentPlayer(room);
      }
    }, lotDuration);

    const serverTimestamp = Date.now();

    // DIAGNOSTIC LOGGING AS REQUIRED BY PROMPT:
    console.log('[BID_ACCEPTED]', JSON.stringify({
      auctionId: room.id,
      lotNumber: room.currentLotNumber,
      bidVersion: currentBidVersion,
      amount,
      bidderId: participant.id,
      serverTimestamp
    }));

    const acceptedPayload = {
      auctionId: room.id,
      lotNumber: room.currentLotNumber,
      bidVersion: currentBidVersion,
      amount,
      bidderId: participant.id,
      leader: room.currentLeader,
      serverTimestamp,
      requestId,
      remainingPurse: participant.purse
    };

    // 6. Outbid Event Animation broadcast with authoritative bidVersion
    this.io.to(room.id).emit('outbid_event', {
      leader: room.currentLeader,
      newBid: amount,
      bidVersion: currentBidVersion,
      lotNumber: room.currentLotNumber,
      timerReset: 10,
      timerEndTimestamp: room.timerEndTimestamp,
      timerDurationMs: 10000,
      bidderId: participant.id,
      bidderPurse: participant.purse,
      requestId
    });

    this.broadcastRoomState(room);

    // Re-evaluate AI bots against the new high bid
    this.scheduleAIBidding(room);
    return { success: true, ...acceptedPayload };
  }

  scheduleAIBidding(room) {
    if (room.bots.length === 0 || room.isResolvingLot) return;
    clearTimeout(room.aiBidTimeout);

    const player = room.currentPlayer || room.playerPool[room.currentPlayerIndex];
    if (!player) return;

    // Collect decisions from all bots
    const remainingTime = (room.timerEndTimestamp || (Date.now() + 10000)) - Date.now();
    const remainingSeconds = Math.max(0, Math.round(remainingTime / 1000));

    const roomContext = {
      remainingPool: room.playerPool ? room.playerPool.slice(room.currentPlayerIndex + 1) : [],
      currentLotIndex: room.currentPlayerIndex,
      totalPoolSize: room.playerPool ? room.playerPool.length : 0,
      opponents: Array.from(room.participants.values()),
      aiDifficulty: room.aiDifficulty || 'MEDIUM'
    };

    const botDecisions = [];
    room.bots.forEach(bot => {
      const botParticipant = room.participants.get(bot.id);
      if (!botParticipant) return;

      const decision = bot.evaluateBid(
        player,
        room.currentBid,
        room.currentLeader ? room.currentLeader.id : null,
        botParticipant.purse,
        botParticipant.squad,
        room.proposedBudget,
        remainingSeconds,
        roomContext
      );

      if (decision) {
        botDecisions.push(decision);
      }
    });

    if (botDecisions.length === 0) return;

    // Pick the quickest bot reaction
    botDecisions.sort((a, b) => a.delayMs - b.delayMs);
    const chosen = botDecisions[0];

    const timerScale = (room.lotDurationMs || 10000) / 10000;
    const scaledDelay = Math.max(50, Math.round(chosen.delayMs * timerScale));

    room.aiBidTimeout = setTimeout(() => {
      const liveRemaining = (room.timerEndTimestamp || 0) - Date.now();
      const minCutoff = Math.round(1000 * timerScale);
      if (room.state === 'AUCTION_ACTIVE' && !room.isResolvingLot && liveRemaining > minCutoff) {
        this.placeBid(room.id, chosen.botId, chosen.amount);
      }
    }, scaledDelay);
  }

  resolveCurrentPlayer(room) {
    // Guard against race conditions / duplicate resolution
    if (room.isResolvingLot) return;
    room.isResolvingLot = true;

    clearTimeout(room.lotTimeout);
    clearTimeout(room.aiBidTimeout);

    const player = room.currentPlayer || room.playerPool[room.currentPlayerIndex];
    if (!player) {
      this.finishAuction(room);
      return;
    }

    if (room.currentLeader && room.currentBid > 0) {
      // SOLD (Screen 22)
      const winner = room.participants.get(room.currentLeader.id);
      if (winner) {
        winner.squad.push({
          ...player,
          soldPrice: room.currentBid
        });
        // Strict formula per user instruction:
        // remainingPurse = startingBudget - sum(all purchased players/items soldPrice)
        const totalSpent = winner.squad.reduce((sum, item) => sum + (item.soldPrice || item.basePrice || 0), 0);
        winner.purse = Math.round((winner.startingBudget - totalSpent) * 10) / 10;
      }

      room.state = 'SOLD';
      const soldData = {
        player,
        winner: winner ? {
          id: winner.id,
          name: winner.name,
          teamName: winner.teamName,
          avatar: winner.avatar,
          remainingPurse: winner.purse
        } : null,
        amount: room.currentBid,
        lotNumber: room.currentLotNumber
      };

      if (room.currentLotRecord) {
        room.currentLotRecord.status = 'SOLD';
        room.currentLotRecord.winnerId = winner ? winner.id : null;
        room.currentLotRecord.soldPrice = room.currentBid;
        room.lotSequence.push(room.currentLotRecord);
      }

      console.log(`[Auction Lot ${room.currentLotNumber}] SOLD: ${player.name} (${player.id}) to ${winner ? winner.name : 'Unknown'} for ₹${room.currentBid} Cr`);
      this.io.to(room.id).emit('player_sold', soldData);
    } else {
      // UNSOLD (Screen 23)
      room.state = 'UNSOLD';
      if (room.currentLotRecord) {
        room.currentLotRecord.status = 'UNSOLD';
        room.currentLotRecord.winnerId = null;
        room.currentLotRecord.soldPrice = 0;
        room.lotSequence.push(room.currentLotRecord);
      }

      console.log(`[Auction Lot ${room.currentLotNumber}] UNSOLD: ${player.name} (${player.id}) - Permanently removed from remaining pool.`);
      this.io.to(room.id).emit('player_unsold', { player, lotNumber: room.currentLotNumber });
    }

    // 🔒 Both SOLD and UNSOLD: Permanently removed from match. Never eligible again.
    room.availablePlayerPool = room.availablePlayerPool.filter(p => p.id !== player.id);
    room.availablePlayerIds.delete(player.id);

    this.broadcastRoomState(room);

    // 3.5s pause to celebrate/absorb SOLD/UNSOLD moment before next player
    const pauseDuration = room.pauseDurationMs || 3500;
    if (room.pauseTimeout) clearTimeout(room.pauseTimeout);
    room.pauseTimeout = setTimeout(() => {
      room.currentPlayerIndex += 1;
      this.startPlayerAuction(room);
    }, pauseDuration);
  }

  finishAuction(room) {
    room.state = 'RESULTS';
    room.finishVoteState = 'FINISH_APPROVED';
    clearInterval(room.timerInterval);
    clearTimeout(room.lotTimeout);
    clearTimeout(room.aiBidTimeout);
    if (room.pauseTimeout) clearTimeout(room.pauseTimeout);
    room.isResolvingLot = false;

    // ==========================================
    // Authoritative End-of-Match Verification
    // ==========================================
    const totalLotsAuctioned = room.lotSequence.length;
    const uniqueAuctionedIds = new Set(room.lotSequence.map(lot => lot.playerId));
    const uniquePlayersAuctioned = uniqueAuctionedIds.size;
    const duplicateCount = totalLotsAuctioned - uniquePlayersAuctioned;

    console.log('==============================================');
    console.log(`🏁 AUCTION FINISHED [Room: ${room.id}]`);
    console.log(`  Total Lots Conducted: ${totalLotsAuctioned}`);
    console.log(`  Unique Players Auctioned: ${uniquePlayersAuctioned}`);
    console.log(`  Duplicate Players: ${duplicateCount}`);

    if (duplicateCount > 0) {
      console.error('🚨 CRITICAL MATCH INTEGRITY ERROR: DUPLICATES DETECTED IN LOT SEQUENCE!');
      const seen = new Set();
      room.lotSequence.forEach(lot => {
        if (seen.has(lot.playerId)) {
          console.error(`  DUPLICATE DETECTED: Player ID ${lot.playerId} (${lot.playerName}) in Lot ${lot.lotNumber}`);
        }
        seen.add(lot.playerId);
      });
    } else {
      console.log(`✅ MATCH VERIFICATION PASSED: ${totalLotsAuctioned} lots, ${uniquePlayersAuctioned} unique player IDs, 0 duplicates.`);
    }
    console.log('==============================================');

    // Generate Signature AI Analysis (Screen 29) and Winner Ranking (Screen 30)
    const evaluation = this.computeAIAnalysis(room);
    room.analysis = evaluation;

    // Record match to store for persistent human accounts
    room.participants.forEach(p => {
      if (!p.isAI) {
        const isWinner = evaluation.rankings[0] && evaluation.rankings[0].id === p.id;
        const targetId = p.uniqueId || p.bidId || p.id;

        const purchases = (p.squad || []).map(item => ({
          id: item.id,
          name: item.auctionedPersonName || item.name,
          role: item.auctionedPersonRole || item.role,
          auctionedPersonName: item.auctionedPersonName || item.name,
          auctionedPersonRole: item.auctionedPersonRole || item.role,
          movieTitle: item.movieTitle || null,
          directorName: item.directorName || null,
          producerName: item.producerName || null,
          leadActorName: item.leadActorName || null,
          studioName: item.studioName || null,
          price: item.soldPrice !== undefined ? item.soldPrice : item.basePrice,
          image: item.image || null
        }));

        const opponents = Array.from(room.participants.values())
          .filter(part => part.id !== p.id)
          .map(part => ({
            id: part.id,
            name: part.name,
            teamName: part.teamName,
            isAI: !!part.isAI,
            rank: evaluation.rankings.findIndex(r => r.id === part.id) + 1
          }));

        const participants = Array.from(room.participants.values()).map(part => ({
          id: part.id,
          name: part.name,
          teamName: part.teamName,
          isAI: !!part.isAI,
          rank: evaluation.rankings.findIndex(r => r.id === part.id) + 1
        }));

        let movieProduction = null;
        if (room.category === 'movie_stars') {
          const lead = purchases.find(item => item.role === 'Lead Actor' || item.category === 'Lead Actor') || purchases[0];
          const dir = purchases.find(item => item.role === 'Director' || item.category === 'Director');
          movieProduction = {
            productionId: `prod_${Date.now()}_${p.id}`,
            ownerUserId: p.id,
            roomId: room.id,
            movieTitle: p.movieTitle || 'Untitled Feature',
            studioEntityId: p.teamId || 'custom_studio',
            studioNameSnapshot: p.teamName || 'Independent Pictures',
            directorSnapshot: dir ? dir.name : 'Unknown Director',
            leadActorSnapshot: lead ? lead.name : 'Ensemble Cast',
            castSnapshot: purchases.map(it => ({
              id: it.id,
              name: it.name,
              role: it.role || it.category || 'Cast',
              price: it.price || it.winningBid || 0,
            })),
            completedAt: new Date().toISOString()
          };
        }

        const matchRecord = {
          matchId: room.id,
          roomCode: room.roomCode || null,
          mode: room.mode,
          category: room.category,
          categoryTitle: room.categoryConfig?.title || room.category,
          currencySymbol: room.categoryConfig?.currencySymbol || '$',
          unitLabel: room.categoryConfig?.unitLabel || 'M',
          teamId: p.teamId || null,
          teamName: p.teamName || 'My Team',
          isCustom: Boolean(p.isCustom),
          movieTitle: p.movieTitle || null,
          movieProduction,
          budget: room.proposedBudget,
          squad: p.squad,
          purchases,
          purchasesCount: purchases.length,
          opponents,
          opponentsCount: opponents.length,
          participants,
          participantsCount: participants.length,
          purseRemaining: p.purse,
          totalSpent: Math.round((room.proposedBudget - p.purse) * 10) / 10,
          rank: evaluation.rankings.findIndex(r => r.id === p.id) + 1,
          isWinner,
          trophyEarned: isWinner ? 1 : 0,
          aiScore: evaluation.teamReports[p.id] ? evaluation.teamReports[p.id].overallScore : 80,
          finalScore: evaluation.teamReports[p.id] ? evaluation.teamReports[p.id].overallScore : 80
        };

        const result = store.recordMatch(targetId, matchRecord);

        // Notify client immediately via socket so trophies and history refresh without delay
        const socketId = p.socketId;
        if (socketId) {
          const userObj = (result && result.user) || store.findUserByUniqueId(targetId);
          this.io.to(socketId).emit('user_profile_updated', {
            user: userObj,
            history: store.getMatchHistory(targetId),
            trophyEarned: isWinner ? 1 : 0,
            trophies: userObj ? userObj.trophies : (isWinner ? 1 : 0),
            matchRecord
          });
        }
      }
    });

    this.broadcastRoomState(room);
    this.io.to(room.id).emit('auction_finished', evaluation);

    // Notify presence change: match has finished, participants return to AVAILABLE
    room.participants.forEach(p => {
      if (!p.isAI && p.uniqueId) {
        const normU = p.uniqueId.trim().toUpperCase();
        this.userLifecycle.set(normU, 'AVAILABLE');
        if (this.onPresenceChanged) {
          this.onPresenceChanged(normU);
        }
      }
    });
  }

  // Signature AI Analysis Engine (Screen 29 & 30) - Delegated to Category Module
  computeAIAnalysis(room) {
    const categoryModule = CategoryRegistry.get(room.category);
    return categoryModule.generateAnalysis(room);
  }

  serializeRoom(room) {
    if (!room) return null;
    const currentPlayer = room.currentPlayer || (room.playerPool ? room.playerPool[room.currentPlayerIndex] : null) || null;
    return {
      id: room.id,
      roomCode: room.roomCode || null,
      category: room.category,
      categoryConfig: room.categoryConfig,
      mode: room.mode,
      aiDifficulty: room.aiDifficulty || 'MEDIUM',
      state: room.state,
      hostId: room.hostId,
      proposedBudget: room.proposedBudget,
      budgetVotes: room.budgetVotes instanceof Map ? Object.fromEntries(room.budgetVotes) : (room.budgetVotes || {}),
      participants: room.participants instanceof Map ? Array.from(room.participants.values()) : (Array.isArray(room.participants) ? room.participants : []),
      currentPlayerIndex: room.currentPlayerIndex,
      currentLotNumber: room.currentLotNumber || (room.currentPlayerIndex + 1),
      totalPlayers: room.playerPool ? room.playerPool.length : 0,
      poolSize: room.playerPool ? room.playerPool.length : 0,
      currentPlayer,
      currentItem: currentPlayer,
      currentBid: room.currentBid || 0,
      currentLeader: room.currentLeader || null,
      bidVersion: room.bidVersion || 0,
      timerSeconds: room.timerSeconds !== undefined ? room.timerSeconds : 10,
      timerEndTimestamp: room.timerEndTimestamp || null,
      timerDurationMs: room.timerDurationMs || 10000,
      teamOwnership: room.teamOwnership instanceof Map ? Object.fromEntries(room.teamOwnership) : (room.teamOwnership && typeof room.teamOwnership === 'object' ? room.teamOwnership : {}),
      finishVoteState: room.finishVoteState || 'NORMAL',
      finishVote: room.finishVote || null,
      reactions: room.reactions || [],
      analysis: room.analysis || null
    };
  }

  broadcastRoomState(room) {
    if (!room || !room.id) return;
    const payload = this.serializeRoom(room);
    this.io.to(room.id).emit('room_state', payload);
  }

  broadcastReaction(roomId, userId, text, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room) return;
    const participant = room.participants.get(userId);
    if (!participant) return;
    if (options.callerSocketId && participant.socketId && participant.socketId !== options.callerSocketId) {
      return;
    }
    const userName = participant.name || participant.displayName || 'Bidder';
    const rxPayload = {
      id: `rx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId,
      userName,
      text,
      timestamp: Date.now()
    };
    if (!room.reactions) room.reactions = [];
    room.reactions.push(rxPayload);
    if (room.reactions.length > 20) room.reactions.shift();

    this.io.to(room.id).emit('reaction_posted', rxPayload);
  }

  // =========================================================================
  // UNIVERSAL FINISH AUCTION CONSENSUS SYSTEM (Server-Authoritative)
  // Strict Invariant: Runs in parallel with live auction. Never alters timer,
  // countdowns, bids, or natural lot progression. 100% Unanimous Agreement.
  // =========================================================================

  getActiveEligibleParticipants(room) {
    // Only participants who are currently active in the room (connected socket or active bot)
    const eligible = [];
    const hasSocketsMap = Boolean(this.io && this.io.sockets && this.io.sockets.sockets);

    for (const [pId, p] of room.participants.entries()) {
      if (p.isAI) {
        eligible.push({ id: pId, name: p.name, isAI: true });
      } else {
        // Discard permanently departed, disconnected or ghost participants
        if (p.hasLeft || p.isGhost || p.isDisconnected) {
          continue;
        }

        if (hasSocketsMap) {
          const socketObj = this.io.sockets.sockets.get ? this.io.sockets.sockets.get(p.socketId) : this.io.sockets.sockets[p.socketId];
          const isConnected = socketObj && (socketObj.connected !== false);
          if (isConnected || !p.socketId) {
            eligible.push({ id: pId, name: p.name, isAI: false, socketId: p.socketId });
          }
        } else {
          eligible.push({ id: pId, name: p.name, isAI: false, socketId: p.socketId });
        }
      }
    }
    return eligible;
  }

  handleSocketDisconnect(socketId) {
    if (!socketId) return;
    for (const room of this.rooms.values()) {
      for (const [pId, p] of room.participants.entries()) {
        if (p.socketId === socketId) {
          p.isDisconnected = true;
          p.disconnectedAt = Date.now();

          // If a finish auction request is currently pending, update voting tally
          if (room.finishVoteState === 'FINISH_REQUESTED' && room.finishVote) {
            const eligible = this.getActiveEligibleParticipants(room);
            const eligibleIds = eligible.map(e => e.id);
            room.finishVote.eligibleParticipantIds = eligibleIds;
            room.finishVote.totalRequired = eligibleIds.length;
            const agreedCount = eligibleIds.filter(id => room.finishVote.votes[id] === true).length;
            room.finishVote.agreedCount = agreedCount;

            // If remaining active participants now reach 100% unanimous agreement
            if (agreedCount >= room.finishVote.totalRequired && room.finishVote.totalRequired > 0) {
              this.resolveAndFinishAuction(room);
              return;
            } else {
              this.broadcastRoomState(room);
            }
          }
        }
      }
    }
  }

  requestFinishAuction(roomId, userId, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room) return { success: false, message: 'Room not found.' };

    const isLiveAuction = room.state === 'AUCTION_ACTIVE' || room.state === 'SOLD' || room.state === 'UNSOLD';
    if (!isLiveAuction) {
      return { success: false, message: 'Finish auction can only be requested during a live match.' };
    }

    const participant = room.participants.get(userId);
    if (!participant) {
      return { success: false, message: 'Participant not found in room.' };
    }
    if (options.callerSocketId && participant.socketId && participant.socketId !== options.callerSocketId) {
      return { success: false, message: 'Unauthorized caller.' };
    }

    // Atomic concurrency handling: If another participant taps at the same time, record as AGREE vote
    if (room.finishVoteState === 'FINISH_REQUESTED') {
      if (room.finishVote && !room.finishVote.votes[userId]) {
        return this.voteFinishAuction(roomId, userId, true, options);
      }
      return { success: true, alreadyRequested: true, room };
    }

    const eligible = this.getActiveEligibleParticipants(room);
    const eligibleIds = eligible.map(e => e.id);

    // Requester is automatically counted as agreed (1 vote)
    const votes = {};
    votes[userId] = true;

    // In computer/bot mode, active AI bots automatically agree
    room.bots.forEach(b => {
      votes[b.id] = true;
    });

    const totalRequired = eligibleIds.length;
    const agreedCount = eligibleIds.filter(id => votes[id] === true).length;

    room.finishVoteState = 'FINISH_REQUESTED';
    room.finishVote = {
      requestedBy: userId,
      requesterName: participant.name || 'Participant',
      votes,
      eligibleParticipantIds: eligibleIds,
      totalRequired,
      agreedCount,
      requestedAt: Date.now()
    };

    console.log(`[FINISH_AUCTION_REQUESTED] Room: ${room.id} by ${participant.name} (${userId}). Total required: ${totalRequired}, Agreed: ${agreedCount}`);

    // Broadcast updated finish vote state to room
    this.broadcastRoomState(room);
    this.io.to(room.id).emit('finish_auction_requested', {
      requestedBy: userId,
      requesterName: participant.name,
      totalRequired,
      agreedCount
    });

    // Check if immediately unanimous (e.g. 1 human + bots, or all eligible already agreed)
    if (agreedCount >= totalRequired && totalRequired > 0) {
      this.resolveAndFinishAuction(room);
      return { success: true, finished: true, room };
    }

    return { success: true, finished: false, room };
  }

  voteFinishAuction(roomId, userId, agreed, options = {}) {
    const room = this.resolveRoom(roomId);
    if (!room || room.finishVoteState !== 'FINISH_REQUESTED' || !room.finishVote) {
      return { success: false, message: 'No active finish auction request to vote on.' };
    }

    const participant = room.participants.get(userId);
    if (!participant) {
      return { success: false, message: 'Participant not found.' };
    }
    if (options.callerSocketId && participant.socketId && participant.socketId !== options.callerSocketId) {
      return { success: false, message: 'Unauthorized caller.' };
    }

    // 1. IGNORE BEHAVIOR: Any participant selecting IGNORE cancels request immediately
    if (!agreed) {
      console.log(`[FINISH_AUCTION_IGNORED] Room: ${room.id} by ${participant.name} (${userId}). Request cancelled.`);
      room.finishVoteState = 'FINISH_REJECTED';
      const cancelledBy = participant.name || 'Participant';

      this.io.to(room.id).emit('finish_auction_cancelled', {
        cancelledBy,
        userId,
        message: `${cancelledBy} chose to continue the auction.`
      });

      // Clear finish vote and return to NORMAL. Timer and lot remain completely untouched!
      room.finishVote = null;
      room.finishVoteState = 'NORMAL';
      this.broadcastRoomState(room);
      return { success: true, cancelled: true };
    }

    // 2. AGREE BEHAVIOR: Register vote exactly once
    if (room.finishVote.votes[userId] === true) {
      return { success: true, alreadyVoted: true };
    }

    room.finishVote.votes[userId] = true;

    // Refresh eligible participants in case anyone disconnected
    const eligible = this.getActiveEligibleParticipants(room);
    const eligibleIds = eligible.map(e => e.id);
    room.finishVote.eligibleParticipantIds = eligibleIds;
    room.finishVote.totalRequired = eligibleIds.length;

    const agreedCount = eligibleIds.filter(id => room.finishVote.votes[id] === true).length;
    room.finishVote.agreedCount = agreedCount;

    console.log(`[FINISH_AUCTION_AGREE] Room: ${room.id} by ${participant.name} (${userId}). Progress: ${agreedCount}/${room.finishVote.totalRequired}`);

    this.broadcastRoomState(room);
    this.io.to(room.id).emit('finish_auction_progress', {
      voterId: userId,
      voterName: participant.name,
      agreedCount,
      totalRequired: room.finishVote.totalRequired
    });

    // 3. UNANIMOUS AGREEMENT CHECK: 100% of eligible participants must agree
    if (agreedCount >= room.finishVote.totalRequired && room.finishVote.totalRequired > 0) {
      this.resolveAndFinishAuction(room);
      return { success: true, finished: true, room };
    }

    return { success: true, finished: false, room };
  }

  resolveAndFinishAuction(room) {
    console.log(`[FINISH_AUCTION_APPROVED] Room: ${room.id}. Unanimous agreement reached! Resolving lot & finishing auction.`);
    room.finishVoteState = 'FINISH_APPROVED';

    // Clear any timers
    clearInterval(room.timerInterval);
    clearTimeout(room.lotTimeout);
    clearTimeout(room.aiBidTimeout);
    if (room.pauseTimeout) clearTimeout(room.pauseTimeout);

    // Rule: Resolve current lot safely before finishing
    // If unanimous agreement occurs while a lot is actively in AUCTION_ACTIVE:
    if (room.state === 'AUCTION_ACTIVE' && !room.isResolvingLot) {
      room.isResolvingLot = true;
      const player = room.currentPlayer || room.playerPool[room.currentPlayerIndex];
      if (player) {
        if (room.currentLeader && room.currentBid > 0) {
          // Current lot is SOLD to the current highest bidder
          const winner = room.participants.get(room.currentLeader.id);
          if (winner) {
            winner.squad.push({
              ...player,
              soldPrice: room.currentBid
            });
            const totalSpent = winner.squad.reduce((sum, item) => sum + (item.soldPrice || item.basePrice || 0), 0);
            winner.purse = Math.round((winner.startingBudget - totalSpent) * 10) / 10;
          }

          if (room.currentLotRecord) {
            room.currentLotRecord.status = 'SOLD';
            room.currentLotRecord.winnerId = winner ? winner.id : null;
            room.currentLotRecord.soldPrice = room.currentBid;
            room.lotSequence.push(room.currentLotRecord);
          }

          room.availablePlayerPool = room.availablePlayerPool.filter(p => p.id !== player.id);
          room.availablePlayerIds.delete(player.id);
          console.log(`[FINISH_AUCTION] Final lot ${room.currentLotNumber} SOLD to ${winner ? winner.name : 'Unknown'} for ₹${room.currentBid}`);
        } else {
          // Current lot is marked UNSOLD if there are no bids
          if (room.currentLotRecord) {
            room.currentLotRecord.status = 'UNSOLD';
            room.currentLotRecord.winnerId = null;
            room.currentLotRecord.soldPrice = 0;
            room.lotSequence.push(room.currentLotRecord);
          }

          room.availablePlayerPool = room.availablePlayerPool.filter(p => p.id !== player.id);
          room.availablePlayerIds.delete(player.id);
          console.log(`[FINISH_AUCTION] Final lot ${room.currentLotNumber} UNSOLD with 0 bids.`);
        }
      }
    }
    // If room.state is already 'SOLD' or 'UNSOLD', the lot was already naturally resolved. Never duplicate it!

    // Transition room to RESULTS
    this.finishAuction(room);
  }
}

module.exports = RoomManager;
