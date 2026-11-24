const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultState = {
  users: {},        // id -> { id, name, avatar, uniqueId, trophies: 0, createdAt }
  googleUsers: {},  // verifiedGoogleId -> uniqueId
  uniqueIdIndex: {}, // uniqueId -> id (Database-level UNIQUE constraint index)
  numericPlayerIndex: {}, // 7-digit numeric player ID -> id
  nextNumericPlayerId: 1000001,
  allocatedLoyaltyIds: [], // ['1111111', '2222222', ...]
  friends: {},      // uniqueId -> [friendUniqueIds]
  friendships: {},  // canonicalPair (min::max) -> { id, userA, userB, createdAt }
  friendRequests: {}, // recipientUniqueId -> [{ fromUniqueId, fromName, date }]
  groups: {},       // groupId -> { id, name, ownerUniqueId, members: [] }
  matchHistory: {}, // uniqueId -> [{ matchId, date, mode, budget, squad: [], rank, aiScore, summary }]
  trophyLedger: {}, // uniqueId -> [{ trophyId, matchId, trophyType, category, earnedAt }]
  roomInvitations: {}, // invitationId -> { id, sender, recipientUniqueId, roomId, roomCode, category, status, createdAt, expiresAt }
  activeRoomKeys: {},  // roomCode (6-digit numeric) -> { code, roomId, hostUniqueId, category, createdAt, isActive }
  customEntities: {}, // ownerUniqueId -> [{ id, ownerUniqueId, categoryId, name, entityType, createdAt, deletedAt }]
  outbox: [],       // [{ eventId, eventType, aggregateId, actorId, targetId, payload, status, createdAt }]
  processedOperations: {} // operationId -> { result, timestamp }
};

// Section 4: Special Player IDs & Early Loyalty Tier
const FOUNDER_EMAILS = [
  'ani1220064@gmail.com'
];
const FOUNDER_GOOGLE_IDS = [
  '111044643998881545528'
];
const isFounderEmail = (em) => {
  if (!em) return false;
  const lower = String(em).trim().toLowerCase();
  return FOUNDER_EMAILS.some(fe => fe.toLowerCase() === lower);
};
const isFounderIdentity = (googleId, em) => {
  if (em && isFounderEmail(em)) return true;
  if (googleId && FOUNDER_GOOGLE_IDS.includes(String(googleId).trim())) return true;
  return false;
};
const FOUNDER_PLAYER_ID = '0000000';
const LOYALTY_PLAYER_IDS = [
  '1111111',
  '2222222',
  '3333333',
  '4444444',
  '5555555',
  '6666666',
  '7777777',
  '8888888',
  '9999999',
  '1000000'
];
const RESERVED_SPECIAL_IDS = new Set([
  FOUNDER_PLAYER_ID,
  ...LOYALTY_PLAYER_IDS
]);

class StoreService {
  constructor() {
    this.data = this.loadData();
    this._authLock = new Map(); // Mutex map to prevent race-condition duplicates
    this.rebuildIndices();
    this.migrateToStrictNumericIds();
  }

  loadData() {
    try {
      let raw = null;
      if (fs.existsSync(DATA_FILE)) {
        raw = fs.readFileSync(DATA_FILE, 'utf8');
      }
      let parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || (!parsed.resetVersion && (!parsed.users || Object.keys(parsed.users).length === 0))) {
        const SEED_FILE = path.join(DATA_DIR, 'seed_store.json');
        if (fs.existsSync(SEED_FILE)) {
          console.log('[STORE] Seeding database from seed_store.json...');
          const seedRaw = fs.readFileSync(SEED_FILE, 'utf8');
          parsed = JSON.parse(seedRaw);
          try {
            fs.writeFileSync(DATA_FILE, seedRaw, 'utf8');
          } catch (wErr) {
            console.warn('[STORE] Could not write seed to DATA_FILE:', wErr.message);
          }
        }
      }
      if (parsed) {
        return {
          ...defaultState,
          ...parsed,
          activeRoomKeys: parsed.activeRoomKeys || {},
          googleUsers: parsed.googleUsers || {},
          uniqueIdIndex: parsed.uniqueIdIndex || {},
          numericPlayerIndex: parsed.numericPlayerIndex || {},
          nextNumericPlayerId: parsed.nextNumericPlayerId || 1000001,
          allocatedLoyaltyIds: Array.isArray(parsed.allocatedLoyaltyIds) ? parsed.allocatedLoyaltyIds : [],
          outbox: Array.isArray(parsed.outbox) ? parsed.outbox : [],
          processedOperations: parsed.processedOperations || {}
        };
      }
    } catch (e) {
      console.error('Error loading store.json, initializing default:', e.message);
    }
    return { ...defaultState, googleUsers: {}, uniqueIdIndex: {}, numericPlayerIndex: {}, nextNumericPlayerId: 1000001, allocatedLoyaltyIds: [], outbox: [], processedOperations: {} };
  }

  reload() {
    this.data = this.loadData();
    this.rebuildIndices();
    return this.data;
  }

  rebuildIndices() {
    this.data.uniqueIdIndex = this.data.uniqueIdIndex || {};
    this.data.numericPlayerIndex = this.data.numericPlayerIndex || {};
    this.data.nextNumericPlayerId = this.data.nextNumericPlayerId || 1000001;
    this.data.allocatedLoyaltyIds = Array.isArray(this.data.allocatedLoyaltyIds) ? this.data.allocatedLoyaltyIds : [];
    this.data.googleUsers = this.data.googleUsers || {};
    this.data.trophyLedger = this.data.trophyLedger || {};
    this.data.activeRoomKeys = this.data.activeRoomKeys || {};
    this.data.outbox = Array.isArray(this.data.outbox) ? this.data.outbox : [];
    this.data.processedOperations = this.data.processedOperations || {};
    if (this.data.users) {
      for (const u of Object.values(this.data.users)) {
        if (u.numericPlayerId) {
          this.data.numericPlayerIndex[String(u.numericPlayerId).trim()] = u.id;
        }
        if (u.legacyNumericPlayerId) {
          this.data.numericPlayerIndex[String(u.legacyNumericPlayerId).trim()] = u.id;
        }
        if (u.bidId && u.bidId.startsWith('BID-')) {
          const numPart = u.bidId.replace('BID-', '').trim();
          if (/^\d+$/.test(numPart)) {
            this.data.numericPlayerIndex[numPart] = u.id;
          }
        }
        if (u.uniqueId) {
          this.data.uniqueIdIndex[u.uniqueId.toUpperCase()] = u.id;
        }
        if (u.googleId) {
          this.data.googleUsers[u.googleId] = u.uniqueId;
        }
        // Initialize and synchronize categoryTrophies across the 7 arenas
        if (!u.categoryTrophies) {
          u.categoryTrophies = {
            ipl_cricket: 0,
            fifa_football: 0,
            formula_1: 0,
            nba: 0,
            movie_stars: 0,
            luxury_cars: 0,
            luxury_collection: 0
          };
          const histKey = u.uniqueId || u.id;
          const userHistory = (this.data.matchHistory && this.data.matchHistory[histKey]) || [];
          let historyTrophySum = 0;
          userHistory.forEach(m => {
            if (m.isWinner || (m.trophyEarned && m.trophyEarned > 0)) {
              const cat = m.category || 'ipl_cricket';
              u.categoryTrophies[cat] = (u.categoryTrophies[cat] || 0) + 1;
              historyTrophySum++;
            }
          });
          if ((u.trophies || 0) > historyTrophySum) {
            u.categoryTrophies.ipl_cricket = (u.categoryTrophies.ipl_cricket || 0) + ((u.trophies || 0) - historyTrophySum);
          }
        }
        // Authoritative master tally equals sum of individual category trophies
        u.trophies = Object.values(u.categoryTrophies).reduce((sum, val) => sum + (val || 0), 0);
      }
    }

    // Initialize and rebuild canonical friendships index
    this.data.friendships = this.data.friendships || {};
    if (this.data.friends) {
      for (const [uId, list] of Object.entries(this.data.friends)) {
        if (Array.isArray(list)) {
          for (const fId of list) {
            const pair = this.getCanonicalPair(uId, fId);
            if (pair && !this.data.friendships[pair]) {
              const [uMin, uMax] = pair.split('::');
              this.data.friendships[pair] = {
                id: `frnd_${pair}`,
                userA: uMin,
                userB: uMax,
                createdAt: new Date().toISOString()
              };
            }
          }
        }
      }
    }
  }

  /**
   * Controlled Idempotent Reset of all THE BID Player & Progress Records.
   * Completely purges all legacy/test accounts, friendships, trophies, and histories.
   * Establishes fresh, clean state where verified Google accounts register afresh.
   */
  performFreshReset(force = false) {
    if (this.data.resetVersion === 'FRESH_RESET_20261121' && !force) {
      console.log('[STORE] Reset already performed (FRESH_RESET_20261121). Skipping to preserve new player records.');
      return { skipped: true, resetVersion: this.data.resetVersion };
    }

    const removedCounts = {
      users: Object.keys(this.data.users || {}).length,
      googleUsers: Object.keys(this.data.googleUsers || {}).length,
      numericPlayerIndex: Object.keys(this.data.numericPlayerIndex || {}).length,
      uniqueIdIndex: Object.keys(this.data.uniqueIdIndex || {}).length,
      friendships: Object.keys(this.data.friendships || {}).length,
      friends: Object.keys(this.data.friends || {}).length,
      friendRequests: Object.keys(this.data.friendRequests || {}).length,
      matchHistory: Object.keys(this.data.matchHistory || {}).length,
      trophyLedger: Object.keys(this.data.trophyLedger || {}).length,
      roomInvitations: Object.keys(this.data.roomInvitations || {}).length,
      activeRoomKeys: Object.keys(this.data.activeRoomKeys || {}).length,
      outbox: (this.data.outbox || []).length
    };

    console.log('[STORE] Executing Controlled THE BID Player Database Reset:', JSON.stringify(removedCounts));

    // Reset all player, progress, and multiplayer collections
    this.data.users = {};
    this.data.googleUsers = {};
    this.data.uniqueIdIndex = {};
    this.data.numericPlayerIndex = {};
    this.data.nextNumericPlayerId = 1000001;
    this.data.allocatedLoyaltyIds = [];
    this.data.friends = {};
    this.data.friendships = {};
    this.data.friendRequests = {};
    this.data.groups = {};
    this.data.matchHistory = {};
    this.data.trophyLedger = {};
    this.data.roomInvitations = {};
    this.data.activeRoomKeys = {};
    this.data.customEntities = {};
    this.data.outbox = [];
    this.data.processedOperations = {};
    this.data.resetVersion = 'FRESH_RESET_20261121';
    this.data.resetPerformedAt = new Date().toISOString();
    this.data.resetReport = {
      timestamp: this.data.resetPerformedAt,
      resetVersion: this.data.resetVersion,
      removedCounts
    };

    // Commit to both store.json and seed_store.json so cold restarts on Render stay clean
    this.saveData();
    const SEED_FILE = path.join(DATA_DIR, 'seed_store.json');
    try {
      fs.writeFileSync(SEED_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.warn('[STORE] Could not update seed_store.json:', e.message);
    }

    console.log('[STORE] Database reset complete. Zero users, fresh ID allocation ready.');
    return { success: true, removedCounts };
  }

  getCanonicalPair(uniqueIdA, uniqueIdB) {
    if (!uniqueIdA || !uniqueIdB) return null;
    const a = String(uniqueIdA).trim().toUpperCase();
    const b = String(uniqueIdB).trim().toUpperCase();
    if (!a || !b || a === b) return null;
    return a < b ? `${a}::${b}` : `${b}::${a}`;
  }

  saveData() {
    try {
      const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).substr(2, 6)}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf8');
      try {
        fs.renameSync(tempFile, DATA_FILE);
      } catch (renameErr) {
        fs.copyFileSync(tempFile, DATA_FILE);
        try { fs.unlinkSync(tempFile); } catch (_) {}
      }
    } catch (e) {
      console.error('Error saving store.json:', e.message);
    }
  }

  assertUniqueIdConstraint(uniqueId) {
    if (!uniqueId) throw new Error('uniqueId is required');
    const clean = uniqueId.trim().toUpperCase();
    if (this.data.uniqueIdIndex && this.data.uniqueIdIndex[clean]) {
      throw new Error(`UNIQUE_CONSTRAINT_VIOLATION: Player ID ${uniqueId} already exists in database`);
    }
  }

  /**
   * Atomic Migration for Existing Accounts:
   * Migrates any legacy alphanumeric IDs (e.g. BID-XXXXXX, TB-XXXXXX) into the approved 7-digit numeric format.
   * Keeps legacy aliases in uniqueIdIndex so old URLs, sockets, and sessions resolve seamlessly.
   */
  migrateToStrictNumericIds() {
    let modified = false;
    if (!this.data || !this.data.users) return;

    for (const [userId, user] of Object.entries(this.data.users)) {
      const emailLower = user.email ? String(user.email).trim().toLowerCase() : '';
      const isFounder = isFounderIdentity(user.googleId, user.email) ||
                        (emailLower === 'ani1220064@gmail.com') ||
                        user.googleId === '111044643998881545528' ||
                        (this.data.numericPlayerIndex && this.data.numericPlayerIndex[FOUNDER_PLAYER_ID] === userId) ||
                        (user.avatar && String(user.avatar).includes('ACg8ocJRGDIVP'));

      const isLoyalty1 = (emailLower === 'anirudhchaturvedi122006@gmail.com') ||
                         (this.data.numericPlayerIndex && this.data.numericPlayerIndex['1111111'] === userId) ||
                         (user.avatar && String(user.avatar).includes('ACg8ocIGzEkhGF'));

      let targetId = user.numericPlayerId;
      if (isFounder) {
        targetId = FOUNDER_PLAYER_ID; // '0000000'
      } else if (isLoyalty1) {
        targetId = '1111111';
      } else if (!targetId || !/^\d{7}$/.test(String(targetId))) {
        targetId = this.generateNumericPlayerId();
      }

      targetId = String(targetId);
      const oldUniqueId = user.uniqueId;
      const oldNumericPlayerId = user.numericPlayerId;

      if (user.uniqueId !== targetId || user.playerId !== targetId || user.bidId !== targetId || user.numericPlayerId !== targetId) {
        console.log(`[MIGRATION] Migrating user ${user.name} (${userId}) from [${user.uniqueId}] -> [${targetId}]`);
        user.uniqueId = targetId;
        user.numericPlayerId = targetId;
        user.playerId = targetId;
        user.bidId = targetId;
        user.legacyUniqueId = oldUniqueId;
        if (oldNumericPlayerId && oldNumericPlayerId !== targetId) {
          user.legacyNumericPlayerId = oldNumericPlayerId;
        }
        if (isFounder) {
          user.isFounder = true;
          user.role = 'FOUNDER';
          if (!user.email) user.email = 'ani1220064@gmail.com';
        }
        if (isLoyalty1) {
          user.isLoyaltyPlayer = true;
          user.loyaltyPriority = 1;
          if (!user.email) user.email = 'anirudhchaturvedi122006@gmail.com';
        }
        modified = true;
      }

      this.data.uniqueIdIndex = this.data.uniqueIdIndex || {};
      this.data.numericPlayerIndex = this.data.numericPlayerIndex || {};
      this.data.googleUsers = this.data.googleUsers || {};

      this.data.uniqueIdIndex[targetId] = userId;
      this.data.numericPlayerIndex[targetId] = userId;
      if (user.googleId) {
        this.data.googleUsers[user.googleId] = targetId;
      }

      // Preserve old alphanumeric/numeric ID in indexes as a reverse alias so existing references resolve seamlessly
      if (oldUniqueId && oldUniqueId !== targetId) {
        this.data.uniqueIdIndex[oldUniqueId.toUpperCase()] = userId;
        this.data.numericPlayerIndex[oldUniqueId] = userId;
        if (this.data.friends && this.data.friends[oldUniqueId]) {
          this.data.friends[targetId] = this.data.friends[targetId] || this.data.friends[oldUniqueId];
        }
        if (this.data.friendRequests && this.data.friendRequests[oldUniqueId]) {
          this.data.friendRequests[targetId] = this.data.friendRequests[targetId] || this.data.friendRequests[oldUniqueId];
        }
        if (this.data.matchHistory && this.data.matchHistory[oldUniqueId]) {
          this.data.matchHistory[targetId] = this.data.matchHistory[targetId] || this.data.matchHistory[oldUniqueId];
        }
        if (this.data.trophyLedger && this.data.trophyLedger[oldUniqueId]) {
          this.data.trophyLedger[targetId] = this.data.trophyLedger[targetId] || this.data.trophyLedger[oldUniqueId];
        }
      }
      if (oldNumericPlayerId && oldNumericPlayerId !== targetId) {
        this.data.numericPlayerIndex[oldNumericPlayerId] = userId;
        this.data.uniqueIdIndex[oldNumericPlayerId] = userId;
      }
    }

    // Remap all existing friendship records to canonical numeric IDs
    if (this.data.friendships) {
      const updatedFriendships = {};
      for (const [pairKey, friendship] of Object.entries(this.data.friendships)) {
        if (!friendship || !friendship.userA || !friendship.userB) continue;
        const uA = this.findUserByUniqueId(friendship.userA) || (this.data.users && this.data.users[friendship.userA]);
        const uB = this.findUserByUniqueId(friendship.userB) || (this.data.users && this.data.users[friendship.userB]);
        const canA = uA ? (uA.numericPlayerId || uA.uniqueId) : friendship.userA;
        const canB = uB ? (uB.numericPlayerId || uB.uniqueId) : friendship.userB;
        if (canA && canB && canA !== canB) {
          const canonicalPair = this.getCanonicalPair(canA, canB);
          updatedFriendships[canonicalPair] = {
            id: `frnd_${canonicalPair}`,
            userA: canonicalPair.split('::')[0],
            userB: canonicalPair.split('::')[1],
            createdAt: friendship.createdAt || new Date().toISOString()
          };
          // Keep old pairKey alias for backwards compatibility
          if (canonicalPair !== pairKey) {
            updatedFriendships[pairKey] = updatedFriendships[canonicalPair];
            modified = true;
          }
        } else {
          updatedFriendships[pairKey] = friendship;
        }
      }
      this.data.friendships = updatedFriendships;
    }

    // Remap and synchronize all directional friends lists
    this.data.friends = this.data.friends || {};
    if (this.data.friendships) {
      for (const f of Object.values(this.data.friendships)) {
        if (!f || !f.userA || !f.userB) continue;
        const uA = f.userA;
        const uB = f.userB;
        this.data.friends[uA] = this.data.friends[uA] || [];
        this.data.friends[uB] = this.data.friends[uB] || [];
        if (!this.data.friends[uA].includes(uB)) {
          this.data.friends[uA].push(uB);
          modified = true;
        }
        if (!this.data.friends[uB].includes(uA)) {
          this.data.friends[uB].push(uA);
          modified = true;
        }
      }
    }

    if (modified) {
      this.saveData();
      console.log('[MIGRATION] Atomic migration to 7-digit numeric IDs completed.');
    }
  }

  /**
   * Generates a 7-digit numeric-only Player ID server-side.
   * Format: exactly 7 numeric characters.
   */
  generateUniqueId(prefix = '') {
    return this.generateNumericPlayerId();
  }

  /**
   * Generates a 7-digit numeric-only Player ID.
   * Format: exactly 7 digits (1000001 - 9999999).
   * Guaranteed collision-free via atomic check against numericPlayerIndex and RESERVED_SPECIAL_IDS.
   */
  generateNumericPlayerId() {
    this.data.numericPlayerIndex = this.data.numericPlayerIndex || {};
    let nextId = this.data.nextNumericPlayerId || 1000001;
    while (
      RESERVED_SPECIAL_IDS.has(String(nextId)) ||
      this.data.numericPlayerIndex[String(nextId)] ||
      this.findUserByNumericId(String(nextId))
    ) {
      nextId++;
    }
    this.data.nextNumericPlayerId = nextId + 1;
    this.saveData();
    return String(nextId);
  }

  /**
   * O(1) lookup of user by 7-digit numeric Player ID.
   */
  findUserByNumericId(numericId) {
    if (!numericId) return null;
    const clean = String(numericId).trim().replace(/\D/g, '');
    if (!clean) return null;
    this.data.numericPlayerIndex = this.data.numericPlayerIndex || {};
    const userId = this.data.numericPlayerIndex[clean];
    if (userId && this.data.users && this.data.users[userId]) {
      return this.data.users[userId];
    }
    // Fallback scan across users in case index missed
    if (this.data.users) {
      const match = Object.values(this.data.users).find(u => 
        (u.numericPlayerId && String(u.numericPlayerId).trim() === clean) ||
        (u.legacyNumericPlayerId && String(u.legacyNumericPlayerId).trim() === clean) ||
        (u.bidId && u.bidId.replace(/\D/g, '') === clean) ||
        (u.uniqueId && u.uniqueId.replace(/\D/g, '') === clean)
      );
      if (match) {
        this.data.numericPlayerIndex[clean] = match.id;
        return match;
      }
    }
    return null;
  }

  /**
   * Generates a collision-safe, sequential player name for guests/new accounts (Section 2.C).
   * Format: Player 001, Player 002, etc.
   */
  generateNextPlayerName() {
    if (!this.data.nextPlayerNumber) {
      let maxNum = 0;
      if (this.data.users) {
        for (const u of Object.values(this.data.users)) {
          if (u.name && /^Player\s+(\d+)$/i.test(u.name)) {
            const m = parseInt(u.name.match(/^Player\s+(\d+)$/i)[1], 10);
            if (!isNaN(m) && m > maxNum) maxNum = m;
          }
        }
      }
      this.data.nextPlayerNumber = maxNum + 1;
    }
    const name = `Player ${String(this.data.nextPlayerNumber).padStart(3, '0')}`;
    this.data.nextPlayerNumber++;
    this.saveData();
    return name;
  }

  /**
   * Deterministic Player ID derivation.
   * Maps permanent authentication seeds to approved 7-digit numeric IDs.
   */
  deriveDeterministicPlayerId(seed, prefix = '') {
    return this.generateNumericPlayerId();
  }

  /**
   * Database-enforced atomic resolution.
   * Every authenticated Google account maps to EXACTLY ONE permanent THE BID account.
   * Special Rule (Section 4):
   * - Founder ID '0000000' is strictly assigned to verified Google account ani1220064@gmail.com
   * - First ten loyalty Google accounts atomically receive priority IDs: 1111111, 2222222, 3333333, 4444444, 5555555, 6666666, 7777777, 8888888, 9999999, 1000000
   * - All subsequent Google accounts receive standard unique 7-digit IDs (1000001+)
   */
  resolveOrCreateGoogleUser({ verifiedGoogleId, name, email, avatar }) {
    if (!verifiedGoogleId || typeof verifiedGoogleId !== 'string') {
      throw new Error('Valid verified Google identity is required');
    }
    const cleanGoogleId = verifiedGoogleId.trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const isFounder = isFounderIdentity(cleanGoogleId, cleanEmail);

    // 1. O(1) Lookup in stable googleUsers identity index
    this.data.googleUsers = this.data.googleUsers || {};
    const existingUniqueId = this.data.googleUsers[cleanGoogleId];
    if (existingUniqueId) {
      const existingUser = this.findUserByUniqueId(existingUniqueId);
      if (existingUser) {
        let modified = false;

        // If this is the founder, enforce FOUNDER ID '0000000'
        if (isFounder) {
          if (existingUser.numericPlayerId !== FOUNDER_PLAYER_ID) {
            existingUser.legacyNumericPlayerId = existingUser.numericPlayerId;
            this.data.numericPlayerIndex[existingUser.legacyNumericPlayerId] = existingUser.id;
          }
          existingUser.numericPlayerId = FOUNDER_PLAYER_ID;
          existingUser.uniqueId = FOUNDER_PLAYER_ID;
          existingUser.playerId = FOUNDER_PLAYER_ID;
          existingUser.bidId = FOUNDER_PLAYER_ID;
          this.data.numericPlayerIndex[FOUNDER_PLAYER_ID] = existingUser.id;
          this.data.uniqueIdIndex[FOUNDER_PLAYER_ID] = existingUser.id;
          this.data.googleUsers[cleanGoogleId] = FOUNDER_PLAYER_ID;
          existingUser.isFounder = true;
          existingUser.role = 'FOUNDER';
          if (!existingUser.email) existingUser.email = cleanEmail || 'ani1220064@gmail.com';
          modified = true;
        } else {
          const canonicalId = (existingUser.numericPlayerId && /^\d{7}$/.test(existingUser.numericPlayerId))
            ? existingUser.numericPlayerId
            : this.generateNumericPlayerId();
          if (existingUser.uniqueId !== canonicalId || existingUser.numericPlayerId !== canonicalId) {
            existingUser.uniqueId = canonicalId;
            existingUser.numericPlayerId = canonicalId;
            existingUser.playerId = canonicalId;
            existingUser.bidId = canonicalId;
            this.data.numericPlayerIndex[canonicalId] = existingUser.id;
            this.data.uniqueIdIndex[canonicalId] = existingUser.id;
            this.data.googleUsers[cleanGoogleId] = canonicalId;
            modified = true;
          }
        }

        // Always record Google profile claims for optional selection (Section 4.B & 10)
        if (name && existingUser.googleDisplayName !== name) {
          existingUser.googleDisplayName = name;
          modified = true;
        }
        if (avatar && existingUser.googlePhotoUrl !== avatar) {
          existingUser.googlePhotoUrl = avatar;
          modified = true;
        }

        // Section 2.B & 10: Never silently overwrite a custom display name
        if (name && existingUser.nameSource !== 'CUSTOM_NAME') {
          if (existingUser.name !== name && name !== 'Bidder') {
            existingUser.name = name;
            existingUser.nameSource = 'GOOGLE_NAME';
            modified = true;
          }
        }

        // Section 3: Automatic Google profile picture synchronization rules
        if (avatar) {
          if (existingUser.avatarSource !== 'THE_BID_AVATAR' && existingUser.avatarSource !== 'CUSTOM_UPLOAD') {
            if (existingUser.avatar !== avatar) {
              existingUser.avatar = avatar;
              existingUser.avatarSource = 'GOOGLE_PROFILE';
              modified = true;
            }
          }
        } else {
          if (existingUser.avatarSource === 'GOOGLE_PROFILE') {
            existingUser.avatar = 'avatar_male_1';
            existingUser.avatarSource = 'DEFAULT_AVATAR';
            existingUser.googlePhotoUrl = null;
            modified = true;
          }
        }

        if (modified) {
          this.saveData();
        }
        return existingUser;
      }
    }

    // 2. Safe Migration for Founder account
    if (isFounder) {
      const existingFounderAccount = Object.values(this.data.users || {}).find(u => 
        (u.email && isFounderEmail(u.email)) || (u.googleId && FOUNDER_GOOGLE_IDS.includes(u.googleId))
      );

      if (existingFounderAccount) {
        console.log(`[AUTH] Atomically linking existing founder account [${existingFounderAccount.uniqueId}] to verified Google ID & FOUNDER ID 0000000...`);
        existingFounderAccount.numericPlayerId = FOUNDER_PLAYER_ID;
        existingFounderAccount.uniqueId = FOUNDER_PLAYER_ID;
        existingFounderAccount.playerId = FOUNDER_PLAYER_ID;
        existingFounderAccount.bidId = FOUNDER_PLAYER_ID;
        existingFounderAccount.googleId = cleanGoogleId;
        existingFounderAccount.email = cleanEmail || 'ani1220064@gmail.com';
        existingFounderAccount.isFounder = true;
        existingFounderAccount.role = 'FOUNDER';
        existingFounderAccount.isGuest = false;
        if (name && existingFounderAccount.nameSource !== 'CUSTOM_NAME') {
          existingFounderAccount.name = name;
        }
        if (avatar && existingFounderAccount.avatarSource !== 'CUSTOM_UPLOAD') {
          existingFounderAccount.googlePhotoUrl = avatar;
        }
        this.data.numericPlayerIndex = this.data.numericPlayerIndex || {};
        this.data.numericPlayerIndex[FOUNDER_PLAYER_ID] = existingFounderAccount.id;
        this.data.uniqueIdIndex[FOUNDER_PLAYER_ID] = existingFounderAccount.id;
        this.data.googleUsers[cleanGoogleId] = FOUNDER_PLAYER_ID;
        this.saveData();
        return existingFounderAccount;
      }
    }

    // 3. Secondary check across existing user records to recover any orphaned mappings
    const matchingUser = Object.values(this.data.users || {}).find(u => u.googleId === cleanGoogleId);
    if (matchingUser) {
      const targetCanonicalId = isFounder ? FOUNDER_PLAYER_ID : (matchingUser.numericPlayerId || this.generateNumericPlayerId());
      matchingUser.uniqueId = targetCanonicalId;
      matchingUser.numericPlayerId = targetCanonicalId;
      matchingUser.playerId = targetCanonicalId;
      matchingUser.bidId = targetCanonicalId;
      this.data.googleUsers[cleanGoogleId] = targetCanonicalId;
      this.data.uniqueIdIndex[targetCanonicalId] = matchingUser.id;
      this.data.numericPlayerIndex[targetCanonicalId] = matchingUser.id;
      if (isFounder) {
        matchingUser.isFounder = true;
        matchingUser.role = 'FOUNDER';
        if (!matchingUser.email) matchingUser.email = cleanEmail || 'ani1220064@gmail.com';
      }
      this.saveData();
      return matchingUser;
    }

    // 4. Allocate Numeric Player ID (Founder -> Loyalty -> Sequential)
    let numericPlayerId = null;
    let isLoyalty = false;
    let loyaltyPriority = null;

    if (isFounder) {
      numericPlayerId = FOUNDER_PLAYER_ID;
    } else if (cleanEmail === 'anirudhchaturvedi122006@gmail.com') {
      numericPlayerId = '1111111';
      this.data.allocatedLoyaltyIds = Array.isArray(this.data.allocatedLoyaltyIds) ? this.data.allocatedLoyaltyIds : [];
      if (!this.data.allocatedLoyaltyIds.includes('1111111')) {
        this.data.allocatedLoyaltyIds.unshift('1111111');
      }
      isLoyalty = true;
      loyaltyPriority = 1;
    } else {
      this.data.allocatedLoyaltyIds = Array.isArray(this.data.allocatedLoyaltyIds) ? this.data.allocatedLoyaltyIds : [];
      const nextLoyaltyId = LOYALTY_PLAYER_IDS.find(id => 
        !this.data.allocatedLoyaltyIds.includes(id) && 
        !this.data.numericPlayerIndex[id] &&
        !this.findUserByNumericId(id)
      );

      if (nextLoyaltyId) {
        numericPlayerId = nextLoyaltyId;
        this.data.allocatedLoyaltyIds.push(nextLoyaltyId);
        isLoyalty = true;
        loyaltyPriority = this.data.allocatedLoyaltyIds.length;
        console.log(`[AUTH] Assigned Loyalty Player ID [${numericPlayerId}] (Priority #${loyaltyPriority}) to new Google user: ${cleanEmail || cleanGoogleId}`);
      } else {
        numericPlayerId = this.generateNumericPlayerId();
      }
    }

    const canonicalId = numericPlayerId;

    const newUser = {
      id: `usr_g_${cleanGoogleId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_${Date.now()}`,
      googleId: cleanGoogleId,
      uniqueId: canonicalId,
      numericPlayerId: canonicalId,
      playerId: canonicalId,
      bidId: canonicalId,
      legacyUniqueId: canonicalId,
      name: name || 'Bidder',
      nameSource: name ? 'GOOGLE_NAME' : 'GENERATED_NAME',
      email: cleanEmail || (isFounder ? 'ani1220064@gmail.com' : null),
      avatar: avatar || 'avatar_1',
      avatarSource: avatar ? 'GOOGLE_PROFILE' : 'DEFAULT_AVATAR',
      googleDisplayName: name || null,
      googlePhotoUrl: avatar || null,
      customPhotoUrl: null,
      isProfileSetupDone: false,
      trophies: 0,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      categoryTrophies: {
        ipl_cricket: 0,
        fifa_football: 0,
        formula_1: 0,
        nba: 0,
        movie_stars: 0,
        luxury_cars: 0,
        luxury_collection: 0
      },
      isGuest: false,
      isFounder: isFounder,
      role: isFounder ? 'FOUNDER' : 'PLAYER',
      isLoyaltyPlayer: isLoyalty,
      loyaltyPriority: loyaltyPriority,
      createdAt: new Date().toISOString()
    };

    this.data.users[newUser.id] = newUser;
    this.data.googleUsers[cleanGoogleId] = canonicalId;
    this.data.uniqueIdIndex[canonicalId] = newUser.id;
    this.data.numericPlayerIndex[canonicalId] = newUser.id;
    this.data.friends[canonicalId] = this.data.friends[canonicalId] || [];
    this.data.friendRequests[canonicalId] = this.data.friendRequests[canonicalId] || [];
    this.data.matchHistory[canonicalId] = this.data.matchHistory[canonicalId] || [];

    this.saveData();
    return newUser;
  }

  getUserFullProfile(identifier) {
    const user = this.findUserByUniqueId(identifier) || this.findUserByNumericId(identifier);
    if (!user) return null;

    const emailLower = user.email ? String(user.email).trim().toLowerCase() : '';
    const isFounder = isFounderIdentity(user.googleId, user.email) ||
                      (emailLower === 'ani1220064@gmail.com') ||
                      user.googleId === '111044643998881545528' ||
                      (this.data.numericPlayerIndex && this.data.numericPlayerIndex[FOUNDER_PLAYER_ID] === user.id) ||
                      (user.avatar && String(user.avatar).includes('ACg8ocJRGDIVP'));

    const isLoyalty1 = (emailLower === 'anirudhchaturvedi122006@gmail.com') ||
                       (this.data.numericPlayerIndex && this.data.numericPlayerIndex['1111111'] === user.id) ||
                       (user.avatar && String(user.avatar).includes('ACg8ocIGzEkhGF'));

    const canonicalNumId = isFounder
      ? FOUNDER_PLAYER_ID
      : (isLoyalty1
        ? '1111111'
        : ((user.numericPlayerId && /^\d{7}$/.test(user.numericPlayerId))
          ? user.numericPlayerId
          : (/^\d{7}$/.test(user.uniqueId) ? user.uniqueId : this.generateNumericPlayerId())));

    let modified = false;
    if (user.uniqueId !== canonicalNumId || user.numericPlayerId !== canonicalNumId) {
      user.uniqueId = canonicalNumId;
      user.numericPlayerId = canonicalNumId;
      user.playerId = canonicalNumId;
      user.bidId = canonicalNumId;
      this.data.numericPlayerIndex[canonicalNumId] = user.id;
      this.data.uniqueIdIndex[canonicalNumId] = user.id;
      modified = true;
    }
    if (isFounder && (!user.isFounder || user.role !== 'FOUNDER')) {
      user.isFounder = true;
      user.role = 'FOUNDER';
      if (!user.email) user.email = 'ani1220064@gmail.com';
      modified = true;
    }
    if (isLoyalty1 && (!user.isLoyaltyPlayer || user.loyaltyPriority !== 1)) {
      user.isLoyaltyPlayer = true;
      user.loyaltyPriority = 1;
      if (!user.email) user.email = 'anirudhchaturvedi122006@gmail.com';
      modified = true;
    }
    if (modified) {
      this.saveData();
    }

    const cleanId = user.uniqueId || user.id;
    const friends = this.getFriendsList(cleanId);
    const requests = this.getFriendRequests(cleanId);
    const history = this.getMatchHistory(cleanId);
    const trophies = this.getTrophyLedger(cleanId);
    return {
      user,
      friends,
      requests,
      history,
      matchHistory: history,
      trophies,
      trophiesLedger: trophies
    };
  }

  updateUserTrophies(identifier, trophies) {
    const user = this.findUserByUniqueId(identifier);
    if (user) {
      user.trophies = Number(trophies);
      this.saveData();
      return user;
    }
    return null;
  }

  getOrCreateUser(userData) {
    let existing = Object.values(this.data.users).find(u => 
      u.email === userData.email || u.id === userData.id || u.uniqueId === userData.uniqueId
    );

    if (existing) {
      if (userData.name && existing.nameSource !== 'CUSTOM_NAME') {
        existing.name = userData.name;
        if (userData.nameSource) existing.nameSource = userData.nameSource;
      }
      if (userData.avatar && existing.avatarSource !== 'CUSTOM_UPLOAD' && existing.avatarSource !== 'THE_BID_AVATAR') {
        existing.avatar = userData.avatar;
        if (userData.avatarSource) existing.avatarSource = userData.avatarSource;
      }
      if (userData.isProfileSetupDone !== undefined) {
        existing.isProfileSetupDone = userData.isProfileSetupDone;
      }
      const isStagingMode = process.env.STAGING_MULTIPLAYER_TEST === 'true';
      if (userData.isStagingTestAccount || (isStagingMode && existing.numericPlayerId)) {
        existing.isStagingTestAccount = true;
        existing.isGuest = false;
      }
      if (!existing.numericPlayerId && (!existing.isGuest || isStagingMode)) {
        existing.numericPlayerId = this.generateNumericPlayerId();
        this.data.numericPlayerIndex = this.data.numericPlayerIndex || {};
        this.data.numericPlayerIndex[existing.numericPlayerId] = existing.id;
      }
      if (existing.numericPlayerId) {
        this.data.numericPlayerIndex = this.data.numericPlayerIndex || {};
        this.data.numericPlayerIndex[existing.numericPlayerId] = existing.id;
      }
      if (existing.uniqueId) {
        this.data.uniqueIdIndex[existing.uniqueId.toUpperCase()] = existing.id;
      }
      this.saveData();
      return existing;
    }

    const isGuest = !!userData.isGuest;
    const isStagingMode = process.env.STAGING_MULTIPLAYER_TEST === 'true';
    let numericPlayerId = userData.numericPlayerId;
    if (numericPlayerId && RESERVED_SPECIAL_IDS.has(String(numericPlayerId))) {
      if (!this.data.numericPlayerIndex || this.data.numericPlayerIndex[String(numericPlayerId)] !== userData.id) {
        numericPlayerId = null;
      }
    }
    if (!numericPlayerId || !/^\d{7}$/.test(String(numericPlayerId))) {
      numericPlayerId = this.generateNumericPlayerId();
    }
    const canonicalId = String(numericPlayerId);
    const uniqueId = canonicalId;
    const finalName = userData.name || this.generateNextPlayerName();
    const finalNameSource = userData.nameSource || (userData.name ? 'CUSTOM_NAME' : 'GENERATED_NAME');
    const finalAvatar = userData.avatar || 'avatar_1';
    const finalAvatarSource = userData.avatarSource || 'DEFAULT_AVATAR';

    const newUser = {
      id: userData.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: finalName,
      nameSource: finalNameSource,
      email: userData.email || null,
      avatar: finalAvatar,
      avatarSource: finalAvatarSource,
      googleDisplayName: userData.googleDisplayName || null,
      googlePhotoUrl: userData.googlePhotoUrl || null,
      customPhotoUrl: userData.customPhotoUrl || null,
      isProfileSetupDone: !!userData.isProfileSetupDone,
      uniqueId: canonicalId,
      numericPlayerId: canonicalId,
      playerId: canonicalId,
      bidId: canonicalId,
      legacyUniqueId: canonicalId,
      trophies: userData.trophies || 0,
      categoryTrophies: userData.categoryTrophies || {
        ipl_cricket: userData.trophies || 0,
        fifa_football: 0,
        formula_1: 0,
        nba: 0,
        movie_stars: 0,
        luxury_cars: 0,
        luxury_collection: 0
      },
      isGuest,
      isMockTestAccount: !!userData.isMockTestAccount,
      createdAt: new Date().toISOString()
    };

    this.data.users[newUser.id] = newUser;
    if (numericPlayerId) {
      this.data.numericPlayerIndex = this.data.numericPlayerIndex || {};
      this.data.numericPlayerIndex[numericPlayerId] = newUser.id;
    }
    if (uniqueId) {
      this.data.uniqueIdIndex[uniqueId.toUpperCase()] = newUser.id;
      this.data.friends[uniqueId] = this.data.friends[uniqueId] || [];
      this.data.friendRequests[uniqueId] = this.data.friendRequests[uniqueId] || [];
      this.data.matchHistory[uniqueId] = this.data.matchHistory[uniqueId] || [];
    }
    this.saveData();
    return newUser;
  }

  ensureQATester() {
    this.data.users = this.data.users || {};
    this.data.numericPlayerIndex = this.data.numericPlayerIndex || {};
    this.data.uniqueIdIndex = this.data.uniqueIdIndex || {};
    this.data.friends = this.data.friends || {};
    this.data.friendRequests = this.data.friendRequests || {};

    const userId = 'usr_staging_qa_1000999';
    const numericPlayerId = '1000999';
    const uniqueId = '1000999';

    // Also upgrade current physical device tester profile in staging
    const devUserId = 'guest_inst_134182cf-db2a-4cac-b638-86b72bd709bc';
    if (this.data.users[devUserId]) {
      const du = this.data.users[devUserId];
      du.isStagingTestAccount = true;
      du.isGuest = false;
      du.authType = 'GOOGLE';
      if (!du.numericPlayerId) du.numericPlayerId = '1000129';
      du.bidId = `BID-${du.numericPlayerId}`;
      this.data.numericPlayerIndex[du.numericPlayerId] = devUserId;
      this.data.uniqueIdIndex[devUserId] = devUserId;
      this.data.uniqueIdIndex[du.numericPlayerId] = devUserId;
      this.data.uniqueIdIndex[`BID-${du.numericPlayerId}`] = devUserId;

      // Ensure mutual friendships with test players so direct room invitations succeed
      for (let i = 1; i <= 10; i++) {
        const testBotId = `BID-1000${100 + i}`;
        this.ensureFriendship(devUserId, testBotId);
      }
    }

    if (this.data.users[userId]) {
      const u = this.data.users[userId];
      u.isStagingTestAccount = true;
      u.isGuest = false;
      u.numericPlayerId = numericPlayerId;
      u.uniqueId = uniqueId;
      u.legacyUniqueId = uniqueId;
      u.authType = 'GOOGLE';
      this.data.numericPlayerIndex[numericPlayerId] = userId;
      this.data.uniqueIdIndex[uniqueId] = userId;
      this.data.uniqueIdIndex[numericPlayerId] = userId;
      return u;
    }

    const qaUser = {
      id: userId,
      playerId: userId,
      numericPlayerId,
      uniqueId,
      legacyUniqueId: uniqueId,
      name: 'Anirudh Tester',
      displayName: 'Anirudh Tester',
      email: 'anirudh.qa.tester@thebid.game',
      avatar: 'avatar_male_1',
      nameSource: 'CUSTOM_NAME',
      avatarSource: 'THE_BID_AVATAR',
      isProfileSetupDone: true,
      trophies: 25,
      totalTrophies: 25,
      trophiesEarned: 25,
      categoryTrophies: {
        ipl_cricket: 10,
        fifa_football: 5,
        formula_1: 4,
        nba: 3,
        movie_stars: 3,
        luxury_cars: 0,
        luxury_collection: 0
      },
      isGuest: false,
      isStagingTestAccount: true,
      authType: 'GOOGLE',
      createdAt: new Date().toISOString()
    };

    this.data.users[userId] = qaUser;
    this.data.numericPlayerIndex[numericPlayerId] = userId;
    this.data.uniqueIdIndex[uniqueId] = userId;
    this.data.uniqueIdIndex[numericPlayerId] = userId;
    this.data.friends[uniqueId] = this.data.friends[uniqueId] || [];
    this.data.friendRequests[uniqueId] = this.data.friendRequests[uniqueId] || [];
    this.saveData();
    return qaUser;
  }

  ensureFriendship(idA, idB) {
    if (!idA || !idB) return;
    const userA = this.findUserByUniqueId(idA);
    const userB = this.findUserByUniqueId(idB);
    if (!userA || !userB) return;
    const normA = (userA.uniqueId || userA.id).trim().toUpperCase();
    const normB = (userB.uniqueId || userB.id).trim().toUpperCase();
    if (normA === normB) return;

    this.data.friendships = this.data.friendships || {};
    this.data.friends = this.data.friends || {};

    const pair = this.getCanonicalPair(normA, normB);
    this.data.friendships[pair] = {
      userA: normA,
      userB: normB,
      createdAt: new Date().toISOString()
    };

    this.data.friends[normA] = this.data.friends[normA] || [];
    if (!this.data.friends[normA].some(f => (typeof f === 'string' ? f : (f.uniqueId || '')).toUpperCase() === normB)) {
      this.data.friends[normA].push(normB);
    }

    this.data.friends[normB] = this.data.friends[normB] || [];
    if (!this.data.friends[normB].some(f => (typeof f === 'string' ? f : (f.uniqueId || '')).toUpperCase() === normA)) {
      this.data.friends[normB].push(normA);
    }
    this.saveData();
  }

  removeFriendship(idA, idB) {
    if (!idA || !idB) return;
    const userA = this.findUserByUniqueId(idA);
    const userB = this.findUserByUniqueId(idB);
    const keysA = [idA, userA?.uniqueId, userA?.id, userA?.numericPlayerId].filter(Boolean).map(x => String(x).trim().toUpperCase());
    const keysB = [idB, userB?.uniqueId, userB?.id, userB?.numericPlayerId].filter(Boolean).map(x => String(x).trim().toUpperCase());

    if (this.data.friendships) {
      for (const a of keysA) {
        for (const b of keysB) {
          const pair = this.getCanonicalPair(a, b);
          if (pair && this.data.friendships[pair]) {
            delete this.data.friendships[pair];
          }
        }
      }
    }

    if (this.data.friends) {
      for (const a of keysA) {
        if (this.data.friends[a]) {
          this.data.friends[a] = this.data.friends[a].filter(f => {
            const fKey = (typeof f === 'string' ? f : (f.uniqueId || f.id || '')).trim().toUpperCase();
            return !keysB.includes(fKey);
          });
        }
      }
      for (const b of keysB) {
        if (this.data.friends[b]) {
          this.data.friends[b] = this.data.friends[b].filter(f => {
            const fKey = (typeof f === 'string' ? f : (f.uniqueId || f.id || '')).trim().toUpperCase();
            return !keysA.includes(fKey);
          });
        }
      }
    }
    this.saveData();
  }

  findUserByUniqueId(identifier) {
    if (!identifier) return null;
    const clean = String(identifier).trim();
    if (!clean) return null;
    const cleanUpper = clean.toUpperCase();

    // 0. Direct 7-digit numeric player ID lookup (O(1))
    if (/^\d{7}$/.test(clean)) {
      const numMatch = this.findUserByNumericId(clean);
      if (numMatch) return numMatch;
    }

    // 1. Check googleUsers index
    if (this.data.googleUsers && this.data.googleUsers[clean]) {
      const uId = this.data.googleUsers[clean];
      const match = Object.values(this.data.users).find(u => u.uniqueId === uId || u.id === uId);
      if (match) return match;
    }

    // 2. Direct uniqueIdIndex check (O(1))
    if (this.data.uniqueIdIndex) {
      if (this.data.uniqueIdIndex[cleanUpper] && this.data.users[this.data.uniqueIdIndex[cleanUpper]]) {
        return this.data.users[this.data.uniqueIdIndex[cleanUpper]];
      }

      // Check with common prefix variants
      const prefixVariants = [
        `BID-${cleanUpper.replace(/^(BID|TB)-?G?/i, '')}`,
        `BID-G${cleanUpper.replace(/^(BID|TB)-?G?/i, '')}`,
        `TB-${cleanUpper.replace(/^(BID|TB)-?G?/i, '')}`,
        `TB-G${cleanUpper.replace(/^(BID|TB)-?G?/i, '')}`,
        `BID-${cleanUpper}`,
        `TB-${cleanUpper}`
      ];

      for (const variant of prefixVariants) {
        const id = this.data.uniqueIdIndex[variant];
        if (id && this.data.users[id]) return this.data.users[id];
      }
    }

    // 3. Fallback exhaustive scan across all registered user records
    const core = cleanUpper.replace(/^(BID|TB)-?G?/i, '');
    const strippedTarget = cleanUpper.replace(/[^A-Z0-9]/g, '');

    return Object.values(this.data.users).find(u => {
      const uNorm = (u.uniqueId || '').trim().toUpperCase();
      if (!uNorm) return false;

      if (uNorm === cleanUpper) return true;
      if (u.id && u.id.trim().toUpperCase() === cleanUpper) return true;
      if (u.googleId && u.googleId.trim() === clean) return true;
      if (u.firebaseUid && u.firebaseUid.trim() === clean) return true;

      const uCore = uNorm.replace(/^(BID|TB)-?G?/i, '');
      if (core && core.length >= 3 && uCore === core) return true;

      const uStripped = uNorm.replace(/[^A-Z0-9]/g, '');
      if (strippedTarget.length >= 4 && uStripped === strippedTarget) return true;

      return false;
    }) || null;
  }

  areFriends(uniqueIdA, uniqueIdB) {
    if (!uniqueIdA || !uniqueIdB) return false;
    let normA = uniqueIdA.trim().toUpperCase();
    let normB = uniqueIdB.trim().toUpperCase();
    if (normA === normB) return false;

    // Check canonical pair table with direct keys
    let pair = this.getCanonicalPair(normA, normB);
    if (pair && this.data.friendships && this.data.friendships[pair]) {
      return true;
    }

    // Resolve users to all their potential aliases
    const userA = this.findUserByUniqueId(normA) || this.findUserByNumericId(normA);
    const userB = this.findUserByUniqueId(normB) || this.findUserByNumericId(normB);
    if (userA && userB) {
      const keysA = [userA.uniqueId, userA.numericPlayerId, userA.id, normA].filter(Boolean).map(k => String(k).trim().toUpperCase());
      const keysB = [userB.uniqueId, userB.numericPlayerId, userB.id, normB].filter(Boolean).map(k => String(k).trim().toUpperCase());
      for (const kA of keysA) {
        for (const kB of keysB) {
          const p = this.getCanonicalPair(kA, kB);
          if (p && this.data.friendships && this.data.friendships[p]) {
            return true;
          }
        }
      }
      if (this.data.friends) {
        for (const kA of keysA) {
          if (Array.isArray(this.data.friends[kA])) {
            for (const item of this.data.friends[kA]) {
              const cleanItem = (typeof item === 'string' ? item : (item?.uniqueId || item?.id || item?.numericPlayerId || '')).trim().toUpperCase();
              if (keysB.includes(cleanItem)) return true;
            }
          }
        }
      }
    }

    return false;
  }

  getPlayerRelationship(searcherUniqueId, targetUniqueId) {
    if (!searcherUniqueId || !targetUniqueId) return 'NOT_FRIENDS';
    const normSearcher = searcherUniqueId.trim().toUpperCase();
    const normTarget = targetUniqueId.trim().toUpperCase();

    if (normSearcher === normTarget) return 'SELF';

    if (this.areFriends(normSearcher, normTarget)) return 'FRIENDS';

    // Check incoming requests (searcher received from target)
    const incoming = (this.data.friendRequests[normSearcher] || []).filter(r => r.status === 'PENDING');
    if (incoming.some(r => (r.fromUniqueId || '').trim().toUpperCase() === normTarget)) {
      return 'REQUEST_RECEIVED';
    }

    // Check outgoing requests (searcher sent to target)
    const outgoing = (this.data.friendRequests[normTarget] || []).filter(r => r.status === 'PENDING');
    if (outgoing.some(r => (r.fromUniqueId || '').trim().toUpperCase() === normSearcher)) {
      return 'REQUEST_SENT';
    }

    return 'NOT_FRIENDS';
  }

  // --- TRANSACTIONAL OUTBOX & IDEMPOTENCY ---
  isOperationProcessed(operationId) {
    if (!operationId || typeof operationId !== 'string') return null;
    this.data.processedOperations = this.data.processedOperations || {};
    return this.data.processedOperations[operationId] || null;
  }

  recordProcessedOperation(operationId, result) {
    if (!operationId || typeof operationId !== 'string') return;
    this.data.processedOperations = this.data.processedOperations || {};
    this.data.processedOperations[operationId] = {
      result,
      processedAt: new Date().toISOString()
    };
    // Keep processed operations bounded to last 2000 items
    const keys = Object.keys(this.data.processedOperations);
    if (keys.length > 2000) {
      delete this.data.processedOperations[keys[0]];
    }
  }

  createOutboxEvent({ eventType, aggregateId, actorUserId, targetUserId, payload }) {
    if (!eventType || !targetUserId) return null;
    this.data.outbox = this.data.outbox || [];
    const event = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      eventType,
      aggregateId: aggregateId || null,
      actorUserId: (actorUserId || '').trim().toUpperCase(),
      targetUserId: (targetUserId || '').trim().toUpperCase(),
      payload: payload || {},
      status: 'PENDING', // PENDING -> DISPATCHED -> DELIVERED
      createdAt: new Date().toISOString(),
      dispatchedAt: null,
      deliveredAt: null
    };
    this.data.outbox.push(event);
    if (this.data.outbox.length > 1000) {
      this.data.outbox = this.data.outbox.slice(-1000);
    }
    return event;
  }

  getPendingOutboxEvents(targetUserId) {
    if (!targetUserId) return [];
    const normTarget = String(targetUserId).trim().toUpperCase();
    this.data.outbox = this.data.outbox || [];
    return this.data.outbox.filter(e => 
      e.targetUserId === normTarget && e.status === 'PENDING'
    );
  }

  markOutboxEventDispatched(eventId) {
    if (!eventId || !this.data.outbox) return;
    const evt = this.data.outbox.find(e => e.eventId === eventId);
    if (evt) {
      evt.status = 'DELIVERED';
      evt.dispatchedAt = evt.dispatchedAt || new Date().toISOString();
      evt.deliveredAt = new Date().toISOString();
      this.saveData();
    }
  }

  markOutboxEventDelivered(eventId) {
    if (!eventId || !this.data.outbox) return;
    const evt = this.data.outbox.find(e => e.eventId === eventId);
    if (evt) {
      evt.status = 'DELIVERED';
      evt.deliveredAt = new Date().toISOString();
      this.saveData();
    }
  }

  sendFriendRequest(fromUniqueId, toUniqueId, operationId = null) {
    if (operationId) {
      const prev = this.isOperationProcessed(operationId);
      if (prev) {
        return prev.result;
      }
    }

    const fromUser = this.findUserByUniqueId(fromUniqueId) || this.findUserByNumericId(fromUniqueId);
    const target = this.findUserByUniqueId(toUniqueId) || this.findUserByNumericId(toUniqueId);
    if (!target) return { success: false, message: 'Player with that Player ID was not found.' };
    if (!fromUser) return { success: false, message: 'Sender profile not found.' };

    const normFrom = (fromUser.numericPlayerId || fromUser.uniqueId).trim().toUpperCase();
    const normTarget = (target.numericPlayerId || target.uniqueId).trim().toUpperCase();

    if (normFrom === normTarget) {
      return { success: false, message: 'You cannot add yourself as a friend.' };
    }

    // 1. Check if already mutual permanent friends
    if (this.areFriends(normFrom, normTarget)) {
      return { success: false, error: 'ALREADY_FRIENDS', message: 'You are already permanent friends with this player.' };
    }

    // 2. Check if target already sent a pending request to fromUser (Mutual request auto-merge)
    const pendingOnSender = this.data.friendRequests[normFrom] || [];
    const reverseReq = pendingOnSender.find(r => r.status === 'PENDING' && (r.fromUniqueId || '').trim().toUpperCase() === normTarget);
    if (reverseReq) {
      this.acceptFriendRequest(normFrom, normTarget, operationId ? `auto_${operationId}` : null);
      const res = {
        success: true,
        autoAccepted: true,
        fromUser,
        targetUser: target,
        user: fromUser,
        message: `Mutual request! You and ${target.name} are now permanent friends.`
      };
      if (operationId) this.recordProcessedOperation(operationId, res);
      return res;
    }

    // 3. Check for existing pending request from sender to target
    if (!this.data.friendRequests[normTarget]) {
      this.data.friendRequests[normTarget] = [];
    }

    const existingReq = this.data.friendRequests[normTarget].find(
      r => r.status === 'PENDING' && (r.fromUniqueId || '').trim().toUpperCase() === normFrom
    );
    if (existingReq) {
      const now = Date.now();
      const lastSent = existingReq.lastSentAt || (existingReq.date ? new Date(existingReq.date).getTime() : 0);
      if (now - lastSent < 1800) {
        return {
          success: false,
          throttled: true,
          waitMs: Math.max(0, 1800 - (now - lastSent)),
          message: 'Please wait a moment before sending another notification.'
        };
      }
      existingReq.lastSentAt = now;
      existingReq.updatedAt = new Date(now).toISOString();
      existingReq.date = new Date(now).toISOString();
      existingReq.fromName = fromUser.name || existingReq.fromName;
      existingReq.fromAvatar = fromUser.avatar || existingReq.fromAvatar;

      const outboxEvt = this.createOutboxEvent({
        eventType: 'FRIEND_REQUEST_SENT',
        aggregateId: existingReq.id,
        actorUserId: normFrom,
        targetUserId: normTarget,
        payload: { request: existingReq, fromUser, targetUser: target }
      });

      this.saveData();
      const res = {
        success: true,
        reNotified: true,
        request: existingReq,
        targetUser: target,
        fromUser,
        outboxEvent: outboxEvt,
        message: `Request notification re-sent to ${target.name}`
      };
      if (operationId) this.recordProcessedOperation(operationId, res);
      return res;
    }

    const now = Date.now();
    const newReq = {
      id: `freq_${now}_${Math.random().toString(36).substr(2, 6)}`,
      senderUserId: fromUser.id,
      senderUniqueId: normFrom,
      fromUniqueId: normFrom,
      recipientUserId: target.id,
      recipientUniqueId: normTarget,
      fromName: fromUser.name || 'A Player',
      fromAvatar: fromUser.avatar || 'avatar_1',
      status: 'PENDING',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      date: new Date(now).toISOString(),
      lastSentAt: now
    };
    this.data.friendRequests[normTarget].push(newReq);

    const outboxEvt = this.createOutboxEvent({
      eventType: 'FRIEND_REQUEST_SENT',
      aggregateId: newReq.id,
      actorUserId: normFrom,
      targetUserId: normTarget,
      payload: { request: newReq, fromUser, targetUser: target }
    });

    this.saveData(); // Authoritative DB Commit BEFORE returning
    const res = {
      success: true,
      request: newReq,
      targetUser: target,
      fromUser,
      outboxEvent: outboxEvt,
      message: `Request sent to ${target.name}`
    };
    if (operationId) this.recordProcessedOperation(operationId, res);
    return res;
  }

  acceptFriendRequest(userUniqueId, fromUniqueId, operationId = null) {
    if (operationId) {
      const prev = this.isOperationProcessed(operationId);
      if (prev) {
        return prev.result;
      }
    }

    const user = this.findUserByUniqueId(userUniqueId) || this.findUserByNumericId(userUniqueId);
    if (!user) {
      return { success: false, message: 'User not found.' };
    }

    const fromUser = this.findUserByUniqueId(fromUniqueId) || this.findUserByNumericId(fromUniqueId);
    if (!fromUser) {
      return { success: false, message: 'Requesting player not found.' };
    }

    const userKeys = [user.uniqueId, user.numericPlayerId, user.id, userUniqueId].filter(Boolean).map(k => String(k).trim().toUpperCase());
    const fromKeys = [fromUser.uniqueId, fromUser.numericPlayerId, fromUser.id, fromUniqueId].filter(Boolean).map(k => String(k).trim().toUpperCase());

    const canUser = (user.numericPlayerId || user.uniqueId).trim().toUpperCase();
    const canFrom = (fromUser.numericPlayerId || fromUser.uniqueId).trim().toUpperCase();

    // Verify incoming request exists or mutual auto-acceptance across all aliases
    let pendingReq = null;
    for (const uKey of userKeys) {
      const list = this.data.friendRequests[uKey] || [];
      const found = list.find(r => (r.status === 'PENDING' || r.status === 'ACCEPTED') && fromKeys.includes(String(r.fromUniqueId || '').trim().toUpperCase()));
      if (found) {
        pendingReq = found;
        break;
      }
    }

    // Also mark any reverse request on fromUser as ACCEPTED if present
    let reversePending = null;
    for (const fKey of fromKeys) {
      const list = this.data.friendRequests[fKey] || [];
      const found = list.find(r => (r.status === 'PENDING' || r.status === 'ACCEPTED') && userKeys.includes(String(r.fromUniqueId || '').trim().toUpperCase()));
      if (found) {
        reversePending = found;
        break;
      }
    }

    if (!pendingReq && !reversePending) {
      // In cases where request was sent via direct invite or already established, allow graceful completion
      console.log(`[Store] Notice: No pending request object found between ${canUser} and ${canFrom}, establishing friendship directly`);
    }

    if (pendingReq) {
      pendingReq.status = 'ACCEPTED';
      pendingReq.updatedAt = new Date().toISOString();
    }

    if (reversePending) {
      reversePending.status = 'ACCEPTED';
      reversePending.updatedAt = new Date().toISOString();
    }

    // 1. Establish Canonical Unordered Friendship Pair (min::max)
    const pair = this.getCanonicalPair(canUser, canFrom);
    if (pair) {
      this.data.friendships = this.data.friendships || {};
      if (!this.data.friendships[pair]) {
        const [uMin, uMax] = pair.split('::');
        this.data.friendships[pair] = {
          id: `frnd_${pair}`,
          userA: uMin,
          userB: uMax,
          createdAt: new Date().toISOString()
        };
      }
    }

    // 2. Synchronize directional lookups for fast retrieval
    this.data.friends = this.data.friends || {};
    this.data.friends[canUser] = this.data.friends[canUser] || [];
    this.data.friends[canFrom] = this.data.friends[canFrom] || [];

    if (!this.data.friends[canUser].some(f => (typeof f === 'string' ? f : (f?.uniqueId || f?.id || f?.numericPlayerId || '')).toUpperCase() === canFrom)) {
      this.data.friends[canUser].push(canFrom);
    }
    if (!this.data.friends[canFrom].some(f => (typeof f === 'string' ? f : (f?.uniqueId || f?.id || f?.numericPlayerId || '')).toUpperCase() === canUser)) {
      this.data.friends[canFrom].push(canUser);
    }

    // Outbox event for target player to receive realtime friendship sync
    const outboxEvt = this.createOutboxEvent({
      eventType: 'FRIEND_REQUEST_ACCEPTED',
      aggregateId: pair,
      actorUserId: canUser,
      targetUserId: canFrom,
      payload: { user, fromUser }
    });

    this.saveData(); // Authoritative DB commit
    const res = { success: true, user, fromUser, outboxEvent: outboxEvt };
    if (operationId) this.recordProcessedOperation(operationId, res);
    return res;
  }

  declineFriendRequest(userUniqueId, fromUniqueId, operationId = null) {
    if (operationId) {
      const prev = this.isOperationProcessed(operationId);
      if (prev) {
        return prev.result;
      }
    }

    const user = this.findUserByUniqueId(userUniqueId);
    if (!user) return { success: false, message: 'User not found.' };
    const normUser = user.uniqueId.trim().toUpperCase();
    const normFrom = (fromUniqueId || '').trim().toUpperCase();

    const requests = this.data.friendRequests[normUser] || [];
    const pendingReq = requests.find(r => r.status === 'PENDING' && (r.fromUniqueId || '').trim().toUpperCase() === normFrom);
    if (pendingReq) {
      pendingReq.status = 'DECLINED';
      pendingReq.updatedAt = new Date().toISOString();
    }
    this.saveData();
    const res = { success: true, userUniqueId: normUser, fromUniqueId: normFrom };
    if (operationId) this.recordProcessedOperation(operationId, res);
    return res;
  }

  getFriendsList(uniqueId) {
    if (!uniqueId) return [];
    const cleanId = String(uniqueId).trim();
    const user = this.findUserByUniqueId(cleanId) || this.findUserByNumericId(cleanId);

    // Collect all identity keys that could represent this user
    const userKeys = new Set();
    userKeys.add(cleanId.toUpperCase());
    if (user) {
      if (user.uniqueId) userKeys.add(String(user.uniqueId).trim().toUpperCase());
      if (user.numericPlayerId) userKeys.add(String(user.numericPlayerId).trim().toUpperCase());
      if (user.id) userKeys.add(String(user.id).trim().toUpperCase());
      if (user.legacyUniqueId) userKeys.add(String(user.legacyUniqueId).trim().toUpperCase());
      if (user.legacyNumericPlayerId) userKeys.add(String(user.legacyNumericPlayerId).trim().toUpperCase());
    }

    // Query canonical friendships + directional cache with deduplication
    const friendIdSet = new Set();

    if (this.data.friendships) {
      for (const f of Object.values(this.data.friendships)) {
        if (!f || !f.userA || !f.userB) continue;
        const uA = String(f.userA).trim().toUpperCase();
        const uB = String(f.userB).trim().toUpperCase();
        if (userKeys.has(uA)) {
          friendIdSet.add(uB);
        } else if (userKeys.has(uB)) {
          friendIdSet.add(uA);
        }
      }
    }

    if (this.data.friends) {
      for (const key of userKeys) {
        if (this.data.friends[key] && Array.isArray(this.data.friends[key])) {
          for (const fId of this.data.friends[key]) {
            const clean = (typeof fId === 'string' ? fId : (fId ? (fId.uniqueId || fId.id || fId.numericPlayerId || '') : '')).trim().toUpperCase();
            if (clean && !userKeys.has(clean)) friendIdSet.add(clean);
          }
        }
      }
    }

    return Array.from(friendIdSet).map(fId => {
      const u = this.findUserByUniqueId(fId) || this.findUserByNumericId(fId);
      const canonicalNum = u ? (u.numericPlayerId || u.uniqueId || fId) : fId;
      return u ? {
        uniqueId: canonicalNum,
        numericPlayerId: canonicalNum,
        name: u.name,
        avatar: u.avatar || 'avatar_1',
        trophies: u.trophies || 0
      } : {
        uniqueId: fId,
        numericPlayerId: fId,
        name: 'Bidder',
        avatar: 'avatar_1',
        trophies: 0
      };
    });
  }

  getFriendRequests(uniqueId) {
    if (!uniqueId) return [];
    const cleanId = String(uniqueId).trim();
    const user = this.findUserByUniqueId(cleanId) || this.findUserByNumericId(cleanId);
    const userKeys = new Set();
    userKeys.add(cleanId.toUpperCase());
    if (user) {
      if (user.uniqueId) userKeys.add(String(user.uniqueId).trim().toUpperCase());
      if (user.numericPlayerId) userKeys.add(String(user.numericPlayerId).trim().toUpperCase());
      if (user.id) userKeys.add(String(user.id).trim().toUpperCase());
    }

    const allRequests = [];
    const seenReqIds = new Set();
    for (const key of userKeys) {
      const list = (this.data.friendRequests[key] || []).filter(r => r.status === 'PENDING');
      for (const r of list) {
        const reqKey = r.id || `${r.fromUniqueId}_${r.date}`;
        if (!seenReqIds.has(reqKey)) {
          seenReqIds.add(reqKey);
          const sender = this.findUserByUniqueId(r.fromUniqueId) || this.findUserByNumericId(r.fromUniqueId);
          const senderCanonical = sender ? (sender.numericPlayerId || sender.uniqueId) : r.fromUniqueId;
          allRequests.push({
            ...r,
            fromUniqueId: senderCanonical,
            numericPlayerId: senderCanonical,
            name: r.fromName || (sender ? sender.name : r.fromUniqueId),
            avatar: r.fromAvatar || (sender ? sender.avatar : 'avatar_2'),
            trophies: sender ? (sender.trophies || 0) : 0
          });
        }
      }
    }
    return allRequests;
  }

  createGroup(ownerUniqueId, groupName, memberUniqueIds = []) {
    const groupId = `grp_${Date.now()}`;
    const members = Array.from(new Set([ownerUniqueId, ...memberUniqueIds]));
    this.data.groups[groupId] = {
      id: groupId,
      name: groupName,
      ownerUniqueId,
      members,
      createdAt: new Date().toISOString()
    };
    this.saveData();
    return this.data.groups[groupId];
  }

  getUserGroups(uniqueId) {
    return Object.values(this.data.groups).filter(g => g.members.includes(uniqueId));
  }

  recordMatch(identifier, matchRecord) {
    if (!identifier) return null;
    const cleanId = String(identifier).trim();
    
    // Look up user by uniqueId or id
    let user = this.findUserByUniqueId(cleanId);
    if (!user && this.data.users[cleanId]) {
      user = this.data.users[cleanId];
    }

    // Auto-register user in store if not present
    if (!user) {
      user = this.getOrCreateUser({
        id: cleanId.startsWith('user_') || cleanId.startsWith('guest_') ? cleanId : `user_${cleanId}`,
        uniqueId: cleanId,
        name: cleanId.startsWith('TB-G') ? `Guest Bidder #${cleanId.replace('TB-G', '')}` : 'Bidder',
        avatar: 'avatar_1',
        trophies: 0,
        isGuest: cleanId.startsWith('TB-G') || cleanId.startsWith('guest_')
      });
    }

    const canonicalKey = user ? (user.uniqueId || user.id) : cleanId;
    this.data.matchHistory[canonicalKey] = this.data.matchHistory[canonicalKey] || [];
    this.data.trophyLedger[canonicalKey] = this.data.trophyLedger[canonicalKey] || [];

    const isWinner = !!matchRecord.isWinner;
    const finalMatchId = matchRecord.matchId || `match_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    // Idempotent duplicate check: Do not re-add match if matchId already processed
    const existingMatch = this.data.matchHistory[canonicalKey].find(m => (m.matchId || m.id) === finalMatchId);
    let record;
    if (existingMatch) {
      record = existingMatch;
      console.log(`[STORE] Match ${finalMatchId} already recorded for ${canonicalKey}, skipping duplicate record`);
    } else {
      record = {
        id: finalMatchId,
        matchId: finalMatchId,
        date: matchRecord.completedAt || matchRecord.date || new Date().toISOString(),
        trophyEarned: isWinner ? 1 : 0,
        ...matchRecord
      };
      this.data.matchHistory[canonicalKey].unshift(record);
      if (this.data.matchHistory[canonicalKey].length > 100) {
        this.data.matchHistory[canonicalKey] = this.data.matchHistory[canonicalKey].slice(0, 100);
      }
      if (user) {
        user.matchesPlayed = (user.matchesPlayed || 0) + 1;
        if (isWinner) {
          user.auctionsWon = (user.auctionsWon || 0) + 1;
        }
      }
    }

    // Process Trophy Ledger (Deterministic unique trophyId prevents duplication)
    let trophyRecord = null;
    if (isWinner) {
      const cat = matchRecord.category || 'ipl_cricket';
      const trophyId = matchRecord.trophyId || `trophy_${finalMatchId}_champion`;
      const existingTrophy = this.data.trophyLedger[canonicalKey].find(t => t.trophyId === trophyId);
      if (!existingTrophy) {
        trophyRecord = {
          trophyId,
          playerId: canonicalKey,
          matchId: finalMatchId,
          trophyType: 'CHAMPION',
          trophyName: `${matchRecord.categoryTitle || cat} Champion`,
          earnedAt: record.date || new Date().toISOString(),
          category: cat,
          gameMode: matchRecord.mode || 'online',
          createdAt: new Date().toISOString(),
        };
        this.data.trophyLedger[canonicalKey].push(trophyRecord);
      } else {
        trophyRecord = existingTrophy;
      }
    }

    // Authoritative total trophies strictly calculated from the unique trophy ledger
    if (user) {
      user.categoryTrophies = user.categoryTrophies || {
        ipl_cricket: 0,
        fifa_football: 0,
        formula_1: 0,
        nba: 0,
        movie_stars: 0,
        luxury_cars: 0,
        luxury_collection: 0
      };

      const ledger = this.data.trophyLedger[canonicalKey] || [];
      const ledgerCounts = {
        ipl_cricket: 0,
        fifa_football: 0,
        formula_1: 0,
        nba: 0,
        movie_stars: 0,
        luxury_cars: 0,
        luxury_collection: 0
      };
      for (const t of ledger) {
        if (t.category && ledgerCounts[t.category] !== undefined) {
          ledgerCounts[t.category] += 1;
        } else if (t.category) {
          ledgerCounts[t.category] = (ledgerCounts[t.category] || 0) + 1;
        }
      }

      for (const cat of Object.keys(ledgerCounts)) {
        user.categoryTrophies[cat] = Math.max(ledgerCounts[cat], user.categoryTrophies[cat] || 0);
      }
      user.trophies = Object.values(user.categoryTrophies).reduce((sum, val) => sum + (val || 0), 0);
    }

    this.saveData();
    return {
      record,
      user,
      trophies: user ? user.trophies : (isWinner ? 1 : 0),
      trophyRecord
    };
  }

  getTrophyLedger(identifier) {
    if (!identifier) return [];
    const clean = String(identifier).trim();
    if (this.data.trophyLedger && this.data.trophyLedger[clean]) {
      return this.data.trophyLedger[clean];
    }
    const user = this.findUserByUniqueId(clean);
    if (user) {
      if (user.uniqueId && this.data.trophyLedger && this.data.trophyLedger[user.uniqueId]) {
        return this.data.trophyLedger[user.uniqueId];
      }
      if (user.id && this.data.trophyLedger && this.data.trophyLedger[user.id]) {
        return this.data.trophyLedger[user.id];
      }
    }
    return [];
  }

  getMatchHistory(identifier) {
    if (!identifier) return [];
    const clean = String(identifier).trim();
    if (this.data.matchHistory[clean] && this.data.matchHistory[clean].length > 0) {
      return this.data.matchHistory[clean];
    }
    const user = this.findUserByUniqueId(clean);
    if (user) {
      if (user.uniqueId && this.data.matchHistory[user.uniqueId]) {
        return this.data.matchHistory[user.uniqueId];
      }
      if (user.id && this.data.matchHistory[user.id]) {
        return this.data.matchHistory[user.id];
      }
    }
    return [];
  }

  syncOfflineBatch(identifier, data) {
    if (!identifier || !data) return null;
    const cleanId = String(identifier).trim();
    if (!cleanId || cleanId.includes('..') || ['__proto__', 'constructor', 'prototype'].includes(cleanId.toLowerCase())) {
      return null;
    }
    let user = this.findUserByUniqueId(cleanId);
    if (!user && this.data.users[cleanId]) {
      user = this.data.users[cleanId];
    }
    if (!user) {
      user = this.getOrCreateUser({
        id: cleanId.startsWith('user_') || cleanId.startsWith('guest_') ? cleanId : `user_${cleanId}`,
        uniqueId: cleanId,
        name: 'Bidder',
        avatar: 'avatar_1',
        trophies: 0,
        isGuest: cleanId.startsWith('guest_')
      });
    }

    const canonicalKey = user ? (user.uniqueId || user.id) : cleanId;
    this.data.matchHistory[canonicalKey] = this.data.matchHistory[canonicalKey] || [];
    this.data.trophyLedger[canonicalKey] = this.data.trophyLedger[canonicalKey] || [];

    const VALID_CATEGORIES = ['ipl_cricket', 'fifa_football', 'formula_1', 'nba', 'movie_stars', 'luxury_cars', 'luxury_collection'];

    // 1. Ingest offline matches idempotently with strict server-side validation
    // Disallow online matches via offline sync and disallow unverified trophies
    if (Array.isArray(data.matches)) {
      for (const m of data.matches) {
        if (!m || typeof m !== 'object') continue;
        const mId = m.matchId || m.id;
        if (!mId || typeof mId !== 'string') continue;

        // Security Enforcement: Offline sync ONLY allows offline / computer mode matches (rejects online multiplayer matches)
        const mode = (m.mode || m.gameMode || '').toLowerCase();
        if (mode && mode !== 'computer' && mode !== 'offline') {
          console.warn(`[SYNC_REJECTED] Attempted to sync non-offline match mode: ${m.mode || m.gameMode}`);
          continue;
        }

        // Validate category
        const cat = m.category || 'ipl_cricket';
        if (!VALID_CATEGORIES.includes(cat)) {
          console.warn(`[SYNC_REJECTED] Invalid category in offline match: ${cat}`);
          continue;
        }

        // Validate squad & budget
        const budget = Number(m.budget || m.startingBudget || 100);
        if (isNaN(budget) || budget < 10 || budget > 500) {
          continue;
        }
        const squad = Array.isArray(m.squad) ? m.squad : (Array.isArray(m.purchasedItems) ? m.purchasedItems : (Array.isArray(m.finalSquad) ? m.finalSquad : []));

        // Validate spending within budget if squad present
        if (squad.length > 0) {
          const totalSpent = squad.reduce((sum, item) => sum + (Number(item.soldPrice || item.basePrice || item.price) || 0), 0);
          if (totalSpent > budget * 1.05) { // allow 5% rounding tolerance
            console.warn(`[SYNC_REJECTED] Squad spending (${totalSpent}) exceeds budget (${budget})`);
            continue;
          }
        }

        const isWinner = !!m.isWinner && (m.rank === undefined || Number(m.rank) === 1 || Number(m.finalRank) === 1);

        if (!this.data.matchHistory[canonicalKey].some(existing => (existing.matchId || existing.id) === mId)) {
          const sanitizedMatch = {
            id: mId,
            matchId: mId,
            mode: 'computer',
            category: cat,
            categoryTitle: m.categoryTitle || cat,
            budget,
            squad,
            rank: isWinner ? 1 : (Number(m.rank) || 2),
            isWinner,
            trophyEarned: isWinner ? 1 : 0,
            date: m.completedAt || m.date || new Date().toISOString(),
            completedAt: m.completedAt || m.date || new Date().toISOString(),
            clientOccurredAt: m.clientOccurredAt || m.completedAt || m.date || new Date().toISOString(),
            resultsSnapshot: m.resultsSnapshot,
            purchasedItems: m.purchasedItems || squad,
            finalSquad: m.finalSquad || squad
          };

          this.data.matchHistory[canonicalKey].unshift(sanitizedMatch);
          if (this.data.matchHistory[canonicalKey].length > 100) {
            this.data.matchHistory[canonicalKey] = this.data.matchHistory[canonicalKey].slice(0, 100);
          }

          if (user) {
            user.matchesPlayed = (user.matchesPlayed || 0) + 1;
            if (isWinner) {
              user.auctionsWon = (user.auctionsWon || 0) + 1;
            }
          }

          // Authoritative trophy derivation from verified victory
          if (isWinner) {
            const trophyId = `trophy_${mId}_champion`;
            if (!this.data.trophyLedger[canonicalKey].some(existing => existing.trophyId === trophyId)) {
              this.data.trophyLedger[canonicalKey].push({
                trophyId,
                playerId: canonicalKey,
                matchId: mId,
                trophyType: 'CHAMPION',
                trophyName: `${m.categoryTitle || cat} Champion`,
                earnedAt: sanitizedMatch.date,
                category: cat,
                gameMode: 'computer',
                createdAt: new Date().toISOString()
              });
            }
          }
        }
      }
    }

    // 2. Ingest offline trophies ledger
    if (Array.isArray(data.trophies)) {
      for (const t of data.trophies) {
        if (!t || !t.trophyId) continue;
        const cat = t.category || 'ipl_cricket';
        if (!this.data.trophyLedger[canonicalKey].some(existing => existing.trophyId === t.trophyId)) {
          this.data.trophyLedger[canonicalKey].push({
            trophyId: t.trophyId,
            playerId: canonicalKey,
            matchId: t.matchId || `match_${t.trophyId}`,
            trophyType: t.trophyType || 'CHAMPION',
            trophyName: t.trophyName || `${t.categoryTitle || cat} Champion`,
            earnedAt: t.earnedAt || t.createdAt || new Date().toISOString(),
            category: cat,
            gameMode: 'computer',
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // 3. Reconcile user profile stats
    if (user) {
      user.categoryTrophies = user.categoryTrophies || {
        ipl_cricket: 0,
        fifa_football: 0,
        formula_1: 0,
        nba: 0,
        movie_stars: 0,
        luxury_cars: 0,
        luxury_collection: 0
      };

      const ledger = this.data.trophyLedger[canonicalKey] || [];
      const ledgerCounts = {
        ipl_cricket: 0,
        fifa_football: 0,
        formula_1: 0,
        nba: 0,
        movie_stars: 0,
        luxury_cars: 0,
        luxury_collection: 0
      };
      for (const t of ledger) {
        if (t.category && ledgerCounts[t.category] !== undefined) {
          ledgerCounts[t.category] += 1;
        } else if (t.category) {
          ledgerCounts[t.category] = (ledgerCounts[t.category] || 0) + 1;
        }
      }
      for (const c of Object.keys(ledgerCounts)) {
        user.categoryTrophies[c] = ledgerCounts[c];
      }
      user.trophies = Object.values(user.categoryTrophies).reduce((sum, val) => sum + (val || 0), 0);
    }

    this.saveData();
    return {
      user,
      history: this.data.matchHistory[canonicalKey] || [],
      trophies: this.data.trophyLedger[canonicalKey] || [],
    };
  }

  // Room Invitations (Authoritative Lifecycle)
  createOrUpdateInvitation({ sender, recipientUniqueId, roomId, roomCode, category, categoryTitle, operationId = null }) {
    if (operationId) {
      const prev = this.isOperationProcessed(operationId);
      if (prev) return prev.result;
    }
    if (!this.data.roomInvitations) this.data.roomInvitations = {};
    const normRecipient = (recipientUniqueId || '').trim().toUpperCase();

    // Duplicate check: if a PENDING invitation exists for same room + recipient, reuse/refresh it
    const existing = Object.values(this.data.roomInvitations).find(inv => 
      inv.roomId === roomId &&
      inv.recipientUniqueId.toUpperCase() === normRecipient &&
      inv.status === 'PENDING' &&
      inv.expiresAt > Date.now()
    );

    const now = Date.now();
    if (existing) {
      const lastSent = existing.lastSentAt || existing.createdAt || 0;
      if (now - lastSent < 1800) {
        return {
          invitation: existing,
          isDuplicate: true,
          throttled: true,
          waitMs: Math.max(0, 1800 - (now - lastSent))
        };
      }
      existing.lastSentAt = now;
      existing.expiresAt = now + 10 * 60 * 1000;
      const outboxEvt = this.createOutboxEvent({
        eventType: 'ROOM_INVITATION_SENT',
        aggregateId: existing.id,
        actorUserId: (sender.uniqueId || '').trim().toUpperCase(),
        targetUserId: normRecipient,
        payload: { invitation: existing, sender }
      });
      this.saveData();
      const res = { invitation: existing, isDuplicate: true, reNotified: true, outboxEvent: outboxEvt };
      if (operationId) this.recordProcessedOperation(operationId, res);
      return res;
    }

    const invitation = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      sender: {
        id: sender.id,
        name: sender.name,
        uniqueId: sender.uniqueId,
        numericPlayerId: sender.numericPlayerId || (sender.uniqueId && sender.uniqueId.startsWith('BID-') ? sender.uniqueId.replace('BID-', '') : ''),
        avatar: sender.avatar || 'avatar_1'
      },
      recipientUniqueId: normRecipient,
      roomId,
      roomCode,
      category,
      categoryTitle: categoryTitle || 'Auction Room',
      status: 'PENDING',
      createdAt: now,
      lastSentAt: now,
      expiresAt: now + 10 * 60 * 1000 // 10 minutes validity
    };

    this.data.roomInvitations[invitation.id] = invitation;
    const outboxEvt = this.createOutboxEvent({
      eventType: 'ROOM_INVITATION_SENT',
      aggregateId: invitation.id,
      actorUserId: (sender.uniqueId || '').trim().toUpperCase(),
      targetUserId: normRecipient,
      payload: { invitation, sender }
    });
    this.saveData();
    const res = { invitation, isDuplicate: false, outboxEvent: outboxEvt };
    if (operationId) this.recordProcessedOperation(operationId, res);
    return res;
  }

  getInvitation(invitationId) {
    if (!this.data.roomInvitations) return null;
    return this.data.roomInvitations[invitationId] || null;
  }

  getPendingInvitations(recipientUniqueId) {
    if (!this.data.roomInvitations) return [];
    const normRecipient = (recipientUniqueId || '').trim().toUpperCase();
    const now = Date.now();

    return Object.values(this.data.roomInvitations).filter(inv => {
      if (inv.recipientUniqueId.toUpperCase() !== normRecipient) return false;
      if (inv.status !== 'PENDING') return false;
      if (inv.expiresAt <= now) {
        inv.status = 'EXPIRED';
        return false;
      }
      return true;
    });
  }

  updateInvitationStatus(invitationId, status) {
    if (!this.data.roomInvitations) return null;
    const inv = this.data.roomInvitations[invitationId];
    if (!inv) return null;
    inv.status = status;
    this.saveData();
    return inv;
  }

  cancelInvitationsForRoom(roomId) {
    if (!this.data.roomInvitations) return;
    let modified = false;
    Object.values(this.data.roomInvitations).forEach(inv => {
      if (inv.roomId === roomId && inv.status === 'PENDING') {
        inv.status = 'CANCELLED';
        modified = true;
      }
    });
    if (modified) this.saveData();
  }

  // =========================================================================
  // AUTHORITATIVE 6-DIGIT NUMERIC ROOM KEY PERSISTENCE
  // Strictly numeric: 100000 to 999999
  // =========================================================================
  isRoomKeyActive(code) {
    if (!code || typeof code !== 'string') return false;
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) return false;
    if (!this.data.activeRoomKeys) this.data.activeRoomKeys = {};
    const entry = this.data.activeRoomKeys[clean];
    return Boolean(entry && entry.isActive);
  }

  reserveRoomKey(code, roomId, hostUniqueId, category) {
    if (!code || typeof code !== 'string') throw new Error('Invalid room key');
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(clean)) throw new Error('Room key must be exactly 6 digits');
    if (!this.data.activeRoomKeys) this.data.activeRoomKeys = {};

    // Atomic uniqueness check
    if (this.data.activeRoomKeys[clean] && this.data.activeRoomKeys[clean].isActive) {
      return { success: false, reason: 'ALREADY_ACTIVE' };
    }

    this.data.activeRoomKeys[clean] = {
      code: clean,
      roomId,
      hostUniqueId: (hostUniqueId || '').trim().toUpperCase(),
      category: category || 'ipl_cricket',
      createdAt: Date.now(),
      isActive: true,
    };
    this.saveData();
    return { success: true, code: clean };
  }

  releaseRoomKey(codeOrRoomId) {
    if (!codeOrRoomId) return false;
    if (!this.data.activeRoomKeys) return false;
    const clean = String(codeOrRoomId).replace(/\D/g, '').slice(0, 6);
    let released = false;

    if (clean.length === 6 && this.data.activeRoomKeys[clean] && this.data.activeRoomKeys[clean].isActive) {
      this.data.activeRoomKeys[clean].isActive = false;
      this.data.activeRoomKeys[clean].releasedAt = Date.now();
      released = true;
    } else {
      for (const entry of Object.values(this.data.activeRoomKeys)) {
        if (entry.roomId === codeOrRoomId && entry.isActive) {
          entry.isActive = false;
          entry.releasedAt = Date.now();
          released = true;
        }
      }
    }

    if (released) {
      this.saveData();
    }
    return released;
  }

  // --- CUSTOM ENTITY MANAGEMENT ---
  getCustomEntities(ownerUniqueId, categoryId) {
    if (!ownerUniqueId) return [];
    const norm = String(ownerUniqueId).trim().toUpperCase();
    this.data.customEntities = this.data.customEntities || {};
    const list = this.data.customEntities[norm] || [];
    return list.filter(e => {
      if (e.deletedAt) return false;
      if (categoryId && e.categoryId !== categoryId) return false;
      return true;
    });
  }

  createCustomEntity({ ownerUniqueId, categoryId, name, entityType }) {
    if (!ownerUniqueId || !name || !categoryId) {
      return { success: false, message: 'Owner, category, and name are required.' };
    }
    const norm = String(ownerUniqueId).trim().toUpperCase();
    const cleanName = String(name).replace(/<[^>]*>/g, '').trim().slice(0, 40);
    if (!cleanName) {
      return { success: false, message: 'Valid entity name is required.' };
    }

    this.data.customEntities = this.data.customEntities || {};
    this.data.customEntities[norm] = this.data.customEntities[norm] || [];

    // Check if user already has an active custom entity with the same name in this category
    const existing = this.data.customEntities[norm].find(
      e => !e.deletedAt && e.categoryId === categoryId && e.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) {
      return { success: true, customEntity: existing, alreadyExisted: true };
    }

    const customId = `custom_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
    const newEntity = {
      id: customId,
      customEntityId: customId,
      ownerUserId: norm,
      ownerUniqueId: norm,
      categoryId,
      entityType: entityType || 'TEAM',
      name: cleanName,
      displayName: cleanName,
      shortName: cleanName.length > 12 ? `${cleanName.slice(0, 10)}..` : cleanName,
      code: cleanName.slice(0, 4).toUpperCase(),
      primaryColor: '#E5B869', // Luxury Champagne Gold accent for custom creations
      isCustom: true,
      isOfficial: false,
      createdAt: new Date().toISOString(),
      deletedAt: null
    };

    this.data.customEntities[norm].push(newEntity);
    this.saveData();
    return { success: true, customEntity: newEntity };
  }

  deleteCustomEntity(customEntityId, ownerUniqueId) {
    if (!customEntityId || !ownerUniqueId) {
      return { success: false, message: 'Entity ID and owner ID required.' };
    }
    const norm = String(ownerUniqueId).trim().toUpperCase();
    this.data.customEntities = this.data.customEntities || {};
    const list = this.data.customEntities[norm] || [];
    const target = list.find(e => e.id === customEntityId || e.customEntityId === customEntityId);
    if (!target) {
      return { success: false, message: 'Custom entity not found.' };
    }

    // Soft delete so historical matches referencing this entity retain their snapshots
    target.deletedAt = new Date().toISOString();
    this.saveData();
    return { success: true, message: 'Custom entity deleted from future selections.' };
  }

  purgeMockTestAccounts(mockIds = []) {
    const idsToPurge = new Set(mockIds.map(id => (id || '').trim().toUpperCase()));
    const purgedUsers = [];

    // Find and delete mock users from users table
    for (const [userId, user] of Object.entries(this.data.users || {})) {
      const uId = (user.uniqueId || '').toUpperCase();
      if (idsToPurge.has(uId) || user.isMockTestAccount) {
        idsToPurge.add(uId);
        purgedUsers.push({ id: userId, uniqueId: user.uniqueId, name: user.name });
        delete this.data.users[userId];
      }
    }

    // Clean uniqueIdIndex, friends, friendRequests, and matchHistory for all purged IDs
    for (const uId of idsToPurge) {
      if (!uId) continue;
      delete this.data.uniqueIdIndex[uId];
      delete this.data.friends[uId];
      delete this.data.friendRequests[uId];
      delete this.data.matchHistory[uId];
    }

    // Clean friendships for all purged IDs
    if (this.data.friendships) {
      for (const [pairKey, friendship] of Object.entries(this.data.friendships)) {
        if (idsToPurge.has((friendship.userA || '').toUpperCase()) || idsToPurge.has((friendship.userB || '').toUpperCase())) {
          delete this.data.friendships[pairKey];
        }
      }
    }

    // Clean friends lists of all remaining users
    if (this.data.friends) {
      for (const [uId, friendList] of Object.entries(this.data.friends)) {
        if (Array.isArray(friendList)) {
          this.data.friends[uId] = friendList.filter(f => !idsToPurge.has((f || '').toUpperCase()));
        }
      }
    }

    // Clean friendRequests of all remaining users
    if (this.data.friendRequests) {
      for (const [uId, requests] of Object.entries(this.data.friendRequests)) {
        if (Array.isArray(requests)) {
          this.data.friendRequests[uId] = requests.filter(r => !idsToPurge.has((r.fromUniqueId || '').toUpperCase()));
        }
      }
    }

    // Clean room invitations
    if (this.data.roomInvitations) {
      for (const [invId, inv] of Object.entries(this.data.roomInvitations)) {
        if (
          idsToPurge.has((inv.recipientUniqueId || '').toUpperCase()) ||
          (inv.sender && idsToPurge.has((inv.sender.uniqueId || '').toUpperCase()))
        ) {
          delete this.data.roomInvitations[invId];
        }
      }
    }

    this.saveData();
    return { purgedCount: purgedUsers.length, purgedUsers };
  }
}

module.exports = new StoreService();
