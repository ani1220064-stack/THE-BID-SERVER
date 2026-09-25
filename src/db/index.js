const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let pool = null;
let usePostgres = false;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  pool.connect(async (err, client, release) => {
    if (err) {
      console.warn('[DB] PostgreSQL connection failed, falling back to local persistent store.', err.message);
      usePostgres = false;
    } else {
      console.log('[DB] Connected to PostgreSQL successfully.');
      usePostgres = true;
      try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
          const schemaSql = fs.readFileSync(schemaPath, 'utf8');
          await client.query(schemaSql);
          console.log('[DB] Master PostgreSQL schema verified / initialized successfully.');
        }
      } catch (schemaErr) {
        console.error('[DB] Error initializing schema:', schemaErr.message);
      } finally {
        release();
      }
    }
  });
} else {
  console.log('[DB] No DATABASE_URL provided. Using local persistent JSON store (PostgreSQL-ready interface).');
}

// Local persistent store helper
function loadLocalStore() {
  if (fs.existsSync(STORE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    } catch (e) {
      console.error('[DB] Error parsing store.json, resetting', e);
    }
  }
  return {
    users: {},
    friends: [],
    social_groups: {},
    group_members: [],
    match_history: []
  };
}

function saveLocalStore(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function generateBidId() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TB-${code}`;
}

const db = {
  generateBidId,

  async getUserById(id) {
    if (usePostgres && pool) {
      const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return res.rows[0] || null;
    }
    const store = loadLocalStore();
    return store.users[id] || null;
  },

  async getUserByBidId(bidId) {
    if (usePostgres && pool) {
      const res = await pool.query('SELECT * FROM users WHERE bid_id = $1', [bidId.toUpperCase()]);
      return res.rows[0] || null;
    }
    const store = loadLocalStore();
    return Object.values(store.users).find(u => u.bid_id === bidId.toUpperCase()) || null;
  },

  async createUser({ id, googleId, displayName, avatarUrl, isGuest }) {
    const bidId = generateBidId();
    const newUser = {
      id,
      google_id: googleId || null,
      bid_id: bidId,
      display_name: displayName || (isGuest ? 'Guest Player' : 'Bidder'),
      avatar_url: avatarUrl || '/avatars/default.png',
      is_guest: !!isGuest,
      trophies: 0,
      matches_played: 0,
      matches_won: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (usePostgres && pool) {
      const res = await pool.query(
        `INSERT INTO users (id, google_id, bid_id, display_name, avatar_url, is_guest, trophies, matches_played, matches_won)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [newUser.id, newUser.google_id, newUser.bid_id, newUser.display_name, newUser.avatar_url, newUser.is_guest, 0, 0, 0]
      );
      return res.rows[0];
    }

    const store = loadLocalStore();
    store.users[id] = newUser;
    saveLocalStore(store);
    return newUser;
  },

  async updateUser(id, fields) {
    if (usePostgres && pool) {
      const keys = Object.keys(fields);
      if (keys.length === 0) return this.getUserById(id);
      const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const values = [id, ...Object.values(fields)];
      const res = await pool.query(
        `UPDATE users SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        values
      );
      return res.rows[0];
    }
    const store = loadLocalStore();
    if (store.users[id]) {
      store.users[id] = { ...store.users[id], ...fields, updated_at: new Date().toISOString() };
      saveLocalStore(store);
      return store.users[id];
    }
    return null;
  },

  async searchFriends(searchQuery) {
    const q = (searchQuery || '').trim().toUpperCase();
    if (!q) return [];
    if (usePostgres && pool) {
      const res = await pool.query(
        `SELECT id, bid_id, display_name, avatar_url, trophies FROM users 
         WHERE (bid_id = $1 OR UPPER(display_name) LIKE $2) AND is_guest = FALSE LIMIT 10`,
        [q, `%${q}%`]
      );
      return res.rows;
    }
    const store = loadLocalStore();
    return Object.values(store.users)
      .filter(u => !u.is_guest && (u.bid_id === q || u.display_name.toUpperCase().includes(q)))
      .map(u => ({
        id: u.id,
        bid_id: u.bid_id,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        trophies: u.trophies
      }));
  },

  async getFriends(userId) {
    if (usePostgres && pool) {
      const res = await pool.query(
        `SELECT f.id as request_id, f.status, f.created_at,
                u.id as user_id, u.bid_id, u.display_name, u.avatar_url, u.trophies
         FROM friends f
         JOIN users u ON (f.friend_user_id = u.id)
         WHERE f.user_id = $1`,
        [userId]
      );
      return res.rows;
    }
    const store = loadLocalStore();
    const userFriends = store.friends.filter(f => f.user_id === userId);
    return userFriends.map(f => {
      const u = store.users[f.friend_user_id] || {};
      return {
        request_id: f.id,
        status: f.status,
        created_at: f.created_at,
        user_id: u.id,
        bid_id: u.bid_id,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        trophies: u.trophies
      };
    });
  },

  async sendFriendRequest(userId, targetBidId) {
    const targetUser = await this.getUserByBidId(targetBidId);
    if (!targetUser) throw new Error('Player not found with THE BID ID: ' + targetBidId);
    if (targetUser.id === userId) throw new Error('Cannot send friend request to yourself');

    const reqId = `freq_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = Date.now();

    if (usePostgres && pool) {
      await pool.query(
        `INSERT INTO friend_requests (id, sender_user_id, sender_unique_id, recipient_user_id, recipient_unique_id, status, last_sent_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
         ON CONFLICT (id) DO NOTHING`,
        [reqId, userId, (await this.getUserById(userId))?.bid_id || userId, targetUser.id, targetUser.bid_id, now]
      );
      return { targetUser, status: 'PENDING', id: reqId };
    }

    const store = loadLocalStore();
    store.friend_requests = store.friend_requests || [];
    const newReq = {
      id: reqId,
      sender_user_id: userId,
      sender_unique_id: store.users[userId]?.bid_id || userId,
      recipient_user_id: targetUser.id,
      recipient_unique_id: targetUser.bid_id,
      status: 'PENDING',
      created_at: new Date(now).toISOString(),
      last_sent_at: now
    };
    store.friend_requests.push(newReq);
    saveLocalStore(store);
    return { targetUser, status: 'PENDING', id: reqId };
  },

  async respondFriendRequest(userId, requestId, accept) {
    const status = accept ? 'ACCEPTED' : 'DECLINED';
    if (usePostgres && pool) {
      const res = await pool.query(
        `UPDATE friend_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, requestId]
      );
      const req = res.rows[0];
      if (req && accept) {
        // Enforce canonical user ordering for friendships table
        const u1 = req.sender_user_id < req.recipient_user_id ? req.sender_user_id : req.recipient_user_id;
        const u2 = req.sender_user_id < req.recipient_user_id ? req.recipient_user_id : req.sender_user_id;
        const b1 = req.sender_user_id < req.recipient_user_id ? req.sender_unique_id : req.recipient_unique_id;
        const b2 = req.sender_user_id < req.recipient_user_id ? req.recipient_unique_id : req.sender_unique_id;

        await pool.query(
          `INSERT INTO friendships (user_id_1, user_id_2, bid_id_1, bid_id_2)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id_1, user_id_2) DO NOTHING`,
          [u1, u2, b1, b2]
        );
      }
      return req;
    }
    const store = loadLocalStore();
    store.friend_requests = store.friend_requests || [];
    const req = store.friend_requests.find(f => f.id === requestId);
    if (req) {
      req.status = status;
      req.updated_at = new Date().toISOString();
      if (accept) {
        store.friendships = store.friendships || [];
        const u1 = req.sender_user_id < req.recipient_user_id ? req.sender_user_id : req.recipient_user_id;
        const u2 = req.sender_user_id < req.recipient_user_id ? req.recipient_user_id : req.sender_user_id;
        if (!store.friendships.some(f => f.user_id_1 === u1 && f.user_id_2 === u2)) {
          store.friendships.push({
            id: Date.now(),
            user_id_1: u1,
            user_id_2: u2,
            bid_id_1: req.sender_user_id < req.recipient_user_id ? req.sender_unique_id : req.recipient_unique_id,
            bid_id_2: req.sender_user_id < req.recipient_user_id ? req.recipient_unique_id : req.sender_unique_id,
            created_at: new Date().toISOString()
          });
        }
      }
      saveLocalStore(store);
      return req;
    }
    return null;
  },

  async getGroups(userId) {
    if (usePostgres && pool) {
      const res = await pool.query(
        `SELECT g.id, g.name, g.owner_id, g.created_at,
                json_agg(json_build_object('id', u.id, 'bid_id', u.bid_id, 'display_name', u.display_name)) as members
         FROM social_groups g
         JOIN group_members gm ON g.id = gm.group_id
         JOIN users u ON gm.user_id = u.id
         WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = $1)
         GROUP BY g.id`,
        [userId]
      );
      return res.rows;
    }
    const store = loadLocalStore();
    const userGroupIds = store.group_members.filter(gm => gm.user_id === userId).map(gm => gm.group_id);
    return userGroupIds.map(gid => {
      const g = store.social_groups[gid] || { id: gid, name: 'Group' };
      const memberIds = store.group_members.filter(gm => gm.group_id === gid).map(gm => gm.user_id);
      const members = memberIds.map(mid => store.users[mid]).filter(Boolean);
      return { ...g, members };
    });
  },

  async createGroup(userId, name, memberIds = []) {
    const groupId = 'grp_' + Date.now();
    const newGroup = {
      id: groupId,
      name,
      owner_id: userId,
      created_at: new Date().toISOString()
    };

    if (usePostgres && pool) {
      await pool.query('INSERT INTO social_groups (id, name, owner_id) VALUES ($1, $2, $3)', [groupId, name, userId]);
      const allMembers = Array.from(new Set([userId, ...memberIds]));
      for (const mId of allMembers) {
        await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [groupId, mId]);
      }
      return this.getGroups(userId);
    }

    const store = loadLocalStore();
    store.social_groups[groupId] = newGroup;
    const allMembers = Array.from(new Set([userId, ...memberIds]));
    allMembers.forEach(mId => {
      store.group_members.push({ group_id: groupId, user_id: mId, joined_at: new Date().toISOString() });
    });
    saveLocalStore(store);
    return newGroup;
  },

  async saveMatchHistory(matchRecord) {
    const record = {
      id: matchRecord.id || 'match_' + Date.now(),
      user_id: matchRecord.userId,
      auction_world: matchRecord.auctionWorld || 'IPL',
      room_id: matchRecord.roomId,
      starting_budget: matchRecord.startingBudget,
      total_spent: matchRecord.totalSpent,
      remaining_budget: matchRecord.remainingBudget,
      players_bought: matchRecord.playersBought || [],
      final_rank: matchRecord.finalRank,
      is_winner: matchRecord.isWinner || false,
      ai_analysis: matchRecord.aiAnalysis || {},
      participants: matchRecord.participants || [],
      completed_at: new Date().toISOString()
    };

    if (usePostgres && pool) {
      await pool.query(
        `INSERT INTO match_history (id, user_id, auction_world, room_id, starting_budget, total_spent, remaining_budget, players_bought, final_rank, is_winner, ai_analysis, participants)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          record.id, record.user_id, record.auction_world, record.room_id,
          record.starting_budget, record.total_spent, record.remaining_budget,
          JSON.stringify(record.players_bought), record.final_rank, record.is_winner,
          JSON.stringify(record.ai_analysis), JSON.stringify(record.participants)
        ]
      );
      // Increment user stats & trophies if winner
      await pool.query(
        `UPDATE users SET matches_played = matches_played + 1, 
                          matches_won = matches_won + $1, 
                          trophies = trophies + $2
         WHERE id = $3`,
        [record.is_winner ? 1 : 0, record.is_winner ? 1 : 0, record.user_id]
      );
      return record;
    }

    const store = loadLocalStore();
    store.match_history.push(record);
    if (store.users[record.user_id]) {
      const u = store.users[record.user_id];
      u.matches_played = (u.matches_played || 0) + 1;
      if (record.is_winner) {
        u.matches_won = (u.matches_won || 0) + 1;
        u.trophies = (u.trophies || 0) + 1;
      }
    }
    saveLocalStore(store);
    return record;
  },

  async getMatchHistory(userId) {
    if (usePostgres && pool) {
      const res = await pool.query(
        `SELECT * FROM match_history WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 50`,
        [userId]
      );
      return res.rows;
    }
    const store = loadLocalStore();
    return store.match_history
      .filter(m => m.user_id === userId)
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  }
};

module.exports = db;
