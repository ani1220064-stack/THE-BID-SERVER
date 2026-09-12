// Canonical definition of the 10 authentic IPL franchises
const IPL_FRANCHISES = [
  {
    id: 'rcb',
    code: 'RCB',
    name: 'Royal Challengers Bengaluru',
    shortName: 'Bengaluru',
    primaryColor: '#E02020'
  },
  {
    id: 'csk',
    code: 'CSK',
    name: 'Chennai Super Kings',
    shortName: 'Chennai',
    primaryColor: '#F9CD05'
  },
  {
    id: 'mi',
    code: 'MI',
    name: 'Mumbai Indians',
    shortName: 'Mumbai',
    primaryColor: '#004BA0'
  },
  {
    id: 'kkr',
    code: 'KKR',
    name: 'Kolkata Knight Riders',
    shortName: 'Kolkata',
    primaryColor: '#3A225D'
  },
  {
    id: 'srh',
    code: 'SRH',
    name: 'Sunrisers Hyderabad',
    shortName: 'Hyderabad',
    primaryColor: '#F26522'
  },
  {
    id: 'rr',
    code: 'RR',
    name: 'Rajasthan Royals',
    shortName: 'Rajasthan',
    primaryColor: '#EA1A85'
  },
  {
    id: 'dc',
    code: 'DC',
    name: 'Delhi Capitals',
    shortName: 'Delhi',
    primaryColor: '#0078BC'
  },
  {
    id: 'pbks',
    code: 'PBKS',
    name: 'Punjab Kings',
    shortName: 'Punjab',
    primaryColor: '#ED1B24'
  },
  {
    id: 'gt',
    code: 'GT',
    name: 'Gujarat Titans',
    shortName: 'Gujarat',
    primaryColor: '#1B2133'
  },
  {
    id: 'lsg',
    code: 'LSG',
    name: 'Lucknow Super Giants',
    shortName: 'Lucknow',
    primaryColor: '#A72056'
  }
];

function getFranchiseById(id) {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  return IPL_FRANCHISES.find(f => f.id === clean || f.code.toLowerCase() === clean) || null;
}

function getFranchiseByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return IPL_FRANCHISES.find(f => 
    f.name.toLowerCase() === clean || 
    f.code.toLowerCase() === clean || 
    f.id.toLowerCase() === clean
  ) || null;
}

function getAllFranchises() {
  return [...IPL_FRANCHISES];
}

module.exports = {
  IPL_FRANCHISES,
  getFranchiseById,
  getFranchiseByName,
  getAllFranchises
};
