// Canonical definition of the 10 Major Film Studios (Global & Indian Giants)
// In Movie Stars auction, each participant represents and owns a film studio (NO teams).
const FILM_STUDIOS = [
  {
    id: 'disney',
    code: 'DIS',
    name: 'Walt Disney Studios',
    shortName: 'Disney',
    primaryColor: '#002244',
    badge: '🏰'
  },
  {
    id: 'warner_bros',
    code: 'WB',
    name: 'Warner Bros. Pictures',
    shortName: 'Warner Bros.',
    primaryColor: '#003399',
    badge: '🛡️'
  },
  {
    id: 'universal',
    code: 'UNI',
    name: 'Universal Pictures',
    shortName: 'Universal',
    primaryColor: '#1A1A24',
    badge: '🌐'
  },
  {
    id: 'sony_pictures',
    code: 'SONY',
    name: 'Sony Pictures',
    shortName: 'Sony',
    primaryColor: '#0A0A0A',
    badge: '📽️'
  },
  {
    id: 'marvel_studios',
    code: 'MCU',
    name: 'Marvel Studios',
    shortName: 'Marvel',
    primaryColor: '#ED1D24',
    badge: '⚡'
  },
  {
    id: 'paramount',
    code: 'PARA',
    name: 'Paramount Pictures',
    shortName: 'Paramount',
    primaryColor: '#004A97',
    badge: '⛰️'
  },
  {
    id: 'twentieth_century',
    code: '20TH',
    name: '20th Century Studios',
    shortName: '20th Century',
    primaryColor: '#C9A45C',
    badge: '🏛️'
  },
  {
    id: 'yash_raj_films',
    code: 'YRF',
    name: 'Yash Raj Films',
    shortName: 'Yash Raj Films',
    primaryColor: '#D32F2F',
    badge: '👑'
  },
  {
    id: 'dharma_productions',
    code: 'DHR',
    name: 'Dharma Productions',
    shortName: 'Dharma Productions',
    primaryColor: '#6A1B9A',
    badge: '✨'
  },
  {
    id: 'lionsgate',
    code: 'LG',
    name: 'Lionsgate Films',
    shortName: 'Lionsgate',
    primaryColor: '#C59B27',
    badge: '🦁'
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

module.exports = {
  FILM_STUDIOS,
  getFilmStudioById,
  getFilmStudioByName,
  getAllFilmStudios
};
