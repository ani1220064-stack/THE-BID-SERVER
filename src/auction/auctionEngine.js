// THE BID: Authoritative Auction Engine & Room State Machine
// Adheres strictly to Master Game Design Specification (Screens 12, 13, 15, 18, 19, 20, 21, 22, 23, 27)

const { IPL_PLAYERS, formatCurrency } = require('./iplData');
const { shouldAiBid, AI_BOT_PROFILES } = require('./aiOpponent');
const { evaluateAuctionResults } = require('./aiAnalysis');
const db = require('../db');

class AuctionEngine {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> Room
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  createRoom({ id, name, host, mode = 'computer', initialBudget = 1000000000 }) {
    // 1000000000 = ₹100 Cr
    const room = {
      id,
      name: name || `IPL Arena #${id.slice(-4)}`,
      mode, // 'computer' | 'random' | 'friends'
      hostId: host.id,
      status: 'budget_agreement', // 'lobby' | 'budget_agreement' | 'live' | 'completed'
      startingBudget: initialBudget,
      proposedBudget: initialBudget,
      budgetAgreed: false,
      participants: {}, // userId -> participant
      playerPool: [...IPL_PLAYERS],
      currentItemIndex: 0,
      currentItem: null,
      currentBid: 0,
      currentBidder: null,
      timer: 10,
      timerInterval: null,
      soldCount: 0,
      unsoldCount: 0,
      totalItems: IPL_PLAYERS.length,
      history: []
    };

    // Add host as participant
    room.participants[host.id] = {
      id: host.id,
      displayName: host.displayName,
      avatar: host.avatarUrl || host.avatar || '/avatars/user.png',
      bidId: host.bidId,
      isHost: true,
      isReady: false,
      squad: [],
      spent: 0,
      remainingBudget: initialBudget,
      budgetAgreement: true, // host starts agreed to default
      isBot: false
    };

    // If computer mode, add AI bot opponents
    if (mode === 'computer') {
      const botsToAdd = AI_BOT_PROFILES.slice(0, 3);
      botsToAdd.forEach(bot => {
        room.participants[bot.id] = {
          id: bot.id,
          displayName: bot.displayName,
          avatar: bot.avatar,
          bidId: bot.bidId,
          isHost: false,
          isReady: true,
          squad: [],
          spent: 0,
          remainingBudget: initialBudget,
          budgetAgreement: true,
          isBot: true,
          botStyle: bot.style
        };
      });
      room.budgetAgreed = true; // In computer mode, bots automatically agree
      room.status = 'lobby';
    }

    this.rooms.set(id, room);
    return room;
  }

  joinRoom(roomId, user) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Auction room not found');

    if (!room.participants[user.id]) {
      room.participants[user.id] = {
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatarUrl || user.avatar || '/avatars/user.png',
        bidId: user.bidId,
        isHost: false,
        isReady: false,
        squad: [],
        spent: 0,
        remainingBudget: room.startingBudget,
        budgetAgreement: null, // must actively agree
        isBot: false
      };
      // Whenever a new participant joins, budget agreement must be re-evaluated
      if (room.mode !== 'computer') {
        room.budgetAgreed = false;
        room.status = 'budget_agreement';
      }
    }

    this.broadcastRoomState(roomId);
    return room;
  }

  leaveRoom(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    delete room.participants[userId];
    if (Object.keys(room.participants).filter(id => !room.participants[id].isBot).length === 0) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      this.rooms.delete(roomId);
    } else {
      this.broadcastRoomState(roomId);
    }
  }

  // SCREEN 12 & 13: Budget Selection & Unanimous Agreement Flow
  proposeBudget(roomId, userId, newBudget) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'live' || room.status === 'completed') {
      throw new Error('Cannot change budget once auction has started');
    }

    const budgetNum = Number(newBudget);
    if (isNaN(budgetNum) || budgetNum < 100000000 || budgetNum > 2500000000) {
      throw new Error('Budget must be between ₹10 Cr and ₹250 Cr');
    }

    room.proposedBudget = budgetNum;
    room.budgetAgreed = false;
    room.status = 'budget_agreement';

    // Reset agreement for everyone except the proposer
    Object.values(room.participants).forEach(p => {
      if (p.isBot) {
        p.budgetAgreement = true;
      } else if (p.id === userId) {
        p.budgetAgreement = true;
      } else {
        p.budgetAgreement = null; // resets to unconfirmed state
      }
    });

    this.io.to(roomId).emit('BUDGET_PROPOSED', {
      proposedBudget: room.proposedBudget,
      proposedBy: room.participants[userId]?.displayName || 'Player',
      participants: room.participants
    });
    this.broadcastRoomState(roomId);
  }

  respondBudgetAgreement(roomId, userId, agree) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    if (room.participants[userId]) {
      room.participants[userId].budgetAgreement = !!agree;
    }

    // Check if ALL participants agree
    const participantsList = Object.values(room.participants);
    const allAgreed = participantsList.every(p => p.budgetAgreement === true);

    if (allAgreed) {
      room.budgetAgreed = true;
      room.startingBudget = room.proposedBudget;
      // Lock budget for each participant
      participantsList.forEach(p => {
        p.remainingBudget = room.startingBudget;
        p.spent = 0;
      });
      room.status = 'lobby';
      this.io.to(roomId).emit('BUDGET_LOCKED', {
        startingBudget: room.startingBudget,
        participants: room.participants
      });
    }

    this.broadcastRoomState(roomId);
  }

  setPlayerReady(roomId, userId, isReady) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    if (room.participants[userId]) {
      room.participants[userId].isReady = !!isReady;
    }

    this.broadcastRoomState(roomId);
  }

  // SCREEN 14 -> 15: Start Live Auction
  startAuction(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (!room.budgetAgreed) throw new Error('Unanimous budget agreement required before starting');

    room.status = 'live';
    room.currentItemIndex = 0;
    this.presentNextItem(roomId);
  }

  // SCREEN 15, 16, 17: Present Next Player & Server Timer Initiation
  presentNextItem(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.currentItemIndex >= room.playerPool.length) {
      this.completeAuction(roomId);
      return;
    }

    if (room.timerInterval) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
    }

    room.currentItem = room.playerPool[room.currentItemIndex];
    room.currentBid = 0;
    room.currentBidder = null;
    room.timer = 10; // 10-second authoritative timer

    this.io.to(roomId).emit('NEW_ITEM_PRESENTED', {
      item: room.currentItem,
      itemNumber: room.currentItemIndex + 1,
      totalItems: room.playerPool.length,
      currentBid: 0,
      currentBidder: null,
      timer: 10,
      soldCount: room.soldCount,
      unsoldCount: room.unsoldCount
    });

    this.startServerTimer(roomId);
  }

  // SCREEN 19: Server-Authoritative 10-Second Timer
  startServerTimer(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.timerInterval) clearInterval(room.timerInterval);

    room.timerInterval = setInterval(() => {
      room.timer -= 1;

      // Broadcast synchronized countdown
      this.io.to(roomId).emit('TIMER_TICK', {
        timer: room.timer,
        currentBid: room.currentBid,
        currentBidder: room.currentBidder
      });

      // AI Bot bidding consideration (if active)
      if (room.mode === 'computer' && room.timer >= 2) {
        this.checkAiBids(roomId);
      }

      // When timer hits 0
      if (room.timer <= 0) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
        this.handleTimerExpiry(roomId);
      }
    }, 1000);
  }

  // SCREEN 18: Bidding Controls & Atomic Bid Validation
  placeBid(roomId, userId, incrementAmount) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Auction room not found');
    if (room.status !== 'live') throw new Error('Auction is not live');
    if (!room.currentItem) throw new Error('No active player being auctioned');

    const participant = room.participants[userId];
    if (!participant) throw new Error('Participant not in room');

    // Rule: Cannot bid against oneself
    if (room.currentBidder && room.currentBidder.id === userId) {
      throw new Error('You are already the leading bidder');
    }

    let nextBidAmount;
    if (room.currentBid === 0) {
      // First bid starts at base price or base price + increment
      nextBidAmount = room.currentItem.basePrice + (incrementAmount || 0);
    } else {
      nextBidAmount = room.currentBid + (incrementAmount || 10000000); // default 1 Cr
    }

    // Validation: Budget limit
    if (nextBidAmount > participant.remainingBudget) {
      throw new Error(`Insufficient budget! Bid ₹${(nextBidAmount/10000000).toFixed(2)} Cr exceeds remaining purse ₹${(participant.remainingBudget/10000000).toFixed(2)} Cr`);
    }

    // Atomic acceptance of bid
    room.currentBid = nextBidAmount;
    room.currentBidder = {
      id: participant.id,
      displayName: participant.displayName,
      avatar: participant.avatar,
      bidId: participant.bidId
    };

    // SCREEN 19 & 20: Reset 10-second timer on higher bid & trigger Outbid Event
    room.timer = 10;

    const outbidData = {
      bidder: room.currentBidder,
      amount: room.currentBid,
      amountDisplay: formatCurrency(room.currentBid),
      timer: 10,
      timestamp: Date.now()
    };

    this.io.to(roomId).emit('OUTBID_EVENT', outbidData);
    this.broadcastRoomState(roomId);
    return outbidData;
  }

  // AI Opponents Evaluator
  checkAiBids(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.currentItem || room.timer <= 1) return;

    const botParticipants = Object.values(room.participants).filter(p => p.isBot);
    for (const bot of botParticipants) {
      const willBid = shouldAiBid({
        bot,
        room,
        currentPlayer: room.currentItem,
        currentBid: room.currentBid,
        currentBidderId: room.currentBidder?.id,
        timeRemaining: room.timer
      });

      if (willBid) {
        // Stagger bot bid slightly
        setTimeout(() => {
          if (this.rooms.get(roomId)?.timer > 0 && room.currentBidder?.id !== bot.id) {
            try {
              let increment = 10000000;
              if (room.currentBid < 50000000) increment = 5000000;
              this.placeBid(roomId, bot.id, increment);
            } catch (e) {
              // Bid failed due to state change, silent ignore
            }
          }
        }, 800 + Math.random() * 1200);
        break; // Only one bot bid evaluated per tick
      }
    }
  }

  // SCREEN 22 & 23: SOLD / UNSOLD System
  handleTimerExpiry(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.currentBidder) {
      // SCREEN 22: SOLD!
      const winner = room.participants[room.currentBidder.id];
      const soldItem = {
        ...room.currentItem,
        soldPrice: room.currentBid,
        soldPriceDisplay: formatCurrency(room.currentBid),
        soldTo: winner.displayName
      };

      winner.squad.push(soldItem);
      winner.spent += room.currentBid;
      winner.remainingBudget -= room.currentBid;
      room.soldCount += 1;

      this.io.to(roomId).emit('ITEM_SOLD', {
        item: soldItem,
        winner: {
          id: winner.id,
          displayName: winner.displayName,
          avatar: winner.avatar,
          remainingBudget: winner.remainingBudget,
          spent: winner.spent,
          squadCount: winner.squad.length
        },
        finalAmount: room.currentBid,
        finalAmountDisplay: formatCurrency(room.currentBid)
      });
    } else {
      // SCREEN 23: UNSOLD!
      room.unsoldCount += 1;
      this.io.to(roomId).emit('ITEM_UNSOLD', {
        item: room.currentItem
      });
    }

    this.broadcastRoomState(roomId);

    // 4-second dramatic pause for SOLD/UNSOLD showcase, then transition to next player
    setTimeout(() => {
      room.currentItemIndex += 1;
      this.presentNextItem(roomId);
    }, 3800);
  }

  // SCREEN 28, 29, 30, 31: Final Results & AI Analysis
  async completeAuction(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.status = 'completed';

    // Prepare teams for AI analysis
    const teams = Object.values(room.participants).map(p => ({
      participant: p,
      players: p.squad,
      totalSpent: p.spent,
      remainingBudget: p.remainingBudget
    }));

    // AI Analysis calculation
    const analyzedRankings = evaluateAuctionResults(teams, room.startingBudget);
    const winnerAnalysis = analyzedRankings.find(r => r.isWinner);

    const completionPayload = {
      roomId,
      startingBudget: room.startingBudget,
      totalItemsAuctioned: room.playerPool.length,
      soldCount: room.soldCount,
      unsoldCount: room.unsoldCount,
      rankings: analyzedRankings,
      winner: winnerAnalysis,
      teams: Object.values(room.participants).map(p => ({
        id: p.id,
        displayName: p.displayName,
        avatar: p.avatar,
        bidId: p.bidId,
        squad: p.squad,
        spent: p.spent,
        remainingBudget: p.remainingBudget
      }))
    };

    // Save match history to database for persistent players
    for (const rankItem of analyzedRankings) {
      const participant = room.participants[rankItem.participantId];
      if (participant && !participant.isBot) {
        try {
          await db.saveMatchHistory({
            userId: participant.id,
            auctionWorld: 'IPL',
            roomId,
            startingBudget: room.startingBudget,
            totalSpent: participant.spent,
            remainingBudget: participant.remainingBudget,
            playersBought: participant.squad,
            finalRank: rankItem.rank,
            isWinner: rankItem.isWinner,
            aiAnalysis: rankItem,
            participants: Object.values(room.participants).map(p => ({
              id: p.id,
              name: p.displayName,
              isBot: p.isBot
            }))
          });
        } catch (err) {
          console.error('[DB] Failed to save match history for player', participant.id, err.message);
        }
      }
    }

    this.io.to(roomId).emit('AUCTION_COMPLETED', completionPayload);
    this.broadcastRoomState(roomId);
  }

  // SCREEN 21: Reactions / Quick Text
  sendReaction(roomId, userId, text) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const participant = room.participants[userId];
    if (!participant) return;

    this.io.to(roomId).emit('REACTION_EVENT', {
      userId,
      displayName: participant.displayName,
      text,
      timestamp: Date.now()
    });
  }

  broadcastRoomState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.io.to(roomId).emit('ROOM_STATE', {
      id: room.id,
      name: room.name,
      mode: room.mode,
      status: room.status,
      hostId: room.hostId,
      startingBudget: room.startingBudget,
      proposedBudget: room.proposedBudget,
      budgetAgreed: room.budgetAgreed,
      participants: room.participants,
      currentItem: room.currentItem,
      currentItemIndex: room.currentItemIndex,
      totalItems: room.totalItems,
      currentBid: room.currentBid,
      currentBidder: room.currentBidder,
      timer: room.timer,
      soldCount: room.soldCount,
      unsoldCount: room.unsoldCount
    });
  }
}

module.exports = AuctionEngine;
