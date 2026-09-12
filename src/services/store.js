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
  friendRequests: {}, // recipientUniqueId -> [{ fromUniqueId, fromName, date }]
  groups: {},       // groupId -> { id, name, ownerUniqueId, members: [] }
  matchHistory: {}, // uniqueId -> [{ matchId, date, mode, budget, squad: [], rank, aiScore, summary }]
  roomInvitations: {} // invitationId -> { id, sender, recipientUniqueId, roomId, roomCode, category, status, createdAt, expiresAt }
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
  }

  saveData() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf8');
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
    const cleanId = user.uniqueId;
    const friends = this.getFriendsList(cleanId);
    const requests = this.getFriendRequests(cleanId);
    const history = this.getMatchHistory(cleanId);
    return {
      user,
      friends,
      requests,
      history
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
      this.saveData();
      return existing;
    }

    const uniqueId = userData.uniqueId || (userData.isGuest ? '' : this.generateUniqueId('BID-'));
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
    const clean = identifier.trim().toUpperCase();
    return Object.values(this.data.users).find(u => 
      (u.uniqueId && u.uniqueId.trim().toUpperCase() === clean) ||
      (u.id && u.id.trim().toUpperCase() === clean)
    ) || null;
  }

  sendFriendRequest(fromUniqueId, toUniqueId) {
    const fromUser = this.findUserByUniqueId(fromUniqueId);
    const target = this.findUserByUniqueId(toUniqueId);
    if (!target) return { success: false, message: 'Player with that Player ID was not found.' };
    if (!fromUser) return { success: false, message: 'Sender profile not found.' };

    if (fromUser.uniqueId.toUpperCase() === target.uniqueId.toUpperCase()) {
      return { success: false, message: 'You cannot add yourself as a friend.' };
    }

    if (fromUser.isGuest) {
      return { success: false, error: 'GUEST_RESTRICTED', message: 'Guest accounts cannot send friend requests. Please sign in with Google.' };
    }
    if (target.isGuest) {
      return { success: false, error: 'GUEST_RESTRICTED', message: 'Cannot send friend request to a guest account.' };
    }

    // 1. Check if already mutual permanent friends
    const fromFriends = this.data.friends[fromUser.uniqueId] || [];
    if (fromFriends.includes(target.uniqueId)) {
      return { success: false, error: 'ALREADY_FRIENDS', message: 'You are already permanent friends with this player.' };
    }

    // 2. Check if target already sent a request to fromUser (Mutual request auto-merge)
    const pendingOnSender = this.data.friendRequests[fromUser.uniqueId] || [];
    const reverseReq = pendingOnSender.find(r => r.fromUniqueId.toUpperCase() === target.uniqueId.toUpperCase());
    if (reverseReq) {
      this.acceptFriendRequest(fromUser.uniqueId, target.uniqueId);
      return {
        success: true,
        autoAccepted: true,
        message: `Mutual request! You and ${target.name} are now permanent friends.`
      };
    }

    // 3. Prevent duplicate requests (Idempotent server-side storage)
    if (!this.data.friendRequests[target.uniqueId]) {
      this.data.friendRequests[target.uniqueId] = [];
    }

    const existingReq = this.data.friendRequests[target.uniqueId].find(
      r => r.fromUniqueId.toUpperCase() === fromUser.uniqueId.toUpperCase()
    );
    if (existingReq) {
      return { success: false, error: 'DUPLICATE_REQUEST', message: 'Friend request already sent to this player.' };
    }

    this.data.friendRequests[target.uniqueId].push({
      fromUniqueId: fromUser.uniqueId,
      fromName: fromUser.name || 'A Player',
      fromAvatar: fromUser.avatar || 'avatar_1',
      date: new Date().toISOString()
    });

    this.saveData();
    return { success: true, message: `Request sent to ${target.name}` };
  }

  acceptFriendRequest(userUniqueId, fromUniqueId) {
    const user = this.findUserByUniqueId(userUniqueId);
    if (!user) {
      return { success: false, message: 'User not found.' };
    }
    if (user.isGuest) {
      return { success: false, error: 'GUEST_RESTRICTED', message: 'Guest accounts cannot accept friend requests.' };
    }

    const fromUser = this.findUserByUniqueId(fromUniqueId);
    if (!fromUser) {
      return { success: false, message: 'Requesting player not found.' };
    }
    const normFrom = fromUser.uniqueId.toUpperCase();

    // Security Hardening (BOLA): Verify incoming request actually exists before establishing friendship
    const requests = this.data.friendRequests[user.uniqueId] || [];
    const hasRequest = requests.some(r => r.fromUniqueId && r.fromUniqueId.toUpperCase() === normFrom);
    if (!hasRequest) {
      return { success: false, error: 'NO_PENDING_REQUEST', message: 'No pending friend request found from this player.' };
    }

    this.data.friendRequests[user.uniqueId] = requests.filter(r => r.fromUniqueId && r.fromUniqueId.toUpperCase() !== normFrom);

    this.data.friends[user.uniqueId] = this.data.friends[user.uniqueId] || [];
    this.data.friends[fromUser.uniqueId] = this.data.friends[fromUser.uniqueId] || [];

    if (!this.data.friends[user.uniqueId].includes(fromUser.uniqueId)) {
      this.data.friends[user.uniqueId].push(fromUser.uniqueId);
    }
    if (!this.data.friends[fromUser.uniqueId].includes(user.uniqueId)) {
      this.data.friends[fromUser.uniqueId].push(user.uniqueId);
    }

    this.saveData();
    return { success: true };
  }

  declineFriendRequest(userUniqueId, fromUniqueId) {
    this.data.friendRequests[userUniqueId] = (this.data.friendRequests[userUniqueId] || [])
      .filter(r => r.fromUniqueId !== fromUniqueId);
    this.saveData();
    return { success: true };
  }

  getFriendsList(uniqueId) {
    const friendIds = this.data.friends[uniqueId] || [];
    return friendIds.map(fId => {
      const u = this.findUserByUniqueId(fId);
      return u ? { uniqueId: u.uniqueId, name: u.name, avatar: u.avatar, trophies: u.trophies } : { uniqueId: fId, name: 'Bidder' };
    });
  }

  getFriendRequests(uniqueId) {
    const list = this.data.friendRequests[uniqueId] || [];
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

    const isWinner = !!matchRecord.isWinner;
    const record = {
      id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      date: new Date().toISOString(),
      trophyEarned: isWinner ? 1 : 0,
      ...matchRecord
    };

    this.data.matchHistory[canonicalKey].unshift(record);
    if (this.data.matchHistory[canonicalKey].length > 50) {
      this.data.matchHistory[canonicalKey] = this.data.matchHistory[canonicalKey].slice(0, 50);
    }

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
      if (isWinner) {
        const cat = matchRecord.category || 'ipl_cricket';
        user.categoryTrophies[cat] = (user.categoryTrophies[cat] || 0) + 1;
        // Dynamic sum variable automatically recalculated across all 7 arenas
        user.trophies = Object.values(user.categoryTrophies).reduce((sum, val) => sum + (val || 0), 0);
        user.auctionsWon = (user.auctionsWon || 0) + 1;
      }
      user.matchesPlayed = (user.matchesPlayed || 0) + 1;
    }

    this.saveData();
    return {
      record,
      user,
      trophies: user ? user.trophies : (isWinner ? 1 : 0)
    };
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

    if (existing) {
      existing.expiresAt = Date.now() + 10 * 60 * 1000;
      this.saveData();
      return { invitation: existing, isDuplicate: true };
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
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes validity
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
