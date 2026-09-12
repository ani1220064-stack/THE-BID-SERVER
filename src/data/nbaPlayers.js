// NBA Basketball Superstars Roster with stats, form, and dynamic game valuation models
const nbaPlayers = [
  {
    id: "nba-01",
    name: "Nikola Jokić",
    role: "Center",
    nationality: "Serbian",
    basePrice: 20.0,
    matches: 675,
    runs: 26,     // PPG
    wickets: 12,  // RPG
    strikeRate: 9, // APG
    points: 26.4,
    rebounds: 12.4,
    assists: 9.0,
    titles: 1,
    recentForm: "3x NBA MVP & Historic Triple-Double Efficiency",
    brandValue: "The Joker / Greatest Passing Big Man Ever",
    trendingIndex: "Peak Market (#1)",
    estimatedValuation: { min: 70.0, max: 120.0 },
    specialty: "Sombor Shuffle, Court Vision & Unstoppable Post Mastery",
    avatarBg: "from-blue-700 to-amber-500"
  },
  {
    id: "nba-02",
    name: "Luka Dončić",
    role: "Point Guard",
    nationality: "Slovenian",
    basePrice: 20.0,
    matches: 400,
    runs: 34,     // PPG
    wickets: 9,   // RPG
    strikeRate: 10, // APG
    points: 33.9,
    rebounds: 9.2,
    assists: 9.8,
    titles: 0,
    recentForm: "NBA Scoring Champion & Masterful Helocentric Wizard",
    brandValue: "Global Phenom / Wonder Boy",
    trendingIndex: "Peak Market (#2)",
    estimatedValuation: { min: 68.0, max: 115.0 },
    specialty: "Step-back Three, Slow-Motion Deceleration & Pick-and-Roll Dissection",
    avatarBg: "from-blue-600 to-cyan-500"
  },
  {
    id: "nba-03",
    name: "Giannis Antetokounmpo",
    role: "Power Forward",
    nationality: "Greek",
    basePrice: 19.0,
    matches: 792,
    runs: 30,     // PPG
    wickets: 11,  // RPG
    strikeRate: 6, // APG
    points: 30.4,
    rebounds: 11.5,
    assists: 6.5,
    titles: 1,
    recentForm: "Unstoppable Downhill Force & 2x MVP Dominance",
    brandValue: "The Greek Freak",
    trendingIndex: "Peak Market (#3)",
    estimatedValuation: { min: 65.0, max: 110.0 },
    specialty: "Eurostep Transition Dunks, Paint Annihilation & DPOY Rim Protection",
    avatarBg: "from-emerald-700 to-amber-200"
  },
  {
    id: "nba-04",
    name: "Stephen Curry",
    role: "Point Guard",
    nationality: "American",
    basePrice: 18.0,
    matches: 956,
    runs: 27,     // PPG
    wickets: 4,   // RPG
    strikeRate: 5, // APG
    points: 26.4,
    rebounds: 4.5,
    assists: 5.1,
    titles: 4,
    recentForm: "Greatest Shooter in Basketball History & 4x Champion",
    brandValue: "Chef Curry / Global NBA Face",
    trendingIndex: "Legend Tier (#1)",
    estimatedValuation: { min: 62.0, max: 105.0 },
    specialty: "Logo Range Threes, Relentless Off-Ball Gravity & Clutch Daggers",
    avatarBg: "from-yellow-400 to-blue-700"
  },
  {
    id: "nba-05",
    name: "LeBron James",
    role: "Small Forward",
    nationality: "American",
    basePrice: 18.0,
    matches: 1492,
    runs: 25,     // PPG
    wickets: 7,   // RPG
    strikeRate: 8, // APG
    points: 25.7,
    rebounds: 7.3,
    assists: 8.3,
    titles: 4,
    recentForm: "All-Time NBA Scoring Leader & 21-Year Benchmark",
    brandValue: "King James / The Chosen One",
    trendingIndex: "Legend Tier (#2)",
    estimatedValuation: { min: 60.0, max: 105.0 },
    specialty: "Full-Court Transition Bully Ball, High-IQ Playmaking & Chase-down Blocks",
    avatarBg: "from-purple-700 to-yellow-500"
  },
  {
    id: "nba-06",
    name: "Shai Gilgeous-Alexander",
    role: "Point Guard",
    nationality: "Canadian",
    basePrice: 18.0,
    matches: 386,
    runs: 30,     // PPG
    wickets: 6,   // RPG
    strikeRate: 6, // APG
    points: 30.1,
    rebounds: 5.5,
    assists: 6.2,
    titles: 0,
    recentForm: "MVP Runner-Up & Mid-Range Maestro",
    brandValue: "SGA / All-NBA 1st Team Star",
    trendingIndex: "Rising Sensation (#1)",
    estimatedValuation: { min: 58.0, max: 100.0 },
    specialty: "Slippery Iso Penetration, Lethal Mid-Range Pull-up & Steals Leader",
    avatarBg: "from-blue-500 to-orange-500"
  },
  {
    id: "nba-07",
    name: "Jayson Tatum",
    role: "Small Forward",
    nationality: "American",
    basePrice: 17.0,
    matches: 513,
    runs: 27,     // PPG
    wickets: 8,   // RPG
    strikeRate: 5, // APG
    points: 26.9,
    rebounds: 8.1,
    assists: 4.9,
    titles: 1,
    recentForm: "Reigning NBA Champion & Complete Two-Way Forward",
    brandValue: "Boston's Franchise Ace",
    trendingIndex: "Championship Tier",
    estimatedValuation: { min: 55.0, max: 95.0 },
    specialty: "Side-Step Triples, Versatile Wing Defense & All-Around Scoring",
    avatarBg: "from-green-700 to-emerald-400"
  },
  {
    id: "nba-08",
    name: "Joel Embiid",
    role: "Center",
    nationality: "American",
    basePrice: 17.0,
    matches: 433,
    runs: 35,     // PPG
    wickets: 11,  // RPG
    strikeRate: 6, // APG
    points: 34.7,
    rebounds: 11.0,
    assists: 5.6,
    titles: 0,
    recentForm: "Former MVP & Historical Points-Per-Minute Scorer",
    brandValue: "The Process",
    trendingIndex: "Elite Heavyweight",
    estimatedValuation: { min: 54.0, max: 92.0 },
    specialty: "Dream Shake Footwork, Mid-Range Rip-Through & Paint Intimidation",
    avatarBg: "from-blue-700 to-red-600"
  },
  {
    id: "nba-09",
    name: "Kevin Durant",
    role: "Power Forward",
    nationality: "American",
    basePrice: 17.0,
    matches: 1061,
    runs: 27,     // PPG
    wickets: 7,   // RPG
    strikeRate: 5, // APG
    points: 27.1,
    rebounds: 6.6,
    assists: 5.0,
    titles: 2,
    recentForm: "Purest Bucket-Getter in Modern History & 2x Finals MVP",
    brandValue: "The Slim Reaper / KD",
    trendingIndex: "Legend Tier (#3)",
    estimatedValuation: { min: 52.0, max: 90.0 },
    specialty: "Uncontestable High-Release Jumper, 7-Foot Handle & 50-40-90 Precision",
    avatarBg: "from-orange-600 to-purple-800"
  },
  {
    id: "nba-10",
    name: "Anthony Edwards",
    role: "Shooting Guard",
    nationality: "American",
    basePrice: 16.0,
    matches: 302,
    runs: 26,     // PPG
    wickets: 5,   // RPG
    strikeRate: 5, // APG
    points: 25.9,
    rebounds: 5.4,
    assists: 5.1,
    titles: 0,
    recentForm: "Electric Playoff Sensation & Poster Dunk Machine",
    brandValue: "Ant-Man / Next Face of NBA",
    trendingIndex: "Skyrocketing",
    estimatedValuation: { min: 50.0, max: 88.0 },
    specialty: "Nuclear Athleticism, Highlight Poster Dunks & Lockdown Perimeter Agility",
    avatarBg: "from-navy-800 to-green-500"
  },
  {
    id: "nba-11",
    name: "Anthony Davis",
    role: "Power Forward",
    nationality: "American",
    basePrice: 16.0,
    matches: 736,
    runs: 25,     // PPG
    wickets: 13,  // RPG
    strikeRate: 4, // APG
    points: 24.7,
    rebounds: 12.6,
    assists: 3.5,
    titles: 1,
    recentForm: "Premier Two-Way Interior Force & All-Defensive Juggernaut",
    brandValue: "The Brow / AD",
    trendingIndex: "Elite Defense",
    estimatedValuation: { min: 48.0, max: 85.0 },
    specialty: "Shot-Blocking Fortress, Lob Threat & Mid-Range Pucker Control",
    avatarBg: "from-purple-800 to-gold-500"
  },
  {
    id: "nba-12",
    name: "Victor Wembanyama",
    role: "Center",
    nationality: "French",
    basePrice: 15.0,
    matches: 71,
    runs: 21,     // PPG
    wickets: 11,  // RPG
    strikeRate: 4, // APG
    points: 21.4,
    rebounds: 10.6,
    assists: 3.9,
    titles: 0,
    recentForm: "Rookie of the Year & 7-Foot-4 Generational Alien",
    brandValue: "The Alien / Wemby",
    trendingIndex: "Hypersonic Prospect (#1)",
    estimatedValuation: { min: 48.0, max: 86.0 },
    specialty: "8-Foot Wingspan Blocks, Guard Dribbling & Step-Back Three Point Arcs",
    avatarBg: "from-silver-400 to-black"
  },
  {
    id: "nba-13",
    name: "Devin Booker",
    role: "Shooting Guard",
    nationality: "American",
    basePrice: 15.0,
    matches: 598,
    runs: 27,     // PPG
    wickets: 5,   // RPG
    strikeRate: 7, // APG
    points: 27.1,
    rebounds: 4.5,
    assists: 6.9,
    titles: 0,
    recentForm: "Surgical Three-Level Scorer & Olympic Gold Leader",
    brandValue: "Book / Kobe Mentee",
    trendingIndex: "Consistent All-Star",
    estimatedValuation: { min: 45.0, max: 80.0 },
    specialty: "Mid-Range Baseline Fadeaway & Relentless Catch-and-Shoot Accuracy",
    avatarBg: "from-orange-500 to-purple-600"
  },
  {
    id: "nba-14",
    name: "Jalen Brunson",
    role: "Point Guard",
    nationality: "American",
    basePrice: 15.0,
    matches: 422,
    runs: 29,     // PPG
    wickets: 4,   // RPG
    strikeRate: 7, // APG
    points: 28.7,
    rebounds: 3.6,
    assists: 6.7,
    titles: 0,
    recentForm: "Madison Square Garden King & Clutch 40-Point Playoff Engine",
    brandValue: "The Big Apple Hero",
    trendingIndex: "Fan Icon",
    estimatedValuation: { min: 44.0, max: 78.0 },
    specialty: "Pivot Footwork Craft, Up-and-Under Layups & Pure Clutchness",
    avatarBg: "from-blue-600 to-orange-500"
  },
  {
    id: "nba-15",
    name: "Kyrie Irving",
    role: "Shooting Guard",
    nationality: "American",
    basePrice: 14.0,
    matches: 729,
    runs: 26,     // PPG
    wickets: 5,   // RPG
    strikeRate: 5, // APG
    points: 25.6,
    rebounds: 5.0,
    assists: 5.2,
    titles: 1,
    recentForm: "Greatest Ball-Handler in Basketball History",
    brandValue: "Uncle Drew / Wizard of Handles",
    trendingIndex: "High Demand",
    estimatedValuation: { min: 42.0, max: 75.0 },
    specialty: "Impossible English Off Glass, Ankle-Breaker Crossovers & Dagger Triples",
    avatarBg: "from-teal-600 to-blue-800"
  },
  {
    id: "nba-16",
    name: "Donovan Mitchell",
    role: "Shooting Guard",
    nationality: "American",
    basePrice: 14.0,
    matches: 468,
    runs: 27,     // PPG
    wickets: 5,   // RPG
    strikeRate: 6, // APG
    points: 26.6,
    rebounds: 5.1,
    assists: 6.1,
    titles: 0,
    recentForm: "71-Point Game Legend & Explosive Dynamic Scorer",
    brandValue: "Spida Mitchell",
    trendingIndex: "Prime All-Star",
    estimatedValuation: { min: 40.0, max: 72.0 },
    specialty: "High-Flying Slashing, Pull-Up 30-Foot Bomb & Fastbreak Explosion",
    avatarBg: "from-red-800 to-yellow-600"
  },
  {
    id: "nba-17",
    name: "Jimmy Butler",
    role: "Small Forward",
    nationality: "American",
    basePrice: 14.0,
    matches: 814,
    runs: 21,     // PPG
    wickets: 5,   // RPG
    strikeRate: 5, // APG
    points: 20.8,
    rebounds: 5.3,
    assists: 5.0,
    titles: 0,
    recentForm: "Playoff Jimmy & Heat Culture Standard-Bearer",
    brandValue: "Jimmy Buckets",
    trendingIndex: "Big Game Clutch",
    estimatedValuation: { min: 38.0, max: 70.0 },
    specialty: "Drawing Contact at Rim, Lockdown Wing Defense & Playoff Transcendence",
    avatarBg: "from-red-600 to-black"
  },
  {
    id: "nba-18",
    name: "Jaylen Brown",
    role: "Shooting Guard",
    nationality: "American",
    basePrice: 14.0,
    matches: 540,
    runs: 23,     // PPG
    wickets: 6,   // RPG
    strikeRate: 4, // APG
    points: 23.0,
    rebounds: 5.5,
    assists: 3.6,
    titles: 1,
    recentForm: "Reigning NBA Finals MVP & Ruthless Transition Attacker",
    brandValue: "Boston Co-Captain / Finals MVP",
    trendingIndex: "Championship Tier",
    estimatedValuation: { min: 38.0, max: 68.0 },
    specialty: "Punishing Fast-break Dunks, Physical Defense & Big Game Focus",
    avatarBg: "from-green-600 to-black"
  },
  {
    id: "nba-19",
    name: "Tyrese Haliburton",
    role: "Point Guard",
    nationality: "American",
    basePrice: 13.0,
    matches: 260,
    runs: 20,     // PPG
    wickets: 4,   // RPG
    strikeRate: 11, // APG
    points: 20.1,
    rebounds: 3.9,
    assists: 10.9,
    titles: 0,
    recentForm: "NBA Assists Leader & Pace-and-Space Sorcerer",
    brandValue: "Hali / Indiana's Engine",
    trendingIndex: "Playmaking Master",
    estimatedValuation: { min: 36.0, max: 65.0 },
    specialty: "No-Look Dimes, Jump-Pass Mastery & Fast-Break Engine",
    avatarBg: "from-yellow-400 to-navy-900"
  },
  {
    id: "nba-20",
    name: "Damian Lillard",
    role: "Point Guard",
    nationality: "American",
    basePrice: 13.0,
    matches: 842,
    runs: 25,     // PPG
    wickets: 4,   // RPG
    strikeRate: 7, // APG
    points: 24.3,
    rebounds: 4.4,
    assists: 7.0,
    titles: 0,
    recentForm: "Historic Clutch Closer & 8x All-Star",
    brandValue: "Dame Time",
    trendingIndex: "Deep Threat",
    estimatedValuation: { min: 35.0, max: 62.0 },
    specialty: "Dame Time 35-Foot Daggers & Cold-Blooded Buzzer Beaters",
    avatarBg: "from-emerald-800 to-cream-200"
  },
  {
    id: "nba-21",
    name: "Kawhi Leonard",
    role: "Small Forward",
    nationality: "American",
    basePrice: 13.0,
    matches: 696,
    runs: 24,     // PPG
    wickets: 7,   // RPG
    strikeRate: 4, // APG
    points: 23.7,
    rebounds: 6.1,
    assists: 3.6,
    titles: 2,
    recentForm: "2x Finals MVP & Terminator Two-Way Play",
    brandValue: "The Klaw / Board Man",
    trendingIndex: "Claw Defense",
    estimatedValuation: { min: 34.0, max: 60.0 },
    specialty: "Giant Hands On-Ball Strips, Mid-Post Baseline Jumper & Ice Veins",
    avatarBg: "from-red-600 to-blue-700"
  },
  {
    id: "nba-22",
    name: "Bam Adebayo",
    role: "Center",
    nationality: "American",
    basePrice: 12.0,
    matches: 486,
    runs: 19,     // PPG
    wickets: 10,  // RPG
    strikeRate: 4, // APG
    points: 19.3,
    rebounds: 10.4,
    assists: 3.9,
    titles: 0,
    recentForm: "Olympic Gold Medalist & Switch-All Defensive Anchor",
    brandValue: "Bam / Miami Defensive Heart",
    trendingIndex: "DPOY Contender",
    estimatedValuation: { min: 32.0, max: 58.0 },
    specialty: "1-Through-5 Perimeter Switching, DHO Playmaking & Rim Denials",
    avatarBg: "from-red-700 to-amber-600"
  },
  {
    id: "nba-23",
    name: "Domantas Sabonis",
    role: "Center",
    nationality: "Lithuanian",
    basePrice: 12.0,
    matches: 566,
    runs: 19,     // PPG
    wickets: 14,  // RPG
    strikeRate: 8, // APG
    points: 19.4,
    rebounds: 13.7,
    assists: 8.2,
    titles: 0,
    recentForm: "Rebounding Champion & High-Post Playmaking Hub",
    brandValue: "Domas / The Beam Anchor",
    trendingIndex: "Double-Double Machine",
    estimatedValuation: { min: 30.0, max: 55.0 },
    specialty: "Dribble Handoff Hub, Glass Domination & Physical Screens",
    avatarBg: "from-purple-600 to-silver-400"
  },
  {
    id: "nba-24",
    name: "Ja Morant",
    role: "Point Guard",
    nationality: "American",
    basePrice: 12.0,
    matches: 257,
    runs: 25,     // PPG
    wickets: 6,   // RPG
    strikeRate: 8, // APG
    points: 25.1,
    rebounds: 5.6,
    assists: 8.1,
    titles: 0,
    recentForm: "Jaw-Dropping Aerial Acrobat & Franchise Catalyst",
    brandValue: "12 / Aerial Wonder",
    trendingIndex: "Viral Sensation",
    estimatedValuation: { min: 30.0, max: 55.0 },
    specialty: "Gravity-Defying Hang Time, Fearless Rim Attacks & Vision",
    avatarBg: "from-teal-500 to-navy-900"
  },
  {
    id: "nba-25",
    name: "De'Aaron Fox",
    role: "Point Guard",
    nationality: "American",
    basePrice: 12.0,
    matches: 469,
    runs: 27,     // PPG
    wickets: 5,   // RPG
    strikeRate: 6, // APG
    points: 26.6,
    rebounds: 4.6,
    assists: 5.6,
    titles: 0,
    recentForm: "Clutch Player of the Year & Fastest Coast-to-Coast Guard",
    brandValue: "Swipa / The Beam Runner",
    trendingIndex: "Speed Star",
    estimatedValuation: { min: 28.0, max: 52.0 },
    specialty: "Blistering Open-Court Speed, Mid-Range Floaters & 4th Quarter Scoring",
    avatarBg: "from-purple-700 to-black"
  },
  {
    id: "nba-26",
    name: "Trae Young",
    role: "Point Guard",
    nationality: "American",
    basePrice: 11.0,
    matches: 407,
    runs: 26,     // PPG
    wickets: 3,   // RPG
    strikeRate: 11, // APG
    points: 25.7,
    rebounds: 2.8,
    assists: 10.8,
    titles: 0,
    recentForm: "Top 3 NBA Playmaker & Elite PnR Maestro",
    brandValue: "Ice Trae",
    trendingIndex: "Offense Hub",
    estimatedValuation: { min: 28.0, max: 50.0 },
    specialty: "Deep Floater Arsenal, Trae-Distance Triples & Alley-Oop Passes",
    avatarBg: "from-red-600 to-amber-500"
  },
  {
    id: "nba-27",
    name: "Paul George",
    role: "Small Forward",
    nationality: "American",
    basePrice: 11.0,
    matches: 867,
    runs: 23,     // PPG
    wickets: 5,   // RPG
    strikeRate: 4, // APG
    points: 22.6,
    rebounds: 5.2,
    assists: 3.5,
    titles: 0,
    recentForm: "Silky Smooth All-Star Wing & Elite Perimeter Shooter",
    brandValue: "PG-13",
    trendingIndex: "Smooth Scorer",
    estimatedValuation: { min: 26.0, max: 48.0 },
    specialty: "Fluid Crossover-to-Pullup, Catch-and-Shoot Three & Lengthy Wing D",
    avatarBg: "from-blue-800 to-red-500"
  },
  {
    id: "nba-28",
    name: "Zion Williamson",
    role: "Power Forward",
    nationality: "American",
    basePrice: 11.0,
    matches: 184,
    runs: 23,     // PPG
    wickets: 6,   // RPG
    strikeRate: 5, // APG
    points: 22.9,
    rebounds: 5.8,
    assists: 5.0,
    titles: 0,
    recentForm: "Historic Paint Scoring Percentage & Point-Forward Bully",
    brandValue: "Zion / Generational Power",
    trendingIndex: "Paint Force",
    estimatedValuation: { min: 26.0, max: 48.0 },
    specialty: "Inhuman Second Bounce, Point-Zion Handle & Pure Paint Power",
    avatarBg: "from-navy-900 to-gold-600"
  },
  {
    id: "nba-29",
    name: "Chet Holmgren",
    role: "Center",
    nationality: "American",
    basePrice: 10.0,
    matches: 82,
    runs: 17,     // PPG
    wickets: 8,   // RPG
    strikeRate: 3, // APG
    points: 16.5,
    rebounds: 7.9,
    assists: 2.4,
    titles: 0,
    recentForm: "7-Foot-1 Unicorn Rim Protector & Stretch Big",
    brandValue: "Chet / OKC Anchor",
    trendingIndex: "Rising Star",
    estimatedValuation: { min: 24.0, max: 45.0 },
    specialty: "Apex Shot Contest, Pick-and-Pop Triples & High-Paced Mobility",
    avatarBg: "from-blue-600 to-orange-400"
  },
  {
    id: "nba-30",
    name: "Jamal Murray",
    role: "Point Guard",
    nationality: "Canadian",
    basePrice: 10.0,
    matches: 469,
    runs: 21,     // PPG
    wickets: 4,   // RPG
    strikeRate: 7, // APG
    points: 21.2,
    rebounds: 4.1,
    assists: 6.5,
    titles: 1,
    recentForm: "Playoff Two-Man Partner to Jokić & Cold-Blooded Closer",
    brandValue: "Blue Arrow",
    trendingIndex: "Playoff Hero",
    estimatedValuation: { min: 24.0, max: 44.0 },
    specialty: "Two-Man Chemistry, Tough Shot Creation & Buzzer-Beater Daggers",
    avatarBg: "from-navy-900 to-yellow-500"
  },
  {
    id: "nba-31",
    name: "Paolo Banchero",
    role: "Power Forward",
    nationality: "American",
    basePrice: 10.0,
    matches: 152,
    runs: 23,     // PPG
    wickets: 7,   // RPG
    strikeRate: 5, // APG
    points: 22.6,
    rebounds: 6.9,
    assists: 5.4,
    titles: 0,
    recentForm: "All-Star Sophomore & 6-Foot-10 Playmaking Forward",
    brandValue: "Orlando Franchise Leader",
    trendingIndex: "Future Superstar",
    estimatedValuation: { min: 22.0, max: 42.0 },
    specialty: "Physical Drive-and-Kick, Size Mismatches & Mid-Range Isolation",
    avatarBg: "from-blue-700 to-black"
  },
  {
    id: "nba-32",
    name: "Derrick White",
    role: "Point Guard",
    nationality: "American",
    basePrice: 9.0,
    matches: 417,
    runs: 15,     // PPG
    wickets: 4,   // RPG
    strikeRate: 5, // APG
    points: 15.2,
    rebounds: 4.2,
    assists: 5.2,
    titles: 1,
    recentForm: "Olympic Gold Medalist & Premier Defensive Role Star",
    brandValue: "The Buffalo / Boston Champion",
    trendingIndex: "Ultimate Teammate",
    estimatedValuation: { min: 20.0, max: 38.0 },
    specialty: "Guard Rim Protection, 0-Second Decision Making & Spot-Up Precision",
    avatarBg: "from-green-700 to-white"
  },
  {
    id: "nba-33",
    name: "Mikal Bridges",
    role: "Small Forward",
    nationality: "American",
    basePrice: 9.0,
    matches: 474,
    runs: 20,     // PPG
    wickets: 5,   // RPG
    strikeRate: 4, // APG
    points: 19.6,
    rebounds: 4.5,
    assists: 3.6,
    titles: 0,
    recentForm: "Iron Man of the NBA (Zero Games Missed in Career)",
    brandValue: "Iron Man / 3-and-D Extraordinaire",
    trendingIndex: "Durability Benchmark",
    estimatedValuation: { min: 18.0, max: 36.0 },
    specialty: "Zero-Fatigue Defense, Wing Slashing & Corner Three Reliability",
    avatarBg: "from-orange-600 to-blue-700"
  },
  {
    id: "nba-34",
    name: "Alperen Şengün",
    role: "Center",
    nationality: "Turkish",
    basePrice: 8.0,
    matches: 210,
    runs: 21,     // PPG
    wickets: 9,   // RPG
    strikeRate: 5, // APG
    points: 21.1,
    rebounds: 9.3,
    assists: 5.0,
    titles: 0,
    recentForm: "Baby Jokic & Masterful Post Passer",
    brandValue: "Turkish Wizard",
    trendingIndex: "Rising Big Man",
    estimatedValuation: { min: 16.0, max: 34.0 },
    specialty: "Post Spin Dazzle, High-Post Vision & Crafty Touch Around Rim",
    avatarBg: "from-red-600 to-silver-400"
  },
  {
    id: "nba-35",
    name: "LaMelo Ball",
    role: "Point Guard",
    nationality: "American",
    basePrice: 8.0,
    matches: 184,
    runs: 24,     // PPG
    wickets: 5,   // RPG
    strikeRate: 8, // APG
    points: 23.9,
    rebounds: 5.1,
    assists: 8.0,
    titles: 0,
    recentForm: "Electrifying Open-Floor Showtime Maestro",
    brandValue: "Melo / Showtime",
    trendingIndex: "Showtime Sensation",
    estimatedValuation: { min: 16.0, max: 32.0 },
    specialty: "Full-Court Touchdown Passes, Deep Pull-Up Triples & Flare",
    avatarBg: "from-teal-400 to-purple-600"
  }
];

module.exports = { nbaPlayers };
