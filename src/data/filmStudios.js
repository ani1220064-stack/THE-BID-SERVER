// Canonical definition of the 20 Curated Major Film Studios (50% Indian Giants & 50% Global Titans)
// In Movie Stars auction, each participant represents and owns a film studio/production house.

const FILM_STUDIOS = [
  // --- INDIAN GIANTS (10) ---
  {
    id: 'yrf',
    code: 'YRF',
    name: 'Yash Raj Films',
    shortName: 'Yash Raj Films',
    primaryColor: '#D32F2F',
    badge: '👑',
    featured: true,
    region: 'Indian'
  },
  {
    id: 'dhr',
    code: 'DHR',
    name: 'Dharma Productions',
    shortName: 'Dharma',
    primaryColor: '#6A1B9A',
    badge: '✨',
    featured: true,
    region: 'Indian'
  },
  {
    id: 'tseries',
    code: 'TSER',
    name: 'T-Series Films',
    shortName: 'T-Series',
    primaryColor: '#E53935',
    badge: '🎵',
    featured: true,
    region: 'Indian'
  },
  {
    id: 'red_chillies',
    code: 'RCE',
    name: 'Red Chillies Entertainment',
    shortName: 'Red Chillies',
    primaryColor: '#C2185B',
    badge: '🌶️',
    featured: true,
    region: 'Indian'
  },
  {
    id: 'jio_studios',
    code: 'JIO',
    name: 'Jio Studios',
    shortName: 'Jio Studios',
    primaryColor: '#1976D2',
    badge: '📱',
    featured: true,
    region: 'Indian'
  },
  {
    id: 'hombale',
    code: 'HOM',
    name: 'Hombale Films',
    shortName: 'Hombale',
    primaryColor: '#F57C00',
    badge: '🔥',
    featured: true,
    region: 'Indian'
  },
  {
    id: 'excel',
    code: 'EXC',
    name: 'Excel Entertainment',
    shortName: 'Excel',
    primaryColor: '#0288D1',
    badge: '⭐',
    featured: true,
    region: 'Indian'
  },
  {
    id: 'maddock',
    code: 'MAD',
    name: 'Maddock Films',
    shortName: 'Maddock',
    primaryColor: '#388E3C',
    badge: '🎬',
    featured: true,
    region: 'Indian'
  },
  {
    id: 'rajshri',
    code: 'RAJ',
    name: 'Rajshri Productions',
    shortName: 'Rajshri',
    primaryColor: '#7B1FA2',
    badge: '🕊️',
    featured: true,
    region: 'Indian'
  },
  {
    id: 'nadiadwala',
    code: 'NGE',
    name: 'Nadiadwala Grandson Entertainment',
    shortName: 'Nadiadwala',
    primaryColor: '#D81B60',
    badge: '🌟',
    featured: true,
    region: 'Indian'
  },

  // --- GLOBAL TITANS (10) ---
  {
    id: 'disney',
    code: 'DIS',
    name: 'Walt Disney Pictures',
    shortName: 'Disney',
    primaryColor: '#002244',
    badge: '🏰',
    featured: true,
    region: 'Global'
  },
  {
    id: 'warner_bros',
    code: 'WB',
    name: 'Warner Bros. Pictures',
    shortName: 'Warner Bros.',
    primaryColor: '#003399',
    badge: '🛡️',
    featured: true,
    region: 'Global'
  },
  {
    id: 'universal',
    code: 'UNI',
    name: 'Universal Pictures',
    shortName: 'Universal',
    primaryColor: '#1A1A24',
    badge: '🌐',
    featured: true,
    region: 'Global'
  },
  {
    id: 'sony_pictures',
    code: 'SONY',
    name: 'Sony Pictures',
    shortName: 'Sony',
    primaryColor: '#0A0A0A',
    badge: '📽️',
    featured: true,
    region: 'Global'
  },
  {
    id: 'paramount',
    code: 'PARA',
    name: 'Paramount Pictures',
    shortName: 'Paramount',
    primaryColor: '#004A97',
    badge: '⛰️',
    featured: true,
    region: 'Global'
  },
  {
    id: 'twentieth_century',
    code: '20TH',
    name: '20th Century Studios',
    shortName: '20th Century',
    primaryColor: '#C9A45C',
    badge: '🏛️',
    featured: true,
    region: 'Global'
  },
  {
    id: 'lionsgate',
    code: 'LG',
    name: 'Lionsgate Films',
    shortName: 'Lionsgate',
    primaryColor: '#C59B27',
    badge: '🦁',
    featured: true,
    region: 'Global'
  },
  {
    id: 'a24',
    code: 'A24',
    name: 'A24',
    shortName: 'A24',
    primaryColor: '#000000',
    badge: '🎞️',
    featured: true,
    region: 'Global'
  },
  {
    id: 'mgm',
    code: 'MGM',
    name: 'Metro-Goldwyn-Mayer',
    shortName: 'MGM',
    primaryColor: '#D4AF37',
    badge: '🦁',
    featured: true,
    region: 'Global'
  },
  {
    id: 'united_artists',
    code: 'UA',
    name: 'United Artists',
    shortName: 'United Artists',
    primaryColor: '#333333',
    badge: '🎨',
    featured: true,
    region: 'Global'
  }
];

function getFilmStudioById(id) {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  return FILM_STUDIOS.find(s => s.id === clean || s.code.toLowerCase() === clean) || null;
}

function getFilmStudioByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return FILM_STUDIOS.find(s => 
    s.name.toLowerCase() === clean || 
    s.shortName.toLowerCase() === clean ||
    s.code.toLowerCase() === clean || 
    s.id.toLowerCase() === clean
  ) || null;
}

function getAllFilmStudios() {
  return [...FILM_STUDIOS];
}

function getFeaturedFilmStudios() {
  return FILM_STUDIOS.filter(s => s.featured);
}

module.exports = {
  FILM_STUDIOS,
  getFilmStudioById,
  getFilmStudioByName,
  getAllFilmStudios,
  getFeaturedFilmStudios
};
