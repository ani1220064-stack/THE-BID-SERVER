// Canonical definition of the 10 Elite Private Collections & Vaults
// In Luxury Collection auction, each participant represents and curates an elite Private Collection.

const LUXURY_COLLECTIONS = [
  {
    id: 'heritage_house',
    code: 'HHC',
    name: 'Heritage House Collection',
    shortName: 'Heritage House',
    primaryColor: '#C9A45C',
    badge: '🏛️'
  },
  {
    id: 'crown_jewel_vault',
    code: 'CJV',
    name: 'Crown Jewel Vault',
    shortName: 'Crown Vault',
    primaryColor: '#FA7B17',
    badge: '👑'
  },
  {
    id: 'blackstone_curators',
    code: 'BPC',
    name: 'Blackstone Private Curators',
    shortName: 'Blackstone',
    primaryColor: '#111923',
    badge: '💎'
  },
  {
    id: 'sovereign_horology',
    code: 'SHA',
    name: 'Sovereign Horology & Art',
    shortName: 'Sovereign',
    primaryColor: '#168BFF',
    badge: '⏳'
  },
  {
    id: 'elysium_fine_art',
    code: 'EAC',
    name: 'Elysium Fine Art Collection',
    shortName: 'Elysium',
    primaryColor: '#7047D9',
    badge: '🎨'
  },
  {
    id: 'zenith_treasury',
    code: 'ZTR',
    name: 'Zenith Treasury',
    shortName: 'Zenith',
    primaryColor: '#25C7E8',
    badge: '🗝️'
  },
  {
    id: 'royal_antiquities',
    code: 'RAV',
    name: 'Royal Antiquities Vault',
    shortName: 'Royal Vault',
    primaryColor: '#35B982',
    badge: '🏺'
  },
  {
    id: 'louvre_syndicate',
    code: 'LSC',
    name: 'Louvre Syndicate Curations',
    shortName: 'Louvre Syn.',
    primaryColor: '#E80020',
    badge: '🖼️'
  },
  {
    id: 'olympus_horology',
    code: 'OHH',
    name: 'Olympus Haute Horology',
    shortName: 'Olympus',
    primaryColor: '#E5A93C',
    badge: '⌚'
  },
  {
    id: 'pantheon_curators',
    code: 'PGC',
    name: 'Pantheon Global Curators',
    shortName: 'Pantheon',
    primaryColor: '#00A389',
    badge: '🌐'
  }
];

function getCollectionById(id) {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  return LUXURY_COLLECTIONS.find(c => c.id === clean || c.code.toLowerCase() === clean) || null;
}

function getCollectionByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return LUXURY_COLLECTIONS.find(c => c.name.toLowerCase() === clean || c.shortName.toLowerCase() === clean) || null;
}

function getAllCollections() {
  return LUXURY_COLLECTIONS;
}

module.exports = {
  LUXURY_COLLECTIONS,
  getCollectionById,
  getCollectionByName,
  getAllCollections
};
