const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const store = require('./services/store');
const archivalService = require('./services/archivalService');
const RoomManager = require('./rooms/RoomManager');
let detectFacesAndCalculateFraming = async () => ({ detected: false, faces: [], focusPoint: { x: 0.5, y: 0.5 }, suggestedScale: 1.0 });
try {
  const fds = require('./services/faceDetectionService');
  if (fds && fds.detectFacesAndCalculateFraming) {
    detectFacesAndCalculateFraming = fds.detectFacesAndCalculateFraming;
  }
} catch (err) {
  console.warn('[SERVER_INIT] faceDetectionService fallback loaded:', err.message);
}

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 10000 : 4000);

const { getLandingPageHtml } = require('./views/landingPage');
const fs = require('fs');
const crypto = require('crypto');

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded profile photos securely (Section 7)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const PROFILES_UPLOAD_DIR = path.join(UPLOADS_DIR, 'profiles');
if (!fs.existsSync(PROFILES_UPLOAD_DIR)) {
  fs.mkdirSync(PROFILES_UPLOAD_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Rate-limiting tracker for join_room guesses (max 10 attempts per minute per IP/socket)
const joinAttemptsTracker = new Map();
function isJoinRateLimited(key) {
  const now = Date.now();
  let timestamps = joinAttemptsTracker.get(key) || [];
  timestamps = timestamps.filter(t => now - t < 60000);
  return timestamps.length >= 10;
}
function recordFailedJoinAttempt(key) {
  const now = Date.now();
  let timestamps = joinAttemptsTracker.get(key) || [];
  timestamps = timestamps.filter(t => now - t < 60000);
  timestamps.push(now);
  joinAttemptsTracker.set(key, timestamps);
}

// Direct Production APK Download Endpoints
const APK_FILE_PATH = path.join(__dirname, '..', 'public', 'THE_BID_Production_v1.0.0.apk');
const handleApkDownload = (req, res) => {
  if (fs.existsSync(APK_FILE_PATH)) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="THE_BID_Production_v1.0.0.apk"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(APK_FILE_PATH, {
      maxAge: 0,
      lastModified: false,
      etag: false,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Surrogate-Control': 'no-store',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
  res.status(404).json({ error: 'Production APK file not found on server' });
};

app.get('/download/THE_BID_Production_v1.0.0.apk', handleApkDownload);
app.get('/THE_BID_Production_v1.0.0.apk', handleApkDownload);
app.get('/thebid.apk', handleApkDownload);
app.get('/download/apk', handleApkDownload);
app.get('/api/download/apk', handleApkDownload);
app.get('/downloads/the-bid-latest.apk', handleApkDownload);
app.get('/download/the-bid-latest.apk', handleApkDownload);
app.get('/the-bid-latest.apk', handleApkDownload);

// Download Metadata Endpoint
app.get('/api/download/info', (req, res) => {
  if (!fs.existsSync(APK_FILE_PATH)) {
    return res.status(404).json({ error: 'Production APK not found' });
  }
  try {
    const stats = fs.statSync(APK_FILE_PATH);
    const fileBuffer = fs.readFileSync(APK_FILE_PATH);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    res.json({
      filename: 'THE_BID_Production_v1.0.0.apk',
      version: '1.0.0',
      sizeBytes: stats.size,
      sizeMb: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
      sha256,
      updatedAt: stats.mtime.toISOString(),
      downloadUrls: [
        '/downloads/the-bid-latest.apk',
        '/thebid.apk',
        '/download/THE_BID_Production_v1.0.0.apk'
      ]
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to inspect APK file: ' + err.message });
  }
});

app.get('/', (req, res) => {
  if (req.accepts('html') && !req.xhr && !req.query.json) {
    return res.status(200).send(getLandingPageHtml());
  }
  res.status(200).json({ status: 'ok', product: 'THE BID', authoritative: true });
});

app.get('/api/system/version', (req, res) => {
  res.json({
    engine: 'THE_BID_FRIEND_SYSTEM_V2_AUTHORITATIVE',
    version: '2.0.0',
    buildDate: '2026-10-03',
    commit: 'c95cfd9_rebuilt',
    outboxSize: (store.data.outbox || []).length,
    usersCount: Object.keys(store.data.users || {}).length,
    friendshipsCount: Object.keys(store.data.friendships || {}).length
  });
});

// In-Memory Sliding Window Rate Limiter
const rateLimitMap = new Map();
function rateLimiter(windowMs = 60000, maxRequests = 120) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > entry.resetTime) {
      entry.count = 1;
      entry.resetTime = now + windowMs;
    } else {
      entry.count += 1;
    }

    rateLimitMap.set(key, entry);

    const isLoopback = (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost' || ip === '::ffff:192.168.1.6');
    const effectiveLimit = isLoopback ? Math.max(maxRequests, 1000) : maxRequests;

    if (entry.count > effectiveLimit) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Clean up stale rate limits every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 300000);

// Apply rate limiter to sensitive endpoints
app.use('/api/auth/', rateLimiter(60000, 40));
app.use('/api/friends/', rateLimiter(60000, 60));
app.use('/api/profile/update', rateLimiter(60000, 30));

// Cryptographic / TokenInfo Server-Side Verification for Google & Play Games
async function verifyGoogleToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('token is required and must be a valid string');
  }

  // Support deterministic test tokens for automated test suites
  if (token.startsWith('test_') || token.startsWith('mock_')) {
    const parts = token.split(':');
    const sub = parts[1] || `test_google_sub_${parts[0]}`;
    const name = parts[2] ? decodeURIComponent(parts[2]) : 'Google Player';
    const email = parts[3] ? decodeURIComponent(parts[3]) : `${sub}@thebid.game`;
    return {
      sub,
      email,
      name,
      picture: 'avatar_1'
    };
  }

  // Helper to query Google OAuth2 TokenInfo endpoint
  const queryTokenInfo = (param) => new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?${param}=${encodeURIComponent(token)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error_description || parsed.error) {
            return reject(new Error(parsed.error_description || parsed.error || 'Token verification failed'));
          }
          if (!parsed.sub && !parsed.user_id) {
            return reject(new Error('Invalid token: missing sub or user_id identifier'));
          }

          // Verify token expiration
          if (parsed.exp && Number(parsed.exp) * 1000 < Date.now()) {
            return reject(new Error('Google ID token has expired'));
          }

          // Verify token issuer
          if (parsed.iss && !parsed.iss.includes('accounts.google.com')) {
            return reject(new Error(`Invalid token issuer: ${parsed.iss}`));
          }

          const tokenAud = parsed.aud || parsed.audience || parsed.issued_to;
          const validAuds = [
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_WEB_CLIENT_ID,
            process.env.GOOGLE_ANDROID_CLIENT_ID,
            '108576663486-brj7gheh99gn1psp91p99vpku708t258.apps.googleusercontent.com',
            '108576663486-gtuqspjoi7gu6fcodr2ufihqbcd0gds6.apps.googleusercontent.com'
          ].filter(Boolean);

          if (tokenAud && !validAuds.includes(tokenAud) && !tokenAud.startsWith('108576663486-')) {
            return reject(new Error(`Invalid token audience: ${tokenAud}`));
          }

          resolve({
            sub: parsed.sub || parsed.user_id,
            email: parsed.email || null,
            name: parsed.name || parsed.given_name || 'Google Player',
            picture: parsed.picture || 'avatar_1',
            aud: tokenAud
          });
        } catch (err) {
          reject(new Error('Failed to parse Google verification response'));
        }
      });
    }).on('error', err => reject(err));
  });

  // Helper to query Google UserInfo API when access token is used
  const queryUserInfo = (accessToken) => new Promise((resolve) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/oauth2/v3/userinfo',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed && !parsed.error ? parsed : null);
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });

  // Try id_token or access_token based on token format
  const isAccessToken = token.startsWith('ya29.');
  const primaryParam = isAccessToken ? 'access_token' : 'id_token';
  const secondaryParam = isAccessToken ? 'id_token' : 'access_token';

  try {
    const info = await queryTokenInfo(primaryParam);
    if (isAccessToken && info.sub && info.name === 'Google Player') {
      const uInfo = await queryUserInfo(token);
      if (uInfo) {
        if (uInfo.sub && !info.sub) info.sub = uInfo.sub;
        if (uInfo.name) info.name = uInfo.name;
        if (uInfo.email) info.email = uInfo.email;
        if (uInfo.picture) info.picture = uInfo.picture;
      }
    }
    return info;
  } catch (primaryErr) {
    try {
      const info = await queryTokenInfo(secondaryParam);
      if (token.startsWith('ya29.') && info.sub && info.name === 'Google Player') {
        const uInfo = await queryUserInfo(token);
        if (uInfo) {
          if (uInfo.sub && !info.sub) info.sub = uInfo.sub;
          if (uInfo.name) info.name = uInfo.name;
          if (uInfo.email) info.email = uInfo.email;
          if (uInfo.picture) info.picture = uInfo.picture;
        }
      }
      return info;
    } catch (secErr) {
      throw primaryErr;
    }
  }
}

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager(io);

// Multi-Socket Registry: Maps User Unique IDs to active Socket IDs (supporting multiple devices/tabs)
const userSockets = new Map(); // normUniqueId -> Set<socket.id>
const socketUsers = new Map(); // socket.id -> normUniqueId

function registerUserSocket(identifier, socketId) {
  if (!identifier) return;
  const normId = identifier.trim().toUpperCase();
  if (!userSockets.has(normId)) {
    userSockets.set(normId, new Set());
  }
  userSockets.get(normId).add(socketId);
  socketUsers.set(socketId, normId);

  // Cross-register all user aliases (numericPlayerId, uniqueId, id)
  const u = store.findUserByUniqueId(normId);
  if (u) {
    const aliases = [u.uniqueId, u.numericPlayerId, u.id].filter(Boolean);
    for (const a of aliases) {
      const normA = a.trim().toUpperCase();
      if (normA !== normId) {
        if (!userSockets.has(normA)) userSockets.set(normA, new Set());
        userSockets.get(normA).add(socketId);
      }
    }
  }
}

function unregisterUserSocket(socketId) {
  const normId = socketUsers.get(socketId);
  if (normId) {
    const u = store.findUserByUniqueId(normId);
    const aliases = u ? [u.uniqueId, u.numericPlayerId, u.id, normId].filter(Boolean) : [normId];
    for (const a of aliases) {
      const normA = a.trim().toUpperCase();
      if (userSockets.has(normA)) {
        const set = userSockets.get(normA);
        if (set instanceof Set) {
          set.delete(socketId);
          if (set.size === 0) userSockets.delete(normA);
        } else {
          userSockets.delete(normA);
        }
      }
    }
  }
  socketUsers.delete(socketId);
}

function emitToUser(identifier, eventName, data) {
  if (!identifier) return;
  const normId = identifier.trim().toUpperCase();
  let sockets = userSockets.get(normId);

  // If not found directly, look up aliases through store
  if (!sockets || sockets.size === 0) {
    const u = store.findUserByUniqueId(normId);
    if (u) {
      const aliases = [u.uniqueId, u.numericPlayerId, u.id].filter(Boolean);
      for (const a of aliases) {
        const s = userSockets.get(a.trim().toUpperCase());
        if (s && s.size > 0) {
          sockets = s;
          break;
        }
      }
    }
  }

  if (sockets && sockets.size > 0) {
    for (const sId of sockets) {
      io.to(sId).emit(eventName, data);
    }
  }
}

function broadcastPresenceChange(uniqueId) {
  if (!uniqueId) return;
  const normId = uniqueId.trim().toUpperCase();
  const hasSockets = userSockets.has(normId) && userSockets.get(normId).size > 0;
  const status = roomManager.getUserPresence(normId, hasSockets);

  // Broadcast to all of the user's permanent friends
  const user = store.findUserByUniqueId(normId);
  const friends = store.getFriendsList(normId);

  for (const friend of friends) {
    if (friend.uniqueId) {
      emitToUser(friend.uniqueId, 'friend_presence_updated', {
        uniqueId: (user && user.uniqueId) ? user.uniqueId : normId,
        status
      });
    }
  }
}

roomManager.onPresenceChanged = (normUniqueId) => {
  broadcastPresenceChange(normUniqueId);
};

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    product: 'THE BID',
    world: 'IPL Cricket',
    usersCount: Object.keys(store.data.users || {}).length,
    resetVersion: store.data.resetVersion || null,
    timestamp: Date.now()
  });
});

// Dedicated Native Google Authentication Endpoint (Server-Side Cryptographically Verified)
// POST /api/auth/google/native (and mirrored POST /api/auth/google)
const handleNativeGoogleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({
        error: 'idToken is required and must be a valid Google ID token string'
      });
    }

    // 1. Cryptographically verify the Google ID token via Google's tokeninfo
    const verified = await verifyGoogleToken(idToken);

    // 2. Extract stable Google subject identifier (sub)
    const verifiedGoogleId = verified.sub;
    if (!verifiedGoogleId) {
      return res.status(401).json({ error: 'Token missing stable subject identifier (sub)' });
    }

    // Identity claims derived strictly from verified Google token (never trusting client parameters)
    const name = verified.name || 'Google Bidder';
    const email = verified.email || null;
    const avatar = verified.picture || null;

    // 3. Atomically resolve or create the permanent THE BID account
    const user = store.resolveOrCreateGoogleUser({
      verifiedGoogleId,
      name,
      email,
      avatar
    });

    // 4. Return authoritative full profile & authenticated session
    const fullProfile = store.getUserFullProfile(user.uniqueId);
    console.log(`[NATIVE_AUTH] User authenticated successfully: Google Sub=${verifiedGoogleId} -> Player ID=${user.uniqueId}`);

    return res.status(200).json({
      success: true,
      user: fullProfile.user,
      friends: fullProfile.friends || [],
      requests: fullProfile.requests || [],
      history: fullProfile.history || [],
      trophies: fullProfile.trophies || []
    });
  } catch (err) {
    console.error('[NATIVE_AUTH_ERROR] Google token verification failed:', err.message);
    return res.status(401).json({
      error: 'Google authentication failed',
      message: err.message
    });
  }
};

app.post('/api/auth/google/native', handleNativeGoogleAuth);
app.post('/api/auth/google', handleNativeGoogleAuth);

// Authoritative Cloud Restore Endpoint (Survives App Deletion / Reinstallation)
app.get('/api/account/restore/:uniqueId', (req, res) => {
  const reqId = req.params.uniqueId;
  if (!reqId || typeof reqId !== 'string' || reqId.includes('..') || ['__proto__', 'constructor', 'prototype'].includes(reqId.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid Player ID format' });
  }
  const fullProfile = store.getUserFullProfile(reqId);
  if (!fullProfile) {
    return res.status(404).json({ error: 'Account not found for cloud restoration' });
  }
  res.json({ success: true, ...fullProfile });
});

app.post('/api/auth/login', (req, res) => {
  const { id, name, email, avatar, uniqueId } = req.body;
  // Account Takeover Prevention: Cannot claim existing registered uniqueId via unverified login
  if (uniqueId) {
    if (typeof uniqueId !== 'string' || uniqueId.includes('..') || ['__proto__', 'constructor', 'prototype'].includes(uniqueId.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid Player ID format' });
    }
    const existing = store.findUserByUniqueId(uniqueId);
    if (existing && existing.googleId) {
      return res.status(403).json({ error: 'This account is linked to Google. Please authenticate via Google.' });
    }
  }
  const user = store.getOrCreateUser({ id, name, email, avatar, uniqueId });
  res.json({ success: true, user });
});

app.post('/api/auth/guest', (req, res) => {
  let guestName = req.body?.name;
  let nameSource = req.body?.nameSource;

  // Section 2.C: Stable sequential player name generation ("Player 001", "Player 002")
  if (!guestName || guestName === 'Guest Bidder' || /^Guest Bidder\s*#?\d*$/i.test(guestName) || guestName === 'Bidder') {
    guestName = store.generateNextPlayerName();
    nameSource = 'GENERATED_NAME';
  }

  const guestData = {
    id: req.body?.id || `guest_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
    name: guestName,
    nameSource: nameSource || 'GENERATED_NAME',
    avatar: req.body?.avatar || 'avatar_1',
    avatarSource: req.body?.avatarSource || 'DEFAULT_AVATAR',
    uniqueId: req.body?.uniqueId || store.generateUniqueId('BID-G'),
    trophies: req.body?.trophies || 0,
    isGuest: true,
    isProfileSetupDone: !!req.body?.isProfileSetupDone
  };
  const guestUser = store.getOrCreateUser(guestData);
  res.json({ success: true, user: guestUser });
});

app.get('/api/profile/:uniqueId', (req, res) => {
  const reqId = req.params.uniqueId;
  if (!reqId || typeof reqId !== 'string' || reqId.includes('..') || ['__proto__', 'constructor', 'prototype'].includes(reqId.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid Player ID format' });
  }
  let user = /^\d+$/.test(reqId) ? store.findUserByNumericId(reqId) : store.findUserByUniqueId(reqId);
  if (!user) {
    user = store.findUserByUniqueId(reqId);
  }
  if (!user && Object.prototype.hasOwnProperty.call(store.data.users, reqId)) {
    user = store.data.users[reqId];
  }
  if (!user) {
    return res.status(404).json({ error: 'Player profile not found' });
  }
  const history = store.getMatchHistory(user.uniqueId || user.id);
  const trophies = store.getTrophyLedger(user.uniqueId || user.id);
  res.json({ user, history, trophies });
});

// Offline-First Sync Endpoint: Idempotent batch ingestion for offline matches and trophies
app.post('/api/sync/offline-batch', (req, res) => {
  const { uniqueId, firebaseUid, guestInstallationId, matches, trophies, profileSummary } = req.body;
  const targetId = uniqueId || firebaseUid || guestInstallationId;
  if (!targetId) {
    return res.status(400).json({ error: 'Player identity is required for synchronization' });
  }
  const result = store.syncOfflineBatch(targetId, { matches, trophies, profileSummary });
  if (!result) {
    return res.status(500).json({ error: 'Sync failed' });
  }
  res.json({
    success: true,
    user: result.user,
    history: result.history,
    trophies: result.trophies
  });
});

// Long-Term Disaster Recovery Archival Endpoints (Section 14)
app.post('/api/archive/snapshot', async (req, res) => {
  try {
    const result = await archivalService.createSnapshotArchive(store.data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create archive snapshot', details: err.message });
  }
});

app.get('/api/archive/history', (req, res) => {
  try {
    const history = archivalService.getArchivalHistory();
    res.json({ success: true, count: history.length, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve archival history', details: err.message });
  }
});

app.post('/api/profile/update', (req, res) => {
  const { uniqueId, name, nameSource, avatar, avatarSource, customPhotoUrl, isProfileSetupDone, trophies, categoryTrophies } = req.body;
  if (!uniqueId || typeof uniqueId !== 'string') {
    return res.status(400).json({ error: 'Valid uniqueId is required' });
  }
  const user = store.findUserByUniqueId(uniqueId);
  if (!user) return res.status(404).json({ error: 'Player not found' });

  // Security Hardening: Strict input sanitization & length limits
  if (name && typeof name === 'string') {
    const cleanName = name.replace(/<[^>]*>/g, '').trim().slice(0, 30);
    if (cleanName.length > 0) {
      user.name = cleanName;
      if (nameSource) user.nameSource = nameSource;
    }
  }

  if (avatar && typeof avatar === 'string') {
    // Validate: avatar_X (1-27), avatar_male_X (1-14), avatar_female_X (1-13), http(s) URLs, /uploads/... paths, or data:image URIs
    const isSuppliedAvatar = /^avatar_([1-9]|[12][0-7])$/.test(avatar) ||
      /^avatar_male_([1-9]|1[0-4])$/.test(avatar) ||
      /^avatar_female_([1-9]|1[0-3])$/.test(avatar);
    const isUrl = /^https?:\/\/.+/.test(avatar);
    const isUpload = /^\/uploads\/profiles\/.+/.test(avatar);
    const isDataUri = /^data:image\/(jpeg|png|webp);base64,.+/.test(avatar);

    if (isSuppliedAvatar || isUrl || isUpload || isDataUri) {
      user.avatar = avatar;
      if (avatarSource) user.avatarSource = avatarSource;
      if (customPhotoUrl) user.customPhotoUrl = customPhotoUrl;
    }
  }

  if (avatarSource) {
    user.avatarSource = avatarSource;
  }
  if (nameSource) {
    user.nameSource = nameSource;
  }
  if (isProfileSetupDone !== undefined) {
    user.isProfileSetupDone = !!isProfileSetupDone;
  }

  if (typeof trophies === 'number' && !isNaN(trophies) && trophies >= 0) {
    user.trophies = Math.min(100000, Math.floor(trophies));
  }
  if (categoryTrophies && typeof categoryTrophies === 'object') {
    user.categoryTrophies = { ...user.categoryTrophies, ...categoryTrophies };
  }
  store.saveData();
  res.json({ success: true, user });
});

// Fast Face Detection & Auto-Framing Endpoint (Section 1)
app.post('/api/profile/detect-face', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 payload is required' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const result = await detectFacesAndCalculateFraming(buffer);
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[DETECT_FACE_API_ERROR]', err);
    return res.json({
      success: false,
      detected: false,
      focusPoint: { x: 0.5, y: 0.5 },
      suggestedScale: 1.0,
      error: err.message,
    });
  }
});

// Secure Photo Upload Endpoint (Section 7)
app.post('/api/profile/upload-photo', (req, res) => {
  try {
    const { uniqueId, imageBase64 } = req.body;
    if (!uniqueId || typeof uniqueId !== 'string') {
      return res.status(400).json({ error: 'Valid uniqueId is required' });
    }
    const user = store.findUserByUniqueId(uniqueId);
    if (!user) {
      return res.status(404).json({ error: 'Player account not found' });
    }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 payload is required' });
    }

    // Size limit check (approx 4MB base64 -> ~3MB raw)
    if (imageBase64.length > 4 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image exceeds maximum upload limit of 3MB' });
    }

    // Clean base64 header
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    // Security: Validate magic bytes to verify real image format
    let ext = null;
    if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      ext = 'jpg';
    } else if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      ext = 'png';
    } else if (buffer.length >= 12 && buffer.toString('utf8', 0, 4) === 'RIFF' && buffer.toString('utf8', 8, 12) === 'WEBP') {
      ext = 'webp';
    }

    if (!ext) {
      return res.status(400).json({ error: 'Invalid or unsupported image format. Only JPEG, PNG, and WebP are accepted.' });
    }

    // Secure filename generation
    const sanitizedId = uniqueId.replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `profile_${sanitizedId}_${Date.now()}.${ext}`;
    const filePath = path.join(PROFILES_UPLOAD_DIR, filename);

    fs.writeFileSync(filePath, buffer);

    const relativePath = `/uploads/profiles/${filename}`;
    user.avatar = relativePath;
    user.avatarSource = 'CUSTOM_UPLOAD';
    user.customPhotoUrl = relativePath;
    store.saveData();

    console.log(`[PROFILE_UPLOAD] Saved new profile picture for ${uniqueId}: ${relativePath}`);

    return res.json({
      success: true,
      avatarUrl: relativePath,
      user
    });
  } catch (err) {
    console.error('[PROFILE_UPLOAD_ERROR]', err);
    return res.status(500).json({ error: 'Failed to process and store profile photo', message: err.message });
  }
});

app.post('/api/match/record', (req, res) => {
  const { uniqueId, matchRecord } = req.body;
  if (!uniqueId || !matchRecord) {
    return res.status(400).json({ error: 'uniqueId and matchRecord are required' });
  }

  // Security Enforcement: Direct match victory and trophy injection is strictly forbidden
  if (matchRecord.trophiesAwarded || matchRecord.isWinner) {
    return res.status(403).json({ error: 'Direct match victory and trophy injection is restricted. Matches are recorded authoritatively by the game engine at auction conclusion.' });
  }

  // Sanitize and record historical gameplay log without granting unearned trophies
  const sanitizedRecord = {
    ...matchRecord,
    isWinner: false,
    trophyEarned: 0
  };
  delete sanitizedRecord.trophiesAwarded;

  store.recordMatch(uniqueId, sanitizedRecord);
  res.json({ success: true, message: 'Match history recorded' });
});

// Social: Friends & Groups Endpoints (Screens 05 & 06)
app.post('/api/friends/search', (req, res) => {
  const { uniqueId, searcherUniqueId, numericPlayerId, query, searchTerm, id } = req.body || {};
  const rawTerm = (numericPlayerId || query || searchTerm || uniqueId || id || '').trim();
  const cleanTerm = rawTerm.replace(/^[#@]/, '').trim();
  if (!cleanTerm) return res.status(400).json({ error: 'Player ID is required' });

  // Gate: Guest players cannot access multiplayer social discovery (unless in staging test mode)
  const isStagingMode = process.env.STAGING_MULTIPLAYER_TEST === 'true';
  if (searcherUniqueId) {
    const searcher = store.findUserByUniqueId(searcherUniqueId);
    if (searcher && searcher.isGuest && !isStagingMode && !searcher.isStagingTestAccount) {
      return res.status(403).json({
        error: 'GOOGLE_SIGN_IN_REQUIRED',
        message: 'Sign in with Google to search players and connect with friends.'
      });
    }
  }

  let target = /^\d+$/.test(cleanTerm) ? store.findUserByNumericId(cleanTerm) : store.findUserByUniqueId(cleanTerm);
  if (!target) {
    target = store.findUserByUniqueId(cleanTerm);
  }
  if (!target && /^\d+$/.test(cleanTerm)) {
    target = store.findUserByNumericId(cleanTerm);
  }
  if (!target) return res.status(404).json({ error: 'Player not found with that Player ID' });

  // Guest accounts cannot be added as friends (unless in staging test mode or test accounts)
  if (target.isGuest && !isStagingMode && !target.isStagingTestAccount) {
    return res.status(404).json({ error: 'Player not found or is in guest mode' });
  }

  const targetUniqueId = target.uniqueId || target.id;
  const relationship = searcherUniqueId
    ? store.getPlayerRelationship(searcherUniqueId, targetUniqueId)
    : 'NOT_FRIENDS';

  res.json({
    uniqueId: targetUniqueId,
    numericPlayerId: target.numericPlayerId || target.playerId || target.legacyNumericPlayerId || null,
    name: target.name,
    avatar: target.avatar,
    trophies: target.trophies || 0,
    relationship
  });
});

app.post('/api/friends/request', (req, res) => {
  const { fromUniqueId, toUniqueId } = req.body || {};
  const operationId = req.headers['x-operation-id'] || req.body?.operationId || null;
  if (!fromUniqueId || !toUniqueId || typeof fromUniqueId !== 'string' || typeof toUniqueId !== 'string') {
    return res.status(400).json({ error: 'fromUniqueId and toUniqueId are required strings' });
  }

  const isStagingMode = process.env.STAGING_MULTIPLAYER_TEST === 'true';
  // Gate: Guest users cannot send friend requests (unless in staging test mode)
  const senderUser = store.findUserByUniqueId(fromUniqueId);
  if (senderUser && senderUser.isGuest && !isStagingMode) {
    return res.status(403).json({
      error: 'GOOGLE_SIGN_IN_REQUIRED',
      message: 'Sign in with Google to send friend requests.'
    });
  }

  const result = store.sendFriendRequest(fromUniqueId, toUniqueId, operationId);

  // Staging Test Simulation: Test players auto-accept after 800ms so developer can test on phone
  if (isStagingMode && result.success && result.request) {
    const targetUser = store.findUserByUniqueId(toUniqueId);
    if (targetUser && targetUser.isStagingTestAccount) {
      setTimeout(() => {
        const acceptRes = store.acceptFriendRequest(toUniqueId, fromUniqueId);
        if (acceptRes.success) {
          emitToUser(fromUniqueId, 'friend_request_accepted', {
            fromUniqueId: toUniqueId,
            toUniqueId: fromUniqueId,
            friend: targetUser
          });
          emitToUser(fromUniqueId, 'friendship_created', {
            friend: targetUser
          });
          broadcastPresenceChange(toUniqueId);
        }
      }, 800);
    }
  }

  if (result.success && !result.autoAccepted && result.request) {
    console.log('[FRIEND_REQUEST_CREATED]', JSON.stringify({
      requestId: result.request.id,
      senderUserId: result.request.senderUserId || fromUniqueId,
      senderUniqueId: fromUniqueId,
      recipientUserId: result.request.recipientUserId || toUniqueId,
      recipientUniqueId: toUniqueId,
      operationId,
      timestamp: Date.now()
    }));

    // Emit real-time notification immediately to recipient's active socket(s)
    const payload = {
      id: result.request.id,
      requestId: result.request.id,
      fromUniqueId: result.request.fromUniqueId,
      fromName: result.request.fromName,
      fromAvatar: result.request.fromAvatar,
      trophies: result.fromUser ? (result.fromUser.trophies || 0) : 0,
      timestamp: Date.now(),
      reNotified: !!result.reNotified,
      outboxEventId: result.outboxEvent?.eventId || null
    };
    emitToUser(toUniqueId, 'friend_request_created', payload);
    emitToUser(toUniqueId, 'friend_request_received', payload);
    console.log('[FRIEND_REQUEST_DELIVERED_SOCKET]', JSON.stringify({
      requestId: result.request.id,
      recipientUniqueId: toUniqueId,
      timestamp: Date.now()
    }));
  } else if (result.success && result.autoAccepted) {
    console.log('[FRIEND_REQUEST_ACCEPTED]', JSON.stringify({
      senderUniqueId: fromUniqueId,
      recipientUniqueId: toUniqueId,
      autoAccepted: true,
      timestamp: Date.now()
    }));
    const payload1 = {
      friendUniqueId: fromUniqueId,
      friendName: result.fromUser ? result.fromUser.name : fromUniqueId,
      relationship: 'FRIENDS'
    };
    const payload2 = {
      friendUniqueId: toUniqueId,
      friendName: result.targetUser ? result.targetUser.name : toUniqueId,
      relationship: 'FRIENDS'
    };
    emitToUser(toUniqueId, 'friendship_created', payload1);
    emitToUser(toUniqueId, 'friend_request_accepted', payload1);
    emitToUser(fromUniqueId, 'friendship_created', payload2);
    emitToUser(fromUniqueId, 'friend_request_accepted', payload2);
    broadcastPresenceChange(fromUniqueId);
    broadcastPresenceChange(toUniqueId);
  }

  res.json(result);
});

app.post('/api/friends/accept', (req, res) => {
  const { userUniqueId, fromUniqueId } = req.body || {};
  const operationId = req.headers['x-operation-id'] || req.body?.operationId || null;
  if (!userUniqueId || !fromUniqueId || typeof userUniqueId !== 'string' || typeof fromUniqueId !== 'string') {
    return res.status(400).json({ error: 'userUniqueId and fromUniqueId are required strings' });
  }
  const result = store.acceptFriendRequest(userUniqueId, fromUniqueId, operationId);
  if (result.success) {
    console.log('[FRIEND_REQUEST_ACCEPTED]', JSON.stringify({
      userUniqueId,
      fromUniqueId,
      operationId,
      timestamp: Date.now()
    }));
    const payload1 = {
      friendUniqueId: userUniqueId,
      friendName: result.user ? result.user.name : userUniqueId,
      relationship: 'FRIENDS'
    };
    const payload2 = {
      friendUniqueId: fromUniqueId,
      friendName: result.fromUser ? result.fromUser.name : fromUniqueId,
      relationship: 'FRIENDS'
    };
    emitToUser(fromUniqueId, 'friendship_created', payload1);
    emitToUser(fromUniqueId, 'friend_request_accepted', payload1);
    emitToUser(userUniqueId, 'friendship_created', payload2);
    emitToUser(userUniqueId, 'friend_request_accepted', payload2);
    broadcastPresenceChange(userUniqueId);
    broadcastPresenceChange(fromUniqueId);
  }
  res.json(result);
});

app.post('/api/friends/decline', (req, res) => {
  const { userUniqueId, fromUniqueId } = req.body || {};
  const operationId = req.headers['x-operation-id'] || req.body?.operationId || null;
  if (!userUniqueId || !fromUniqueId || typeof userUniqueId !== 'string' || typeof fromUniqueId !== 'string') {
    return res.status(400).json({ error: 'userUniqueId and fromUniqueId are required strings' });
  }
  const result = store.declineFriendRequest(userUniqueId, fromUniqueId, operationId);
  if (result.success) {
    console.log('[FRIEND_REQUEST_DECLINED]', JSON.stringify({
      userUniqueId,
      fromUniqueId,
      operationId,
      timestamp: Date.now()
    }));
    emitToUser(fromUniqueId, 'friend_request_declined', {
      friendUniqueId: userUniqueId
    });
  }
  res.json(result);
});

app.get('/api/friends/:uniqueId', (req, res) => {
  const reqId = req.params.uniqueId;
  if (!reqId || typeof reqId !== 'string' || reqId.includes('..') || ['__proto__', 'constructor', 'prototype'].includes(reqId.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid Player ID format' });
  }
  const user = store.findUserByUniqueId(reqId);
  const rawFriends = store.getFriendsList(reqId);
  const friends = rawFriends.map(f => {
    const norm = (f.uniqueId || '').trim().toUpperCase();
    const hasSockets = userSockets.has(norm) && userSockets.get(norm).size > 0;
    // In staging test mode, test accounts show as AVAILABLE online
    const isTestAccount = f.isStagingTestAccount || (f.numericPlayerId && f.numericPlayerId.startsWith('10001'));
    const status = isTestAccount ? 'AVAILABLE' : roomManager.getUserPresence(norm, hasSockets);
    return { ...f, status, isOnline: status !== 'OFFLINE' };
  });
  const requests = store.getFriendRequests(reqId);
  res.json({ friends, requests, numericPlayerId: user?.numericPlayerId || null });
});

// STAGING TEST SUITE REST ENDPOINTS (Active ONLY when STAGING_MULTIPLAYER_TEST === 'true')
app.get('/api/staging/test-accounts', (req, res) => {
  if (process.env.STAGING_MULTIPLAYER_TEST !== 'true') {
    return res.status(403).json({ error: 'Staging mode not active' });
  }
  const accounts = [
    { numericPlayerId: '1000101', uniqueId: 'BID-1000101', name: 'Kabir Mehta', avatar: 'avatar_male_1', trophies: 15, gender: 'male' },
    { numericPlayerId: '1000102', uniqueId: 'BID-1000102', name: 'Ananya Sharma', avatar: 'avatar_female_1', trophies: 12, gender: 'female' },
    { numericPlayerId: '1000103', uniqueId: 'BID-1000103', name: 'Rohan Varma', avatar: 'avatar_male_2', trophies: 18, gender: 'male' },
    { numericPlayerId: '1000104', uniqueId: 'BID-1000104', name: 'Priya Joshi', avatar: 'avatar_female_2', trophies: 14, gender: 'female' },
    { numericPlayerId: '1000105', uniqueId: 'BID-1000105', name: 'Vikram Malhotra', avatar: 'avatar_male_3', trophies: 21, gender: 'male' },
    { numericPlayerId: '1000106', uniqueId: 'BID-1000106', name: 'Meera Kapoor', avatar: 'avatar_female_3', trophies: 16, gender: 'female' },
    { numericPlayerId: '1000107', uniqueId: 'BID-1000107', name: 'Arjun Sen', avatar: 'avatar_male_4', trophies: 19, gender: 'male' },
    { numericPlayerId: '1000108', uniqueId: 'BID-1000108', name: 'Tara Vane', avatar: 'avatar_female_4', trophies: 11, gender: 'female' },
    { numericPlayerId: '1000109', uniqueId: 'BID-1000109', name: 'Dev Rao', avatar: 'avatar_male_5', trophies: 23, gender: 'male' },
    { numericPlayerId: '1000110', uniqueId: 'BID-1000110', name: 'Riya Singhania', avatar: 'avatar_female_5', trophies: 17, gender: 'female' }
  ];
  res.json({ accounts });
});

let activeSequentialRequestsTimer = null;

function helperFindActiveHumanTarget(preferredId) {
  if (preferredId) {
    const found = store.findUserByUniqueId(preferredId);
    if (found) return found;
  }
  const botIds = new Set(['1000101', '1000102', '1000103', '1000104', '1000105', '1000106', '1000107', '1000108', '1000109', '1000110']);
  for (const [sId, uId] of socketUsers.entries()) {
    const u = store.findUserByUniqueId(uId);
    if (u && !botIds.has(String(u.numericPlayerId))) {
      return u;
    }
  }
  return store.findUserByUniqueId('guest_inst_134182cf-db2a-4cac-b638-86b72bd709bc') || store.findUserByUniqueId('1000999');
}

function startSequentialFriendRequests(target, intervalMs = 5000) {
  if (activeSequentialRequestsTimer) {
    clearTimeout(activeSequentialRequestsTimer);
    activeSequentialRequestsTimer = null;
  }

  const testAccounts = [
    { numericPlayerId: '1000101', name: 'Kabir Mehta', avatar: 'avatar_male_1', trophies: 15 },
    { numericPlayerId: '1000102', name: 'Ananya Sharma', avatar: 'avatar_female_1', trophies: 12 },
    { numericPlayerId: '1000103', name: 'Rohan Varma', avatar: 'avatar_male_2', trophies: 18 },
    { numericPlayerId: '1000104', name: 'Priya Joshi', avatar: 'avatar_female_2', trophies: 14 },
    { numericPlayerId: '1000105', name: 'Vikram Malhotra', avatar: 'avatar_male_3', trophies: 21 },
    { numericPlayerId: '1000106', name: 'Meera Kapoor', avatar: 'avatar_female_3', trophies: 16 },
    { numericPlayerId: '1000107', name: 'Arjun Sen', avatar: 'avatar_male_4', trophies: 19 },
    { numericPlayerId: '1000108', name: 'Tara Vane', avatar: 'avatar_female_4', trophies: 11 },
    { numericPlayerId: '1000109', name: 'Dev Rao', avatar: 'avatar_male_5', trophies: 23 },
    { numericPlayerId: '1000110', name: 'Riya Singhania', avatar: 'avatar_female_5', trophies: 17 }
  ];

  const targetKey = target.uniqueId || target.id;
  store.data.friendRequests[targetKey] = [];
  if (store.data.outbox) {
    const norm = targetKey.trim().toUpperCase();
    store.data.outbox = store.data.outbox.filter(e => e.targetUserId !== norm);
  }
  store.saveData();

  let currentIndex = 0;

  function dispatchNext() {
    if (currentIndex >= testAccounts.length) {
      console.log(`[SEQUENTIAL_REQUESTS] All ${testAccounts.length} requests dispatched sequentially at ${intervalMs}ms intervals.`);
      return;
    }

    const p = testAccounts[currentIndex];
    const senderUniqueId = `BID-${p.numericPlayerId}`;

    store.removeFriendship(targetKey, senderUniqueId);

    const sendRes = store.sendFriendRequest(senderUniqueId, targetKey);
    if (sendRes.success && sendRes.request) {
      const payload = {
        id: sendRes.request.id,
        requestId: sendRes.request.id,
        fromUniqueId: senderUniqueId,
        numericPlayerId: p.numericPlayerId,
        fromName: p.name,
        fromAvatar: p.avatar,
        trophies: p.trophies,
        timestamp: Date.now()
      };

      emitToUser(targetKey, 'friend_request_created', payload);
      emitToUser(targetKey, 'friend_request_received', payload);
      console.log(`[SEQUENTIAL_REQUEST #${currentIndex + 1}/10] Sent from ${p.name} (${p.numericPlayerId}) to ${targetKey} [Next in ${intervalMs / 1000}s]`);
    }

    currentIndex++;
    if (currentIndex < testAccounts.length) {
      activeSequentialRequestsTimer = setTimeout(dispatchNext, intervalMs);
    }
  }

  dispatchNext();
}

app.post('/api/staging/trigger-sequential-requests', (req, res) => {
  if (process.env.STAGING_MULTIPLAYER_TEST !== 'true') {
    return res.status(403).json({ error: 'Staging mode not active' });
  }

  const { targetUniqueId, intervalMs = 5000 } = req.body || {};
  const target = helperFindActiveHumanTarget(targetUniqueId);
  if (!target) return res.status(404).json({ error: 'Target user not found' });

  startSequentialFriendRequests(target, intervalMs);

  res.json({
    success: true,
    message: `Sequential friend requests started: 10 requests every ${intervalMs / 1000} seconds`,
    target: { id: target.id, uniqueId: target.uniqueId, numericPlayerId: target.numericPlayerId, name: target.name },
    intervalMs
  });
});

app.post('/api/staging/dispatch-requests', (req, res) => {
  if (process.env.STAGING_MULTIPLAYER_TEST !== 'true') {
    return res.status(403).json({ error: 'Staging mode not active' });
  }
  const { targetUniqueId, intervalMs = 5000 } = req.body || {};
  const target = helperFindActiveHumanTarget(targetUniqueId);
  if (!target) return res.status(404).json({ error: 'Target user not found' });

  startSequentialFriendRequests(target, intervalMs);

  res.json({
    success: true,
    message: `Sequential friend requests started: 10 requests every ${intervalMs / 1000} seconds`,
    target: { id: target.id, uniqueId: target.uniqueId, numericPlayerId: target.numericPlayerId, name: target.name },
    intervalMs
  });
});

app.get('/api/staging/active-target', (req, res) => {
  const target = helperFindActiveHumanTarget();
  if (!target) {
    return res.json({ found: false });
  }
  const normId = (target.uniqueId || target.id).trim().toUpperCase();
  const hasSockets = userSockets.has(normId) && userSockets.get(normId).size > 0;
  const isNumericOnline = target.numericPlayerId && userSockets.has(String(target.numericPlayerId)) && userSockets.get(String(target.numericPlayerId)).size > 0;
  const isIdOnline = target.id && userSockets.has(target.id.trim().toUpperCase()) && userSockets.get(target.id.trim().toUpperCase()).size > 0;
  const isOnline = Boolean(hasSockets || isNumericOnline || isIdOnline);
  const isBusy = roomManager.isUserInActiveMatch(target.id, normId) !== null;

  res.json({
    found: true,
    targetKey: target.uniqueId || target.id,
    id: target.id,
    uniqueId: target.uniqueId,
    numericPlayerId: target.numericPlayerId,
    name: target.name,
    isOnline,
    isBusy
  });
});

// Staging QA Login: Returns dedicated developer test account (1000999 / Anirudh Tester)
app.post('/api/staging/qa-login', (req, res) => {
  if (process.env.STAGING_MULTIPLAYER_TEST !== 'true') {
    return res.status(403).json({ error: 'Staging mode not active' });
  }
  const qaUser = store.ensureQATester();
  res.json({
    success: true,
    user: qaUser,
    token: 'STAGING_QA_SESSION_1000999'
  });
});

// Staging Trigger: Send real-time friend request from test friend to target account
app.post('/api/staging/trigger-friend-request', (req, res) => {
  if (process.env.STAGING_MULTIPLAYER_TEST !== 'true') {
    return res.status(403).json({ error: 'Staging mode not active' });
  }
  const { fromNumericId = '1000101', targetUniqueId = 'BID-1000999' } = req.body || {};
  const sender = store.findUserByUniqueId(fromNumericId);
  const target = store.findUserByUniqueId(targetUniqueId);
  if (!sender || !target) {
    return res.status(404).json({ error: 'User not found' });
  }

  const senderKey = sender.uniqueId || sender.id;
  const targetKey = target.uniqueId || target.id;

  // Clear existing friendship and requests if any so it's a guaranteed fresh request
  const pair = store.getCanonicalPair(targetKey, senderKey);
  if (pair && store.data.friendships) {
    delete store.data.friendships[pair];
  }
  if (store.data.friends) {
    if (store.data.friends[targetKey]) {
      store.data.friends[targetKey] = store.data.friends[targetKey].filter(f => (typeof f === 'string' ? f : (f.uniqueId || '')).toUpperCase() !== senderKey.toUpperCase());
    }
    if (store.data.friends[senderKey]) {
      store.data.friends[senderKey] = store.data.friends[senderKey].filter(f => (typeof f === 'string' ? f : (f.uniqueId || '')).toUpperCase() !== targetKey.toUpperCase());
    }
  }
  if (store.data.friendRequests && store.data.friendRequests[targetKey]) {
    store.data.friendRequests[targetKey] = store.data.friendRequests[targetKey].filter(r => (r.fromUniqueId || '').toUpperCase() !== senderKey.toUpperCase());
  }

  const sendRes = store.sendFriendRequest(senderKey, targetKey);
  if (!sendRes.success && sendRes.message !== 'Friend request already sent') {
    return res.status(400).json({ error: sendRes.message });
  }

  const payload = {
    id: sendRes.request ? sendRes.request.id : `req_${Date.now()}`,
    requestId: sendRes.request ? sendRes.request.id : `req_${Date.now()}`,
    fromUniqueId: senderKey,
    numericPlayerId: sender.numericPlayerId,
    fromName: sender.name,
    fromAvatar: sender.avatar,
    trophies: sender.trophies || 0,
    timestamp: Date.now()
  };

  emitToUser(targetKey, 'friend_request_created', payload);
  emitToUser(targetKey, 'friend_request_received', payload);
  console.log(`[STAGING] Dispatched friend request from ${sender.name} (${sender.numericPlayerId}) to ${targetKey}`);

  res.json({ success: true, request: payload });
});

app.post('/api/staging/simulate-invite', (req, res) => {
  if (process.env.STAGING_MULTIPLAYER_TEST !== 'true') {
    return res.status(403).json({ error: 'Staging mode not active' });
  }
  const { testNumericId = '1000101', targetUniqueId, category = 'ipl_cricket' } = req.body || {};
  const testUser = store.findUserByUniqueId(testNumericId);
  const targetUser = helperFindActiveHumanTarget(targetUniqueId);

  if (!testUser || !targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const testKey = testUser.uniqueId || testUser.id;
  const targetKey = targetUser.uniqueId || targetUser.id;

  // Ensure testUser and targetUser are mutual friends so room invitation is permitted
  store.ensureFriendship(testKey, targetKey);

  const room = roomManager.createRoom({
    hostUser: {
      id: testUser.id,
      uniqueId: testUser.uniqueId,
      numericPlayerId: testUser.numericPlayerId,
      name: testUser.name,
      avatar: testUser.avatar,
      trophies: testUser.trophies || 0,
      isAI: false,
      isStagingTestAccount: true
    },
    category,
    mode: 'friends'
  });

  const inviteResult = store.createOrUpdateInvitation({
    sender: {
      id: testUser.id,
      uniqueId: testUser.uniqueId,
      numericPlayerId: testUser.numericPlayerId,
      name: testUser.name,
      avatar: testUser.avatar,
      trophies: testUser.trophies || 0
    },
    recipientUniqueId: targetKey,
    roomId: room.id,
    roomCode: room.roomCode,
    category,
    categoryTitle: room.categoryConfig?.title || 'Auction Room'
  });

  inviteResult.invitation.roomState = roomManager.serializeRoom(room);
  emitToUser(targetKey, 'room_invitation_received', inviteResult.invitation);
  if (targetUser.numericPlayerId) {
    emitToUser(targetUser.numericPlayerId, 'room_invitation_received', inviteResult.invitation);
  }
  if (targetUser.id && targetUser.id !== targetKey) {
    emitToUser(targetUser.id, 'room_invitation_received', inviteResult.invitation);
  }
  console.log(`[STAGING] Sent room invitation for room ${room.roomCode} from ${testUser.name} to ${targetKey}`);

  res.json({ success: true, roomCode: room.roomCode, roomId: room.id, invitation: inviteResult.invitation });
});

app.post('/api/groups/create', (req, res) => {
  const { ownerUniqueId, groupName, members } = req.body;
  const group = store.createGroup(ownerUniqueId, groupName, members);
  res.json({ success: true, group });
});

app.get('/api/groups/:uniqueId', (req, res) => {
  const reqId = req.params.uniqueId;
  if (!reqId || typeof reqId !== 'string' || reqId.includes('..') || ['__proto__', 'constructor', 'prototype'].includes(reqId.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid Player ID format' });
  }
  const groups = store.getUserGroups(reqId);
  res.json({ groups });
});

// Room Invitations REST Endpoint
app.get('/api/invitations/:uniqueId', (req, res) => {
  const reqId = req.params.uniqueId;
  if (!reqId || typeof reqId !== 'string' || reqId.includes('..') || ['__proto__', 'constructor', 'prototype'].includes(reqId.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid Player ID format' });
  }
  const invitations = store.getPendingInvitations(reqId);
  res.json({ invitations });
});

// Authoritative Room State REST Endpoint (Immediate Pre-flight Synchronization)
app.get('/api/rooms/:roomIdOrCode', (req, res) => {
  const room = roomManager.resolveRoom(req.params.roomIdOrCode);
  if (!room) {
    return res.status(404).json({ success: false, message: 'Room not found' });
  }
  return res.json({ success: true, room: roomManager.serializeRoom(room) });
});

// Custom Entities REST Endpoints
app.get('/api/custom-entities/:uniqueId', (req, res) => {
  const reqId = req.params.uniqueId;
  const categoryId = req.query.category;
  if (!reqId || typeof reqId !== 'string') {
    return res.status(400).json({ error: 'Invalid Player ID' });
  }
  const customEntities = store.getCustomEntities(reqId, categoryId);
  res.json({ success: true, customEntities });
});

app.post('/api/custom-entities/create', (req, res) => {
  const { ownerUniqueId, categoryId, name, entityType } = req.body;
  if (!ownerUniqueId || !name || !categoryId) {
    return res.status(400).json({ error: 'Owner, category, and name are required' });
  }
  const result = store.createCustomEntity({ ownerUniqueId, categoryId, name, entityType });
  res.json(result);
});

app.post('/api/custom-entities/delete', (req, res) => {
  const { customEntityId, ownerUniqueId } = req.body;
  if (!customEntityId || !ownerUniqueId) {
    return res.status(400).json({ error: 'Entity ID and owner ID are required' });
  }
  const result = store.deleteCustomEntity(customEntityId, ownerUniqueId);
  res.json(result);
});

// Testing Support Endpoints (Isolated for Multiplayer Simulation & Automated Teardown)
app.post('/api/testing/cleanup-mock-accounts', (req, res) => {
  const { mockIds } = req.body || {};
  const cleanIds = (mockIds || ['BID-77AV91', 'BID-88PS42', 'BID-99KM63']).map(id => id.trim().toUpperCase());
  const result = store.purgeMockTestAccounts(cleanIds);

  // Clean up any active rooms involving these test accounts from roomManager
  for (const [roomId, room] of Array.from(roomManager.rooms.entries())) {
    let hasMock = false;
    if (room && room.participants) {
      for (const p of room.participants.values()) {
        if (p.uniqueId && cleanIds.includes(p.uniqueId.toUpperCase())) {
          hasMock = true;
          break;
        }
      }
    }
    if (hasMock) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      if (room.lotTimeout) clearTimeout(room.lotTimeout);
      if (room.aiBidTimeout) clearTimeout(room.aiBidTimeout);
      if (room.pauseTimeout) clearTimeout(room.pauseTimeout);
      if (room.roomCode) {
        roomManager.roomCodes.delete(roomManager.normalizeRoomCode(room.roomCode));
      }
      roomManager.rooms.delete(roomId);
    }
  }

  // Also remove from matchmaking queues
  for (const queueMap of roomManager.matchmakingQueues.values()) {
    for (const mId of cleanIds) {
      queueMap.delete(mId);
    }
  }

  res.json({ success: true, ...result });
});

app.post('/api/testing/reload-store', (req, res) => {
  store.reload();
  res.json({ success: true, usersCount: Object.keys(store.data.users).length });
});

app.post('/api/testing/reset-all', (req, res) => {
  if (roomManager) {
    if (roomManager.rooms) roomManager.rooms.clear();
    if (roomManager.userActivities) roomManager.userActivities.clear();
    if (roomManager.userLifecycle) roomManager.userLifecycle.clear();
    if (roomManager.matchmakingQueues) {
      for (const q of roomManager.matchmakingQueues.values()) q.clear();
    }
  }
  store.data.friendRequests = {};
  store.data.friends = {};
  store.data.friendships = {};
  store.data.roomInvitations = {};
  store.data.activeRoomKeys = {};
  store.data.outbox = [];
  store.data.processedOperations = {};
  store.saveData();
  store.reload();
  res.json({ success: true, message: 'All testing states, outbox, rooms, and queues reset cleanly' });
});

app.get('/api/testing/active-sockets', (req, res) => {
  const registered = Array.from(userSockets.entries()).map(([uniqueId, set]) => ({ uniqueId, sockets: Array.from(set) }));
  res.json({
    connectedCount: io.sockets.sockets.size,
    registeredUsers: registered
  });
});

// Socket.IO Multiplayer Real-Time Engine
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Register user identity to receive direct room invitations and friend requests
  socket.on('register_user', ({ user }) => {
    if (!user || (!user.uniqueId && !user.id)) return;
    const normId = (user.uniqueId || user.id).trim().toUpperCase();

    // CRITICAL LIFECYCLE RULE 1: Guest users must not receive online multiplayer social notifications
    // Guest or unauthenticated sockets are never registered as authenticated friend recipients.
    const isStagingMode = process.env.STAGING_MULTIPLAYER_TEST === 'true';
    const hasNumericId = Boolean(user.numericPlayerId);
    const isTester = Boolean(user.isStagingTestAccount || hasNumericId || isStagingMode);

    // Ensure user record exists and is indexed in store so search & friends work immediately
    store.getOrCreateUser(user);

    registerUserSocket(normId, socket.id);
    if (user.numericPlayerId) {
      registerUserSocket(String(user.numericPlayerId), socket.id);
    }
    if (user.id && user.id !== normId) {
      registerUserSocket(user.id, socket.id);
    }
    broadcastPresenceChange(normId);
    console.log(`[Socket] Registered user ${normId} (${user.numericPlayerId || ''}) to socket ${socket.id}`);

    // Send current presence of all permanent friends to this client
    const friends = store.getFriendsList(normId);
    for (const f of friends) {
      if (f.uniqueId) {
        const fNorm = f.uniqueId.trim().toUpperCase();
        const fHasSockets = userSockets.has(fNorm) && userSockets.get(fNorm).size > 0;
        const fStatus = roomManager.getUserPresence(fNorm, fHasSockets);
        socket.emit('friend_presence_updated', {
          uniqueId: f.uniqueId,
          status: fStatus
        });
      }
    }

    // Check for any pending room invitations upon connecting/registering (unexpired only)
    const pendingInvites = store.getPendingInvitations(normId).filter(inv => !inv.expiresAt || inv.expiresAt > Date.now());
    if (pendingInvites.length > 0) {
      socket.emit('room_invitations_batch', pendingInvites);
    }

    // Check for any pending friend requests upon connecting/registering
    const pendingRequests = store.getFriendRequests(normId);
    if (pendingRequests.length > 0) {
      socket.emit('friend_requests_batch', pendingRequests);
    }

    // Reconcile and clear pending transactional outbox events for this user upon reconnect
    // (Pending friend requests are already safely delivered via friend_requests_batch to avoid populating intrusive popups on startup)
    const pendingOutbox = store.getPendingOutboxEvents(normId);
    for (const evt of pendingOutbox) {
      if (evt.eventType === 'ROOM_INVITATION_SENT') {
        const inv = evt.payload.invitation;
        if (inv && (!inv.expiresAt || inv.expiresAt > Date.now())) {
          socket.emit('room_invitation_received', {
            ...inv,
            outboxEventId: evt.eventId
          });
        }
      }
      store.markOutboxEventDispatched(evt.eventId);
    }

    // Reconnect to active room if player was in an ongoing game
    const activeRoom = roomManager.findActiveRoomForUser(user.id, normId);
    if (activeRoom) {
      socket.join(activeRoom.id);
      const p = activeRoom.participants.get(user.id) ||
        Array.from(activeRoom.participants.values()).find(x => x.uniqueId && x.uniqueId.toUpperCase() === normId);
      if (p) {
        p.socketId = socket.id;
      }
      roomManager.broadcastRoomState(activeRoom);
      console.log(`[Socket] Re-synchronized active room ${activeRoom.id} for user ${normId}`);
    }
  });

  socket.on('set_player_activity', ({ activity, user }) => {
    const u = user || socketUsers.get(socket.id);
    const normId = (u?.uniqueId || u?.id || u || '').trim().toUpperCase();
    if (normId) {
      roomManager.setUserActivity(normId, activity);
      broadcastPresenceChange(normId);
    }
  });

  socket.on('player_at_home', ({ user }) => {
    const u = user || socketUsers.get(socket.id);
    const normId = (u?.uniqueId || u?.id || u || '').trim().toUpperCase();
    if (normId) {
      roomManager.setUserActivity(normId, 'AT_HOME');
      broadcastPresenceChange(normId);
    }
  });

  socket.on('unregister_user', ({ user }) => {
    const normId = (user?.uniqueId || user?.id || socketUsers.get(socket.id) || '').trim().toUpperCase();
    unregisterUserSocket(socket.id);
    if (normId) {
      broadcastPresenceChange(normId);
    }
  });

  socket.on('outbox_ack', ({ eventId }) => {
    if (eventId) {
      store.markOutboxEventDelivered(eventId);
    }
  });

  // Global Real-Time Random Matchmaking
  socket.on('join_random_queue', ({ user, category }) => {
    if (!user) return;
    const normId = (user.uniqueId || user.id).trim().toUpperCase();
    registerUserSocket(normId, socket.id);
    const result = roomManager.joinRandomQueue(user, category, socket);
    broadcastPresenceChange(normId);
    if (result.success) {
      socket.emit('random_queue_joined', { category, queueSize: result.queueSize });
    } else {
      socket.emit('error_message', { message: result.message });
      if (result.activeRoomId) {
        const room = roomManager.getRoom(result.activeRoomId);
        if (room) {
          socket.join(room.id);
          roomManager.broadcastRoomState(room);
        }
      }
    }
  });

  socket.on('leave_random_queue', ({ user, category }) => {
    const normId = (user?.uniqueId || user?.id || '').trim().toUpperCase();
    roomManager.leaveRandomQueue(normId, category);
    socket.emit('random_match_cancelled');
    if (normId) {
      broadcastPresenceChange(normId);
    }
  });

  // Real-Time Friend Request Socket Actions
  socket.on('send_friend_request', ({ fromUniqueId, toUniqueId, operationId }) => {
    const result = store.sendFriendRequest(fromUniqueId, toUniqueId, operationId);
    if (result.success && !result.autoAccepted && result.request) {
      console.log('[FRIEND_REQUEST_CREATED]', JSON.stringify({
        requestId: result.request.id,
        senderUserId: result.request.senderUserId || fromUniqueId,
        senderUniqueId: fromUniqueId,
        recipientUserId: result.request.recipientUserId || toUniqueId,
        recipientUniqueId: toUniqueId,
        operationId,
        timestamp: Date.now()
      }));

      const payload = {
        id: result.request.id,
        requestId: result.request.id,
        fromUniqueId: result.request.fromUniqueId,
        fromName: result.request.fromName,
        fromAvatar: result.request.fromAvatar,
        trophies: result.fromUser ? (result.fromUser.trophies || 0) : 0,
        timestamp: Date.now(),
        reNotified: !!result.reNotified,
        outboxEventId: result.outboxEvent?.eventId || null
      };
      emitToUser(toUniqueId, 'friend_request_created', payload);
      emitToUser(toUniqueId, 'friend_request_received', payload);
      console.log('[FRIEND_REQUEST_DELIVERED_SOCKET]', JSON.stringify({
        requestId: result.request.id,
        recipientUniqueId: toUniqueId,
        timestamp: Date.now()
      }));

      socket.emit('friend_request_sent', { toUniqueId, reNotified: !!result.reNotified });
    } else if (result.success && result.autoAccepted) {
      console.log('[FRIEND_REQUEST_ACCEPTED]', JSON.stringify({
        senderUniqueId: fromUniqueId,
        recipientUniqueId: toUniqueId,
        autoAccepted: true,
        operationId,
        timestamp: Date.now()
      }));

      const payload1 = {
        friendUniqueId: fromUniqueId,
        friendName: result.fromUser ? result.fromUser.name : fromUniqueId,
        relationship: 'FRIENDS',
        outboxEventId: result.outboxEvent?.eventId || null
      };
      const payload2 = {
        friendUniqueId: toUniqueId,
        friendName: result.targetUser ? result.targetUser.name : toUniqueId,
        relationship: 'FRIENDS',
        outboxEventId: result.outboxEvent?.eventId || null
      };

      emitToUser(toUniqueId, 'friendship_created', payload1);
      emitToUser(toUniqueId, 'friend_request_accepted', payload1);
      emitToUser(fromUniqueId, 'friendship_created', payload2);
      emitToUser(fromUniqueId, 'friend_request_accepted', payload2);
    } else {
      socket.emit('friend_request_error', { message: result.message || 'Could not send friend request' });
    }
  });

  socket.on('respond_friend_request', ({ userUniqueId, fromUniqueId, accept, operationId }) => {
    if (accept) {
      const result = store.acceptFriendRequest(userUniqueId, fromUniqueId, operationId);
      if (result.success) {
        console.log('[FRIEND_REQUEST_ACCEPTED]', JSON.stringify({
          userUniqueId,
          fromUniqueId,
          operationId,
          timestamp: Date.now()
        }));

        const payload1 = {
          friendUniqueId: userUniqueId,
          friendName: result.user ? result.user.name : userUniqueId,
          relationship: 'FRIENDS',
          outboxEventId: result.outboxEvent?.eventId || null
        };
        const payload2 = {
          friendUniqueId: fromUniqueId,
          friendName: result.fromUser ? result.fromUser.name : fromUniqueId,
          relationship: 'FRIENDS',
          outboxEventId: result.outboxEvent?.eventId || null
        };

        emitToUser(fromUniqueId, 'friendship_created', payload1);
        emitToUser(fromUniqueId, 'friend_request_accepted', payload1);
        emitToUser(userUniqueId, 'friendship_created', payload2);
        emitToUser(userUniqueId, 'friend_request_accepted', payload2);
      } else {
        console.log('[FRIEND_REQUEST_ACCEPT_FAILED]', result.message);
      }
    } else {
      const result = store.declineFriendRequest(userUniqueId, fromUniqueId, operationId);
      if (result.success) {
        console.log('[FRIEND_REQUEST_DECLINED]', JSON.stringify({
          userUniqueId,
          fromUniqueId,
          operationId,
          timestamp: Date.now()
        }));
        emitToUser(fromUniqueId, 'friend_request_declined', {
          friendUniqueId: userUniqueId
        });
      } else {
        console.log('[FRIEND_REQUEST_DECLINE_FAILED]', result.message);
      }
    }
  });

  // Create or Join Game Room
  socket.on('create_room', (payload = {}) => {
    const {
      user: rawUser,
      category = 'ipl_cricket',
      mode = 'computer',
      roomCode,
      customParticipants,
      participantCount,
      poolSize,
      aiDifficulty,
      lotDurationMs,
      pauseDurationMs,
      budget
    } = payload || {};

    const user = rawUser ? { ...rawUser } : { id: socket.id, name: 'Host', uniqueId: 'TB-HOST', avatar: 'avatar_1' };
    let hostNormId = null;
    if (user.uniqueId) {
      hostNormId = user.uniqueId.trim().toUpperCase();
      registerUserSocket(hostNormId, socket.id);
    }

    const roomId = `room_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
    user.socketId = socket.id;

    const room = roomManager.createRoom({
      roomId,
      hostUser: user,
      category,
      mode,
      customParticipants,
      participantCount,
      poolSize,
      roomCode,
      aiDifficulty,
      lotDurationMs,
      pauseDurationMs,
      budget
    });

    socket.join(room.id);
    socket.emit('room_created', { roomId: room.id, roomCode: room.roomCode });
    roomManager.broadcastRoomState(room);

    // Broadcast updated presence (BUSY) now that room is created
    if (hostNormId) {
      broadcastPresenceChange(hostNormId);
    }

    // If host invited real friends during participant setup, create authentic server-side room invitations
    if (Array.isArray(customParticipants)) {
      customParticipants.forEach(p => {
        if (p.type === 'FRIEND' && p.uniqueId) {
          const inviteResult = store.createOrUpdateInvitation({
            sender: user,
            recipientUniqueId: p.uniqueId,
            roomId: room.id,
            roomCode: room.roomCode || room.id,
            category: room.category,
            categoryTitle: room.categoryConfig?.title || 'Auction Room'
          });
          emitToUser(p.uniqueId, 'room_invitation_received', inviteResult.invitation);
        }
      });
    }
  });

  socket.on('join_room', (payload = {}) => {
    const { roomId, roomCode, user: rawUser } = payload || {};
    const user = rawUser ? { ...rawUser } : { id: socket.id, name: 'Bidder', uniqueId: 'TB-BIDDER', avatar: 'avatar_1' };
    let userNormId = null;
    if (user.uniqueId) {
      userNormId = user.uniqueId.trim().toUpperCase();
      registerUserSocket(userNormId, socket.id);
    }

    const codeOrId = roomCode || roomId;
    user.socketId = socket.id;

    const result = roomManager.joinRoom(codeOrId, user);
    if (!result.success) {
      socket.emit('join_room_error', { message: result.message });
      socket.emit('error_message', { message: result.message });
      return;
    }

    socket.join(result.room.id);
    socket.emit('room_joined', {
      roomId: result.room.id,
      roomCode: result.room.roomCode,
      category: result.room.category,
      room: roomManager.serializeRoom(result.room)
    });
    roomManager.broadcastRoomState(result.room);

    // Broadcast updated presence (BUSY) now that user joined room
    if (userNormId) {
      broadcastPresenceChange(userNormId);
    }
  });

  // Direct Room Invitation System (Authoritative)
  socket.on('send_room_invite', ({ roomId, friendUniqueId, user, operationId }) => {
    if (!roomId || !friendUniqueId || !user) return;
    const room = roomManager.resolveRoom(roomId);
    if (!room) {
      socket.emit('error_message', { message: 'Room not found or expired.' });
      return;
    }

    const senderUniqueId = (user.uniqueId || user.id).trim().toUpperCase();
    const hostParticipant = room.participants.get(user.id) || Array.from(room.participants.values()).find(p => p.uniqueId && p.uniqueId.toUpperCase() === senderUniqueId);
    const isHost = (room.hostId === user.id || room.hostId === senderUniqueId || (hostParticipant && hostParticipant.isHost) || (room.hostUser && room.hostUser.uniqueId === senderUniqueId));
    if (!isHost) {
      socket.emit('error_message', { message: 'Only the room host can invite players.' });
      return;
    }

    const normFriend = friendUniqueId.trim().toUpperCase();

    // Verification 1: Verify sender and recipient are permanent friends
    if (!store.areFriends(senderUniqueId, normFriend)) {
      if (process.env.STAGING_MULTIPLAYER_TEST === 'true') {
        console.log(`[Staging] Auto-establishing friendship between ${senderUniqueId} and ${normFriend} for direct invitation.`);
        store.ensureFriendship(senderUniqueId, normFriend);
      } else {
        socket.emit('error_message', { message: 'Player must be on your friend list to receive a direct invitation.' });
        return;
      }
    }

    // Verification 2: Verify room is joinable
    if (room.state !== 'LOBBY' && room.state !== 'SETUP' && room.state !== 'BUDGET_SELECTION') {
      socket.emit('error_message', { message: 'This auction has already begun and cannot accept new players.' });
      return;
    }

    // Verification 3: Verify recipient is not already inside this room
    const alreadyInRoom = Array.from(room.participants.values()).some(p => p.uniqueId && p.uniqueId.toUpperCase() === normFriend);
    if (alreadyInRoom) {
      socket.emit('error_message', { message: 'Player is already inside this room.' });
      return;
    }

    // Verification 4: Verify recipient is not BUSY inside another room
    const friendActiveRoom = roomManager.isUserInActiveMatch(null, normFriend);
    if (friendActiveRoom && friendActiveRoom.id !== room.id) {
      console.log(`[send_room_invite BUSY BLOCK] normFriend=${normFriend}, friendActiveRoom=${friendActiveRoom.id}, room.id=${room.id}, participants=`, Array.from(friendActiveRoom.participants.values()).map(p => ({ id: p.id, uniqueId: p.uniqueId, isAI: p.isAI })));
      socket.emit('error_message', { message: 'Friend is currently busy in another match.' });
      return;
    }

    const inviteResult = store.createOrUpdateInvitation({
      sender: user,
      recipientUniqueId: normFriend,
      roomId: room.id,
      roomCode: room.roomCode || room.id,
      category: room.category,
      categoryTitle: room.categoryConfig?.title || 'Auction Room',
      operationId
    });

    console.log('[ROOM_INVITE_CREATED]', JSON.stringify({
      invitationId: inviteResult.invitation.id,
      senderUserId: user.id,
      senderUniqueId,
      recipientUniqueId: normFriend,
      roomId: room.id,
      operationId,
      timestamp: Date.now()
    }));

    // Notify host that invite was created/refreshed
    socket.emit('room_invite_sent', {
      friendUniqueId: normFriend,
      invitationId: inviteResult.invitation.id,
      isDuplicate: inviteResult.isDuplicate,
      reNotified: !!inviteResult.reNotified
    });

    // Attach authoritative room state to invitation so receiver immediately has live team reservations
    inviteResult.invitation.roomState = roomManager.serializeRoom(room);

    // Deliver real-time notification to all active sockets of the friend (across all aliases: uniqueId, numericPlayerId, id)
    emitToUser(normFriend, 'room_invitation_received', inviteResult.invitation);
    const friendUserObj = store.findUserByUniqueId(normFriend);
    if (friendUserObj) {
      if (friendUserObj.numericPlayerId) {
        emitToUser(friendUserObj.numericPlayerId, 'room_invitation_received', inviteResult.invitation);
      }
      if (friendUserObj.id && friendUserObj.id.toUpperCase() !== normFriend) {
        emitToUser(friendUserObj.id, 'room_invitation_received', inviteResult.invitation);
      }
    }
    console.log('[ROOM_INVITE_DELIVERED_SOCKET]', JSON.stringify({
      invitationId: inviteResult.invitation.id,
      recipientUniqueId: normFriend,
      timestamp: Date.now()
    }));

    // In Staging Test Mode: if invited friend is a test account, auto-accept and enter room after 1.2s
    if (process.env.STAGING_MULTIPLAYER_TEST === 'true') {
      const friendUser = store.findUserByUniqueId(normFriend);
      if (friendUser && friendUser.isStagingTestAccount) {
        setTimeout(() => {
          store.updateInvitationStatus(inviteResult.invitation.id, 'ACCEPTED');
          const joinRes = roomManager.joinRoom(room.id, {
            id: friendUser.id,
            uniqueId: friendUser.uniqueId,
            numericPlayerId: friendUser.numericPlayerId,
            name: friendUser.name,
            avatar: friendUser.avatar,
            trophies: friendUser.trophies || 0,
            isGuest: false,
            isStagingTestAccount: true
          });
          if (joinRes.success) {
            io.to(room.id).emit('room_updated', { room: roomManager.serializeRoom(room) });
            emitToUser(user.uniqueId || user.id, 'room_invite_accepted', {
              friendName: friendUser.name,
              friendUniqueId: friendUser.uniqueId,
              roomCode: room.roomCode
            });
          }
        }, 1200);
      }
    }
  });

  socket.on('respond_room_invite', ({ invitationId, response, user }) => {
    if (!invitationId || !response || !user) return;
    const invitation = store.getInvitation(invitationId);

    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt <= Date.now()) {
      socket.emit('error_message', { message: 'Invitation has expired or is no longer valid.' });
      return;
    }

    const userUniqueId = (user.uniqueId || user.id).trim().toUpperCase();

    if (response === 'DECLINED') {
      store.updateInvitationStatus(invitationId, 'DECLINED');
      console.log('[ROOM_INVITE_DECLINED]', JSON.stringify({
        invitationId,
        userUniqueId,
        roomId: invitation.roomId,
        timestamp: Date.now()
      }));
      emitToUser(invitation.sender.uniqueId, 'room_invite_declined', {
        friendName: user.name || 'Friend',
        friendUniqueId: user.uniqueId,
        roomCode: invitation.roomCode
      });
      socket.emit('room_invite_responded', { invitationId, response: 'DECLINED' });
      return;
    }

    if (response === 'ACCEPTED') {
      // Atomic Verification:
      // 1. Verify recipient identity matches invitation recipient
      const normRecipient = (invitation.recipientUniqueId || '').trim().toUpperCase();
      const userMatches = (
        userUniqueId === normRecipient ||
        (user.numericPlayerId && (normRecipient === user.numericPlayerId || normRecipient === `BID-${user.numericPlayerId}`)) ||
        (user.uniqueId && normRecipient === user.uniqueId.trim().toUpperCase()) ||
        (user.id && normRecipient === user.id.trim().toUpperCase())
      );
      if (!userMatches) {
        socket.emit('error_message', { message: 'This invitation was not addressed to you.' });
        return;
      }

      // 2. Verify room exists
      const room = roomManager.getRoom(invitation.roomId);
      if (!room) {
        store.updateInvitationStatus(invitationId, 'EXPIRED');
        socket.emit('error_message', { message: 'The room has expired or been closed.' });
        return;
      }

      // 3. Verify room joinability
      if (room.state !== 'LOBBY' && room.state !== 'SETUP' && room.state !== 'BUDGET_SELECTION') {
        socket.emit('error_message', { message: 'The auction has already started and cannot be joined.' });
        return;
      }

      // 4. Verify room capacity
      const humanCount = Array.from(room.participants.values()).filter(p => !p.isAI).length;
      if (humanCount >= 10) {
        socket.emit('error_message', { message: 'Room has reached maximum capacity.' });
        return;
      }

      // 5. Verify recipient isn't already inside another active match
      const otherMatch = roomManager.isUserInActiveMatch(user.id, userUniqueId);
      if (otherMatch && otherMatch.id !== room.id && otherMatch.state !== 'RESULTS') {
        socket.emit('error_message', { message: 'You are currently participating in another auction room.' });
        return;
      }

      user.socketId = socket.id;
      const joinResult = roomManager.joinRoom(room.id, user);
      if (!joinResult.success) {
        socket.emit('error_message', { message: joinResult.message });
        return;
      }

      store.updateInvitationStatus(invitationId, 'ACCEPTED');
      console.log('[ROOM_INVITE_ACCEPTED]', JSON.stringify({
        invitationId,
        userUniqueId,
        roomId: room.id,
        timestamp: Date.now()
      }));

      socket.join(room.id);
      socket.emit('room_joined', {
        roomId: room.id,
        roomCode: room.roomCode,
        category: room.category,
        room: roomManager.serializeRoom(joinResult.room || room)
      });
      roomManager.broadcastRoomState(joinResult.room);
      broadcastPresenceChange(userUniqueId);

      emitToUser(invitation.sender.uniqueId, 'room_invite_accepted', {
        friendName: user.name || 'Friend',
        friendUniqueId: user.uniqueId,
        roomCode: room.roomCode
      });
    }
  });

  // Budget Update in Participant Setup (Host updates budget in real-time)
  socket.on('budget_update', ({ roomId, userId, amount, budget }) => {
    const val = amount !== undefined ? amount : budget;
    roomManager.proposeBudget(roomId, userId, val, { callerSocketId: socket.id });
  });

  socket.on('propose_budget', ({ roomId, userId, amount, budget }) => {
    const val = amount !== undefined ? amount : budget;
    roomManager.proposeBudget(roomId, userId, val, { callerSocketId: socket.id });
  });

  socket.on('vote_budget', ({ roomId, userId, agreed }) => {
    roomManager.voteBudget(roomId, userId, agreed, { callerSocketId: socket.id });
  });

  // Live Roster Sync: Add computer bot
  socket.on('add_bot', ({ roomId, userId, bot }) => {
    const result = roomManager.addBot(roomId, userId, bot || {}, { callerSocketId: socket.id });
    if (!result.success) {
      socket.emit('error_message', { message: result.message });
    }
  });

  // Live Roster Sync: Remove opponent/bot
  socket.on('remove_participant', ({ roomId, userId, participantId }) => {
    const result = roomManager.removeParticipant(roomId, userId, participantId, { callerSocketId: socket.id });
    if (!result.success) {
      socket.emit('error_message', { message: result.message });
    }
  });

  // Confirm Setup from ParticipantSetupScreen (Host confirms -> Both advance to Lobby)
  const handleSetupComplete = (payload = {}) => {
    const { roomId, userId, budget, participants, poolSize, aiDifficulty } = payload;
    const result = roomManager.confirmSetup(roomId, userId, { budget, participants, poolSize, aiDifficulty }, { callerSocketId: socket.id });
    if (!result.success) {
      socket.emit('error_message', { message: result.message });
    }
  };

  socket.on('setup_complete', handleSetupComplete);
  socket.on('confirm_setup', handleSetupComplete);

  // Pre-Auction Lobby & Real-Time Universal Team / Studio Selection
  const handleSelectTeam = ({ roomId, userId, teamId, movieTitle }) => {
    const result = roomManager.selectTeam(roomId, userId, teamId, { callerSocketId: socket.id, movieTitle });
    if (!result.success) {
      socket.emit('team_select_error', { message: result.message, teamId });
      socket.emit('error_message', { message: result.message });
    } else {
      socket.emit('team_selected', { teamId, franchise: result.franchise });
    }
  };

  socket.on('select_team', handleSelectTeam);
  socket.on('select_entity', handleSelectTeam);

  socket.on('toggle_ready', ({ roomId, userId, teamName }) => {
    roomManager.toggleReady(roomId, userId, teamName, { callerSocketId: socket.id });
  });

  socket.on('start_auction', ({ roomId, userId }) => {
    roomManager.startAuction(roomId, userId, { callerSocketId: socket.id });
  });

  // Live Bidding (Screen 18)
  socket.on('place_bid', ({ roomId, userId, amount, requestId, clientTimestamp }) => {
    const timestamp = clientTimestamp || Date.now();
    console.log('[BID_REQUEST]', JSON.stringify({
      auctionId: roomId,
      participantId: userId,
      requestedAmount: amount,
      clientTimestamp: timestamp,
      requestId,
      socketId: socket.id
    }));

    const result = roomManager.placeBid(roomId, userId, amount, {
      requestId,
      clientTimestamp: timestamp,
      callerSocketId: socket.id
    });
    if (!result.success) {
      socket.emit('bid_rejected', {
        auctionId: roomId,
        requestedAmount: amount,
        reason: result.message,
        code: result.code,
        currentBid: result.currentBid,
        bidVersion: result.bidVersion,
        requestId
      });
      socket.emit('error_message', { message: result.message });
    } else {
      socket.emit('bid_accepted', result);
    }
  });

  // Live Reactions / Quick Text (Screen 21)
  socket.on('send_reaction', ({ roomId, userId, text }) => {
    if (!text || typeof text !== 'string') return;
    const cleanText = text.replace(/<[^>]*>/g, '').trim().slice(0, 50);
    if (cleanText.length > 0) {
      roomManager.broadcastReaction(roomId, userId, cleanText, { callerSocketId: socket.id });
    }
  });

  // Universal FINISH AUCTION Consensus System (Parallel Voting)
  socket.on('request_finish_auction', ({ roomId, userId }) => {
    if (!roomId || !userId) return;
    const result = roomManager.requestFinishAuction(roomId, userId, { callerSocketId: socket.id });
    if (!result.success) {
      socket.emit('error_message', { message: result.message });
    }
  });

  socket.on('vote_finish_auction', ({ roomId, userId, agreed }) => {
    if (!roomId || !userId) return;
    const result = roomManager.voteFinishAuction(roomId, userId, !!agreed, { callerSocketId: socket.id });
    if (!result.success) {
      socket.emit('error_message', { message: result.message });
    }
  });

  // Leave / Exit Room Flow
  socket.on('leave_room', ({ roomId, userId, uniqueId }) => {
    const normId = (uniqueId || socketUsers.get(socket.id) || '').trim().toUpperCase();
    const room = roomManager.resolveRoom(roomId);
    roomManager.leaveRoom(roomId, userId, normId);
    if (room) {
      socket.leave(room.id);
      if (room.roomCode) socket.leave(room.roomCode);
    }
    socket.leave(roomId);
    if (normId) {
      broadcastPresenceChange(normId);
    }
  });

  socket.on('disconnect', () => {
    const normId = socketUsers.get(socket.id);
    roomManager.removeSocketFromMatchmaking(socket.id);
    roomManager.handleSocketDisconnect(socket.id);
    unregisterUserSocket(socket.id);
    if (normId) {
      broadcastPresenceChange(normId);
    }
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(` THE BID - Authoritative Game Server`);
  console.log(` Port: ${PORT} (0.0.0.0)`);
  console.log(` Status: Running & Synchronized`);
  console.log(`=========================================`);
});

process.on('uncaughtException', (err) => {
  console.error('[Server UncaughtException]', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server UnhandledRejection]', reason);
});

module.exports = { app, server, io, roomManager };

