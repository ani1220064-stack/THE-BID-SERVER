const { iplPlayers } = require('../data/iplPlayers');
const { IPL_FRANCHISES, getFranchiseById: getIPLFranchiseById, getFranchiseByName: getIPLFranchiseByName, getAllFranchises: getAllIPLFranchises } = require('../data/iplFranchises');

const { fifaPlayers } = require('../data/fifaPlayers');
const { FIFA_TEAMS, getFIFATeamById, getFIFATeamByName, getAllFIFATeams } = require('../data/fifaTeams');

const { f1Drivers } = require('../data/f1Drivers');
const { F1_TEAMS, getF1TeamById, getF1TeamByName, getAllF1Teams } = require('../data/f1Teams');

const { nbaPlayers } = require('../data/nbaPlayers');
const { NBA_TEAMS, getNBATeamById, getNBATeamByName, getAllNBATeams } = require('../data/nbaTeams');

const { movieStars } = require('../data/movieStars');
const { FILM_STUDIOS, getFilmStudioById, getFilmStudioByName, getAllFilmStudios } = require('../data/filmStudios');

const { luxuryCars } = require('../data/luxuryCars');
const { LUXURY_CAR_GARAGES, getGarageById, getGarageByName, getAllGarages } = require('../data/luxuryCarGarages');

const { luxuryCollection } = require('../data/luxuryCollection');
const { LUXURY_COLLECTIONS, getCollectionById, getCollectionByName, getAllCollections } = require('../data/luxuryCollections');

const {
  FICTIONAL_BOT_TEAMS,
  FICTIONAL_BOT_MANAGERS,
  generateFictionalBots
} = require('../ai/AuctionBot');

// Dynamic Pool Sizing for 1–10 Participants
function calculateDynamicPoolSize(participantCount) {
  if (participantCount <= 2) return 15;
  if (participantCount === 3) return 25;
  if (participantCount === 4) return 30;
  if (participantCount === 5) return 35;
  if (participantCount === 6) return 40;
  if (participantCount === 7) return 45;
  if (participantCount === 8) return 50;
  if (participantCount === 9) return 55;
  if (participantCount >= 10) return 60;
  return 15;
}

// Generic unbiased Fisher-Yates pool generator with deduplication
function createPoolGenerator(masterList, poolSizeFn = calculateDynamicPoolSize) {
  return (participantCount, customPoolSize) => {
    const targetSize = customPoolSize || poolSizeFn(participantCount);

    const seenIds = new Set();
    const seenNames = new Set();
    const cleanMaster = [];
    for (const item of masterList) {
      if (!item || !item.id) continue;
      const cleanName = (item.name || '').trim().toLowerCase();
      if (!seenIds.has(item.id) && !seenNames.has(cleanName)) {
        seenIds.add(item.id);
        seenNames.add(cleanName);
        cleanMaster.push({ ...item });
      }
    }

    for (let i = cleanMaster.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cleanMaster[i], cleanMaster[j]] = [cleanMaster[j], cleanMaster[i]];
    }

    const selected = cleanMaster.slice(0, Math.min(targetSize, cleanMaster.length));
    const finalSeen = new Set();
    const uniquePool = [];
    for (const item of selected) {
      if (!finalSeen.has(item.id)) {
        finalSeen.add(item.id);
        uniquePool.push(item);
      }
    }
    return uniquePool;
  };
}

// Category 1: IPL Cricket Module
const IPL_CATEGORY_MODULE = {
  id: 'ipl_cricket',
  title: 'IPL Cricket Auction',
  shortTitle: 'IPL Cricket',
  tagline: 'OFFICIAL PREMIER AUCTION',
  icon: '🏏',
  status: 'ACTIVE',
  franchiseLabel: 'IPL Team',
  franchiseLabelPlural: 'IPL Teams',
  itemLabelSingle: 'Cricketer',
  itemLabelPlural: 'Cricketers',
  collectionLabel: 'Squad',
  currencySymbol: '₹',
  unitLabel: 'Cr',
  defaultBudget: 100.0,
  minBudget: 20.0,
  maxBudget: 250.0,

  franchises: IPL_FRANCHISES,
  getFranchises: getAllIPLFranchises,
  getFranchiseById: getIPLFranchiseById,
  getFranchiseByName: getIPLFranchiseByName,

  getItems: () => iplPlayers,
  calculatePoolSize: calculateDynamicPoolSize,
  generatePool: createPoolGenerator(iplPlayers, calculateDynamicPoolSize),

  fictionalTeams: FICTIONAL_BOT_TEAMS,
  fictionalManagers: FICTIONAL_BOT_MANAGERS,
  generateBots: (count, existingNames, existingTeams) => {
    return generateFictionalBots(count, existingNames, existingTeams);
  },

  generateAnalysis: (room) => {
    const participants = room?.participants instanceof Map
      ? Array.from(room.participants.values())
      : Array.isArray(room?.participants)
      ? room.participants
      : [];
    const budget = room?.proposedBudget || room?.categoryConfig?.defaultBudget || 100.0;
    const rankings = [];
    const teamReports = {};
    const symbol = room.categoryConfig?.currencySymbol || '₹';
    const unit = room.categoryConfig?.unitLabel || 'Cr';

    participants.forEach(p => {
      const squad = p.squad || [];
      const batsmen = squad.filter(x => x.role === 'Batsman').length;
      const bowlers = squad.filter(x => x.role === 'Fast Bowler' || x.role === 'Spin Bowler').length;
      const allRounders = squad.filter(x => x.role === 'All-Rounder').length;
      const keepers = squad.filter(x => x.role === 'Wicketkeeper Batsman').length;

      const strengths = [];
      const weaknesses = [];
      let bargain = null;
      let biggestSplash = null;

      if (batsmen >= 2) strengths.push('Formidable top-order firepower with proven match-winners');
      if (bowlers >= 2) strengths.push('Lethal wicket-taking depth across powerplay and death overs');
      if (allRounders >= 1) strengths.push('Elite team balance with versatile all-rounders');
      if (keepers >= 1) strengths.push('Reliable behind-the-stumps glovework and clutch middle-order anchor');

      if (bowlers === 0) weaknesses.push('Vulnerable death bowling attack (lack of specialist frontline pacer)');
      if (batsmen === 0) weaknesses.push('Top-order fragility with inadequate specialist batting depth');
      if (keepers === 0) weaknesses.push('Missing recognized designated wicketkeeper batsman');
      if (p.purse > budget * 0.4) weaknesses.push('Under-utilized auction purse (unspent capital in a high-stakes auction)');

      squad.forEach(x => {
        const estMid = ((x.estimatedValuation?.min ?? 10) + (x.estimatedValuation?.max ?? 20)) / 2;
        const currentBargainDiff = bargain ? (((bargain.estimatedValuation?.min ?? 10) + (bargain.estimatedValuation?.max ?? 20)) / 2 - bargain.soldPrice) : -Infinity;
        if (!bargain || (estMid - x.soldPrice) > currentBargainDiff) {
          bargain = x;
        }
        if (!biggestSplash || x.soldPrice > biggestSplash.soldPrice) {
          biggestSplash = x;
        }
      });

      let score = 50;
      score += squad.length * 9;
      if (batsmen >= 1 && bowlers >= 1 && allRounders >= 1) score += 12;
      if (keepers >= 1) score += 6;
      if (p.purse < budget * 0.1) score += 6;
      score = Math.min(98, Math.max(45, score));

      const spent = Math.round((budget - p.purse) * 10) / 10;

      rankings.push({
        id: p.id,
        name: p.name,
        teamName: p.teamName,
        avatar: p.avatar,
        overallScore: score,
        squadCount: squad.length,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10,
        isAI: p.isAI
      });

      teamReports[p.id] = {
        id: p.id,
        teamName: p.teamName,
        name: p.name,
        overallScore: score,
        strengths: strengths.length > 0 ? strengths : ['Balanced core squad development across key disciplines'],
        weaknesses: weaknesses.length > 0 ? weaknesses : ['Minimal roster vulnerabilities detected by tactical AI analysis'],
        bestBargain: bargain ? `${bargain.name} (${symbol}${bargain.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        marqueeSigning: biggestSplash ? `${biggestSplash.name} (${symbol}${biggestSplash.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        compositionSummary: `${squad.length} Players acquired • ${symbol}${spent.toFixed(1)} ${unit} invested`,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10
      };
    });

    rankings.sort((a, b) => b.overallScore - a.overallScore);

    return {
      winner: rankings[0],
      rankings,
      teamReports
    };
  }
};

// Category 2: FIFA Football Module
const FIFA_CATEGORY_MODULE = {
  id: 'fifa_football',
  title: 'FIFA Football Auction',
  shortTitle: 'FIFA Football',
  tagline: 'GLOBAL FOOTBALL AUCTION',
  icon: '⚽',
  status: 'ACTIVE',
  franchiseLabel: 'Football Team',
  franchiseLabelPlural: 'Football Teams',
  itemLabelSingle: 'Footballer',
  itemLabelPlural: 'Footballers',
  collectionLabel: 'Squad',
  currencySymbol: '€',
  unitLabel: 'M',
  defaultBudget: 200.0,
  minBudget: 50.0,
  maxBudget: 500.0,

  franchises: FIFA_TEAMS,
  getFranchises: getAllFIFATeams,
  getFranchiseById: getFIFATeamById,
  getFranchiseByName: getFIFATeamByName,

  getItems: () => fifaPlayers,
  calculatePoolSize: calculateDynamicPoolSize,
  generatePool: createPoolGenerator(fifaPlayers, calculateDynamicPoolSize),

  fictionalTeams: [
    'Apex Athletic', 'Dynamo Madrid', 'Solar Inter', 'United Stars',
    'Vanguard FC', 'Crown Sporting', 'Nova City', 'Olympique Phoenix',
    'Zenith Albion', 'Cobalt Rovers'
  ],
  fictionalManagers: [
    'Carlo AI', 'Pep V', 'Jürgen M', 'Zinedine R', 'Diego S', 'José M',
    'Antonio C', 'Luis E', 'Mikel A', 'Unai E', 'Xabi A', 'Erik T'
  ],
  generateBots: (count, existingNames, existingTeams) => {
    return generateFictionalBots(count, existingNames, existingTeams);
  },

  generateAnalysis: (room) => {
    const participants = room?.participants instanceof Map
      ? Array.from(room.participants.values())
      : Array.isArray(room?.participants)
      ? room.participants
      : [];
    const budget = room?.proposedBudget || room?.categoryConfig?.defaultBudget || 200.0;
    const rankings = [];
    const teamReports = {};
    const symbol = room.categoryConfig?.currencySymbol || '€';
    const unit = room.categoryConfig?.unitLabel || 'M';

    participants.forEach(p => {
      const squad = p.squad || [];
      const forwards = squad.filter(x => x.role === 'Forward').length;
      const midfielders = squad.filter(x => x.role === 'Midfielder').length;
      const defenders = squad.filter(x => x.role === 'Defender').length;
      const keepers = squad.filter(x => x.role === 'Goalkeeper').length;

      const strengths = [];
      const weaknesses = [];
      let bargain = null;
      let biggestSplash = null;

      if (forwards >= 2) strengths.push('Devastating attacking firepower with world-class clinical finishers');
      if (midfielders >= 2) strengths.push('Elite midfield engine room controlling game tempo and chance creation');
      if (defenders >= 2) strengths.push('Impenetrable defensive wall with high-pace isolation tackling');
      if (keepers >= 1) strengths.push('Commanding world-class shot-stopper between the posts');

      if (keepers === 0) weaknesses.push('High vulnerability: missing established frontline goalkeeper');
      if (defenders === 0) weaknesses.push('Defensive fragility: lacking recognized center-back spine');
      if (forwards === 0) weaknesses.push('Goal threat deficiency: inadequate specialist finishing depth');
      if (p.purse > budget * 0.4) weaknesses.push('Under-utilized transfer purse in high-stakes bidding market');

      squad.forEach(x => {
        const estMid = ((x.estimatedValuation?.min ?? 20) + (x.estimatedValuation?.max ?? 50)) / 2;
        const currentBargainDiff = bargain ? (((bargain.estimatedValuation?.min ?? 20) + (bargain.estimatedValuation?.max ?? 50)) / 2 - bargain.soldPrice) : -Infinity;
        if (!bargain || (estMid - x.soldPrice) > currentBargainDiff) {
          bargain = x;
        }
        if (!biggestSplash || x.soldPrice > biggestSplash.soldPrice) {
          biggestSplash = x;
        }
      });

      let score = 50;
      score += squad.length * 9;
      if (forwards >= 1 && midfielders >= 1 && defenders >= 1) score += 12;
      if (keepers >= 1) score += 8;
      if (p.purse < budget * 0.1) score += 6;
      score = Math.min(98, Math.max(45, score));

      const spent = Math.round((budget - p.purse) * 10) / 10;

      rankings.push({
        id: p.id,
        name: p.name,
        teamName: p.teamName,
        avatar: p.avatar,
        overallScore: score,
        squadCount: squad.length,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10,
        isAI: p.isAI
      });

      teamReports[p.id] = {
        id: p.id,
        teamName: p.teamName,
        name: p.name,
        overallScore: score,
        strengths: strengths.length > 0 ? strengths : ['Solid tactical foundation across all pitch areas'],
        weaknesses: weaknesses.length > 0 ? weaknesses : ['Well-rounded squad with minimal tactical vulnerabilities'],
        bestBargain: bargain ? `${bargain.name} (${symbol}${bargain.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        marqueeSigning: biggestSplash ? `${biggestSplash.name} (${symbol}${biggestSplash.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        compositionSummary: `${squad.length} Footballers signed • ${symbol}${spent.toFixed(1)} ${unit} invested`,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10
      };
    });

    rankings.sort((a, b) => b.overallScore - a.overallScore);

    return {
      winner: rankings[0],
      rankings,
      teamReports
    };
  }
};

// Category 3: Formula 1 Drivers Module
const F1_CATEGORY_MODULE = {
  id: 'formula_1',
  title: 'Formula 1 Drivers Auction',
  shortTitle: 'Formula 1',
  tagline: 'PINNACLE OF MOTORSPORT',
  icon: '🏎️',
  status: 'ACTIVE',
  franchiseLabel: 'F1 Constructor',
  franchiseLabelPlural: 'F1 Constructors',
  itemLabelSingle: 'Driver',
  itemLabelPlural: 'Drivers',
  collectionLabel: 'Driver Lineup',
  currencySymbol: '$',
  unitLabel: 'M',
  defaultBudget: 140.0,
  minBudget: 40.0,
  maxBudget: 350.0,

  franchises: F1_TEAMS,
  getFranchises: getAllF1Teams,
  getFranchiseById: getF1TeamById,
  getFranchiseByName: getF1TeamByName,

  getItems: () => f1Drivers,
  calculatePoolSize: calculateDynamicPoolSize,
  generatePool: createPoolGenerator(f1Drivers, calculateDynamicPoolSize),

  fictionalTeams: [
    'Apex Motorsport', 'Velocity Grand Prix', 'Quantum Racing', 'Nova F1',
    'Titan Speedworks', 'Cobalt Racing', 'Solar Corse', 'Vanguard GP',
    'Zenith Scuderia', 'Phoenix Dynamics'
  ],
  fictionalManagers: [
    'Marcus AI', 'Lucas Apex', 'Soren V', 'David M', 'Jean-Paul', 'Stefan B',
    'Enzo K', 'Ron H', 'Colin C', 'Ross B', 'Flavio B', 'Franz T'
  ],
  generateBots: (count, existingNames, existingTeams) => {
    return generateFictionalBots(count, existingNames, existingTeams);
  },

  generateAnalysis: (room) => {
    const participants = room?.participants instanceof Map
      ? Array.from(room.participants.values())
      : Array.isArray(room?.participants)
      ? room.participants
      : [];
    const budget = room?.proposedBudget || room?.categoryConfig?.defaultBudget || 140.0;
    const rankings = [];
    const teamReports = {};
    const symbol = room.categoryConfig?.currencySymbol || '$';
    const unit = room.categoryConfig?.unitLabel || 'M';

    participants.forEach(p => {
      const squad = p.squad || [];
      const champions = squad.filter(x => (x.strikeRate && x.strikeRate > 0) || x.role === 'Championship Driver').length;
      const winners = squad.filter(x => (x.runs && x.runs > 0) || x.role === 'Grand Prix Winner').length;
      const podiumHolders = squad.filter(x => (x.wickets && x.wickets > 0) || x.role === 'Podium Contender').length;

      const strengths = [];
      const weaknesses = [];
      let bargain = null;
      let biggestSplash = null;

      if (champions >= 1) strengths.push('World Championship-winning driver capable of extracting maximum qualifying pace');
      if (winners >= 2) strengths.push('Formidable two-car driver lineup with multiple Grand Prix victories');
      if (podiumHolders >= 2) strengths.push('Proven race craft and tire management across wet and high-degradation tracks');
      if (squad.length >= 4) strengths.push('Deep competitive squad with marquee leaders and agile reserve strength');

      if (winners === 0) weaknesses.push('Lineup lacks proven Grand Prix race winners in high-pressure battles');
      if (squad.length < 2) weaknesses.push('Grid vulnerability: failed to fill two full-time race seats');
      if (p.purse > budget * 0.4) weaknesses.push('Under-utilized team budget in competitive driver market');

      squad.forEach(x => {
        const estMid = ((x.estimatedValuation?.min ?? 15) + (x.estimatedValuation?.max ?? 40)) / 2;
        const currentBargainDiff = bargain ? (((bargain.estimatedValuation?.min ?? 15) + (bargain.estimatedValuation?.max ?? 40)) / 2 - bargain.soldPrice) : -Infinity;
        if (!bargain || (estMid - x.soldPrice) > currentBargainDiff) {
          bargain = x;
        }
        if (!biggestSplash || x.soldPrice > biggestSplash.soldPrice) {
          biggestSplash = x;
        }
      });

      let score = 50;
      score += squad.length * 10;
      if (champions >= 1) score += 12;
      if (winners >= 2) score += 10;
      if (p.purse < budget * 0.1) score += 6;
      score = Math.min(98, Math.max(45, score));

      const spent = Math.round((budget - p.purse) * 10) / 10;

      rankings.push({
        id: p.id,
        name: p.name,
        teamName: p.teamName,
        avatar: p.avatar,
        overallScore: score,
        squadCount: squad.length,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10,
        isAI: p.isAI
      });

      teamReports[p.id] = {
        id: p.id,
        teamName: p.teamName,
        name: p.name,
        overallScore: score,
        strengths: strengths.length > 0 ? strengths : ['Balanced driver lineup with consistent scoring potential'],
        weaknesses: weaknesses.length > 0 ? weaknesses : ['Aerodynamic and driver pairing shows zero glaring weaknesses'],
        bestBargain: bargain ? `${bargain.name} (${symbol}${bargain.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        marqueeSigning: biggestSplash ? `${biggestSplash.name} (${symbol}${biggestSplash.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        compositionSummary: `${squad.length} Drivers signed • ${symbol}${spent.toFixed(1)} ${unit} invested`,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10
      };
    });

    rankings.sort((a, b) => b.overallScore - a.overallScore);

    return {
      winner: rankings[0],
      rankings,
      teamReports
    };
  }
};

// Category 4: NBA Basketball Module
const NBA_CATEGORY_MODULE = {
  id: 'nba',
  title: 'NBA Basketball Auction',
  shortTitle: 'NBA Basketball',
  tagline: 'WHERE AMAZING HAPPENS',
  icon: '🏀',
  status: 'ACTIVE',
  franchiseLabel: 'NBA Franchise',
  franchiseLabelPlural: 'NBA Franchises',
  itemLabelSingle: 'Basketball Star',
  itemLabelPlural: 'Basketball Stars',
  collectionLabel: 'Franchise Roster',
  currencySymbol: '$',
  unitLabel: 'M',
  defaultBudget: 120.0,
  minBudget: 30.0,
  maxBudget: 300.0,

  franchises: NBA_TEAMS,
  getFranchises: getAllNBATeams,
  getFranchiseById: getNBATeamById,
  getFranchiseByName: getNBATeamByName,

  getItems: () => nbaPlayers,
  calculatePoolSize: calculateDynamicPoolSize,
  generatePool: createPoolGenerator(nbaPlayers, calculateDynamicPoolSize),

  fictionalTeams: [
    'Seattle SuperStorm', 'Vegas High Rollers', 'Gotham Knights', 'Pacific Tide',
    'Empire Titans', 'Lone Star Outlaws', 'Apex Predators', 'Aurora Northern Lights',
    'Starlight Voyagers', 'Metro Ballers'
  ],
  fictionalManagers: [
    'Coach Pop AI', 'Phil Jackson V', 'Steve Kerr M', 'Erik Spoelstra R',
    'Doc Rivers AI', 'Tyronn Lue M', 'Monty W', 'Rick Carlisle AI'
  ],
  generateBots: (count, existingNames, existingTeams) => {
    return generateFictionalBots(count, existingNames, existingTeams);
  },

  generateAnalysis: (room) => {
    const participants = room?.participants instanceof Map
      ? Array.from(room.participants.values())
      : Array.isArray(room?.participants)
      ? room.participants
      : [];
    const budget = room?.proposedBudget || room?.categoryConfig?.defaultBudget || 120.0;
    const rankings = [];
    const teamReports = {};
    const symbol = room.categoryConfig?.currencySymbol || '$';
    const unit = room.categoryConfig?.unitLabel || 'M';

    participants.forEach(p => {
      const squad = p.squad || [];
      const guards = squad.filter(x => x.role === 'Point Guard' || x.role === 'Shooting Guard').length;
      const forwards = squad.filter(x => x.role === 'Small Forward' || x.role === 'Power Forward').length;
      const centers = squad.filter(x => x.role === 'Center').length;
      const champions = squad.filter(x => (x.titles && x.titles > 0)).length;

      const strengths = [];
      const weaknesses = [];
      let bargain = null;
      let biggestSplash = null;

      if (guards >= 2) strengths.push('High-octane perimeter backcourt with lethal three-point shooting and playmaking');
      if (forwards >= 2) strengths.push('Versatile two-way forward tandem capable of switching and downhill penetration');
      if (centers >= 1) strengths.push('Dominant interior anchor securing defensive glass and paint deterrence');
      if (champions >= 1) strengths.push('Championship pedigree and battle-tested clutch fourth-quarter execution');

      if (guards === 0) weaknesses.push('Ball-handling deficit: missing premier playmaking floor general');
      if (centers === 0) weaknesses.push('Interior vulnerability: lacking specialist shot-blocking center');
      if (forwards === 0) weaknesses.push('Wing depth deficiency: susceptible to opposing isolation scoring');
      if (p.purse > budget * 0.4) weaknesses.push('Under-utilized salary cap in high-stakes bidding market');

      squad.forEach(x => {
        const estMid = ((x.estimatedValuation?.min ?? 20) + (x.estimatedValuation?.max ?? 60)) / 2;
        const currentBargainDiff = bargain ? (((bargain.estimatedValuation?.min ?? 20) + (bargain.estimatedValuation?.max ?? 60)) / 2 - bargain.soldPrice) : -Infinity;
        if (!bargain || (estMid - x.soldPrice) > currentBargainDiff) {
          bargain = x;
        }
        if (!biggestSplash || x.soldPrice > biggestSplash.soldPrice) {
          biggestSplash = x;
        }
      });

      let score = 50;
      score += squad.length * 9;
      if (guards >= 1 && forwards >= 1) score += 10;
      if (centers >= 1) score += 10;
      if (champions >= 1) score += 8;
      if (p.purse < budget * 0.1) score += 6;
      score = Math.min(98, Math.max(45, score));

      const spent = Math.round((budget - p.purse) * 10) / 10;

      rankings.push({
        id: p.id,
        name: p.name,
        teamName: p.teamName,
        avatar: p.avatar,
        overallScore: score,
        squadCount: squad.length,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10,
        isAI: p.isAI
      });

      teamReports[p.id] = {
        id: p.id,
        teamName: p.teamName,
        name: p.name,
        overallScore: score,
        strengths: strengths.length > 0 ? strengths : ['Solid basketball roster with balanced positional depth'],
        weaknesses: weaknesses.length > 0 ? weaknesses : ['Versatile two-way roster with zero noticeable structural flaws'],
        bestBargain: bargain ? `${bargain.name} (${symbol}${bargain.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        marqueeSigning: biggestSplash ? `${biggestSplash.name} (${symbol}${biggestSplash.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        compositionSummary: `${squad.length} Players acquired • ${symbol}${spent.toFixed(1)} ${unit} cap committed`,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10
      };
    });

    rankings.sort((a, b) => b.overallScore - a.overallScore);

    return {
      winner: rankings[0],
      rankings,
      teamReports
    };
  }
};

// Dedicated Movie Stars Pool Generator with balanced role distribution and strict deduplication
function createMovieStarsPoolGenerator(masterList, poolSizeFn = calculateDynamicPoolSize) {
  return (participantCount, customPoolSize) => {
    const targetSize = customPoolSize || poolSizeFn(participantCount);

    const directors = masterList.filter(x => x.role === 'Director');
    const maleSingers = masterList.filter(x => x.role === 'Male Singer');
    const femaleSingers = masterList.filter(x => x.role === 'Female Singer');
    const maleActors = masterList.filter(x => x.role === 'Male Actor');
    const femaleActors = masterList.filter(x => x.role === 'Female Actor');

    const shuffle = (arr) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const shuffDirectors = shuffle(directors);
    const shuffMaleSingers = shuffle(maleSingers);
    const shuffFemaleSingers = shuffle(femaleSingers);
    const shuffMaleActors = shuffle(maleActors);
    const shuffFemaleActors = shuffle(femaleActors);

    const numDirectors = Math.min(shuffDirectors.length, Math.max(2, Math.round(targetSize * 0.12)));
    const numMaleSingers = Math.min(shuffMaleSingers.length, Math.max(1, Math.round(targetSize * 0.08)));
    const numFemaleSingers = Math.min(shuffFemaleSingers.length, Math.max(1, Math.round(targetSize * 0.08)));
    const numFemaleActors = Math.min(shuffFemaleActors.length, Math.max(3, Math.round(targetSize * 0.28)));

    const picked = [];
    const seenIds = new Set();
    const seenNames = new Set();

    const addUnique = (item) => {
      if (!item || !item.id) return false;
      const cleanName = (item.name || '').trim().toLowerCase();
      if (!seenIds.has(item.id) && !seenNames.has(cleanName)) {
        seenIds.add(item.id);
        seenNames.add(cleanName);
        picked.push({ ...item, AUCTIONED: false });
        return true;
      }
      return false;
    };

    shuffDirectors.slice(0, numDirectors).forEach(addUnique);
    shuffMaleSingers.slice(0, numMaleSingers).forEach(addUnique);
    shuffFemaleSingers.slice(0, numFemaleSingers).forEach(addUnique);
    shuffFemaleActors.slice(0, numFemaleActors).forEach(addUnique);

    shuffMaleActors.forEach(item => {
      if (picked.length < targetSize) {
        addUnique(item);
      }
    });

    const allRemaining = shuffle(masterList);
    for (const item of allRemaining) {
      if (picked.length >= targetSize) break;
      addUnique(item);
    }

    return shuffle(picked);
  };
}

function generateDynamicMovieTitle(studioName, director, leadActors) {
  const dirName = director?.name || '';
  const studio = studioName || '';

  if (dirName.includes('Rajamouli')) {
    const titles = ['Empires of Fire', 'Vanguard of Destiny', 'The Sovereign Realm', 'Chronicles of the Crown'];
    return titles[Math.floor(Math.random() * titles.length)];
  }
  if (dirName.includes('Nolan')) {
    const titles = ['The Singularity Paradox', 'Chrono Horizon', 'Echoes in 70mm', 'Quantum Abyss'];
    return titles[Math.floor(Math.random() * titles.length)];
  }
  if (dirName.includes('Prashanth Neel') || dirName.includes('Lokesh')) {
    const titles = ['Iron Dynasty', 'Bloodline Syndicate', 'Midnight Protocol', 'The Rogue Empire'];
    return titles[Math.floor(Math.random() * titles.length)];
  }
  if (dirName.includes('Bhansali') || dirName.includes('Mani Ratnam')) {
    const titles = ['Symphony of the Soul', 'Whispers of the Monsoon', 'The Royal Canvas', 'Ethereal Waltz'];
    return titles[Math.floor(Math.random() * titles.length)];
  }
  if (dirName.includes('Hirani')) {
    const titles = ['A Million Dreams', 'The Brilliant Fools', 'Heartstrings of the City', 'Pure Gold'];
    return titles[Math.floor(Math.random() * titles.length)];
  }
  if (dirName.includes('Rohit Shetty')) {
    const titles = ['Thunderbolt Express', 'Raging Streets', 'Velocity Force', 'Maximum Impact'];
    return titles[Math.floor(Math.random() * titles.length)];
  }
  if (dirName.includes('Cameron')) {
    const titles = ['Abyss of the Stars', 'The Deep Horizon', 'Leviathan Protocol', 'Way of the Brave'];
    return titles[Math.floor(Math.random() * titles.length)];
  }

  if (studio.includes('Disney') || studio.includes('Amblin')) {
    return 'Legends of the Starlight';
  }
  if (studio.includes('Marvel') || studio.includes('Skydance')) {
    return 'Apex Vanguard';
  }
  if (studio.includes('Yash Raj') || studio.includes('Dharma')) {
    return 'Destined Flames of Glory';
  }
  if (studio.includes('A24') || studio.includes('Searchlight') || studio.includes('Neon')) {
    return 'Fragments of a Midnight Memory';
  }

  const genericTitles = [
    'The Sovereign Legacy',
    'Rays of Redemption',
    'Shadows of the Citadel',
    'Echoes of Valor',
    'The Golden Standard'
  ];
  return genericTitles[Math.floor(Math.random() * genericTitles.length)];
}

// Category 5: Movie Stars Studio Module (Strict Studio & Movie-Making terminology)
const MOVIE_STARS_CATEGORY_MODULE = {
  id: 'movie_stars',
  title: 'Movie Stars Studio Auction',
  shortTitle: 'Movie Stars',
  tagline: 'WHERE LEGENDS ARE CAST',
  icon: '🎬',
  status: 'ACTIVE',
  franchiseLabel: 'Film Studio',
  franchiseLabelPlural: 'Film Studios',
  itemLabelSingle: 'Movie Talent',
  itemLabelPlural: 'Movie Talent',
  collectionLabel: 'Movie Package',
  currencySymbol: '$',
  unitLabel: 'M',
  defaultBudget: 150.0,
  minBudget: 40.0,
  maxBudget: 400.0,

  franchises: FILM_STUDIOS,
  getFranchises: getAllFilmStudios,
  getFranchiseById: getFilmStudioById,
  getFranchiseByName: getFilmStudioByName,

  getItems: () => movieStars,
  calculatePoolSize: calculateDynamicPoolSize,
  generatePool: createMovieStarsPoolGenerator(movieStars, calculateDynamicPoolSize),

  fictionalTeams: [
    'A24 Prestige Pictures', 'Neon CineWave', 'Lakeshore Studios', 'Legendary Pictures',
    'Amblin Entertainment', 'Searchlight Pictures', 'Focus Features', 'Miramax Films',
    'Skydance Media', 'Village Roadshow'
  ],
  fictionalManagers: [
    'Studio Chief AI', 'Executive Producer V', 'Auteur Director K', 'Greenlight Mogul',
    'Casting Director R', 'Studio Head M', 'Festival Programmer S', 'Distributor D'
  ],
  generateBots: (count, existingNames, existingTeams) => {
    return generateFictionalBots(count, existingNames, existingTeams);
  },

  generateAnalysis: (room) => {
    const participants = room?.participants instanceof Map
      ? Array.from(room.participants.values())
      : Array.isArray(room?.participants)
      ? room.participants
      : [];
    const budget = room?.proposedBudget || room?.categoryConfig?.defaultBudget || 150.0;
    const rankings = [];
    const teamReports = {};
    const symbol = room.categoryConfig?.currencySymbol || '$';
    const unit = room.categoryConfig?.unitLabel || 'M';

    participants.forEach(p => {
      const cast = p.squad || [];
      const directors = cast.filter(x => x.role === 'Director');
      const maleActors = cast.filter(x => x.role === 'Male Actor');
      const femaleActors = cast.filter(x => x.role === 'Female Actor');
      const maleSingers = cast.filter(x => x.role === 'Male Singer');
      const femaleSingers = cast.filter(x => x.role === 'Female Singer');
      const allActors = [...maleActors, ...femaleActors];
      const allSingers = [...maleSingers, ...femaleSingers];

      // Primary Director (highest valuation)
      directors.sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));
      const leadDirector = directors[0] || null;

      // Sort actors by star power / base price to determine Lead vs Supporting
      allActors.sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));
      const leadCast = allActors.slice(0, 2);
      const supportingCast = allActors.slice(2);

      // 1. Director Quality Score (Max 20 pts)
      let directorScore = 0;
      if (leadDirector) {
        directorScore = 12;
        if (leadDirector.tier === 'Legend') directorScore += 4;
        else if (leadDirector.tier === 'Trending') directorScore += 3;
        else directorScore += 2;
        if (leadDirector.strikeRate >= 95) directorScore += 4;
        else directorScore += 2;
      } else {
        directorScore = 5.0; // Rudderless execution penalty
      }

      // 2. Cast Quality & Acting Depth (Max 25 pts)
      let castQualityScore = 0;
      if (allActors.length === 0) {
        castQualityScore = 4.0;
      } else {
        const avgActing = allActors.reduce((acc, a) => acc + (a.strikeRate || 90), 0) / allActors.length;
        castQualityScore = (avgActing / 100) * 18;
        if (allActors.length >= 2) castQualityScore += 4;
        if (allActors.some(a => a.tier === 'Legend')) castQualityScore += 3;
      }
      castQualityScore = Math.min(25, Math.max(4, Math.round(castQualityScore * 10) / 10));

      // 3. Music & Soundtrack Value (Max 15 pts)
      let musicScore = 0;
      if (allSingers.length === 0) {
        musicScore = 4.0; // Stock library score penalty
      } else {
        musicScore = 8.0;
        if (maleSingers.length > 0 && femaleSingers.length > 0) musicScore += 4.0; // Dual vocal harmony bonus
        else if (allSingers.length >= 2) musicScore += 2.5;
        if (allSingers.some(s => s.tier === 'Legend' || s.category === 'LEGENDARY_SINGER')) musicScore += 3.0;
      }
      musicScore = Math.min(15, Math.max(4, Math.round(musicScore * 10) / 10));

      // 4. Combined Star Power & Box Office Draw (Max 15 pts)
      let starPowerScore = 0;
      if (cast.length === 0) {
        starPowerScore = 3.0;
      } else {
        const topStar = cast.reduce((max, c) => (c.basePrice > (max?.basePrice || 0) ? c : max), null);
        const topPrice = topStar ? topStar.basePrice : 15;
        starPowerScore = Math.min(10, (topPrice / 25.0) * 10);
        if (cast.filter(c => c.tier === 'Legend' || c.tier === 'Trending').length >= 3) starPowerScore += 3.0;
        if (topPrice >= 24.0) starPowerScore += 2.0; // Mega icon bonus
      }
      starPowerScore = Math.min(15, Math.max(3, Math.round(starPowerScore * 10) / 10));

      // 5. Cast Chemistry & Ensemble Balance (Max 15 pts)
      let chemistryScore = 6.0;
      if (maleActors.length > 0 && femaleActors.length > 0) chemistryScore += 3.5;
      if (leadDirector && allActors.length > 0) chemistryScore += 3.0;
      if (allSingers.length > 0 && allActors.length > 0) chemistryScore += 2.5;
      chemistryScore = Math.min(15, Math.max(5, Math.round(chemistryScore * 10) / 10));

      // 6. Value for Money & Budget Efficiency (Max 10 pts)
      const spent = Math.round((budget - p.purse) * 10) / 10;
      let efficiencyScore = 7.0;
      if (p.purse < budget * 0.05) efficiencyScore += 1.0;
      else if (p.purse > budget * 0.40) efficiencyScore -= 2.5;
      else efficiencyScore += 2.5;
      if (cast.length >= 4) efficiencyScore += 0.5;
      efficiencyScore = Math.min(10, Math.max(3, Math.round(efficiencyScore * 10) / 10));

      // Total Composite Movie Score (XX / 100)
      let movieScore = Math.round((directorScore + castQualityScore + musicScore + starPowerScore + chemistryScore + efficiencyScore) * 10) / 10;
      movieScore = Math.min(99.4, Math.max(42.0, movieScore));

      // Bespoke Non-Generic AI Critique referencing actual talent
      const movieTitle = generateDynamicMovieTitle(p.teamName, leadDirector, leadCast);
      const leadNames = leadCast.length > 0 ? leadCast.map(a => a.name).join(' & ') : 'None';
      const singerNames = allSingers.length > 0 ? allSingers.map(s => s.name).join(' & ') : 'None';

      const strengths = [];
      const weaknesses = [];

      if (leadDirector) {
        strengths.push(`Authoritative direction by ${leadDirector.name} (${leadDirector.tier} Visionary)`);
      } else {
        weaknesses.push('No recognized Director acquired — production lacks singular visionary leadership');
      }

      if (leadCast.length > 0) {
        strengths.push(`Marquee star attraction led by ${leadNames} with proven box-office magnetism`);
      } else {
        weaknesses.push('Missing A-list Lead Actors to command opening weekend theatrical footfalls');
      }

      if (allSingers.length > 0) {
        strengths.push(`Soundtrack powered by ${singerNames} ensuring chart momentum and audio reach`);
      } else {
        weaknesses.push('No playback singers acquired — film relies on uninspired generic library music');
      }

      if (maleActors.length > 0 && femaleActors.length > 0) {
        strengths.push('Excellent on-screen gender and romantic dynamic balance across lead characters');
      } else if (allActors.length > 1) {
        weaknesses.push('Lopsided cast composition lacking balanced opposite-lead chemistry');
      }

      if (p.purse > budget * 0.35) {
        weaknesses.push(`Under-budgeted production: ${symbol}${Math.round(p.purse * 10)/10} ${unit} purse left unutilized`);
      }

      let bargain = null;
      let biggestSplash = null;
      cast.forEach(x => {
        const estMid = ((x.estimatedValuation?.min ?? 25) + (x.estimatedValuation?.max ?? 75)) / 2;
        const currentBargainDiff = bargain ? (((bargain.estimatedValuation?.min ?? 25) + (bargain.estimatedValuation?.max ?? 75)) / 2 - bargain.soldPrice) : -Infinity;
        if (!bargain || (estMid - x.soldPrice) > currentBargainDiff) {
          bargain = x;
        }
        if (!biggestSplash || x.soldPrice > biggestSplash.soldPrice) {
          biggestSplash = x;
        }
      });

      rankings.push({
        id: p.id,
        name: p.name,
        teamName: p.teamName, // Film Studio Name
        avatar: p.avatar,
        overallScore: movieScore,
        movieScore,
        movieTitle,
        director: leadDirector ? leadDirector.name : 'Uncredited / Debutant',
        leadCast: leadCast.map(a => a.name),
        supportingCast: supportingCast.map(a => a.name),
        music: allSingers.map(s => s.name),
        squadCount: cast.length,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10,
        isAI: p.isAI
      });

      teamReports[p.id] = {
        id: p.id,
        teamName: p.teamName, // Film Studio Name
        name: p.name,
        movieTitle,
        movieScore,
        overallScore: movieScore,
        director: leadDirector ? leadDirector.name : 'Uncredited / Debutant',
        leadCast: leadCast.map(a => a.name),
        supportingCast: supportingCast.map(a => a.name),
        music: allSingers.map(s => s.name),
        breakdown: {
          directorScore,
          castQualityScore,
          musicScore,
          starPowerScore,
          chemistryScore,
          efficiencyScore
        },
        strengths: strengths.length > 0 ? strengths : ['Cohesive cinematic package with steady production values'],
        weaknesses: weaknesses.length > 0 ? weaknesses : ['Masterpiece package with zero glaring structural production flaws'],
        bestBargain: bargain ? `${bargain.name} (${symbol}${bargain.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        marqueeSigning: biggestSplash ? `${biggestSplash.name} (${symbol}${biggestSplash.soldPrice.toFixed(1)} ${unit})` : 'N/A',
        compositionSummary: `${movieTitle} • Directed by ${leadDirector ? leadDirector.name : 'Uncredited'} • ${cast.length} Talent signed`,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10
      };
    });

    rankings.sort((a, b) => b.overallScore - a.overallScore);

    return {
      winner: rankings[0],
      rankings,
      teamReports
    };
  }
};

// Pool Generator for Luxury Cars
function createLuxuryCarsPoolGenerator() {
  return (participantCount, customPoolSize) => {
    const targetSize = customPoolSize || calculateDynamicPoolSize(participantCount);
    const hypercars = luxuryCars.filter(c => c.role === 'Hypercar');
    const supercars = luxuryCars.filter(c => c.role === 'Supercar');
    const classics = luxuryCars.filter(c => c.role === 'Classic / Iconic Cars');
    const others = luxuryCars.filter(c => c.role !== 'Hypercar' && c.role !== 'Supercar' && c.role !== 'Classic / Iconic Cars');

    const shuffle = (arr) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const shuffHyper = shuffle(hypercars);
    const shuffSuper = shuffle(supercars);
    const shuffClassic = shuffle(classics);
    const shuffOthers = shuffle(others);

    const pool = [];
    const seenIds = new Set();
    const addUnique = (item) => {
      if (item && !seenIds.has(item.id) && pool.length < targetSize) {
        seenIds.add(item.id);
        pool.push({ ...item });
      }
    };

    shuffHyper.slice(0, 4).forEach(addUnique);
    shuffSuper.slice(0, 4).forEach(addUnique);
    shuffClassic.slice(0, 2).forEach(addUnique);
    shuffOthers.slice(0, 2).forEach(addUnique);

    const remaining = shuffle(luxuryCars.filter(c => !seenIds.has(c.id)));
    for (const item of remaining) {
      if (pool.length >= targetSize) break;
      addUnique(item);
    }

    return shuffle(pool);
  };
}

// Category 6: Luxury Cars Module (World 06)
const LUXURY_CARS_CATEGORY_MODULE = {
  id: 'luxury_cars',
  title: 'Luxury Cars Auction',
  shortTitle: 'Luxury Cars',
  tagline: "WORLD'S MOST DESIRABLE AUTOMOBILES",
  icon: '🚗',
  status: 'ACTIVE',
  franchiseLabel: 'Garage',
  franchiseLabelPlural: 'Garages',
  itemLabelSingle: 'Vehicle',
  itemLabelPlural: 'Vehicles',
  collectionLabel: 'Car Collection',
  currencySymbol: '$',
  unitLabel: 'M',
  defaultBudget: 100.0,
  minBudget: 25.0,
  maxBudget: 300.0,

  franchises: LUXURY_CAR_GARAGES,
  getFranchises: getAllGarages,
  getFranchiseById: getGarageById,
  getFranchiseByName: getGarageByName,

  getItems: () => luxuryCars,
  calculatePoolSize: calculateDynamicPoolSize,
  generatePool: createLuxuryCarsPoolGenerator(),

  fictionalTeams: [
    'Apex Collector', 'Velocity Capital', 'Blackline Motors', 'Prestige Garage',
    'Zenith Collector', 'Hyperion Syndicate', 'Monaco Collector', 'Silverstone Capital',
    'Kronos Motors', 'Sovereign Vault'
  ],
  fictionalManagers: [
    'Marcus Vance', 'Elena Rostova', 'Julian Sterling', 'Antoine Moreau',
    'Siddharth Rao', 'Chloe Bennett', 'Kenji Takahashi', 'Sebastian Wolff'
  ],
  generateBots: (count, existingNames, existingTeams) => {
    return generateFictionalBots(count, existingNames, existingTeams);
  },

  generateAnalysis: (room) => {
    const participants = room?.participants instanceof Map
      ? Array.from(room.participants.values())
      : Array.isArray(room?.participants)
      ? room.participants
      : [];
    const budget = room?.proposedBudget || room?.categoryConfig?.defaultBudget || 100.0;
    const rankings = [];
    const teamReports = {};
    const symbol = room.categoryConfig?.currencySymbol || '$';
    const unit = room.categoryConfig?.unitLabel || 'M';

    participants.forEach(p => {
      const squad = p.squad || [];
      const count = squad.length;

      // 1. Collection Quality (max 25 pts)
      let qualityScore = 0;
      if (count === 0) {
        qualityScore = 5;
      } else {
        const avgHp = squad.reduce((acc, c) => acc + (c.horsepower || 600), 0) / count;
        const legendCount = squad.filter(c => c.tier === 'Legend').length;
        qualityScore = Math.min(25, 10 + (legendCount * 3) + (avgHp >= 800 ? 5 : (avgHp >= 600 ? 3 : 1)));
      }

      // 2. Brand Power (max 20 pts)
      const marques = new Set(squad.map(c => c.manufacturer));
      let brandScore = 0;
      if (marques.size >= 4) brandScore = 20;
      else if (marques.size === 3) brandScore = 17;
      else if (marques.size === 2) brandScore = 14;
      else if (marques.size === 1) brandScore = 10;
      else brandScore = 4;

      // 3. Category Variety (max 15 pts)
      const roles = new Set(squad.map(c => c.role));
      let varietyScore = 0;
      if (roles.size >= 4) varietyScore = 15;
      else if (roles.size === 3) varietyScore = 13;
      else if (roles.size === 2) varietyScore = 10;
      else if (roles.size === 1) varietyScore = 6;
      else varietyScore = 2;

      // 4. Rarity & Collectibility (max 15 pts)
      const rareCars = squad.filter(c => (c.rarity && c.rarity.toLowerCase().includes('1 of')) || c.role === 'Classic / Iconic Cars');
      const rarityScore = Math.min(15, 6 + (rareCars.length * 3));

      // 5. Performance & Engineering (max 15 pts)
      const hyperFast = squad.filter(c => (c.topSpeed && c.topSpeed >= 210) || (c.acceleration0to60 && c.acceleration0to60 <= 2.8));
      const performanceScore = Math.min(15, 6 + (hyperFast.length * 2.5));

      // 6. Budget Efficiency & Value (max 10 pts)
      const spent = Math.round((budget - p.purse) * 10) / 10;
      let efficiencyScore = 10;
      if (p.purse > budget * 0.4) efficiencyScore -= 4;
      if (count < 2) efficiencyScore -= 4;
      efficiencyScore = Math.max(2, efficiencyScore);

      const overallScore = Math.round((qualityScore + brandScore + varietyScore + rarityScore + performanceScore + efficiencyScore) * 10) / 10;

      let marqueeCar = null;
      let bargainCar = null;
      squad.forEach(c => {
        if (!marqueeCar || (c.soldPrice || 0) > (marqueeCar.soldPrice || 0) || (c.horsepower || 0) > (marqueeCar.horsepower || 0)) {
          marqueeCar = c;
        }
        const estMid = ((c.estimatedValuation?.min || c.basePrice) + (c.estimatedValuation?.max || c.basePrice * 1.3)) / 2;
        const currentDiff = bargainCar ? (((bargainCar.estimatedValuation?.min || 1) + (bargainCar.estimatedValuation?.max || 2)) / 2 - bargainCar.soldPrice) : -Infinity;
        if (!bargainCar || (estMid - c.soldPrice) > currentDiff) {
          bargainCar = c;
        }
      });

      const strengths = [];
      const weaknesses = [];
      if (marqueeCar) {
        strengths.push(`Anchor hypercar status secured by ${marqueeCar.name} (${marqueeCar.horsepower || 700} HP, top speed ${marqueeCar.topSpeed || 200} mph)`);
      }
      if (marques.size >= 3) {
        strengths.push(`Prestige marque diversity spanning ${Array.from(marques).slice(0, 3).join(', ')}`);
      }
      if (rareCars.length >= 1) {
        strengths.push(`Rare collector provenance bolstered by ${rareCars[0].name} (${rareCars[0].rarity || 'Ultra-Rare'})`);
      }
      if (strengths.length === 0) {
        strengths.push('Clean baseline garage with solid automotive acquisitions');
      }

      if (count === 0) {
        weaknesses.push('Empty garage (zero vehicles acquired during the auction)');
      } else {
        if (marques.size <= 1 && count >= 3) {
          weaknesses.push('Overly concentrated in a single marque with limited brand variety');
        }
        if (roles.size <= 1 && count >= 2) {
          weaknesses.push('Lack of category diversity (garage heavily skewed to one vehicle type)');
        }
        if (p.purse > budget * 0.4) {
          weaknesses.push('Substantial unspent capital in an elite collector auction');
        }
      }
      if (weaknesses.length === 0) {
        weaknesses.push('Balanced elite collection with zero glaring garage deficiencies');
      }

      const totalHp = squad.reduce((acc, c) => acc + (c.horsepower || 0), 0);

      rankings.push({
        id: p.id,
        name: p.name,
        teamName: p.teamName,
        avatar: p.avatar,
        overallScore,
        squadCount: count,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10,
        isAI: p.isAI,
        breakdown: {
          qualityScore,
          brandScore,
          varietyScore,
          rarityScore,
          performanceScore,
          efficiencyScore
        }
      });

      teamReports[p.id] = {
        id: p.id,
        teamName: p.teamName,
        name: p.name,
        overallScore,
        strengths,
        weaknesses,
        bestBargain: bargainCar ? `${bargainCar.name} (${symbol}${(bargainCar.soldPrice ?? bargainCar.basePrice ?? 1.0).toFixed(1)} ${unit})` : 'N/A',
        marqueeSigning: marqueeCar ? `${marqueeCar.name} (${symbol}${(marqueeCar.soldPrice ?? marqueeCar.basePrice ?? 1.0).toFixed(1)} ${unit})` : 'N/A',
        compositionSummary: `${count} Vehicles in Garage • Total Output: ${totalHp} HP • ${symbol}${spent.toFixed(1)} ${unit} invested`,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10,
        breakdown: {
          qualityScore,
          brandScore,
          varietyScore,
          rarityScore,
          performanceScore,
          efficiencyScore
        }
      };
    });

    rankings.sort((a, b) => b.overallScore - a.overallScore);

    return {
      winner: rankings[0],
      rankings,
      teamReports
    };
  }
};

// Pool Generator for Luxury Collection
function createLuxuryCollectionPoolGenerator() {
  return (participantCount, customPoolSize) => {
    const targetSize = customPoolSize || calculateDynamicPoolSize(participantCount);
    const watches = luxuryCollection.filter(c => c.role === 'Haute Horlogerie');
    const fineArt = luxuryCollection.filter(c => c.role === 'Fine Art');
    const jewels = luxuryCollection.filter(c => c.role === 'Rare Jewellery');
    const relics = luxuryCollection.filter(c => c.role === 'Historic Collectible');

    const shuffle = (arr) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const shuffWatches = shuffle(watches);
    const shuffArt = shuffle(fineArt);
    const shuffJewels = shuffle(jewels);
    const shuffRelics = shuffle(relics);

    const pool = [];
    const seenIds = new Set();
    const addUnique = (item) => {
      if (item && !seenIds.has(item.id) && pool.length < targetSize) {
        seenIds.add(item.id);
        pool.push({ ...item });
      }
    };

    shuffWatches.slice(0, 3).forEach(addUnique);
    shuffArt.slice(0, 3).forEach(addUnique);
    shuffJewels.slice(0, 2).forEach(addUnique);
    shuffRelics.slice(0, 2).forEach(addUnique);

    const remaining = shuffle(luxuryCollection.filter(c => !seenIds.has(c.id)));
    for (const item of remaining) {
      if (pool.length >= targetSize) break;
      addUnique(item);
    }

    return shuffle(pool);
  };
}

// Category 7: Luxury Collection Module (World 07)
const LUXURY_COLLECTION_CATEGORY_MODULE = {
  id: 'luxury_collection',
  title: 'Luxury Collection Auction',
  shortTitle: 'Luxury Collection',
  tagline: 'ELITE ARTIFACTS & MASTERPIECES',
  icon: '💎',
  status: 'ACTIVE',
  franchiseLabel: 'Private Collection',
  franchiseLabelPlural: 'Private Collections',
  itemLabelSingle: 'Collectible',
  itemLabelPlural: 'Collectibles',
  collectionLabel: 'Private Vault',
  currencySymbol: '$',
  unitLabel: 'M',
  defaultBudget: 120.0,
  minBudget: 25.0,
  maxBudget: 400.0,

  franchises: LUXURY_COLLECTIONS,
  getFranchises: getAllCollections,
  getFranchiseById: getCollectionById,
  getFranchiseByName: getCollectionByName,

  getItems: () => luxuryCollection,
  calculatePoolSize: calculateDynamicPoolSize,
  generatePool: createLuxuryCollectionPoolGenerator(),

  fictionalTeams: [
    'Heritage House', 'Elite Curator', 'Blackstone Collection', 'Crown Collector',
    'Private Vault', 'Sovereign Curator', 'Elysium Trust', 'Zenith Vault',
    'Royal Conservator', 'Olympus Syndicate'
  ],
  fictionalManagers: [
    'Lord Harrington', 'Genevieve Laurent', 'Arthur Pendelton', 'Duchess Vivienne',
    'Maximilian Sterling', 'Beatrice Thorne', 'Camille Dubois', 'Alexander Cross'
  ],
  generateBots: (count, existingNames, existingTeams) => {
    return generateFictionalBots(count, existingNames, existingTeams);
  },

  generateAnalysis: (room) => {
    const participants = room?.participants instanceof Map
      ? Array.from(room.participants.values())
      : Array.isArray(room?.participants)
      ? room.participants
      : [];
    const budget = room?.proposedBudget || room?.categoryConfig?.defaultBudget || 120.0;
    const rankings = [];
    const teamReports = {};
    const symbol = room.categoryConfig?.currencySymbol || '$';
    const unit = room.categoryConfig?.unitLabel || 'M';

    participants.forEach(p => {
      const squad = p.squad || [];
      const count = squad.length;

      // 1. Rarity & Scarcity (max 25 pts)
      const uniquePieces = squad.filter(c => (c.rarity && (c.rarity.toLowerCase().includes('unique') || c.rarity.toLowerCase().includes('1 of'))) || c.tier === 'Legend');
      const rarityScore = count === 0 ? 5 : Math.min(25, 10 + (uniquePieces.length * 3.5));

      // 2. Provenance & Prestige (max 20 pts)
      const creators = new Set(squad.map(c => c.creatorOrBrand));
      let prestigeScore = 0;
      if (creators.size >= 4) prestigeScore = 20;
      else if (creators.size === 3) prestigeScore = 17;
      else if (creators.size === 2) prestigeScore = 14;
      else if (creators.size === 1) prestigeScore = 10;
      else prestigeScore = 4;

      // 3. Category Diversification (max 15 pts)
      const categories = new Set(squad.map(c => c.role || c.category));
      let diversificationScore = 0;
      if (categories.size >= 4) diversificationScore = 15;
      else if (categories.size === 3) diversificationScore = 13;
      else if (categories.size === 2) diversificationScore = 10;
      else if (categories.size === 1) diversificationScore = 6;
      else diversificationScore = 2;

      // 4. Collector Desirability (max 15 pts)
      const highDemand = squad.filter(c => c.trendingIndex === 'Top 1%' || c.trendingIndex === 'Top 2%');
      const desirabilityScore = count === 0 ? 3 : Math.min(15, 6 + (highDemand.length * 2.5));

      // 5. Craftsmanship & Quality (max 15 pts)
      const legendArtAndWatches = squad.filter(c => c.role === 'Haute Horlogerie' || c.role === 'Fine Art' || c.role === 'Rare Jewellery');
      const craftsmanshipScore = count === 0 ? 3 : Math.min(15, 6 + (legendArtAndWatches.length * 2.5));

      // 6. Budget Efficiency & Value (max 10 pts)
      const spent = Math.round((budget - p.purse) * 10) / 10;
      let efficiencyScore = 10;
      if (p.purse > budget * 0.4) efficiencyScore -= 4;
      if (count < 2) efficiencyScore -= 4;
      efficiencyScore = Math.max(2, efficiencyScore);

      const overallScore = Math.round((rarityScore + prestigeScore + diversificationScore + desirabilityScore + craftsmanshipScore + efficiencyScore) * 10) / 10;

      let centerpiece = null;
      let bargain = null;
      squad.forEach(c => {
        if (!centerpiece || (c.soldPrice || 0) > (centerpiece.soldPrice || 0)) {
          centerpiece = c;
        }
        const estMid = ((c.estimatedValuation?.min || c.basePrice) + (c.estimatedValuation?.max || c.basePrice * 1.3)) / 2;
        const currentDiff = bargain ? (((bargain.estimatedValuation?.min || 1) + (bargain.estimatedValuation?.max || 2)) / 2 - bargain.soldPrice) : -Infinity;
        if (!bargain || (estMid - c.soldPrice) > currentDiff) {
          bargain = c;
        }
      });

      const strengths = [];
      const weaknesses = [];
      if (centerpiece) {
        strengths.push(`Museum-tier centerpiece secured: ${centerpiece.name} (${centerpiece.creatorOrBrand || 'Master Ateliers'})`);
      }
      if (categories.size >= 3) {
        strengths.push(`Exceptional vault diversification across ${Array.from(categories).slice(0, 3).join(', ')}`);
      }
      if (uniquePieces.length >= 1) {
        strengths.push(`Incomparable provenance established by ${uniquePieces[0].name} (${uniquePieces[0].rarity || 'Unique'})`);
      }
      if (strengths.length === 0) {
        strengths.push('Balanced private vault with established collector artifacts');
      }

      if (count === 0) {
        weaknesses.push('Empty private vault (no artifacts acquired during auction)');
      } else {
        if (categories.size <= 1 && count >= 3) {
          weaknesses.push('Narrow vault diversification (heavily concentrated in a single medium)');
        }
        if (p.purse > budget * 0.4) {
          weaknesses.push('Under-utilized capital in an ultra-rare collector marketplace');
        }
      }
      if (weaknesses.length === 0) {
        weaknesses.push('Cohesive, high-prestige collection with flawless curator balance');
      }

      rankings.push({
        id: p.id,
        name: p.name,
        teamName: p.teamName,
        avatar: p.avatar,
        overallScore,
        squadCount: count,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10,
        isAI: p.isAI,
        breakdown: {
          rarityScore,
          prestigeScore,
          diversificationScore,
          desirabilityScore,
          craftsmanshipScore,
          efficiencyScore
        }
      });

      teamReports[p.id] = {
        id: p.id,
        teamName: p.teamName,
        name: p.name,
        overallScore,
        strengths,
        weaknesses,
        bestBargain: bargain ? `${bargain.name} (${symbol}${(bargain.soldPrice ?? bargain.basePrice ?? 1.0).toFixed(1)} ${unit})` : 'N/A',
        marqueeSigning: centerpiece ? `${centerpiece.name} (${symbol}${(centerpiece.soldPrice ?? centerpiece.basePrice ?? 1.0).toFixed(1)} ${unit})` : 'N/A',
        compositionSummary: `${count} Masterpieces in Vault • ${symbol}${spent.toFixed(1)} ${unit} curated`,
        spent,
        remainingPurse: Math.round(p.purse * 10) / 10,
        breakdown: {
          rarityScore,
          prestigeScore,
          diversificationScore,
          desirabilityScore,
          craftsmanshipScore,
          efficiencyScore
        }
      };
    });

    rankings.sort((a, b) => b.overallScore - a.overallScore);

    return {
      winner: rankings[0],
      rankings,
      teamReports
    };
  }
};

// All Categories Catalog (7 Fully Active Universal Worlds + Future Roadmap)
const CATEGORY_CATALOG = {
  ipl_cricket: IPL_CATEGORY_MODULE,
  fifa_football: FIFA_CATEGORY_MODULE,
  fifa_world_cup: FIFA_CATEGORY_MODULE, // Backward compatible alias
  formula_1: F1_CATEGORY_MODULE,
  nba: NBA_CATEGORY_MODULE,
  movie_stars: MOVIE_STARS_CATEGORY_MODULE,
  luxury_cars: LUXURY_CARS_CATEGORY_MODULE,
  luxury_collection: LUXURY_COLLECTION_CATEGORY_MODULE,
  luxury_collectibles: LUXURY_COLLECTION_CATEGORY_MODULE, // Backward compatible alias
};

const CategoryRegistry = {
  get: (categoryId) => {
    return CATEGORY_CATALOG[categoryId] || IPL_CATEGORY_MODULE;
  },
  getAll: () => {
    const seen = new Set();
    const list = [];
    for (const c of Object.values(CATEGORY_CATALOG)) {
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        list.push(c);
      }
    }
    return list;
  },
  getActive: () => {
    const seen = new Set();
    const list = [];
    for (const c of Object.values(CATEGORY_CATALOG)) {
      if (c && c.status === 'ACTIVE' && !seen.has(c.id)) {
        seen.add(c.id);
        list.push(c);
      }
    }
    return list;
  },
  getFranchises: (categoryId) => {
    const mod = CategoryRegistry.get(categoryId);
    return mod.getFranchises ? mod.getFranchises() : (mod.franchises || []);
  },
  getFranchiseById: (categoryId, id) => {
    const mod = CategoryRegistry.get(categoryId);
    return mod.getFranchiseById ? mod.getFranchiseById(id) : null;
  },
  getFranchiseByName: (categoryId, name) => {
    const mod = CategoryRegistry.get(categoryId);
    return mod.getFranchiseByName ? mod.getFranchiseByName(name) : null;
  }
};

module.exports = {
  CategoryRegistry,
  getCategoryModule: CategoryRegistry.get,
  IPL_CATEGORY_MODULE,
  FIFA_CATEGORY_MODULE,
  F1_CATEGORY_MODULE,
  NBA_CATEGORY_MODULE,
  MOVIE_STARS_CATEGORY_MODULE,
  LUXURY_CARS_CATEGORY_MODULE,
  LUXURY_COLLECTION_CATEGORY_MODULE,
  calculateDynamicPoolSize,
  calculateIPLPoolSize: calculateDynamicPoolSize
};


