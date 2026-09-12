// Canonical definition of the 10 Elite Automotive Garages / Collections
// In Luxury Cars auction, each participant represents and owns a prestigious Garage.

const LUXURY_CAR_GARAGES = [
  {
    id: 'apex_motorsport',
    code: 'APEX',
    name: 'Apex Motorsport Garage',
    shortName: 'Apex',
    primaryColor: '#168BFF',
    badge: '🏎️'
  },
  {
    id: 'velocity_vault',
    code: 'VEL',
    name: 'Velocity Vault',
    shortName: 'Velocity',
    primaryColor: '#E80020',
    badge: '⚡'
  },
  {
    id: 'blackline_scuderia',
    code: 'BLK',
    name: 'Blackline Scuderia',
    shortName: 'Blackline',
    primaryColor: '#111923',
    badge: '🏁'
  },
  {
    id: 'prestige_heritage',
    code: 'PHG',
    name: 'Prestige Heritage Garage',
    shortName: 'Prestige',
    primaryColor: '#C9A45C',
    badge: '👑'
  },
  {
    id: 'zenith_hypercar',
    code: 'ZNT',
    name: 'Zenith Hypercar Syndicate',
    shortName: 'Zenith',
    primaryColor: '#25C7E8',
    badge: '💎'
  },
  {
    id: 'monaco_motors',
    code: 'MMC',
    name: 'Monaco Motors Collection',
    shortName: 'Monaco',
    primaryColor: '#35B982',
    badge: '🇲🇨'
  },
  {
    id: 'silverstone_garage',
    code: 'SPG',
    name: 'Silverstone Private Garage',
    shortName: 'Silverstone',
    primaryColor: '#7047D9',
    badge: '🏎️'
  },
  {
    id: 'kronos_performance',
    code: 'KRN',
    name: 'Kronos Performance House',
    shortName: 'Kronos',
    primaryColor: '#FA7B17',
    badge: '⏱️'
  },
  {
    id: 'sovereign_exotic',
    code: 'SOV',
    name: 'Sovereign Exotic Garage',
    shortName: 'Sovereign',
    primaryColor: '#E5A93C',
    badge: '🛡️'
  },
  {
    id: 'vantage_vault',
    code: 'VAN',
    name: 'Vantage Supercar Vault',
    shortName: 'Vantage',
    primaryColor: '#00A389',
    badge: '🦅'
  }
];

function getGarageById(id) {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  return LUXURY_CAR_GARAGES.find(g => g.id === clean || g.code.toLowerCase() === clean) || null;
}

function getGarageByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return LUXURY_CAR_GARAGES.find(g => g.name.toLowerCase() === clean || g.shortName.toLowerCase() === clean) || null;
}

function getAllGarages() {
  return LUXURY_CAR_GARAGES;
}

module.exports = {
  LUXURY_CAR_GARAGES,
  getGarageById,
  getGarageByName,
  getAllGarages
};
