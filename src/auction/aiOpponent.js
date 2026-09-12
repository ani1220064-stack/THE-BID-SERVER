// THE BID: Computer / AI Opponent Engine
// Follows Screen 26 (Computer / AI Opponents)

const AI_BOT_PROFILES = [
  { id: "bot_csk", displayName: "Chennai Super Kings (AI)", avatar: "/avatars/csk.png", bidId: "TB-BOTCSK", style: "Tactical & Veteran" },
  { id: "bot_mi", displayName: "Mumbai Indians (AI)", avatar: "/avatars/mi.png", bidId: "TB-BOTMI", style: "Aggressive Marquee" },
  { id: "bot_rcb", displayName: "Royal Challengers (AI)", avatar: "/avatars/rcb.png", bidId: "TB-BOTRCB", style: "Power Firepower" },
  { id: "bot_kkr", displayName: "Kolkata Knight Riders (AI)", avatar: "/avatars/kkr.png", bidId: "TB-BOTKKR", style: "Calculated Spin & Finishers" }
];

function shouldAiBid({ bot, room, currentPlayer, currentBid, currentBidderId, timeRemaining }) {
  // If bot is already the highest bidder, do not outbid themselves!
  if (currentBidderId === bot.id) return false;

  const botState = room.participants[bot.id];
  if (!botState) return false;

  const remainingBudget = botState.remainingBudget;

  // Decide next bid amount
  let increment = 10000000; // default 1 Cr
  if (currentBid < 10000000) increment = 2000000; // 20 lakh
  else if (currentBid < 50000000) increment = 5000000; // 50 lakh
  else if (currentBid >= 150000000) increment = 10000000; // 1 Cr

  const nextBid = currentBid === 0 ? currentPlayer.basePrice : currentBid + increment;

  // Check budget constraint
  if (nextBid > remainingBudget) return false;

  // Minimum reserve: reserve budget for at least 3 players
  const playersNeeded = Math.max(0, 4 - botState.squad.length);
  const minReservePerPlayer = 20000000; // 2 Cr per remaining slot
  if (remainingBudget - nextBid < (playersNeeded - 1) * minReservePerPlayer && playersNeeded > 1) {
    return false;
  }

  // Max valuation limit for this bot
  const valuationMax = currentPlayer.valuation.estimatedMax;
  // Bot might go slightly above max for marquee (up to 10%), otherwise stops at estimatedMax
  const maxWillingness = currentPlayer.tier === 'Marquee' ? valuationMax * 1.05 : valuationMax;

  if (nextBid > maxWillingness) {
    return false;
  }

  // Timing: AI bids when timer is between 4 and 8 seconds to allow human anticipation
  // Chance factor based on remaining budget and interest
  const budgetRatio = remainingBudget / room.startingBudget;
  const interestProb = currentPlayer.tier === 'Marquee' ? 0.85 : 0.7;

  return Math.random() < interestProb && budgetRatio > 0.15;
}

module.exports = {
  AI_BOT_PROFILES,
  shouldAiBid
};
