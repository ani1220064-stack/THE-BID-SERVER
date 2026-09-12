// Canonical definition of the 10 premier NBA Basketball Franchises
const NBA_TEAMS = [
  {
    id: 'lakers',
    code: 'LAL',
    name: 'Los Angeles Lakers',
    shortName: 'Lakers',
    primaryColor: '#552583'
  },
  {
    id: 'celtics',
    code: 'BOS',
    name: 'Boston Celtics',
    shortName: 'Celtics',
    primaryColor: '#007A33'
  },
  {
    id: 'warriors',
    code: 'GSW',
    name: 'Golden State Warriors',
    shortName: 'Warriors',
    primaryColor: '#1D428A'
  },
  {
    id: 'bulls',
    code: 'CHI',
    name: 'Chicago Bulls',
    shortName: 'Bulls',
    primaryColor: '#CE1141'
  },
  {
    id: 'heat',
    code: 'MIA',
    name: 'Miami Heat',
    shortName: 'Heat',
    primaryColor: '#98002E'
  },
  {
    id: 'knicks',
    code: 'NYK',
    name: 'New York Knicks',
    shortName: 'Knicks',
    primaryColor: '#006BB6'
  },
  {
    id: 'mavericks',
    code: 'DAL',
    name: 'Dallas Mavericks',
    shortName: 'Mavericks',
    primaryColor: '#00538C'
  },
  {
    id: 'bucks',
    code: 'MIL',
    name: 'Milwaukee Bucks',
    shortName: 'Bucks',
    primaryColor: '#00471B'
  },
  {
    id: 'sixers',
    code: 'PHI',
    name: 'Philadelphia 76ers',
    shortName: '76ers',
    primaryColor: '#ED174C'
  },
  {
    id: 'nuggets',
    code: 'DEN',
    name: 'Denver Nuggets',
    shortName: 'Nuggets',
    primaryColor: '#0E2240'
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

module.exports = {
  NBA_TEAMS,
  getNBATeamById,
  getNBATeamByName,
  getAllNBATeams
};
