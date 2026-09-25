// FIFA / International Football — National Team Registry
// 48 selectable national teams in the game registry
// Curated Top 20 Featured (≥ 41 rule) with India #1, China #2, USA #3

const FIFA_TEAMS = [
  // --- TOP 20 FEATURED (Global Market Ordering: India #1, China #2, USA #3, then World Titans) ---
  {
    id: 'ind',
    code: 'IND',
    name: 'India',
    shortName: 'India',
    primaryColor: '#0054A6',
    featured: true
  },
  {
    id: 'chn',
    code: 'CHN',
    name: 'China PR',
    shortName: 'China',
    primaryColor: '#EE1C25',
    featured: true
  },
  {
    id: 'usa',
    code: 'USA',
    name: 'United States',
    shortName: 'USA',
    primaryColor: '#0A3161',
    featured: true
  },
  {
    id: 'bra',
    code: 'BRA',
    name: 'Brazil',
    shortName: 'Brazil',
    primaryColor: '#FFDF00',
    featured: true
  },
  {
    id: 'arg',
    code: 'ARG',
    name: 'Argentina',
    shortName: 'Argentina',
    primaryColor: '#75AADB',
    featured: true
  },
  {
    id: 'fra',
    code: 'FRA',
    name: 'France',
    shortName: 'France',
    primaryColor: '#002654',
    featured: true
  },
  {
    id: 'ger',
    code: 'GER',
    name: 'Germany',
    shortName: 'Germany',
    primaryColor: '#DD0000',
    featured: true
  },
  {
    id: 'eng',
    code: 'ENG',
    name: 'England',
    shortName: 'England',
    primaryColor: '#CF081F',
    featured: true
  },
  {
    id: 'esp',
    code: 'ESP',
    name: 'Spain',
    shortName: 'Spain',
    primaryColor: '#AA151B',
    featured: true
  },
  {
    id: 'por',
    code: 'POR',
    name: 'Portugal',
    shortName: 'Portugal',
    primaryColor: '#006600',
    featured: true
  },
  {
    id: 'ned',
    code: 'NED',
    name: 'Netherlands',
    shortName: 'Netherlands',
    primaryColor: '#F36C21',
    featured: true
  },
  {
    id: 'ita',
    code: 'ITA',
    name: 'Italy',
    shortName: 'Italy',
    primaryColor: '#0064AA',
    featured: true
  },
  {
    id: 'bel',
    code: 'BEL',
    name: 'Belgium',
    shortName: 'Belgium',
    primaryColor: '#ED2939',
    featured: true
  },
  {
    id: 'jpn',
    code: 'JPN',
    name: 'Japan',
    shortName: 'Japan',
    primaryColor: '#002B66',
    featured: true
  },
  {
    id: 'kor',
    code: 'KOR',
    name: 'South Korea',
    shortName: 'South Korea',
    primaryColor: '#C60C30',
    featured: true
  },
  {
    id: 'cro',
    code: 'CRO',
    name: 'Croatia',
    shortName: 'Croatia',
    primaryColor: '#FF0000',
    featured: true
  },
  {
    id: 'mar',
    code: 'MAR',
    name: 'Morocco',
    shortName: 'Morocco',
    primaryColor: '#C1272D',
    featured: true
  },
  {
    id: 'uru',
    code: 'URU',
    name: 'Uruguay',
    shortName: 'Uruguay',
    primaryColor: '#5C88DA',
    featured: true
  },
  {
    id: 'mex',
    code: 'MEX',
    name: 'Mexico',
    shortName: 'Mexico',
    primaryColor: '#006847',
    featured: true
  },
  {
    id: 'ksa',
    code: 'KSA',
    name: 'Saudi Arabia',
    shortName: 'Saudi Arabia',
    primaryColor: '#006C35',
    featured: true
  },

  // --- ADDITIONAL 28 NATIONAL TEAMS (Available via View All & Search) ---
  { id: 'aus', code: 'AUS', name: 'Australia', shortName: 'Australia', primaryColor: '#00843D', featured: false },
  { id: 'can', code: 'CAN', name: 'Canada', shortName: 'Canada', primaryColor: '#DA291C', featured: false },
  { id: 'col', code: 'COL', name: 'Colombia', shortName: 'Colombia', primaryColor: '#FCD116', featured: false },
  { id: 'sui', code: 'SUI', name: 'Switzerland', shortName: 'Switzerland', primaryColor: '#D52B1E', featured: false },
  { id: 'den', code: 'DEN', name: 'Denmark', shortName: 'Denmark', primaryColor: '#C60C30', featured: false },
  { id: 'sen', code: 'SEN', name: 'Senegal', shortName: 'Senegal', primaryColor: '#00853F', featured: false },
  { id: 'nga', code: 'NGA', name: 'Nigeria', shortName: 'Nigeria', primaryColor: '#008751', featured: false },
  { id: 'egy', code: 'EGY', name: 'Egypt', shortName: 'Egypt', primaryColor: '#C8102E', featured: false },
  { id: 'civ', code: 'CIV', name: 'Ivory Coast', shortName: 'Ivory Coast', primaryColor: '#F77F00', featured: false },
  { id: 'gha', code: 'GHA', name: 'Ghana', shortName: 'Ghana', primaryColor: '#006B3F', featured: false },
  { id: 'pol', code: 'POL', name: 'Poland', shortName: 'Poland', primaryColor: '#DC143C', featured: false },
  { id: 'aut', code: 'AUT', name: 'Austria', shortName: 'Austria', primaryColor: '#ED2939', featured: false },
  { id: 'swe', code: 'SWE', name: 'Sweden', shortName: 'Sweden', primaryColor: '#006AA7', featured: false },
  { id: 'srb', code: 'SRB', name: 'Serbia', shortName: 'Serbia', primaryColor: '#C6363C', featured: false },
  { id: 'ukr', code: 'UKR', name: 'Ukraine', shortName: 'Ukraine', primaryColor: '#FFD700', featured: false },
  { id: 'chi', code: 'CHI', name: 'Chile', shortName: 'Chile', primaryColor: '#D52B1E', featured: false },
  { id: 'ecu', code: 'ECU', name: 'Ecuador', shortName: 'Ecuador', primaryColor: '#FFDD00', featured: false },
  { id: 'per', code: 'PER', name: 'Peru', shortName: 'Peru', primaryColor: '#D91023', featured: false },
  { id: 'irn', code: 'IRN', name: 'Iran', shortName: 'Iran', primaryColor: '#239F40', featured: false },
  { id: 'qat', code: 'QAT', name: 'Qatar', shortName: 'Qatar', primaryColor: '#8A1538', featured: false },
  { id: 'uzb', code: 'UZB', name: 'Uzbekistan', shortName: 'Uzbekistan', primaryColor: '#0099B5', featured: false },
  { id: 'nzl', code: 'NZL', name: 'New Zealand', shortName: 'New Zealand', primaryColor: '#000000', featured: false },
  { id: 'sco', code: 'SCO', name: 'Scotland', shortName: 'Scotland', primaryColor: '#005EB8', featured: false },
  { id: 'wal', code: 'WAL', name: 'Wales', shortName: 'Wales', primaryColor: '#C8102E', featured: false },
  { id: 'tur', code: 'TUR', name: 'Turkey', shortName: 'Turkey', primaryColor: '#E30A17', featured: false },
  { id: 'cze', code: 'CZE', name: 'Czechia', shortName: 'Czechia', primaryColor: '#11457E', featured: false },
  { id: 'cmr', code: 'CMR', name: 'Cameroon', shortName: 'Cameroon', primaryColor: '#007A3D', featured: false },
  { id: 'alg', code: 'ALG', name: 'Algeria', shortName: 'Algeria', primaryColor: '#006233', featured: false }
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
    f.shortName.toLowerCase() === clean ||
    f.code.toLowerCase() === clean || 
    f.id.toLowerCase() === clean
  ) || null;
}

function getAllFIFATeams() {
  return [...FIFA_TEAMS];
}

function getFeaturedFIFATeams() {
  return FIFA_TEAMS.filter(t => t.featured);
}

module.exports = {
  FIFA_TEAMS,
  getFIFATeamById,
  getFIFATeamByName,
  getAllFIFATeams,
  getFeaturedFIFATeams
};
