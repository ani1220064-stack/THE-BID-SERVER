const { CategoryRegistry } = require('../categories/CategoryRegistry');
const { AuctionBot, generateFictionalBots, DEFAULT_AI_PROFILES, getGenderForName, getBotAvatarForName } = require('../ai/AuctionBot');
const store = require('../services/store');

function getCategoryFranchise(catMod, idOrName) {
  if (!idOrName || !catMod) return null;
  if (catMod.getFranchiseById) {
    const f = catMod.getFranchiseById(idOrName);
    if (f) return f;
  }
  if (catMod.getFranchiseByName) {
    const f = catMod.getFranchiseByName(idOrName);
    if (f) return f;
  }
  return null;
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> Room
    this.roomCodes = new Map(); // normalized roomCode -> roomId
    this.matchmakingQueue = []; // [{ socket, user }]
  }

  // Normalizes code input: uppercase, trims, strips extra spaces, standardizes BID- prefix
  normalizeRoomCode(code) {
    if (!code || typeof code !== 'string') return '';
    let clean = code.trim().toUpperCase().replace(/\s+/g, '');
    if (!clean.startsWith('BID-')) {
      clean = clean.replace(/^BID/i, '').replace(/^-/, '');
      clean = `BID-${clean}`;
    }
    return clean;
  }

  // Cryptographically random, collision-free, legible code generator (e.g. BID-7K4P2)
  generateRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let attempts = 0;
    while (attempts < 200) {
      let suffix = '';
      for (let i = 0; i < 5; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const code = `BID-${suffix}`;
      if (!this.roomCodes.has(code)) {
        return code;
      }
      attempts++;
    }
    return `BID-${Date.now().toString(36).toUpperCase().substr(-5)}`;
  }

  getRoom(roomId) {
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  getRoomByCode(code) {
    if (!code) return null;
    const norm = this.normalizeRoomCode(code);
    const roomId = this.roomCodes.get(norm);
    if (roomId) return this.rooms.get(roomId) || null;
    return this.rooms.get(code) || null;
  }

  createRoom({ roomId, hostUser, category = 'ipl_cricket', mode = 'computer', customParticipants, participantCount, poolSize, roomCode, aiDifficulty = 'MEDIUM', lotDurationMs, pauseDurationMs, budget }) {
    const categoryModule = CategoryRegistry.get(category || 'ipl_cricket');

    let participantsCount;
    if (Array.isArray(customParticipants) && customParticipants.length > 0) {
      participantsCount = Math.max(1, Math.min(10, customParticipants.length));
    } else {
      participantsCount = mode === 'computer' ? 4 : 2;
    }

    // Generate match item pool dynamically from the category module
    const matchItems = categoryModule.generatePool(participantsCount, poolSize);

    // Authoritative room code generation for private rooms
    let finalRoomCode = null;
    if (mode === 'friends') {
      finalRoomCode = roomCode ? this.normalizeRoomCode(roomCode) : this.generateRoomCode();
      if (this.roomCodes.has(finalRoomCode)) {
        finalRoomCode = this.generateRoomCode();
      }
      this.roomCodes.set(finalRoomCode, roomId);
    }
    const categoryFranchises = categoryModule.getFranchises ? categoryModule.getFranchises() : (categoryModule.franchises || []);

    const room = {
      id: roomId,
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
      state: mode === 'friends' ? 'SETUP' : 'BUDGET_SELECTION',
      hostId: hostUser.id,
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
      isResolvingLot: false,
      reactions: [],
      createdAt: Date.now()
    };

    room.teamOwnership = new Map(); // teamId -> userId

    // Slot #1 is always Host ("Me") — permanently locked & cannot be removed
    let hostFranchise = null;
    if (Array.isArray(customParticipants)) {
      const hostCustom = customParticipants.find(p => p.id === hostUser.id || p.type === 'HOST');
      if (hostCustom && (hostCustom.teamId || hostCustom.teamName)) {
        hostFranchise = getCategoryFranchise(categoryModule, hostCustom.teamId) || 
                        getCategoryFranchise(categoryModule, hostCustom.teamName);
      }
    }
    if (!hostFranchise) {
      hostFranchise = getCategoryFranchise(categoryModule, hostUser.teamId) || 
                      getCategoryFranchise(categoryModule, hostUser.teamName) || 
                      categoryFranchises[0];
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
      name: hostUser.name,
      avatar: hostUser.avatar,
      teamId: hostFranchise ? hostFranchise.id : null,
      teamName: hostFranchise ? hostFranchise.name : (hostUser.teamName || 'Host Team'),
      purse: room.proposedBudget,
      startingBudget: room.proposedBudget,
      squad: [],
      isReady: false,
      isHost: true,
      isAI: false,
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
      const fictionalBots = generateFictionalBots(countToGenerate, [], [], room.aiDifficulty);
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

    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomIdOrCode, user) {
    let room = this.rooms.get(roomIdOrCode) || this.getRoomByCode(roomIdOrCode);
    if (!room) return { success: false, message: 'Invalid or expired room code.' };

    if (room.state !== 'SETUP' && room.state !== 'BUDGET_SELECTION' && room.state !== 'LOBBY') {
      // Allow reconnect if existing participant
      if (room.participants.has(user.id)) {
        const p = room.participants.get(user.id);
        p.socketId = user.socketId;
        return { success: true, room };
      }
      return { success: false, message: 'Auction is already underway.' };
    }

    if (!room.participants.has(user.id)) {
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
      // If not specified or already taken, assign first remaining unowned franchise
      if (!userFranchise) {
        userFranchise = categoryFranchises.find(f => !room.teamOwnership.has(f.id));
      }
      if (userFranchise) {
        room.teamOwnership.set(userFranchise.id, user.id);
      }

      if (user) {
        store.getOrCreateUser(user);
      }

      room.participants.set(user.id, {
        id: user.id,
        uniqueId: user.uniqueId || user.bidId || user.id,
        name: user.name,
        avatar: user.avatar || 'avatar_1',
        teamId: userFranchise ? userFranchise.id : null,
        teamName: userFranchise ? userFranchise.name : (user.teamName || `${user.name || 'Friend'}'s XI`),
        purse: room.proposedBudget,
        startingBudget: room.proposedBudget,
        squad: [],
        isReady: false,
        isHost: false,
        isAI: false,
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
    }

    return { success: true, room };
  }

  // Handle Starting Budget Negotiation (Screens 12 & 13)
  proposeBudget(roomId, userId, newBudget) {
    const room = this.rooms.get(roomId);
    if (!room || (room.state !== 'SETUP' && room.state !== 'BUDGET_SELECTION')) return;

    // Security Hardening: Validate proposed budget within legitimate bounds
    const budget = Math.round(Number(newBudget) * 10) / 10;
    if (isNaN(budget) || budget < 10 || budget > 500) {
      return;
    }

    room.proposedBudget = budget;
    room.participants.forEach(p => {
      p.purse = room.proposedBudget;
      p.startingBudget = room.proposedBudget;
    });

    if (room.state === 'BUDGET_SELECTION') {
      room.budgetVotes.clear();
      room.budgetVotes.set(userId, true); // Proposer votes agree
      room.bots.forEach(b => room.budgetVotes.set(b.id, true));

      // Check if unanimous agreement reached
      const allAgreed = Array.from(room.participants.keys()).every(id => room.budgetVotes.get(id) === true);
      if (allAgreed) {
        room.state = 'LOBBY';
      }
    }

    this.broadcastRoomState(room);
  }

  voteBudget(roomId, userId, agreed) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'BUDGET_SELECTION') return;

    room.budgetVotes.set(userId, !!agreed);

    // Ensure bots remain agreed
    room.bots.forEach(b => room.budgetVotes.set(b.id, true));

    // Check if unanimous agreement reached among all participants
    const allAgreed = Array.from(room.participants.keys()).every(id => room.budgetVotes.get(id) === true);

    if (allAgreed) {
      // Lock budget for all participants
      room.participants.forEach(p => {
        p.purse = room.proposedBudget;
        p.startingBudget = room.proposedBudget;
      });
      room.state = 'LOBBY';
    }

    this.broadcastRoomState(room);
  }

  // Live Roster Sync: Host adds bot in SETUP phase
  addBot(roomId, userId, botData = {}) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'SETUP') return { success: false, message: 'Invalid room state.' };
    if (room.hostId !== userId) return { success: false, message: 'Only host can add bots.' };
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
  removeParticipant(roomId, userId, participantId) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'SETUP') return { success: false, message: 'Invalid room state.' };
    if (room.hostId !== userId) return { success: false, message: 'Only host can remove participants.' };
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
  confirmSetup(roomId, userId, { budget, participants, poolSize, aiDifficulty } = {}) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found.' };
    if (room.hostId !== userId) {
      return { success: false, message: 'Only the room host can confirm setup.' };
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
    const room = this.rooms.get(roomId);
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
    const franchise = getCategoryFranchise(categoryModule, teamId);
    if (!franchise) {
      return { success: false, message: 'Invalid team or franchise selected.' };
    }

    if (!room.teamOwnership) {
      room.teamOwnership = new Map();
    }

    // Check if team is already owned by another participant in this room
    const currentOwnerId = room.teamOwnership.get(franchise.id);
    if (currentOwnerId && currentOwnerId !== userId) {
      const ownerParticipant = room.participants.get(currentOwnerId);
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
          message: `${franchise.name} (${franchise.code}) has already been selected by ${ownerName}. Please choose another team.`
        };
      }
    }

    // Release any previous team owned by this user
    for (const [tId, uId] of room.teamOwnership.entries()) {
      if (uId === userId) {
        room.teamOwnership.delete(tId);
      }
    }

    // Claim the new team
    room.teamOwnership.set(franchise.id, userId);

    // Update participant's team information
    if (participant) {
      participant.teamId = franchise.id;
      participant.teamName = franchise.name;
    }

    this.broadcastRoomState(room);
    return { success: true, franchise };
  }

  // Pre-Auction Lobby (Screen 14)
  toggleReady(roomId, userId, teamName) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'LOBBY') return;

    const p = room.participants.get(userId);
    if (p) {
      p.isReady = !p.isReady;
      if (teamName) {
        const categoryModule = CategoryRegistry.get(room.category);
        const franchise = getCategoryFranchise(categoryModule, teamName);
        if (franchise) {
          const currentOwner = room.teamOwnership ? room.teamOwnership.get(franchise.id) : null;
          if (currentOwner && currentOwner !== userId) {
            const ownerPart = room.participants.get(currentOwner);
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
          if (!updatedOwner || updatedOwner === userId) {
            if (room.teamOwnership) {
              for (const [tId, uId] of room.teamOwnership.entries()) {
                if (uId === userId) room.teamOwnership.delete(tId);
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
    }

    this.broadcastRoomState(room);
  }

  startAuction(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room || (room.state !== 'LOBBY' && room.state !== 'SETUP' && room.state !== 'BUDGET_SELECTION')) return;
    const isHost = (room.hostId === userId) || (room.participants.get(userId)?.isHost === true);
    if (!isHost) return;

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
    const room = this.rooms.get(roomId);
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
    // 1. Must be >= base price if first bid, or > currentBid
    const minBid = room.currentBid === 0 ? player.basePrice : Math.round((room.currentBid + 0.1) * 10) / 10;
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
    if (room.mode !== 'computer' || room.bots.length === 0 || room.isResolvingLot) return;
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
    setTimeout(() => {
      room.currentPlayerIndex += 1;
      this.startPlayerAuction(room);
    }, pauseDuration);
  }

  finishAuction(room) {
    room.state = 'RESULTS';
    clearInterval(room.timerInterval);
    clearTimeout(room.lotTimeout);
    clearTimeout(room.aiBidTimeout);
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
          name: item.name,
          role: item.role,
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

        const matchRecord = {
          matchId: room.id,
          roomCode: room.roomCode || null,
          mode: room.mode,
          category: room.category,
          categoryTitle: room.categoryConfig?.title || room.category,
          currencySymbol: room.categoryConfig?.currencySymbol || '$',
          unitLabel: room.categoryConfig?.unitLabel || 'M',
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
  }

  // Signature AI Analysis Engine (Screen 29 & 30) - Delegated to Category Module
  computeAIAnalysis(room) {
    const categoryModule = CategoryRegistry.get(room.category);
    return categoryModule.generateAnalysis(room);
  }

  broadcastRoomState(room) {
    const currentPlayer = room.currentPlayer || room.playerPool[room.currentPlayerIndex] || null;
    const payload = {
      id: room.id,
      roomCode: room.roomCode || null,
      category: room.category,
      categoryConfig: room.categoryConfig,
      mode: room.mode,
      aiDifficulty: room.aiDifficulty || 'MEDIUM',
      state: room.state,
      hostId: room.hostId,
      proposedBudget: room.proposedBudget,
      budgetVotes: Object.fromEntries(room.budgetVotes),
      participants: Array.from(room.participants.values()),
      currentPlayerIndex: room.currentPlayerIndex,
      currentLotNumber: room.currentLotNumber || (room.currentPlayerIndex + 1),
      totalPlayers: room.playerPool.length,
      poolSize: room.playerPool.length,
      currentPlayer,
      currentItem: currentPlayer,
      currentBid: room.currentBid,
      currentLeader: room.currentLeader,
      bidVersion: room.bidVersion || 0,
      timerSeconds: room.timerSeconds,
      timerEndTimestamp: room.timerEndTimestamp || null,
      timerDurationMs: room.timerDurationMs || 10000,
      teamOwnership: room.teamOwnership ? Object.fromEntries(room.teamOwnership) : {},
      reactions: room.reactions,
      analysis: room.analysis || null
    };

    this.io.to(room.id).emit('room_state', payload);
  }

  broadcastReaction(roomId, userId, text) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const participant = room.participants.get(userId);
    const userName = participant ? (participant.name || participant.displayName || 'Bidder') : 'Bidder';
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

  leaveRoom(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Check if other humans exist besides this leaving user
    const otherHumans = Array.from(room.participants.values()).filter(p => !p.isAI && p.id !== userId);

    if (otherHumans.length === 0) {
      // No remaining human players: clean up room completely and immediately
      if (room.timerInterval) clearInterval(room.timerInterval);
      if (room.lotTimeout) clearTimeout(room.lotTimeout);
      if (room.aiBidTimeout) clearTimeout(room.aiBidTimeout);
      if (room.roomCode) {
        this.roomCodes.delete(this.normalizeRoomCode(room.roomCode));
      }
      store.cancelInvitationsForRoom(roomId);
      this.rooms.delete(roomId);
      return;
    }

    const leavingPart = room.participants.get(userId);
    const isLiveAuction = room.state === 'AUCTION_ACTIVE' || room.state === 'SOLD' || room.state === 'UNSOLD';

    // In pre-auction phases, release any team reserved by the leaving user
    if (room.state === 'SETUP' || room.state === 'BUDGET_SELECTION' || room.state === 'LOBBY') {
      if (room.teamOwnership) {
        for (const [tId, uId] of room.teamOwnership.entries()) {
          if (uId === userId) {
            room.teamOwnership.delete(tId);
          }
        }
      }
      if (room.budgetVotes) {
        room.budgetVotes.delete(userId);
      }
      room.participants.delete(userId);

      // In BUDGET_SELECTION, check if all remaining participants have agreed
      if (room.state === 'BUDGET_SELECTION' && room.participants.size > 0) {
        const allAgreed = Array.from(room.participants.keys()).every(id => room.budgetVotes.get(id) === true);
        if (allAgreed) {
          room.participants.forEach(p => {
            p.purse = room.proposedBudget;
            p.startingBudget = room.proposedBudget;
          });
          room.state = 'LOBBY';
        }
      }
    } else if (isLiveAuction && leavingPart) {
      // In live auction with remaining humans, convert leaving player to a computer bot
      // to maintain competitive roster integrity without breaking squad allocations or current leader bids
      leavingPart.isAI = true;
      leavingPart.type = 'COMPUTER';
      leavingPart.name = `${leavingPart.name} (AI)`;

      const bot = new AuctionBot({
        id: leavingPart.id,
        name: leavingPart.name,
        teamId: leavingPart.teamId,
        teamName: leavingPart.teamName,
        strategy: 'balanced',
        avatar: leavingPart.avatar,
        difficulty: room.aiDifficulty || 'MEDIUM'
      });
      room.bots.push(bot);
    } else {
      room.participants.delete(userId);
    }

    // Transfer host to next human if leaving user was host
    if (room.hostId === userId && otherHumans.length > 0) {
      room.hostId = otherHumans[0].id;
      otherHumans[0].isHost = true;
    }

    this.broadcastRoomState(room);
  }
}

module.exports = RoomManager;
