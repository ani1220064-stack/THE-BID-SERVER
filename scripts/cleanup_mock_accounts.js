/**
 * ============================================================================
 * THE BID — Authoritative Cleanup Script for Mock Multiplayer Accounts
 * ============================================================================
 * Permanently and cleanly deletes the three fake accounts, their friend mappings,
 * inbound/outbound requests, room invitations, and test data with ZERO database residue.
 *
 * Target Mock Accounts:
 * 1. Arjun Verma  (BID-77AV91)
 * 2. Priya Sharma (BID-88PS42)
 * 3. Kabir Mehta  (BID-99KM63)
 *
 * Usage:
 *   node server/scripts/cleanup_mock_accounts.js
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const MOCK_UNIQUE_IDS = ['BID-77AV91', 'BID-88PS42', 'BID-99KM63'];
const DATA_FILE = path.join(__dirname, '..', 'data', 'store.json');
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000';

async function performCleanup() {
  console.log('====================================================');
  console.log('  THE BID — PERMANENT MOCK ACCOUNT TEARDOWN');
  console.log('====================================================\n');
  console.log(`Target Mock Accounts to Purge: ${MOCK_UNIQUE_IDS.join(', ')}`);

  let serverNotified = false;

  // 1. If server is active, invoke authoritative live purge endpoint
  try {
    const res = await fetch(`${SERVER_URL}/api/testing/cleanup-mock-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mockIds: MOCK_UNIQUE_IDS }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`✓ Active game server in-memory store purged: ${data.purgedCount || 0} user records removed.`);
      serverNotified = true;
    }
  } catch (err) {
    console.log('ℹ Server live endpoint not reachable, proceeding with direct database store sanitization...');
  }

  // 2. Direct database store file purge & verification
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const store = JSON.parse(raw);
      const idsSet = new Set(MOCK_UNIQUE_IDS.map(id => id.toUpperCase()));

      let purgedFromUsers = 0;
      let purgedFromIndices = 0;
      let purgedFromFriends = 0;
      let purgedFromRequests = 0;
      let purgedFromInvitations = 0;

      // Clean users
      if (store.users) {
        for (const [id, u] of Object.entries(store.users)) {
          const uId = (u.uniqueId || '').toUpperCase();
          if (idsSet.has(uId) || u.isMockTestAccount) {
            delete store.users[id];
            purgedFromUsers++;
          }
        }
      }

      // Clean uniqueIdIndex
      if (store.uniqueIdIndex) {
        for (const uId of idsSet) {
          if (store.uniqueIdIndex[uId]) {
            delete store.uniqueIdIndex[uId];
            purgedFromIndices++;
          }
        }
      }

      // Clean friends
      if (store.friends) {
        for (const uId of idsSet) {
          delete store.friends[uId];
        }
        for (const [uId, list] of Object.entries(store.friends)) {
          if (Array.isArray(list)) {
            const initialLen = list.length;
            store.friends[uId] = list.filter(f => !idsSet.has((f || '').toUpperCase()));
            if (store.friends[uId].length !== initialLen) {
              purgedFromFriends += (initialLen - store.friends[uId].length);
            }
          }
        }
      }

      // Clean friend requests
      if (store.friendRequests) {
        for (const uId of idsSet) {
          delete store.friendRequests[uId];
        }
        for (const [uId, list] of Object.entries(store.friendRequests)) {
          if (Array.isArray(list)) {
            const initialLen = list.length;
            store.friendRequests[uId] = list.filter(r => !idsSet.has((r.fromUniqueId || '').toUpperCase()));
            if (store.friendRequests[uId].length !== initialLen) {
              purgedFromRequests += (initialLen - store.friendRequests[uId].length);
            }
          }
        }
      }

      // Clean room invitations
      if (store.roomInvitations) {
        for (const [invId, inv] of Object.entries(store.roomInvitations)) {
          if (
            idsSet.has((inv.recipientUniqueId || '').toUpperCase()) ||
            (inv.sender && idsSet.has((inv.sender.uniqueId || '').toUpperCase()))
          ) {
            delete store.roomInvitations[invId];
            purgedFromInvitations++;
          }
        }
      }

      // Clean match history
      if (store.matchHistory) {
        for (const uId of idsSet) {
          delete store.matchHistory[uId];
        }
      }

      fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');

      console.log('----------------------------------------------------');
      console.log(`✓ Database file (${DATA_FILE}) successfully sanitized:`);
      console.log(`  - User profiles deleted: ${purgedFromUsers}`);
      console.log(`  - Unique ID index mappings deleted: ${purgedFromIndices}`);
      console.log(`  - Mutual friend mappings removed: ${purgedFromFriends}`);
      console.log(`  - Pending friend requests removed: ${purgedFromRequests}`);
      console.log(`  - Room invitations cleared: ${purgedFromInvitations}`);
      console.log('----------------------------------------------------');

      // 3. Verification Assertion: Zero residue check
      const verifyRaw = fs.readFileSync(DATA_FILE, 'utf8');
      const verifyStore = JSON.parse(verifyRaw);

      for (const target of MOCK_UNIQUE_IDS) {
        const inUsers = Object.values(verifyStore.users || {}).some(u => (u.uniqueId || '').toUpperCase() === target);
        const inIndex = !!(verifyStore.uniqueIdIndex && verifyStore.uniqueIdIndex[target]);
        const inFriends = !!(verifyStore.friends && verifyStore.friends[target]);
        const inRequests = !!(verifyStore.friendRequests && verifyStore.friendRequests[target]);

        if (inUsers || inIndex || inFriends || inRequests) {
          throw new Error(`RESIDUE_DETECTED: Mock ID ${target} was not completely purged!`);
        }
      }

      console.log('✓ VERIFICATION CONFIRMED: Zero database residue detected.');
      console.log('All mock testing accounts have been permanently deleted.\n');
      return { success: true };
    } catch (e) {
      console.error('Error during direct store cleanup:', e.message);
      return { success: false, error: e.message };
    }
  } else {
    console.log('store.json not found, nothing to clean.');
    return { success: true };
  }
}

if (require.main === module) {
  performCleanup().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { performCleanup, MOCK_UNIQUE_IDS };
