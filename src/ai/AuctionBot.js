// Universal Authoritative AI Decision Engine for THE BID
class AuctionBot {
  constructor({ id, name, teamId, teamName, strategy = 'balanced', avatar = 'avatar_ai', difficulty = 'MEDIUM' }) {
    this.id = id;
    this.name = name;
    this.teamId = teamId || null;
    this.teamName = teamName;
    this.strategy = strategy; // 'aggressive', 'balanced', 'value_hunter'
    this.avatar = avatar;
    this.difficulty = (difficulty || 'MEDIUM').toUpperCase(); // 'LOW', 'MEDIUM', 'HIGH'
    this.isAI = true;
  }

  setDifficulty(difficulty) {
    if (difficulty) {
      this.difficulty = difficulty.toUpperCase();
    }
  }

  // Calculate maximum price this bot is willing to pay based on AI Intelligence decision quality
  calculateMaxBid(player, botPurse, currentSquad = [], totalStartingBudget = 100, context = {}) {
    if (!player) return 0;

    const basePrice = Number(player.basePrice) || 1.0;
    const estMin = Number(player.estimatedValuation?.min) || (basePrice * 1.5);
    const estMax = Number(player.estimatedValuation?.max) || (basePrice * 2.5);
    const estMid = (estMin + estMax) / 2;

    const currentCount = currentSquad.length;
    const targetCount = 4;
    const spotsNeeded = Math.max(0, targetCount - currentCount - 1);

    // Role need analysis
    const hasRole = currentSquad.some(
      (p) => p.role && player.role && p.role.toLowerCase() === player.role.toLowerCase()
    );

    // Strategy modifier
    let strategyMultiplier = 1.0;
    if (this.strategy === 'aggressive') strategyMultiplier = 1.10;
    if (this.strategy === 'value_hunter') strategyMultiplier = 0.90;

    let willingness = 0;
    let availableToSpend = botPurse;

    if (this.difficulty === 'LOW') {
      // 🟢 LOW — Easy AI
      // Weaker valuation, less scarcity awareness, simpler budget planning, less competitive
      const lowReserve = spotsNeeded * Math.max(0.5, totalStartingBudget * 0.015);
      availableToSpend = Math.max(0, botPurse - lowReserve);

      // Weaker valuation: underestimates true value of top assets by 15-20%, predictable & less competitive
      const roleFactor = hasRole ? 0.80 : 1.05;
      const valuationMod = 0.78 + (this.strategy === 'aggressive' ? 0.08 : 0);
      willingness = estMid * valuationMod * roleFactor * strategyMultiplier;

      willingness = Math.min(availableToSpend, willingness);
    } else if (this.difficulty === 'HIGH') {
      // 🔴 HIGH — Expert AI
      // Strong valuation, scarcity analysis, opponent-purse analysis, strategic bidding & disciplined stopping

      // 1. Dynamic Budget Planning: stage-weighted reserve calculation
      const remainingLots = context.remainingPool ? context.remainingPool.length : 10;
      const totalLots = context.totalPoolSize || (remainingLots + (context.currentLotIndex || 0) + 1);
      const currentLotIdx = context.currentLotIndex || 0;
      const auctionProgress = totalLots > 0 ? currentLotIdx / totalLots : 0.5;

      const expertReserveUnit = Math.max(1.0, totalStartingBudget * 0.04);
      const expertReserve = spotsNeeded * expertReserveUnit;
      availableToSpend = Math.max(0, botPurse - expertReserve);

      // 2. Scarcity Analysis across remaining pool
      let scarcityMultiplier = 1.0;
      if (Array.isArray(context.remainingPool) && context.remainingPool.length > 0 && player.role) {
        const remainingInSameRole = context.remainingPool.filter(
          (p) => p.role && p.role.toLowerCase() === player.role.toLowerCase()
        ).length;

        if (remainingInSameRole <= 1) {
          // Critical scarcity: one of the last available in this role!
          scarcityMultiplier = 1.35;
        } else if (remainingInSameRole <= 2) {
          scarcityMultiplier = 1.20;
        } else if (remainingInSameRole >= 5) {
          // Plentiful supply: wait for better value
          scarcityMultiplier = 0.90;
        }
      }

      // 3. Intrinsic Tier & Quality Valuation
      const isTopTier =
        player.tier === 'S' ||
        player.tier === 'A' ||
        (player.rating && player.rating >= 88);
      const tierPremium = isTopTier ? 1.25 : 0.95;
      const roleNeed = hasRole ? 0.88 : 1.28;

      // 4. Opponent-Purse Analysis & Strategic Bidding
      let opponentPressureMultiplier = 1.0;
      if (Array.isArray(context.opponents) && context.opponents.length > 0) {
        const opponentPurses = context.opponents
          .filter((o) => o.id !== this.id)
          .map((o) => o.purse || 0);
        const maxOpponentPurse = Math.max(...opponentPurses, 0);

        if (maxOpponentPurse < botPurse * 0.5) {
          // Opponents are cash-starved: snap up assets efficiently
          opponentPressureMultiplier = 1.05;
        }
        if (auctionProgress > 0.70 && botPurse > (spotsNeeded + 1) * (totalStartingBudget * 0.15)) {
          // Surplus late-game budget: optimize squad finishing
          opponentPressureMultiplier = 1.20;
        }
      }

      // Composite willingness with full strategic depth
      willingness =
        estMid *
        roleNeed *
        tierPremium *
        scarcityMultiplier *
        opponentPressureMultiplier *
        strategyMultiplier;

      // Disciplined Stopping: never exceed available spend or an absolute utility ceiling
      const absoluteCeiling = availableToSpend * 0.85;
      willingness = Math.min(availableToSpend, Math.min(willingness, Math.max(basePrice, absoluteCeiling)));
    } else {
      // 🟡 MEDIUM — Balanced AI (Default)
      // Normal valuation, reasonable budget management, moderate opponent awareness
      const stdReserve = spotsNeeded * Math.max(1.0, totalStartingBudget * 0.025);
      availableToSpend = Math.max(0, botPurse - stdReserve);

      const roleFactor = hasRole ? 0.85 : 1.20;
      willingness = estMid * roleFactor * strategyMultiplier;
      willingness = Math.min(availableToSpend, willingness);
    }

    if (availableToSpend <= basePrice) {
      return 0;
    }

    return Math.max(basePrice, Math.round(willingness * 10) / 10);
  }

  // Decide next bid increment, valuation, and reaction delay
  evaluateBid(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
    let player, currentBid, currentLeaderId, botPurse, currentSquad, totalStartingBudget, remainingSeconds, roomContext;

    if (arg1 && typeof arg1 === 'object' && ('item' in arg1 || 'player' in arg1)) {
      player = arg1.item || arg1.player;
      currentBid = arg1.currentBid || 0;
      currentLeaderId = arg1.currentLeaderId || (arg1.currentLeader ? arg1.currentLeader.id : null);
      botPurse = arg1.botPurse || 0;
      currentSquad = arg1.botSquad || arg1.currentSquad || [];
      totalStartingBudget = arg1.startingBudget || arg1.totalStartingBudget || 100;
      remainingSeconds = arg1.remainingSeconds || 10;
      roomContext = arg1.roomContext || {};
      if (roomContext.aiDifficulty) {
        this.difficulty = roomContext.aiDifficulty.toUpperCase();
      }
    } else {
      player = arg1;
      currentBid = arg2 || 0;
      currentLeaderId = arg3 || null;
      botPurse = arg4 || 0;
      currentSquad = arg5 || [];
      totalStartingBudget = arg6 || 100;
      remainingSeconds = arg7 || 10;
      roomContext = arg8 || {};
      if (roomContext.aiDifficulty) {
        this.difficulty = roomContext.aiDifficulty.toUpperCase();
      }
    }

    if (!player) return null;

    // If this bot is already winning, never outbid self
    if (currentLeaderId === this.id) {
      return null;
    }

    // Determine category-aware bid increment
    let increment = 0.2;
    if (totalStartingBudget >= 180) {
      increment = 2.0;
      if (currentBid >= 40.0) increment = 5.0;
      if (currentBid >= 80.0) increment = 10.0;
    } else if (totalStartingBudget >= 130) {
      increment = 1.0;
      if (currentBid >= 30.0) increment = 2.0;
      if (currentBid >= 60.0) increment = 5.0;
    } else {
      increment = 0.2;
      if (currentBid >= 10.0) increment = 0.5;
      if (currentBid >= 15.0) increment = 1.0;
    }

    const proposedBid =
      Math.round((currentBid === 0 ? player.basePrice : currentBid + increment) * 10) / 10;

    const maxWilling = this.calculateMaxBid(
      player,
      botPurse,
      currentSquad,
      totalStartingBudget,
      roomContext
    );

    // Disciplined Stopping: if proposed bid exceeds willingness or purse, drop out cleanly
    if (proposedBid > maxWilling || proposedBid > botPurse) {
      return null;
    }

    // Reaction timing by difficulty
    let bidDelayMs = 2200;
    if (this.difficulty === 'LOW') {
      // Slower, more predictable reaction
      bidDelayMs = 2800 + Math.floor(Math.random() * 2500);
    } else if (this.difficulty === 'HIGH') {
      // Decisive, competitive reaction
      bidDelayMs = 1200 + Math.floor(Math.random() * 1800);
    } else {
      // Balanced timing
      bidDelayMs = 1800 + Math.floor(Math.random() * 2200);
    }

    return {
      botId: this.id,
      amount: proposedBid,
      delayMs: bidDelayMs,
    };
  }
}

// Fictional Bot Teams (Purely fictional — no real IPL franchise names)
const FICTIONAL_BOT_TEAMS = [
  'Royal Strikers',
  'Blue Titans',
  'Capital Warriors',
  'Thunder XI',
  'Golden Challengers',
  'Rising Royals',
  'Velocity XI',
  'Crown Warriors',
  'Apex Strikers',
  'Shadow Blitz',
  'Solar Knights',
  'Storm XI',
  'Nova Blasters',
  'Phoenix Dynamos',
  'Zenith Giants',
  'Cobalt Kings',
];

// Fictional Bot Managers (Purely fictional — no real cricket personality names)
const FICTIONAL_BOT_MANAGERS = [
  'Vikram AI',
  'Arjun Vale',
  'Rohan Mehta',
  'Kabir Rao',
  'Dev Malhotra',
  'Karan Shah',
  'Aarav Sen',
  'Naveen Joshi',
  'Sameer Varma',
  'Aditya Roy',
  'Reyansh Kapoor',
  'Kunal Singhania',
];

const BOT_STRATEGIES = ['balanced', 'aggressive', 'value_hunter'];

const MALE_BOT_AVATARS = [
  'avatar_male_1',
  'avatar_male_2',
  'avatar_male_3',
  'avatar_male_4',
  'avatar_male_5',
  'avatar_male_6',
];

const FEMALE_BOT_AVATARS = [
  'avatar_female_1',
  'avatar_female_2',
  'avatar_female_3',
  'avatar_female_4',
];

const FEMALE_FIRST_NAMES = new Set([
  'ananya', 'tara', 'meera', 'riya', 'priya', 'sneha', 'pooja', 'nisha',
  'shreya', 'diya', 'ishita', 'tanvi', 'neha', 'kavya', 'sarah', 'emma',
  'sophia', 'chloe', 'elena', 'maria', 'olivia', 'mia', 'isabella', 'lucia',
  'anita', 'simran', 'geeta', 'sunita', 'radha', 'aarti', 'aditi', 'deepa'
]);

function getGenderForName(name = '') {
  const clean = name.trim().toLowerCase().split(/[\s_]+/)[0];
  return FEMALE_FIRST_NAMES.has(clean) ? 'female' : 'male';
}

function getBotAvatarForName(name = '', index = 0) {
  const gender = getGenderForName(name);
  if (gender === 'female') {
    return FEMALE_BOT_AVATARS[index % FEMALE_BOT_AVATARS.length];
  }
  return MALE_BOT_AVATARS[index % MALE_BOT_AVATARS.length];
}

// Helper to generate dynamic fictional AI bot opponents
function generateFictionalBots(count, existingNames = [], existingTeams = [], difficulty = 'MEDIUM') {
  const bots = [];
  const usedNames = new Set(existingNames);
  const usedTeams = new Set(existingTeams);

  const availableManagers = [...FICTIONAL_BOT_MANAGERS].sort(() => 0.5 - Math.random());
  const availableTeams = [...FICTIONAL_BOT_TEAMS].sort(() => 0.5 - Math.random());

  for (let i = 0; i < count; i++) {
    const manager = availableManagers.find((m) => !usedNames.has(m)) || `Bot Manager ${i + 1}`;
    usedNames.add(manager);

    const team = availableTeams.find((t) => !usedTeams.has(t)) || `Fictional XI ${i + 1}`;
    usedTeams.add(team);

    const avatar = getBotAvatarForName(manager, i);
    const strategy = BOT_STRATEGIES[i % BOT_STRATEGIES.length];
    const botId = `bot_${Date.now().toString(36)}_${i + 1}`;

    bots.push({
      id: botId,
      name: manager,
      teamName: team,
      strategy,
      avatar,
      difficulty,
    });
  }

  return bots;
}

const DEFAULT_AI_PROFILES = [
  { id: 'ai_bot_1', name: 'Vikram AI', teamName: 'Royal Strikers', strategy: 'balanced', avatar: 'avatar_male_6' },
  { id: 'ai_bot_2', name: 'Arjun Vale', teamName: 'Blue Titans', strategy: 'aggressive', avatar: 'avatar_male_5' },
  { id: 'ai_bot_3', name: 'Rohan Mehta', teamName: 'Capital Warriors', strategy: 'value_hunter', avatar: 'avatar_male_3' },
  { id: 'ai_bot_4', name: 'Kabir Rao', teamName: 'Thunder XI', strategy: 'aggressive', avatar: 'avatar_male_2' },
  { id: 'ai_bot_5', name: 'Dev Malhotra', teamName: 'Golden Challengers', strategy: 'balanced', avatar: 'avatar_male_4' }
];

module.exports = {
  AuctionBot,
  DEFAULT_AI_PROFILES,
  FICTIONAL_BOT_TEAMS,
  FICTIONAL_BOT_MANAGERS,
  generateFictionalBots,
  getGenderForName,
  getBotAvatarForName,
  MALE_BOT_AVATARS,
  FEMALE_BOT_AVATARS,
};
