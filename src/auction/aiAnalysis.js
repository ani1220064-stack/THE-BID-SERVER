// THE BID: Master AI Analysis Engine
// Follows Screen 29 (Final AI Analysis) & Screen 30 (Final Ranking & Winner)

function analyzeTeam(team, startingBudget) {
  const { participant, players, totalSpent, remainingBudget } = team;
  
  // 1. Role distribution
  const roles = {
    batsmen: 0,
    bowlers: 0,
    allRounders: 0,
    wicketkeepers: 0
  };

  let totalEstimatedMin = 0;
  let totalEstimatedMax = 0;
  let marqueeCount = 0;
  const goodPurchases = [];
  const overpayments = [];

  players.forEach(p => {
    const roleLower = (p.role || '').toLowerCase();
    if (roleLower.includes('wicketkeeper')) roles.wicketkeepers++;
    else if (roleLower.includes('all-rounder')) roles.allRounders++;
    else if (roleLower.includes('bowler')) roles.bowlers++;
    else roles.batsmen++;

    if (p.tier === 'Marquee') marqueeCount++;

    const estMid = (p.valuation.estimatedMin + p.valuation.estimatedMax) / 2;
    totalEstimatedMin += p.valuation.estimatedMin;
    totalEstimatedMax += p.valuation.estimatedMax;

    // Evaluate purchase value
    if (p.soldPrice <= estMid * 0.9) {
      goodPurchases.push({
        player: p.name,
        price: p.soldPrice,
        reason: `Acquired for ${p.soldPriceDisplay} vs estimated range ${p.valuation.displayRange}. Exceptional squad value efficiency.`
      });
    } else if (p.soldPrice > estMid * 1.25) {
      overpayments.push({
        player: p.name,
        price: p.soldPrice,
        reason: `Bidding war drove final cost to ${p.soldPriceDisplay}, exceeding estimated upper benchmark (${p.valuation.displayRange}).`
      });
    }
  });

  // Strengths
  const strengths = [];
  if (roles.wicketkeepers >= 1) strengths.push("Secured a specialist wicketkeeper-batter ensuring core balance.");
  if (roles.allRounders >= 1) strengths.push("Balanced lineup with impact all-rounder depth for batting and bowling.");
  if (roles.bowlers >= 2) strengths.push("Formidable specialist bowling unit capable of defending totals.");
  if (marqueeCount >= 2) strengths.push("Multi-star marquee spine with unmatched match-winning pedigree.");
  if (remainingBudget >= startingBudget * 0.1) strengths.push("Disciplined fiscal management with remaining purse reserves.");
  if (strengths.length === 0) strengths.push("Solid foundation built within competitive auction constraints.");

  // Weaknesses
  const weaknesses = [];
  if (roles.wicketkeepers === 0 && players.length > 0) weaknesses.push("Absence of a recognized specialist wicketkeeper.");
  if (roles.bowlers === 0 && players.length > 0) weaknesses.push("Lack of dedicated specialist strike bowlers.");
  if (roles.batsmen === 0 && players.length > 0) weaknesses.push("Top-order batting firepower looks thin.");
  if (overpayments.length >= 2) weaknesses.push("Multiple inflationary bidding wars depleted flexibility.");
  if (players.length < 3 && players.length > 0) weaknesses.push("Limited squad depth compared to competing franchises.");
  if (weaknesses.length === 0) weaknesses.push("No major tactical deficiencies detected.");

  // Scoring calculation
  let baseScore = 50;
  baseScore += Math.min(players.length * 10, 30);
  baseScore += Math.min(marqueeCount * 6, 12);
  if (roles.wicketkeepers >= 1) baseScore += 4;
  if (roles.allRounders >= 1) baseScore += 4;
  if (roles.bowlers >= 1) baseScore += 4;
  if (roles.batsmen >= 1) baseScore += 4;

  // Good purchase bonus & overpayment penalty
  baseScore += Math.min(goodPurchases.length * 3, 9);
  baseScore -= Math.min(overpayments.length * 3, 9);

  const finalScore = Math.max(10, Math.min(99, Math.round(baseScore)));

  let grade = "B";
  if (finalScore >= 90) grade = "A+";
  else if (finalScore >= 82) grade = "A";
  else if (finalScore >= 75) grade = "B+";
  else if (finalScore >= 65) grade = "B";
  else grade = "C";

  return {
    participantId: participant.id,
    participantName: participant.displayName,
    grade,
    score: finalScore,
    summary: `${participant.displayName} assembled a squad of ${players.length} players with a total investment of ₹${(totalSpent / 10000000).toFixed(2)} Cr.`,
    goodPurchases,
    overpayments,
    strengths,
    weaknesses,
    composition: roles
  };
}

function evaluateAuctionResults(teams, startingBudget) {
  const analyses = teams.map(team => analyzeTeam(team, startingBudget));
  
  // Sort descending by score
  analyses.sort((a, b) => b.score - a.score);

  // Assign ranks
  return analyses.map((item, index) => ({
    ...item,
    rank: index + 1,
    isWinner: index === 0
  }));
}

module.exports = {
  analyzeTeam,
  evaluateAuctionResults
};
