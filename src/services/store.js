const fs = require('fs');
const path = require('path');

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
  friends: {},      // uniqueId -> [friendUniqueIds]
  friendships: {},  // canonicalPair (min::max) -> { id, userA, userB, createdAt }
  friendRequests: {}, // recipientUniqueId -> [{ fromUniqueId, fromName, date }]
  groups: {},       // groupId -> { id, name, ownerUniqueId, members: [] }
  matchHistory: {}, // uniqueId -> [{ matchId, date, mode, budget, squad: [], rank, aiScore, summary }]
  trophyLedger: {}, // uniqueId -> [{ trophyId, matchId, trophyType, category, earnedAt }]
  roomInvitations: {}, // invitationId -> { id, sender, recipientUniqueId, roomId, roomCode, category, status, createdAt, expiresAt }
  customEntities: {}  // ownerUniqueId -> [{ id, ownerUniqueId, categoryId, name, entityType, createdAt, deletedAt }]
};

class StoreService {
  constructor() {
    this.data = this.loadData();
    this._authLock = new Map(); // Mutex map to prevent race-condition duplicates
    this.rebuildIndices();
  }

  loadData() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          ...defaultState,
          ...parsed,
          googleUsers: parsed.googleUsers || {},
          uniqueIdIndex: parsed.uniqueIdIndex || {}
        };
      }
    } catch (e) {
      console.error('Error loading store.json, initializing default:', e.message);
    }
    return { ...defaultState, googleUsers: {}, uniqueIdIndex: {} };
  }

  reload() {
    this.data = this.loadData();
    this.rebuildIndices();
    return this.data;
  }

  rebuildIndices() {
    this.data.uniqueIdIndex = this.data.uniqueIdIndex || {};
    this.data.googleUsers = this.data.googleUsers || {};
    this.data.trophyLedger = this.data.trophyLedger || {};
    if (this.data.users) {
      for (const u of Object.values(this.data.users)) {
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
   * Generates a unique Player ID server-side.
   * Guaranteed unique across millions of users via uniqueIdIndex check.
   * Format: BID-XXXXXX (6 characters, 30^6 = 729,000,000 combinations)
   * Scalable: Automatically expands to 7-8 chars if population demands it.
   */
  generateUniqueId(prefix = 'BID-') {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const index = this.data.uniqueIdIndex || {};
    const totalUsers = Object.keys(index).length;
    const length = totalUsers > 50000000 ? 7 : 6;

    let code = '';
    let attempts = 0;
    do {
      code = prefix;
      for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      attempts++;
      // O(1) Database uniqueness constraint check
      if (!index[code] && !this.findUserByUniqueId(code)) {
        return code;
      }
    } while (attempts < 2000);

    // High load fallback with timestamp entropy
    return `${prefix}${Date.now().toString(36).toUpperCase()}`;
  }

  /**
   * Database-enforced atomic resolution.
   * Every authenticated Google account maps to EXACTLY ONE permanent THE BID account.
   * Prevents duplicate BID IDs and race-condition account creation.
   */
  resolveOrCreateGoogleUser({ verifiedGoogleId, name, email, avatar }) {
    if (!verifiedGoogleId || typeof verifiedGoogleId !== 'string') {
      throw new Error('Valid verified Google identity is required');
    }
    const cleanGoogleId = verifiedGoogleId.trim();

    // 1. O(1) Lookup in stable googleUsers identity index
    this.data.googleUsers = this.data.googleUsers || {};
    const existingUniqueId = this.data.googleUsers[cleanGoogleId];
    if (existingUniqueId) {
      const existingUser = this.findUserByUniqueId(existingUniqueId);
      if (existingUser) {
        let modified = false;
        if (name && existingUser.name !== name && name !== 'Bidder') {
          existingUser.name = name;
          modified = true;
        }
        if (avatar && existingUser.avatar !== avatar) {
          existingUser.avatar = avatar;
          modified = true;
        }
        if (modified) {
          this.saveData();
        }
        return existingUser;
      }
    }

    // 2. Secondary check across existing user records to recover any orphaned mappings
    const matchingUser = Object.values(this.data.users).find(u => u.googleId === cleanGoogleId);
    if (matchingUser) {
      this.data.googleUsers[cleanGoogleId] = matchingUser.uniqueId;
      this.data.uniqueIdIndex[matchingUser.uniqueId.toUpperCase()] = matchingUser.id;
      this.saveData();
      return matchingUser;
    }

    // 3. Atomically create permanent THE BID account with database uniqueness constraint
    const uniqueId = this.generateUniqueId('BID-');
    
    // Database uniqueness constraint verification
    this.assertUniqueIdConstraint(uniqueId);

    const newUser = {
      id: `usr_g_${cleanGoogleId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_${Date.now()}`,
      googleId: cleanGoogleId,
      uniqueId,
      name: name || 'Bidder',
      email: email || null,
      avatar: avatar || 'avatar_1',
      trophies: 0,
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
      createdAt: new Date().toISOString()
    };

    this.data.users[newUser.id] = newUser;
    this.data.googleUsers[cleanGoogleId] = uniqueId;
    this.data.uniqueIdIndex[uniqueId.toUpperCase()] = newUser.id;
    this.data.friends[uniqueId] = this.data.friends[uniqueId] || [];
    this.data.friendRequests[uniqueId] = this.data.friendRequests[uniqueId] || [];
    this.data.matchHistory[uniqueId] = this.data.matchHistory[uniqueId] || [];

    this.saveData();
    return newUser;
  }

  getUserFullProfile(identifier) {
    const user = this.findUserByUniqueId(identifier);
    if (!user) return null;
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
      if (userData.name) existing.name = userData.name;
      if (userData.avatar) existing.avatar = userData.avatar;
      if (existing.uniqueId) {
        this.data.uniqueIdIndex[existing.uniqueId.toUpperCase()] = existing.id;
      }
      this.saveData();
      return existing;
    }

    const uniqueId = userData.uniqueId || this.generateUniqueId(userData.isGuest ? 'BID-G' : 'BID-');
    const newUser = {
      id: userData.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: userData.name || 'Bidder',
      email: userData.email || null,
      avatar: userData.avatar || 'avatar_1',
      uniqueId,
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
      isGuest: !!userData.isGuest,
      isMockTestAccount: !!userData.isMockTestAccount,
      createdAt: new Date().toISOString()
    };

    this.data.users[newUser.id] = newUser;
    if (uniqueId) {
      this.data.uniqueIdIndex[uniqueId.toUpperCase()] = newUser.id;
      this.data.friends[uniqueId] = this.data.friends[uniqueId] || [];
      this.data.friendRequests[uniqueId] = this.data.friendRequests[uniqueId] || [];
      this.data.matchHistory[uniqueId] = this.data.matchHistory[uniqueId] || [];
    }
    this.saveData();
    return newUser;
  }

  findUserByUniqueId(identifier) {
    if (!identifier) return null;
    const clean = String(identifier).trim();
    if (!clean) return null;
    const cleanUpper = clean.toUpperCase();

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
    const normA = uniqueIdA.trim().toUpperCase();
    const normB = uniqueIdB.trim().toUpperCase();
    if (normA === normB) return false;

    // Check canonical pair table
    const pair = this.getCanonicalPair(normA, normB);
    if (pair && this.data.friendships && this.data.friendships[pair]) {
      return true;
    }

    // Check directional lists as backwards-compatible fallback
    const friendsOfA = this.data.friends[normA] || [];
    if (friendsOfA.some(f => (f || '').trim().toUpperCase() === normB)) return true;

    const friendsOfB = this.data.friends[normB] || [];
    if (friendsOfB.some(f => (f || '').trim().toUpperCase() === normA)) return true;

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

  sendFriendRequest(fromUniqueId, toUniqueId) {
    const fromUser = this.findUserByUniqueId(fromUniqueId);
    const target = this.findUserByUniqueId(toUniqueId);
    if (!target) return { success: false, message: 'Player with that Player ID was not found.' };
    if (!fromUser) return { success: false, message: 'Sender profile not found.' };

    const normFrom = fromUser.uniqueId.trim().toUpperCase();
    const normTarget = target.uniqueId.trim().toUpperCase();

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
      this.acceptFriendRequest(normFrom, normTarget);
      return {
        success: true,
        autoAccepted: true,
        fromUser,
        targetUser: target,
        user: fromUser,
        message: `Mutual request! You and ${target.name} are now permanent friends.`
      };
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
      this.saveData();
      return {
        success: true,
        reNotified: true,
        request: existingReq,
        targetUser: target,
        fromUser,
        message: `Request notification re-sent to ${target.name}`
      };
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

    this.saveData(); // Authoritative DB Commit BEFORE returning
    return {
      success: true,
      request: newReq,
      targetUser: target,
      fromUser,
      message: `Request sent to ${target.name}`
    };
  }

  acceptFriendRequest(userUniqueId, fromUniqueId) {
    const user = this.findUserByUniqueId(userUniqueId);
    if (!user) {
      return { success: false, message: 'User not found.' };
    }

    const fromUser = this.findUserByUniqueId(fromUniqueId);
    if (!fromUser) {
      return { success: false, message: 'Requesting player not found.' };
    }
    const normUser = user.uniqueId.trim().toUpperCase();
    const normFrom = fromUser.uniqueId.trim().toUpperCase();

    // Verify incoming request exists or mutual auto-acceptance
    const requests = this.data.friendRequests[normUser] || [];
    const pendingReq = requests.find(r => (r.status === 'PENDING' || r.status === 'ACCEPTED') && (r.fromUniqueId || '').trim().toUpperCase() === normFrom);

    if (pendingReq) {
      pendingReq.status = 'ACCEPTED';
      pendingReq.updatedAt = new Date().toISOString();
    }

    // Also mark any reverse request on fromUser as ACCEPTED if present
    const fromRequests = this.data.friendRequests[normFrom] || [];
    const reversePending = fromRequests.find(r => (r.status === 'PENDING' || r.status === 'ACCEPTED') && (r.fromUniqueId || '').trim().toUpperCase() === normUser);
    if (reversePending) {
      reversePending.status = 'ACCEPTED';
      reversePending.updatedAt = new Date().toISOString();
    }

    // 1. Establish Canonical Unordered Friendship Pair (min::max)
    const pair = this.getCanonicalPair(normUser, normFrom);
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
    this.data.friends[normUser] = this.data.friends[normUser] || [];
    this.data.friends[normFrom] = this.data.friends[normFrom] || [];

    if (!this.data.friends[normUser].some(f => (f || '').toUpperCase() === normFrom)) {
      this.data.friends[normUser].push(normFrom);
    }
    if (!this.data.friends[normFrom].some(f => (f || '').toUpperCase() === normUser)) {
      this.data.friends[normFrom].push(normUser);
    }

    this.saveData(); // Authoritative DB commit
    return { success: true, user, fromUser };
  }

  declineFriendRequest(userUniqueId, fromUniqueId) {
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
    return { success: true, userUniqueId: normUser, fromUniqueId: normFrom };
  }

  getFriendsList(uniqueId) {
    if (!uniqueId) return [];
    const normId = uniqueId.trim().toUpperCase();

    // Query canonical friendships + directional cache with deduplication
    const friendIdSet = new Set();

    if (this.data.friendships) {
      for (const f of Object.values(this.data.friendships)) {
        if (f.userA === normId) friendIdSet.add(f.userB);
        else if (f.userB === normId) friendIdSet.add(f.userA);
      }
    }

    if (this.data.friends && this.data.friends[normId]) {
      for (const fId of this.data.friends[normId]) {
        if (fId) friendIdSet.add(fId.trim().toUpperCase());
      }
    }

    return Array.from(friendIdSet).map(fId => {
      const u = this.findUserByUniqueId(fId);
      return u ? {
        uniqueId: u.uniqueId,
        name: u.name,
        avatar: u.avatar || 'avatar_1',
        trophies: u.trophies || 0
      } : {
        uniqueId: fId,
        name: 'Bidder',
        avatar: 'avatar_1',
        trophies: 0
      };
    });
  }

  getFriendRequests(uniqueId) {
    if (!uniqueId) return [];
    const normId = uniqueId.trim().toUpperCase();
    const list = (this.data.friendRequests[normId] || []).filter(r => r.status === 'PENDING');
    return list.map(r => {
      const sender = this.findUserByUniqueId(r.fromUniqueId);
      return {
        ...r,
        name: r.fromName || (sender ? sender.name : r.fromUniqueId),
        avatar: r.fromAvatar || (sender ? sender.avatar : 'avatar_2'),
        trophies: sender ? (sender.trophies || 0) : 0
      };
    });
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

        // Security Enforcement: Offline sync ONLY allows offline / computer mode matches
        const mode = (m.mode || '').toLowerCase();
        if (mode !== 'computer' && mode !== 'offline') {
          console.warn(`[SYNC_REJECTED] Attempted to sync non-offline match mode: ${m.mode}`);
          continue;
        }

        // Validate category
        const cat = m.category || 'ipl_cricket';
        if (!VALID_CATEGORIES.includes(cat)) {
          console.warn(`[SYNC_REJECTED] Invalid category in offline match: ${cat}`);
          continue;
        }

        // Validate squad & budget
        const budget = Number(m.budget);
        if (isNaN(budget) || budget < 10 || budget > 500) {
          continue;
        }
        if (!Array.isArray(m.squad) || m.squad.length === 0) {
          continue;
        }

        // Validate spending within budget
        const totalSpent = m.squad.reduce((sum, item) => sum + (Number(item.soldPrice || item.basePrice || item.price) || 0), 0);
        if (totalSpent > budget * 1.05) { // allow 5% rounding tolerance
          console.warn(`[SYNC_REJECTED] Squad spending (${totalSpent}) exceeds budget (${budget})`);
          continue;
        }

        const isWinner = !!m.isWinner && Number(m.rank) === 1;

        if (!this.data.matchHistory[canonicalKey].some(existing => (existing.matchId || existing.id) === mId)) {
          const sanitizedMatch = {
            id: mId,
            matchId: mId,
            mode: 'computer',
            category: cat,
            categoryTitle: m.categoryTitle || cat,
            budget,
            squad: m.squad,
            rank: isWinner ? 1 : (Number(m.rank) || 2),
            isWinner,
            trophyEarned: isWinner ? 1 : 0,
            date: m.completedAt || m.date || new Date().toISOString()
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

    // 2. Direct raw data.trophies injection is rejected!
    // (Trophies must ONLY be derived from the authoritative verified matches above)

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
  createOrUpdateInvitation({ sender, recipientUniqueId, roomId, roomCode, category, categoryTitle }) {
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
      this.saveData();
      return { invitation: existing, isDuplicate: true, reNotified: true };
    }

    const invitation = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      sender: {
        id: sender.id,
        name: sender.name,
        uniqueId: sender.uniqueId,
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
    this.saveData();
    return { invitation, isDuplicate: false };
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
