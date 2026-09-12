// Canonical definition of the 10 authentic FIFA premier teams / nations
const FIFA_TEAMS = [
  {
    id: 'bra',
    code: 'BRA',
    name: 'Brazil',
    shortName: 'Brazil',
    primaryColor: '#FFDF00'
  },
  {
    id: 'arg',
    code: 'ARG',
    name: 'Argentina',
    shortName: 'Argentina',
    primaryColor: '#75AADB'
  },
  {
    id: 'fra',
    code: 'FRA',
    name: 'France',
    shortName: 'France',
    primaryColor: '#002654'
  },
  {
    id: 'ger',
    code: 'GER',
    name: 'Germany',
    shortName: 'Germany',
    primaryColor: '#DD0000'
  },
  {
    id: 'eng',
    code: 'ENG',
    name: 'England',
    shortName: 'England',
    primaryColor: '#CF081F'
  },
  {
    id: 'esp',
    code: 'ESP',
    name: 'Spain',
    shortName: 'Spain',
    primaryColor: '#AA151B'
  },
  {
    id: 'por',
    code: 'POR',
    name: 'Portugal',
    shortName: 'Portugal',
    primaryColor: '#006600'
  },
  {
    id: 'ned',
    code: 'NED',
    name: 'Netherlands',
    shortName: 'Netherlands',
    primaryColor: '#F36C21'
  },
  {
    id: 'ita',
    code: 'ITA',
    name: 'Italy',
    shortName: 'Italy',
    primaryColor: '#0064AA'
  },
  {
    id: 'bel',
    code: 'BEL',
    name: 'Belgium',
    shortName: 'Belgium',
    primaryColor: '#ED2939'
  }
];

function getFIFATeamById(id) {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  return FIFA_TEAMS.find(f => f.id === clean || f.code.toLowerCase() === clean) || null;
}

function getFIFATeamByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return FIFA_TEAMS.find(f => 
    f.name.toLowerCase() === clean || 
    f.code.toLowerCase() === clean || 
    f.id.toLowerCase() === clean
  ) || null;
}

function getAllFIFATeams() {
  return [...FIFA_TEAMS];
}

module.exports = {
  FIFA_TEAMS,
  getFIFATeamById,
  getFIFATeamByName,
  getAllFIFATeams
};
