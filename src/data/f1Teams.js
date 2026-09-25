// Canonical definition of the 11 authentic Formula 1 Constructors for 2026 season
const F1_TEAMS = [
  {
    id: 'ferrari',
    code: 'FER',
    name: 'Scuderia Ferrari',
    shortName: 'Ferrari',
    primaryColor: '#E80020',
    featured: true
  },
  {
    id: 'red_bull',
    code: 'RBR',
    name: 'Red Bull Racing',
    shortName: 'Red Bull',
    primaryColor: '#3671C6',
    featured: true
  },
  {
    id: 'mercedes',
    code: 'MER',
    name: 'Mercedes-AMG Petronas',
    shortName: 'Mercedes',
    primaryColor: '#27F4D2',
    featured: true
  },
  {
    id: 'mclaren',
    code: 'MCL',
    name: 'McLaren F1 Team',
    shortName: 'McLaren',
    primaryColor: '#FF8000',
    featured: true
  },
  {
    id: 'aston_martin',
    code: 'AMR',
    name: 'Aston Martin Aramco',
    shortName: 'Aston Martin',
    primaryColor: '#229971',
    featured: true
  },
  {
    id: 'alpine',
    code: 'ALP',
    name: 'Alpine F1 Team',
    shortName: 'Alpine',
    primaryColor: '#0093CC',
    featured: true
  },
  {
    id: 'williams',
    code: 'WIL',
    name: 'Williams Racing',
    shortName: 'Williams',
    primaryColor: '#64C4FF',
    featured: true
  },
  {
    id: 'racing_bulls',
    code: 'RB',
    name: 'Racing Bulls',
    shortName: 'Racing Bulls',
    primaryColor: '#6692FF',
    featured: true
  },
  {
    id: 'haas',
    code: 'HAA',
    name: 'Haas F1 Team',
    shortName: 'Haas',
    primaryColor: '#B6BABD',
    featured: true
  },
  {
    id: 'audi',
    code: 'AUDI',
    name: 'Audi F1 Team',
    shortName: 'Audi',
    primaryColor: '#E2231A',
    featured: true
  },
  {
    id: 'cadillac',
    code: 'CAD',
    name: 'Cadillac Formula 1',
    shortName: 'Cadillac',
    primaryColor: '#B3995D',
    featured: true
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
    f.shortName.toLowerCase() === clean ||
    f.code.toLowerCase() === clean || 
    f.id.toLowerCase() === clean
  ) || null;
}

function getAllF1Teams() {
  return [...F1_TEAMS];
}

function getFeaturedF1Teams() {
  return F1_TEAMS.filter(t => t.featured);
}

module.exports = {
  F1_TEAMS,
  getF1TeamById,
  getF1TeamByName,
  getAllF1Teams,
  getFeaturedF1Teams
};
