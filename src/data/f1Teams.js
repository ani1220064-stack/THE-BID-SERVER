// Canonical definition of the 10 authentic Formula 1 Constructors
const F1_TEAMS = [
  {
    id: 'ferrari',
    code: 'FER',
    name: 'Scuderia Ferrari',
    shortName: 'Ferrari',
    primaryColor: '#E80020'
  },
  {
    id: 'red_bull',
    code: 'RBR',
    name: 'Red Bull Racing',
    shortName: 'Red Bull',
    primaryColor: '#3671C6'
  },
  {
    id: 'mercedes',
    code: 'MER',
    name: 'Mercedes-AMG Petronas',
    shortName: 'Mercedes',
    primaryColor: '#27F4D2'
  },
  {
    id: 'mclaren',
    code: 'MCL',
    name: 'McLaren F1 Team',
    shortName: 'McLaren',
    primaryColor: '#FF8000'
  },
  {
    id: 'aston_martin',
    code: 'AMR',
    name: 'Aston Martin Aramco',
    shortName: 'Aston Martin',
    primaryColor: '#229971'
  },
  {
    id: 'alpine',
    code: 'ALP',
    name: 'Alpine F1 Team',
    shortName: 'Alpine',
    primaryColor: '#0093CC'
  },
  {
    id: 'williams',
    code: 'WIL',
    name: 'Williams Racing',
    shortName: 'Williams',
    primaryColor: '#64C4FF'
  },
  {
    id: 'rb',
    code: 'VCARB',
    name: 'Visa Cash App RB',
    shortName: 'Racing Bulls',
    primaryColor: '#6692FF'
  },
  {
    id: 'sauber',
    code: 'SAU',
    name: 'Stake F1 Team Kick Sauber',
    shortName: 'Sauber',
    primaryColor: '#52E252'
  },
  {
    id: 'haas',
    code: 'HAA',
    name: 'Haas F1 Team',
    shortName: 'Haas',
    primaryColor: '#B6BABD'
  }
];

function getF1TeamById(id) {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  return F1_TEAMS.find(f => f.id === clean || f.code.toLowerCase() === clean) || null;
}

function getF1TeamByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return F1_TEAMS.find(f => 
    f.name.toLowerCase() === clean || 
    f.code.toLowerCase() === clean || 
    f.id.toLowerCase() === clean
  ) || null;
}

function getAllF1Teams() {
  return [...F1_TEAMS];
}

module.exports = {
  F1_TEAMS,
  getF1TeamById,
  getF1TeamByName,
  getAllF1Teams
};
