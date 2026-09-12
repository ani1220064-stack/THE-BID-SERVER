// THE BID: Master IPL Auction Player Database
// Follows Screen 16 (Player/Item Information) & Screen 17 (Dynamic Valuation)

const IPL_PLAYERS = [
  {
    id: "ipl_01",
    name: "Virat Kohli",
    role: "Batsman",
    nationality: "India",
    tier: "Marquee",
    basePrice: 20000000, // ₹2.00 Cr in Rupees
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 252,
      runs: 8004,
      strikeRate: 131.97,
      average: 38.67,
      fifties: 55,
      hundreds: 8
    },
    recentForm: "Sensational (Orange Cap form, 741 runs)",
    brandValue: "Iconic (Tier 1 Global Brand)",
    trending: "🔥 Supercharged Attention",
    valuation: {
      estimatedMin: 180000000, // ₹18 Cr
      estimatedMax: 240000000, // ₹24 Cr
      displayRange: "₹18.00 Cr – ₹24.00 Cr",
      marketContext: "Top-order anchor & global marquee icon. High demand across all squads."
    },
    avatar: "VK"
  },
  {
    id: "ipl_02",
    name: "Jasprit Bumrah",
    role: "Bowler (Fast)",
    nationality: "India",
    tier: "Marquee",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 133,
      wickets: 165,
      economy: 7.30,
      strikeRate: 18.7,
      bestBowling: "5/10"
    },
    recentForm: "Unplayable (Economy 6.48 in death overs)",
    brandValue: "Premier Matchwinner (Tier 1)",
    trending: "⚡ Peak Competitive Demand",
    valuation: {
      estimatedMin: 190000000,
      estimatedMax: 260000000,
      displayRange: "₹19.00 Cr – ₹26.00 Cr",
      marketContext: "World's #1 T20 pace bowler. Guarantees 4 high-impact overs in any condition."
    },
    avatar: "JB"
  },
  {
    id: "ipl_03",
    name: "Heinrich Klaasen",
    role: "Wicketkeeper-Batsman",
    nationality: "South Africa",
    tier: "Marquee",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 35,
      runs: 993,
      strikeRate: 168.31,
      average: 37.4,
      sixes: 71
    },
    recentForm: "Devastating Spin Destroyer (SR 178+)",
    brandValue: "Prime International Asset (Tier 1)",
    trending: "🔥 Skyrocketing Value",
    valuation: {
      estimatedMin: 160000000,
      estimatedMax: 220000000,
      displayRange: "₹16.00 Cr – ₹22.00 Cr",
      marketContext: "Premier middle-overs aggressor against pace and spin alike."
    },
    avatar: "HK"
  },
  {
    id: "ipl_04",
    name: "Pat Cummins",
    role: "All-Rounder",
    nationality: "Australia",
    tier: "Marquee",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 58,
      wickets: 63,
      economy: 8.54,
      runs: 515,
      strikeRate: 152.3
    },
    recentForm: "Elite Leader & Clutch Performer",
    brandValue: "Global Champion Captain (Tier 1)",
    trending: "📈 Premium Leadership Demand",
    valuation: {
      estimatedMin: 150000000,
      estimatedMax: 200000000,
      displayRange: "₹15.00 Cr – ₹20.00 Cr",
      marketContext: "World Cup winning captain, aggressive strike bowler, and lower-order power hitter."
    },
    avatar: "PC"
  },
  {
    id: "ipl_05",
    name: "Rohit Sharma",
    role: "Batsman",
    nationality: "India",
    tier: "Marquee",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 257,
      runs: 6628,
      strikeRate: 131.14,
      average: 29.72,
      hundreds: 2
    },
    recentForm: "Aggressive Powerplay Opener (T20 WC Winner)",
    brandValue: "Iconic Legend (Tier 1)",
    trending: "⚡ Heavy Fan & Franchise Momentum",
    valuation: {
      estimatedMin: 140000000,
      estimatedMax: 190000000,
      displayRange: "₹14.00 Cr – ₹19.00 Cr",
      marketContext: "Five-time title winning captain with ultra-aggressive powerplay blueprint."
    },
    avatar: "RS"
  },
  {
    id: "ipl_06",
    name: "Travis Head",
    role: "Batsman",
    nationality: "Australia",
    tier: "Specialist Batter",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 25,
      runs: 850,
      strikeRate: 182.4,
      fifties: 6,
      hundreds: 1
    },
    recentForm: "Nuclear Powerplay Hitter (SR 210 in overs 1-6)",
    brandValue: "Explosive Star (Tier 1)",
    trending: "🔥 Highest Powerplay Impact Factor",
    valuation: {
      estimatedMin: 130000000,
      estimatedMax: 175000000,
      displayRange: "₹13.00 Cr – ₹17.50 Cr",
      marketContext: "Game-changing opener who dismantles bowling attacks inside 6 overs."
    },
    avatar: "TH"
  },
  {
    id: "ipl_07",
    name: "Rashid Khan",
    role: "Bowler (Spin)",
    nationality: "Afghanistan",
    tier: "Specialist Spinner",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 121,
      wickets: 149,
      economy: 6.82,
      strikeRate: 19.1,
      runs: 544
    },
    recentForm: "Consistently Elite Mystery Leg-spinner",
    brandValue: "Global T20 Superstar (Tier 1)",
    trending: "⚡ Bankable 4 Overs",
    valuation: {
      estimatedMin: 150000000,
      estimatedMax: 200000000,
      displayRange: "₹15.00 Cr – ₹20.00 Cr",
      marketContext: "Gold standard T20 wrist spinner who delivers wickets and death over containment."
    },
    avatar: "RK"
  },
  {
    id: "ipl_08",
    name: "Rishabh Pant",
    role: "Wicketkeeper-Batsman",
    nationality: "India",
    tier: "Marquee",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 111,
      runs: 3284,
      strikeRate: 148.93,
      average: 35.31,
      dismissals: 85
    },
    recentForm: "Dynamic Captain & Middle Order Power",
    brandValue: "National Marquee Figure (Tier 1)",
    trending: "🔥 Maximum Mega-Auction Focus",
    valuation: {
      estimatedMin: 180000000,
      estimatedMax: 250000000,
      displayRange: "₹18.00 Cr – ₹25.00 Cr",
      marketContext: "Rare combination of Indian wicketkeeper, captain, and left-handed match finisher."
    },
    avatar: "RP"
  },
  {
    id: "ipl_09",
    name: "Hardik Pandya",
    role: "All-Rounder",
    nationality: "India",
    tier: "Marquee",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 137,
      runs: 2525,
      strikeRate: 145.86,
      wickets: 64,
      economy: 8.89
    },
    recentForm: "Clutch World Cup Final Hero",
    brandValue: "Pace All-Rounder Unicorn (Tier 1)",
    trending: "⚡ High Strategic Value",
    valuation: {
      estimatedMin: 150000000,
      estimatedMax: 210000000,
      displayRange: "₹15.00 Cr – ₹21.00 Cr",
      marketContext: "Provides squad balance as 140kmph pace bowler and explosive finisher."
    },
    avatar: "HP"
  },
  {
    id: "ipl_10",
    name: "Mitchell Starc",
    role: "Bowler (Fast)",
    nationality: "Australia",
    tier: "Specialist Pacer",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 41,
      wickets: 51,
      economy: 8.21,
      strikeRate: 17.5
    },
    recentForm: "Playoffs Specialist & High-Velocity Swinger",
    brandValue: "Record Breaker (Tier 1)",
    trending: "📈 Big Match Decider",
    valuation: {
      estimatedMin: 120000000,
      estimatedMax: 180000000,
      displayRange: "₹12.00 Cr – ₹18.00 Cr",
      marketContext: "Lethal left-arm inswinging yorkers with proven tournament playoff pedigree."
    },
    avatar: "MS"
  },
  {
    id: "ipl_11",
    name: "Suryakumar Yadav",
    role: "Batsman",
    nationality: "India",
    tier: "Marquee",
    basePrice: 20000000,
    basePriceDisplay: "₹2.00 Cr",
    stats: {
      matches: 150,
      runs: 3594,
      strikeRate: 145.33,
      average: 32.08,
      hundreds: 2
    },
    recentForm: "World #1 360-Degree T20 Batter",
    brandValue: "Premier T20 Star (Tier 1)",
    trending: "🔥 Relentless Scoring Velocity",
    valuation: {
      estimatedMin: 160000000,
      estimatedMax: 220000000,
      displayRange: "₹16.00 Cr – ₹22.00 Cr",
      marketContext: "Unorthodox shot-maker capable of manipulating any field setting."
    },
    avatar: "SKY"
  },
  {
    id: "ipl_12",
    name: "Rinku Singh",
    role: "Batsman (Finisher)",
    nationality: "India",
    tier: "Specialist Finisher",
    basePrice: 10000000,
    basePriceDisplay: "₹1.00 Cr",
    stats: {
      matches: 45,
      runs: 893,
      strikeRate: 143.34,
      average: 30.79,
      fifties: 4
    },
    recentForm: "Ice-cold Finisher (Death Overs SR 192)",
    brandValue: "Cult Indian Finisher (Tier 2)",
    trending: "⚡ Rising Sensation",
    valuation: {
      estimatedMin: 80000000,
      estimatedMax: 130000000,
      displayRange: "₹8.00 Cr – ₹13.00 Cr",
      marketContext: "Specialist lower-order finisher known for miraculous final-over chases."
    },
    avatar: "RKS"
  }
];

// Helper to format Rupees into Lakhs and Crores
function formatCurrency(amount) {
  if (amount >= 10000000) {
    const cr = (amount / 10000000).toFixed(2);
    return `₹${cr.endsWith('.00') ? cr.slice(0, -3) : cr} Cr`;
  }
  if (amount >= 100000) {
    const lk = (amount / 100000).toFixed(2);
    return `₹${lk.endsWith('.00') ? lk.slice(0, -3) : lk} Lakh`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

module.exports = {
  IPL_PLAYERS,
  formatCurrency
};
