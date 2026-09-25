// Canonical definition of the 30 premier NBA Basketball Franchises
// Curated Top 15 Featured (≤ 40 total entities rule) + complete 30-team registry

const NBA_TEAMS = [
  // --- TOP 15 FEATURED ---
  {
    id: 'lakers',
    code: 'LAL',
    name: 'Los Angeles Lakers',
    shortName: 'Lakers',
    primaryColor: '#552583',
    featured: true
  },
  {
    id: 'celtics',
    code: 'BOS',
    name: 'Boston Celtics',
    shortName: 'Celtics',
    primaryColor: '#007A33',
    featured: true
  },
  {
    id: 'warriors',
    code: 'GSW',
    name: 'Golden State Warriors',
    shortName: 'Warriors',
    primaryColor: '#1D428A',
    featured: true
  },
  {
    id: 'bulls',
    code: 'CHI',
    name: 'Chicago Bulls',
    shortName: 'Bulls',
    primaryColor: '#CE1141',
    featured: true
  },
  {
    id: 'heat',
    code: 'MIA',
    name: 'Miami Heat',
    shortName: 'Heat',
    primaryColor: '#98002E',
    featured: true
  },
  {
    id: 'knicks',
    code: 'NYK',
    name: 'New York Knicks',
    shortName: 'Knicks',
    primaryColor: '#006BB6',
    featured: true
  },
  {
    id: 'mavericks',
    code: 'DAL',
    name: 'Dallas Mavericks',
    shortName: 'Mavericks',
    primaryColor: '#00538C',
    featured: true
  },
  {
    id: 'bucks',
    code: 'MIL',
    name: 'Milwaukee Bucks',
    shortName: 'Bucks',
    primaryColor: '#00471B',
    featured: true
  },
  {
    id: 'sixers',
    code: 'PHI',
    name: 'Philadelphia 76ers',
    shortName: '76ers',
    primaryColor: '#ED174C',
    featured: true
  },
  {
    id: 'nuggets',
    code: 'DEN',
    name: 'Denver Nuggets',
    shortName: 'Nuggets',
    primaryColor: '#0E2240',
    featured: true
  },
  {
    id: 'suns',
    code: 'PHX',
    name: 'Phoenix Suns',
    shortName: 'Suns',
    primaryColor: '#E56020',
    featured: true
  },
  {
    id: 'spurs',
    code: 'SAS',
    name: 'San Antonio Spurs',
    shortName: 'Spurs',
    primaryColor: '#C4CED4',
    featured: true
  },
  {
    id: 'nets',
    code: 'BKN',
    name: 'Brooklyn Nets',
    shortName: 'Nets',
    primaryColor: '#000000',
    featured: true
  },
  {
    id: 'raptors',
    code: 'TOR',
    name: 'Toronto Raptors',
    shortName: 'Raptors',
    primaryColor: '#CE1141',
    featured: true
  },
  {
    id: 'rockets',
    code: 'HOU',
    name: 'Houston Rockets',
    shortName: 'Rockets',
    primaryColor: '#CE1141',
    featured: true
  },

  // --- ADDITIONAL 15 REGISTRY FRANCHISES (Available via View All & Search) ---
  {
    id: 'clippers',
    code: 'LAC',
    name: 'LA Clippers',
    shortName: 'Clippers',
    primaryColor: '#C8102E',
    featured: false
  },
  {
    id: 'cavaliers',
    code: 'CLE',
    name: 'Cleveland Cavaliers',
    shortName: 'Cavaliers',
    primaryColor: '#860038',
    featured: false
  },
  {
    id: 'timberwolves',
    code: 'MIN',
    name: 'Minnesota Timberwolves',
    shortName: 'Timberwolves',
    primaryColor: '#0C2340',
    featured: false
  },
  {
    id: 'thunder',
    code: 'OKC',
    name: 'Oklahoma City Thunder',
    shortName: 'Thunder',
    primaryColor: '#007AC1',
    featured: false
  },
  {
    id: 'pacers',
    code: 'IND',
    name: 'Indiana Pacers',
    shortName: 'Pacers',
    primaryColor: '#002D62',
    featured: false
  },
  {
    id: 'magic',
    code: 'ORL',
    name: 'Orlando Magic',
    shortName: 'Magic',
    primaryColor: '#0077C0',
    featured: false
  },
  {
    id: 'pelicans',
    code: 'NOP',
    name: 'New Orleans Pelicans',
    shortName: 'Pelicans',
    primaryColor: '#0C2340',
    featured: false
  },
  {
    id: 'kings',
    code: 'SAC',
    name: 'Sacramento Kings',
    shortName: 'Kings',
    primaryColor: '#5A2D81',
    featured: false
  },
  {
    id: 'grizzlies',
    code: 'MEM',
    name: 'Memphis Grizzlies',
    shortName: 'Grizzlies',
    primaryColor: '#5D76A9',
    featured: false
  },
  {
    id: 'hawks',
    code: 'ATL',
    name: 'Atlanta Hawks',
    shortName: 'Hawks',
    primaryColor: '#C1D32F',
    featured: false
  },
  {
    id: 'blazers',
    code: 'POR',
    name: 'Portland Trail Blazers',
    shortName: 'Trail Blazers',
    primaryColor: '#E03A3E',
    featured: false
  },
  {
    id: 'jazz',
    code: 'UTA',
    name: 'Utah Jazz',
    shortName: 'Jazz',
    primaryColor: '#002B5C',
    featured: false
  },
  {
    id: 'pistons',
    code: 'DET',
    name: 'Detroit Pistons',
    shortName: 'Pistons',
    primaryColor: '#1D42BA',
    featured: false
  },
  {
    id: 'hornets',
    code: 'CHA',
    name: 'Charlotte Hornets',
    shortName: 'Hornets',
    primaryColor: '#1D1160',
    featured: false
  },
  {
    id: 'wizards',
    code: 'WAS',
    name: 'Washington Wizards',
    shortName: 'Wizards',
    primaryColor: '#002B5C',
    featured: false
  }
];

function getNBATeamById(id) {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  return NBA_TEAMS.find(t => t.id === clean || t.code.toLowerCase() === clean) || null;
}

function getNBATeamByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return NBA_TEAMS.find(t => 
    t.name.toLowerCase() === clean || 
    t.shortName.toLowerCase() === clean ||
    t.code.toLowerCase() === clean || 
    t.id.toLowerCase() === clean
  ) || null;
}

function getAllNBATeams() {
  return [...NBA_TEAMS];
}

function getFeaturedNBATeams() {
  return NBA_TEAMS.filter(t => t.featured);
}

module.exports = {
  NBA_TEAMS,
  getNBATeamById,
  getNBATeamByName,
  getAllNBATeams,
  getFeaturedNBATeams
};
