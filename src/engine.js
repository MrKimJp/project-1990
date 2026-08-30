/* ============================================================================
 * PROJECT 1990: FOOTBALL LEGEND — Copero Edition / Simulation Engine v3
 * ----------------------------------------------------------------------------
 *   1. 엔진은 결과를 "결정"한다. 텍스트는 결과를 "설명"한다.
 *   2. 능력은 현재 능력(Current Ability) 단일 수치. 세부 스탯은 두지 않는다.
 *   3. 잠재력(PA)·유리몸·빅매치 멘탈·적응력·독기는 히든. 은퇴 후 공개.
 *   4. 재능이 인생을 결정하지 않는다: 환경 × 선택 × 기회 × 운.
 *   5. 가정환경은 능력치가 아니라 "기회에 대한 접근성"으로 작동한다.
 *   6. 16세 이후의 중심 선택은 매 시즌 이적시장이다.
 *   7. DOM 의존 0 — 브라우저 UI와 헤드리스 배치 러너가 같은 엔진을 공유한다.
 * ========================================================================== */

/* ─────────────────────────── 1. RNG & 유틸 ─────────────────────────── */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  return {
    seed, f: () => r(),
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    chance: (p) => r() < p,
    norm(mean = 0, sd = 1) {
      let u = 0, v = 0;
      while (u === 0) u = r();
      while (v === 0) v = r();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    rightSkew(power = 2.0) { return Math.pow(r(), power); },
    heavyTail(alpha = 1.6) { return Math.pow(1 - r(), -1 / alpha); },
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    weighted(items) {
      let total = 0;
      for (const it of items) total += Math.max(0, it.w);
      if (total <= 0) return null;
      let x = r() * total;
      for (const it of items) { x -= Math.max(0, it.w); if (x <= 0) return it; }
      return items[items.length - 1];
    },
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** 만 16세 시작 능력 — 전원 동일 */
export const START_OVR = 50;
const round = Math.round;
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const fmtMoney = (v) =>
  v >= 1e6 ? `€${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `€${round(v / 1e3)}K` : `€${round(v)}`;

/* ─────────────────────────── 2. 가정환경 (7종) ─────────────────────────── */

/**
 * 7가지 가정환경. 능력치에는 어떤 보정도 주지 않는다.
 * 작동 방식은 세 가지뿐이다:
 *   money    — 클럽 회비/원정비/사설 훈련에 대한 접근성
 *   safety   — 실패했을 때의 안전망 (안전망이 두터울수록 "축구 말고 다른 길"의 압력이 크다)
 *   scoutBias— 유소년 평가에서의 구조적 편향 (능력이 아니라 평가의 편향)
 *   group    — 엔딩 매트릭스의 4개 그룹
 */
export const FAMILY_ENVS = {
  IMM_LOW: {
    id: 'IMM_LOW', label: '이민자 하위층', group: 'IMM_LOW', immigrant: true,
    money: 14, safety: 8, academic: 40, scoutBias: -5,
    blurb: '정착 자체가 매일의 과제다. 서류, 언어, 그리고 고된 노동. 실패하면 돌아갈 곳이 없다.',
    jobs: ['건설 일용직', '청소 용역', '시장 하역', '식당 주방 보조', '봉제 공장 미싱'],
  },
  LOC_LOW: {
    id: 'LOC_LOW', label: '원주민 하위층', group: 'LOC_LOW', immigrant: false,
    money: 24, safety: 20, academic: 46, scoutBias: 0,
    blurb: '이 동네에서 3대를 살았다. 가난이 익숙한 만큼, 경제적 리스크에 대한 공포도 크다.',
    jobs: ['타파스 바 직원', '시내버스 기사', '섬유 공장 노동', '택시 기사', '항만 하역'],
  },
  IMM_MID: {
    id: 'IMM_MID', label: '이민자 중위층', group: 'IMM_HIGH', immigrant: true,
    money: 52, safety: 48, academic: 78, scoutBias: -3,
    blurb: '자리를 잡은 이민자 가정. "우리가 여기까지 온 이유는 네 공부다"라는 말이 집안의 문장이다.',
    jobs: ['식료품점 운영', '자동차 정비 기술자', '간호조무사', '통역·번역', '소규모 무역 중개'],
  },
  LOC_MID: {
    id: 'LOC_MID', label: '원주민 중위층', group: 'LOC_LOW', immigrant: false,
    money: 58, safety: 56, academic: 68, scoutBias: 0,
    blurb: '평범한 중산층. 하고 싶은 건 해도 되지만, 실패했을 때의 대안을 반드시 확인받는다.',
    jobs: ['초등학교 교사', '은행 창구 직원', '시청 공무원', '전기 기사', '약국 운영'],
  },
  IMM_HIGH: {
    id: 'IMM_HIGH', label: '이민자 상위층', group: 'IMM_HIGH', immigrant: true,
    money: 84, safety: 78, academic: 88, scoutBias: -2,
    blurb: '타국에서 성공한 전문직·자본가. 가문의 명예가 개인의 선택보다 앞선다.',
    jobs: ['무역회사 대표', '치과의사', '건축 설계사', '대학 강사', '수입업체 임원'],
  },
  LOC_HIGH: {
    id: 'LOC_HIGH', label: '원주민 상위층', group: 'LOC_HIGH', immigrant: false,
    money: 92, safety: 90, academic: 90, scoutBias: 2,
    blurb: '기득권 엘리트 가문. 축구는 구경하는 것이지, 집안의 아이가 직업으로 삼는 것이 아니다.',
    jobs: ['변호사', '외과의사', '고위 공무원', '기업 임원', '공증인'],
  },
  MIXED: {
    id: 'MIXED', label: '혼혈·다문화층', group: 'IMM_LOW', immigrant: true,
    money: 44, safety: 36, academic: 60, scoutBias: -2,
    blurb: '두 개의 문화 사이에서 자란다. 정체성은 복잡하지만, 인맥은 어디로든 뻗어 있다.',
    jobs: ['재즈 클럽 운영', '국제학교 교사', '프리랜서 사진가', 'NGO 활동가', '음악 강사'],
  },
};

/** 부모 기본 성향 — 고정. 게임 내내 바뀌지 않는다. */
export const PARENT_PERSONALITIES = {
  CYNIC:   { id: 'CYNIC',   label: '냉소적', blurb: '"세상에 되는 놈은 정해져 있다." 기대를 하지 않는 방식으로 아이를 보호한다.', bias: -1 },
  PASSION: { id: 'PASSION', label: '열정적', blurb: '한번 믿으면 끝까지 간다. 대신 기대가 무거워서 아이가 눌린다.', bias: +1 },
  NEUTRAL: { id: 'NEUTRAL', label: '중립',   blurb: '판단을 유보한다. 결과를 보고 나서 태도를 정하는 쪽이다.', bias: 0 },
};

/** 부모의 축구 반응 — 성적·이적·학업·부상에 따라 실시간으로 변한다. */
export const REACTIONS = [
  { key: 'SKEPTIC',    label: '회의적',      blurb: '"축구로 밥 먹고 사는 애가 몇이나 되는지 아냐."' },
  { key: 'INDIFFERENT',label: '별 관심없음', blurb: '반대도 응원도 하지 않는다. 알아서 하라는 쪽이다.' },
  { key: 'INTERESTED', label: '흥미',        blurb: '주말 경기를 보러 온다. 상대 팀 전력까지 물어본다.' },
  { key: 'SUPPORTIVE', label: '응원중',      blurb: '집안의 우선순위가 이 아이의 축구에 맞춰져 있다.' },
];

const SPANISH_FIRST = ['Alejandro', 'Sergio', 'Iker', 'Pau', 'Marc', 'Javier', 'Rubén', 'Óscar', 'Adrián', 'Hugo', 'Álvaro', 'Dani'];
const SPANISH_LAST = ['Martín', 'García', 'Ortega', 'Ferrer', 'Bosch', 'Navarro', 'Vidal', 'Lorente', 'Serra', 'Iglesias', 'Cabrera', 'Solana'];
const MOTHER_ES = ['Carmen', 'Montserrat', 'Núria', 'Pilar', 'Rosario', 'Dolors', 'Teresa'];
const FATHER_ES = ['Josep', 'Antonio', 'Manuel', 'Jordi', 'Francisco', 'Ramón', 'Miguel'];

/** 1990년 바르셀로나의 실제 이민 경로들 */
const IMMIGRANT_BG = [
  { nat: 'MAR', label: '모로코', first: ['Youssef', 'Karim', 'Hakim', 'Bilal', 'Nabil', 'Anouar'], last: ['El Amrani', 'Benali', 'Ouahbi', 'Chakir', 'Ziani', 'Bouzid'], pa: ['Mohamed', 'Abdelkader', 'Rachid'], ma: ['Fatima', 'Khadija', 'Amina'] },
  { nat: 'SEN', label: '세네갈', first: ['Mamadou', 'Ousmane', 'Ibrahima', 'Cheikh', 'Lamine'], last: ['Diop', 'Ndiaye', 'Fall', 'Sarr', 'Gueye'], pa: ['Abdoulaye', 'Moussa', 'Samba'], ma: ['Aminata', 'Bineta', 'Sokhna'] },
  { nat: 'COL', label: '콜롬비아', first: ['Juan', 'Carlos', 'Andrés', 'Yerry', 'Duván'], last: ['Ospina', 'Zapata', 'Moreno', 'Quintero', 'Cuadrado'], pa: ['Hernán', 'Álvaro', 'Jairo'], ma: ['Marleny', 'Luz', 'Beatriz'] },
  { nat: 'ECU', label: '에콰도르', first: ['Jefferson', 'Ángel', 'Moisés', 'Pervis', 'Enner'], last: ['Mena', 'Caicedo', 'Estupiñán', 'Preciado', 'Valencia'], pa: ['Segundo', 'Wilson', 'Klever'], ma: ['Narcisa', 'Mariana', 'Zoila'] },
  { nat: 'ROU', label: '루마니아', first: ['Andrei', 'Nicolae', 'Vlad', 'Ionuț', 'Răzvan'], last: ['Popescu', 'Ionescu', 'Marin', 'Stanciu', 'Radu'], pa: ['Gheorghe', 'Dumitru', 'Vasile'], ma: ['Elena', 'Maria', 'Ioana'] },
  { nat: 'ARG', label: '아르헨티나', first: ['Matías', 'Lucas', 'Nicolás', 'Gonzalo', 'Emiliano'], last: ['Gómez', 'Fernández', 'Álvarez', 'Romero', 'Paredes'], pa: ['Osvaldo', 'Rubén', 'Horacio'], ma: ['Silvia', 'Graciela', 'Norma'] },
  { nat: 'DOM', label: '도미니카 공화국', first: ['Wilfredo', 'Junior', 'Elvis', 'Starling'], last: ['De la Cruz', 'Peralta', 'Guzmán', 'Rosario'], pa: ['Ramón', 'Rafael', 'Julio'], ma: ['Altagracia', 'Yolanda', 'Mercedes'] },
];

export const POSITIONS = {
  GK: { label: 'GK 골키퍼', goal: 0.00, assist: 0.01 },
  CB: { label: 'CB 센터백', goal: 0.07, assist: 0.05 },
  FB: { label: 'LB/RB 풀백', goal: 0.05, assist: 0.20 },
  CM: { label: 'CM 중앙 미드필더', goal: 0.13, assist: 0.28 },
  AM: { label: 'AM 공격형 미드필더', goal: 0.27, assist: 0.38 },
  WG: { label: 'LW/RW 윙어', goal: 0.35, assist: 0.32 },
  ST: { label: 'ST 스트라이커', goal: 0.54, assist: 0.17 },
};

/* ─────────────────────────── 3. 클럽 DB (210+ / 1·2·3부) ─────────────────── */

/** [클럽명, 명성] — 명성 하나에서 훈련·경쟁·노출·연봉·주전 요구치를 파생시킨다. */
/**
 * 리그 티어 — 세계 시장에서의 리그 전체 수준.
 * 클럽 rep 은 이 티어 대역 안에서만 분포하도록 재작성되어 있다.
 * 중소 리그 강팀이 Tier1 리그 중위권보다 높은 평균을 갖지 않게 하는 장치다.
 * 향후 Historical Database 도입 시 이 표와 ERA 곡선만 교체하면 된다.
 */
export const LEAGUE_TIER = {
  eng1: 1, esp1: 1, ger1: 1, ita1: 1,
  fra1: 1.5,                       // 리그 전체는 낮지만 PSG·Monaco 는 Tier1 급
  por1: 2, ned1: 2, eng2: 2.5, esp2: 2.5, ita2: 2.5, ger2: 2.5,
  bel1: 3, tur1: 3, sam1: 3, fra2: 3,
  gre1: 4, mls1: 4, kor1: 4, jpn1: 4, sau1: 4, esp3: 4, eng3: 4,
};
/** 그 나라에 이 부(division)보다 아래 리그가 실제로 존재하는가 */
export function hasLowerDivision(nat, div) {
  return LEAGUES.some((l) => l.nat === nat && l.div === div + 1);
}

const LEAGUES = [
  { id: 'esp1', name: '라리가', nat: 'ESP', div: 1, home: true, clubs: [
    ['Real Madrid', 98], ['FC Barcelona', 97], ['Atlético Madrid', 89], ['Sevilla FC', 82],
    ['Valencia CF', 80], ['Villarreal CF', 78], ['Real Sociedad', 77], ['Athletic Club', 77],
    ['Real Betis', 75], ['Girona FC', 70], ['RCD Espanyol', 70], ['RC Celta de Vigo', 69],
    ['Getafe CF', 68], ['CA Osasuna', 68], ['RCD Mallorca', 65], ['Rayo Vallecano', 64],
    ['Deportivo Alavés', 62], ['UD Las Palmas', 61], ['Cádiz CF', 59], ['UD Almería', 57],
  ] },
  { id: 'esp2', name: '세군다 디비시온', nat: 'ESP', div: 2, home: true, clubs: [
    ['Deportivo La Coruña', 60], ['Real Zaragoza', 58], ['Real Valladolid', 57],
    ['Sporting de Gijón', 56], ['Levante UD', 56], ['Racing de Santander', 55],
    ['Málaga CF', 55], ['SD Eibar', 54], ['Elche CF', 52], ['Real Oviedo', 51],
    ['CD Leganés', 50], ['CD Tenerife', 49], ['SD Huesca', 49], ['FC Cartagena', 47],
    ['Albacete Balompié', 47], ['Burgos CF', 45], ['CD Mirandés', 43], ['CD Castellón', 42],
    ['FC Andorra', 41], ['Racing de Ferrol', 40], ['CD Eldense', 39], ['SD Amorebieta', 38],
  ] },
  { id: 'esp3', name: '프리메라 RFEF (3부)', nat: 'ESP', div: 3, home: true, clubs: [
    ['Real Murcia', 33], ['Gimnàstic de Tarragona', 32], ['AD Alcorcón', 33],
    ['CD Lugo', 31], ['Cultural Leonesa', 29], ['SD Ponferradina', 29],
    ['Sevilla Atlético', 28], ['CE Sabadell', 27], ['Villarreal CF B', 27],
    ['Betis Deportivo', 26], ['CA Osasuna B', 24], ['Barakaldo CF', 24],
    ['Algeciras CF', 24], ['CD Alcoyano', 23], ['Terrassa FC', 22],
    ['Unionistas de Salamanca', 22], ['Marbella FC', 21], ['Linares Deportivo', 21],
    ['CF Talavera', 19], ['Antequera CF', 18], ['UE Cornellà', 18], ['CE Europa', 17],
  ] },
  { id: 'eng1', name: '프리미어리그', nat: 'ENG', div: 1, clubs: [
    ['Manchester City', 98], ['Liverpool', 96], ['Arsenal', 94], ['Manchester United', 92],
    ['Chelsea', 90], ['Tottenham Hotspur', 87], ['Newcastle United', 83], ['Aston Villa', 81],
    ['Brighton & Hove Albion', 76], ['West Ham United', 76], ['Everton', 72],
    ['Wolverhampton', 72], ['Crystal Palace', 70], ['Fulham', 70], ['Brentford', 69],
    ['Nottingham Forest', 68], ['AFC Bournemouth', 66], ['Burnley', 61],
    ['Sheffield United', 59], ['Luton Town', 57],
  ] },
  { id: 'eng2', name: '챔피언십 (2부)', nat: 'ENG', div: 2, clubs: [
    ['Leicester City', 60], ['Southampton', 57], ['Leeds United', 56], ['Sunderland', 50],
    ['Norwich City', 50], ['West Bromwich Albion', 48], ['Middlesbrough', 47], ['Watford', 46],
    ['Coventry City', 44], ['Hull City', 42], ['Bristol City', 41], ['Preston North End', 39],
    ['Cardiff City', 39], ['Millwall', 38],
  ] },
  { id: 'eng3', name: '리그 원 (3부)', nat: 'ENG', div: 3, clubs: [
    ['Derby County', 33], ['Portsmouth', 33], ['Bolton Wanderers', 32], ['Barnsley', 30],
    ['Oxford United', 28], ['Blackpool', 28], ['Charlton Athletic', 28], ['Wigan Athletic', 25],
    ['Shrewsbury Town', 20], ['Cambridge United', 17],
  ] },
  { id: 'ita1', name: '세리에 A', nat: 'ITA', div: 1, clubs: [
    ['Inter Milan', 95], ['Juventus', 93], ['AC Milan', 93], ['Napoli', 88],
    ['Atalanta', 86], ['AS Roma', 86], ['Lazio', 84], ['Fiorentina', 79],
    ['Bologna', 75], ['Torino', 73], ['Udinese', 68], ['Genoa', 66],
    ['Monza', 64], ['Sassuolo', 63], ['Hellas Verona', 62], ['Cagliari', 59],
    ['Empoli', 58], ['US Lecce', 58], ['Frosinone', 55], ['Salernitana', 55],
  ] },
  { id: 'ita2', name: '세리에 B (2부)', nat: 'ITA', div: 2, clubs: [
    ['Parma', 57], ['Sampdoria', 57], ['Palermo', 54], ['Venezia', 51],
    ['Como', 48], ['Cremonese', 48], ['Bari', 45], ['Brescia', 45],
    ['Pisa', 42], ['Cesena', 40], ['Modena', 39], ['Reggiana', 36],
  ] },
  { id: 'ger1', name: '분데스리가', nat: 'GER', div: 1, clubs: [
    ['Bayern München', 96], ['Bayer Leverkusen', 89], ['Borussia Dortmund', 88],
    ['RB Leipzig', 86], ['VfB Stuttgart', 79], ['Eintracht Frankfurt', 79],
    ['SC Freiburg', 74], ['Borussia Mönchengladbach', 72], ['VfL Wolfsburg', 72],
    ['TSG Hoffenheim', 71], ['Werder Bremen', 70], ['Union Berlin', 70],
    ['1. FC Köln', 66], ['FC Augsburg', 66], ['1. FSV Mainz 05', 65],
    ['VfL Bochum', 62], ['1. FC Heidenheim', 58], ['SV Darmstadt 98', 56],
  ] },
  { id: 'ger2', name: '2. 분데스리가', nat: 'GER', div: 2, clubs: [
    ['Hamburger SV', 56], ['FC Schalke 04', 57], ['Hertha BSC', 53], ['Hannover 96', 48],
    ['Fortuna Düsseldorf', 45], ['1. FC Nürnberg', 45], ['FC St. Pauli', 45],
    ['1. FC Kaiserslautern', 43], ['Karlsruher SC', 40], ['SC Paderborn', 39],
    ['Holstein Kiel', 37], ['Greuther Fürth', 36],
  ] },
  { id: 'fra1', name: '리그 1', nat: 'FRA', div: 1, clubs: [
    ['Paris Saint-Germain', 92], ['AS Monaco', 81], ['Olympique de Marseille', 79],
    ['Lille OSC', 76], ['Olympique Lyonnais', 75], ['OGC Nice', 71], ['RC Lens', 71],
    ['Stade Rennais', 70], ['Toulouse FC', 59], ['Stade de Reims', 59],
    ['Montpellier HSC', 58], ['FC Nantes', 58], ['RC Strasbourg', 57],
    ['Stade Brestois', 54], ['FC Lorient', 52], ['Le Havre AC', 50],
    ['FC Metz', 48], ['Clermont Foot', 46],
  ] },
  { id: 'fra2', name: '리그 2', nat: 'FRA', div: 2, clubs: [
    ['AS Saint-Étienne', 48], ['Girondins de Bordeaux', 48], ['AJ Auxerre', 42],
    ['Angers SCO', 41], ['SM Caen', 37], ['EA Guingamp', 35], ['AC Ajaccio', 34],
    ['Grenoble Foot', 32], ['Stade Lavallois', 31], ['Pau FC', 29],
  ] },
  { id: 'por1', name: '프리메이라 리가', nat: 'POR', div: 1, clubs: [
    ['SL Benfica', 67], ['FC Porto', 67], ['Sporting CP', 67], ['SC Braga', 61],
    ['Vitória de Guimarães', 55], ['Boavista FC', 49], ['FC Famalicão', 48],
    ['Rio Ave FC', 46], ['GD Estoril Praia', 46], ['FC Arouca', 44],
    ['Gil Vicente FC', 44], ['Moreirense FC', 44], ['Casa Pia AC', 42],
    ['Portimonense SC', 42], ['GD Chaves', 41], ['FC Vizela', 40],
  ] },
  { id: 'ned1', name: '에레디비시', nat: 'NED', div: 1, clubs: [
    ['PSV Eindhoven', 67], ['AFC Ajax', 65], ['Feyenoord', 65], ['AZ Alkmaar', 59],
    ['FC Twente', 57], ['FC Utrecht', 54], ['Vitesse', 50], ['SC Heerenveen', 50],
    ['NEC Nijmegen', 48], ['Sparta Rotterdam', 46], ['Go Ahead Eagles', 45],
    ['Fortuna Sittard', 43], ['PEC Zwolle', 43], ['RKC Waalwijk', 42],
    ['Heracles Almelo', 42], ['Almere City', 40],
  ] },
  { id: 'bel1', name: '벨기에 프로리그', nat: 'BEL', div: 1, clubs: [
    ['Club Brugge', 58], ['RSC Anderlecht', 56], ['KRC Genk', 53], ['KAA Gent', 51],
    ['Royal Antwerp', 51], ['Union Saint-Gilloise', 48], ['Standard Liège', 46],
    ['Cercle Brugge', 41], ['KV Mechelen', 36], ['OH Leuven', 34],
  ] },
  { id: 'tur1', name: '쉬페르 리그', nat: 'TUR', div: 1, clubs: [
    ['Galatasaray', 58], ['Fenerbahçe', 58], ['Beşiktaş', 54], ['Trabzonspor', 50],
    ['Başakşehir', 44], ['Adana Demirspor', 38], ['Konyaspor', 36], ['Sivasspor', 34],
  ] },
  { id: 'sam1', name: '남미 명문 (브라질·아르헨티나)', nat: 'SAM', div: 1, clubs: [
    ['Flamengo', 60], ['Palmeiras', 60], ['River Plate', 57], ['Boca Juniors', 57],
    ['São Paulo FC', 51], ['Corinthians', 51], ['Grêmio', 48], ['Internacional', 47],
    ['Atlético Mineiro', 48], ['Racing Club', 40], ['Independiente', 40],
    ['Peñarol', 34], ['Nacional', 34], ['Colo-Colo', 34],
  ] },
  { id: 'mls1', name: 'MLS', nat: 'USA', div: 1, clubs: [
    ['Inter Miami CF', 52], ['LAFC', 49], ['LA Galaxy', 45], ['Seattle Sounders', 42],
    ['Atlanta United', 40], ['Columbus Crew', 38], ['NY Red Bulls', 37],
    ['Portland Timbers', 35], ['Toronto FC', 33], ['Sporting KC', 32],
    ['FC Cincinnati', 35], ['Austin FC', 30],
  ] },
  { id: 'kor1', name: 'K리그 1', nat: 'KOR', div: 1, clubs: [
    ['전북 현대', 50], ['울산 HD', 50], ['FC 서울', 46], ['포항 스틸러스', 43],
    ['수원 삼성', 37], ['대구 FC', 32], ['인천 유나이티드', 30], ['광주 FC', 28],
  ] },
  { id: 'jpn1', name: 'J1 리그', nat: 'JPN', div: 1, clubs: [
    ['가와사키 프론탈레', 52], ['요코하마 F 마리노스', 49], ['우라와 레즈', 46],
    ['감바 오사카', 39], ['비셀 고베', 43], ['가시마 앤틀러스', 39],
    ['FC 도쿄', 33], ['세레소 오사카', 30],
  ] },
  { id: 'sau1', name: '사우디 프로리그', nat: 'SAU', div: 1, clubs: [
    ['Al Hilal', 56], ['Al Nassr', 52], ['Al Ittihad', 49], ['Al Ahli', 45],
    ['Al Shabab', 34], ['Al Ettifaq', 30],
  ] },
];

function deriveClub(name, rep, lg) {
  return {
    id: `${lg.id}:${name}`, name, rep,
    league: lg.name, nat: lg.nat, div: lg.div, home: !!lg.home, leagueId: lg.id,
    youth: !!lg.youth, // 유소년팀은 프로 커리어로 집계되지 않는다
    train: clamp(round(24 + rep * 0.70), 30, 96),
    comp: clamp(round(18 + rep * 0.80), 25, 98),
    expo: clamp(round(rep * (lg.div === 1 ? 0.98 : lg.div === 2 ? 0.62 : 0.34)), 6, 99),
    req: clamp(round(20 + rep * 0.63), 30, 92),
  };
}

export const CLUBS = LEAGUES.flatMap((lg) => lg.clubs.map(([n, r]) => deriveClub(n, r, lg)));

/**
 * 시대 곡선 (Era Curve) — 클럽의 힘은 연도에 따라 변한다.
 * [연도, 명성 보정] 점들 사이를 선형 보간한다.
 * 실제 역사적 성적을 근거로 했지만 수치 자체는 이 게임의 창작 밸런스 값이다.
 */
const ERA = {
  'Real Madrid': [[1995, -4], [2002, 3], [2010, 0], [2017, 3], [2024, 2]],
  'FC Barcelona': [[1995, -6], [2003, -3], [2009, 4], [2015, 3], [2021, -6], [2024, -2]],
  'Atlético Madrid': [[1996, 2], [2000, -26], [2003, -12], [2014, 4], [2021, 3]],
  'Valencia CF': [[1996, -4], [2001, 10], [2004, 8], [2012, -6], [2022, -18]],
  'Sevilla FC': [[1995, -18], [2004, -4], [2007, 6], [2016, 4], [2024, -8]],
  'Villarreal CF': [[1995, -30], [2002, -8], [2006, 6], [2011, 2], [2021, 4]],
  'Real Betis': [[1995, -6], [2005, 2], [2011, -12], [2019, 0], [2024, 4]],
  'Deportivo La Coruña': [[1995, 6], [2000, 16], [2004, 10], [2011, -6], [2020, -18]],
  'Real Zaragoza': [[1995, 6], [2004, 4], [2013, -12], [2020, -18]],
  'RCD Espanyol': [[1995, -2], [2007, 4], [2016, -6], [2023, -12]],
  'Girona FC': [[1995, -34], [2010, -22], [2018, -6], [2024, 4]],
  'Manchester City': [[1995, -26], [2004, -18], [2009, 2], [2014, 8], [2019, 10]],
  'Manchester United': [[1995, 4], [1999, 8], [2008, 8], [2014, -6], [2023, -10]],
  'Chelsea': [[1995, -16], [2004, 4], [2012, 6], [2017, 2], [2023, -8]],
  'Arsenal': [[1995, -4], [2004, 6], [2012, -4], [2020, -4], [2024, 4]],
  'Liverpool': [[1995, -2], [2005, 2], [2012, -6], [2019, 8], [2024, 4]],
  'Tottenham Hotspur': [[1995, -14], [2005, -8], [2017, 2], [2024, -4]],
  'Newcastle United': [[1996, 6], [2004, -2], [2016, -18], [2023, 2]],
  'Leicester City': [[1995, -22], [2009, -20], [2016, 8], [2021, 2], [2024, -10]],
  'Leeds United': [[1995, 2], [2001, 14], [2004, -20], [2010, -22], [2020, -8]],
  'Everton': [[1995, -4], [2005, 2], [2014, 0], [2023, -12]],
  'Inter Milan': [[1995, -2], [2005, 4], [2010, 8], [2016, -8], [2023, 4]],
  'AC Milan': [[1995, 4], [2003, 8], [2007, 6], [2015, -16], [2022, 0]],
  'Juventus': [[1995, 6], [2003, 8], [2007, -16], [2015, 8], [2023, -6]],
  'Napoli': [[1995, -28], [2004, -34], [2011, 0], [2018, 4], [2023, 6]],
  'AS Roma': [[1995, -2], [2001, 8], [2010, 2], [2019, -6]],
  'Atalanta': [[1995, -26], [2010, -20], [2019, 4], [2024, 4]],
  'Lazio': [[1995, 2], [2000, 10], [2008, -8], [2020, 0]],
  'Bayern München': [[1995, 0], [2001, 4], [2013, 6], [2020, 4], [2024, 0]],
  'Borussia Dortmund': [[1995, 4], [1997, 8], [2005, -18], [2013, 6], [2024, 0]],
  'Bayer Leverkusen': [[1995, -6], [2002, 4], [2010, -4], [2024, 6]],
  'RB Leipzig': [[2009, -40], [2016, -6], [2020, 2], [2024, 2]],
  'FC Schalke 04': [[1995, -6], [2008, 4], [2018, -6], [2023, -22]],
  'Hamburger SV': [[1995, 2], [2006, 2], [2014, -10], [2020, -14]],
  'Werder Bremen': [[1995, 0], [2004, 8], [2012, -8], [2022, -10]],
  'Paris Saint-Germain': [[1995, -4], [2004, -14], [2011, -6], [2015, 6], [2022, 8]],
  'AS Monaco': [[1995, 4], [2004, 6], [2011, -22], [2017, 6], [2024, -2]],
  'Olympique Lyonnais': [[1995, -6], [2002, 10], [2008, 6], [2018, -4], [2024, -12]],
  'Olympique de Marseille': [[1995, -8], [2010, 4], [2018, -4], [2024, -2]],
  'Lille OSC': [[1995, -14], [2005, 2], [2011, 4], [2021, 4], [2024, -2]],
  'AFC Ajax': [[1995, 10], [2001, -2], [2010, -4], [2019, 6], [2024, -12]],
  'PSV Eindhoven': [[1995, 4], [2005, 4], [2015, 0], [2024, 0]],
  'FC Porto': [[1995, 0], [2004, 8], [2011, 6], [2020, 0]],
  'SL Benfica': [[1995, -4], [2006, 0], [2014, 4], [2024, 2]],
  'Sporting CP': [[1995, -2], [2002, 2], [2013, -8], [2021, 4]],
  'Inter Miami CF': [[2020, -30], [2023, -4], [2024, 2]],
  'Al Hilal': [[1995, -30], [2010, -18], [2020, -6], [2023, 6]],
  'Al Nassr': [[1995, -30], [2010, -18], [2022, -8], [2023, 6]],
};
/** 창단/승격 이전에는 존재하지 않는 클럽 */
const CLUB_FROM = {
  'RB Leipzig': 2010, 'Inter Miami CF': 2020, 'LAFC': 2018, 'Austin FC': 2021,
  'FC Cincinnati': 2019, '광주 FC': 2011, 'Girona FC': 2008, 'FC Andorra': 2015,
  'Union Saint-Gilloise': 2015, 'Casa Pia AC': 2020, 'Estrela da Amadora': 2020,
};

function interpEra(pts, year) {
  if (!pts || !pts.length) return 0;
  if (year <= pts[0][0]) return pts[0][1];
  if (year >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, m0] = pts[i], [y1, m1] = pts[i + 1];
    if (year >= y0 && year <= y1) return m0 + ((m1 - m0) * (year - y0)) / (y1 - y0);
  }
  return 0;
}
/** 해당 연도의 클럽 명성 */
export function clubRepAt(club, year) {
  return clamp(club.rep + interpEra(ERA[club.name], year), 12, 99);
}
/** 해당 연도의 팀 평균 능력(overall). 입단 판정의 기준값이다. */
export function teamAvgAt(club, year) {
  return clamp(round(28 + clubRepAt(club, year) * 0.60), 30, 90);
}
export function clubExists(club, year) {
  return year >= (CLUB_FROM[club.name] ?? 1900);
}
export const LEAGUE_LIST = LEAGUES.map((l) => ({ id: l.id, name: l.name, nat: l.nat, div: l.div, size: l.clubs.length }));
export const CLUB_COUNT = CLUBS.length;
const clubById = (id) => CLUBS.find((c) => c.id === id);
const leagueOf = (id) => LEAGUES.find((l) => l.id === id);
export const DIV_LABEL = { 1: '1부', 2: '2부', 3: '3부' };

/** 주급 표기 */
export const weekly = (annual) => Math.round(annual / 52);
export const fmtWeekly = (annual) => fmtMoney(weekly(annual)) + '/주';

function salaryFor(club, ovr, year, rep) {
  const base = { 1: 850000, 2: 170000, 3: 32000 }[club.div] ?? 32000;
  const repMul = Math.pow(clamp(club.rep, 20, 100) / 62, 1.9);
  const abilityMul = 0.45 + clamp(ovr - club.req + 12, 0, 34) / 30;
  const fameMul = 0.8 + rep / 180;
  const era = clamp(0.34 + (year - 2000) * 0.033, 0.3, 1.2);
  // 2023년 이후 사우디 리그의 자금 유입. 축구적 수준과 무관하게 주급만 폭등한다.
  const saudiBoom = club.nat === 'SAU' && year >= 2023 ? 7 : 1;
  return round(base * repMul * abilityMul * fameMul * era * saudiBoom);
}

const NT_BAR = { ESP: 92, MAR: 62, SEN: 60, COL: 70, ECU: 60, ROU: 58, ARG: 90, DOM: 48 };
const NT_NAME = { ESP: '스페인', MAR: '모로코', SEN: '세네갈', COL: '콜롬비아', ECU: '에콰도르', ROU: '루마니아', ARG: '아르헨티나', DOM: '도미니카 공화국' };

/* ─────────────────────────── 4. 역사 이벤트 (50+) ─────────────────────────── */

/**
 * year → { t: [제목들], money: 가계 충격(-), boom: 축구 열기(+), note }
 * 역사는 컷신이 아니라 세계의 확률분포를 바꾼다.
 */
export const HISTORY = {
  1990: { t: ['1990 이탈리아 월드컵 — 스페인 16강 탈락'] },
  1991: { t: ['소련 붕괴 — 동유럽發 이민 유입 시작'] },
  1992: { t: ['바르셀로나 올림픽 — 도시 전체가 공사판', '스페인 올림픽 축구 금메달'], boom: 8 },
  1993: { t: ['유럽 단일시장 출범', '스페인 실업률 22% 돌파'], money: -6 },
  1994: { t: ['1994 미국 월드컵 — 스페인 8강'], boom: 5 },
  1995: { t: ['보스만 판결 — 유럽 선수 이동이 자유로워졌다'], note: '해외 이적의 문이 넓어진다' },
  1996: { t: ['유로 1996', '스페인 경제 회복 국면 진입'], money: 4 },
  1997: { t: ['호나우두 열풍', '아시아 금융위기'] },
  1998: { t: ['1998 프랑스 월드컵 — 스페인 조별 탈락'], boom: 3 },
  1999: { t: ['유로화 회계 도입 (현금은 아직 페세타)'] },
  2000: { t: ['유로 2000', '스페인 부동산 붐 시작 — 건설 일자리 급증'], money: 8 },
  2001: { t: ['FIFA 18세 미만 국제이적 제한 규정 발효', '9·11 테러'], note: '18세 미만 해외 이적 불가' },
  2002: { t: ['2002 한일 월드컵 — 스페인, 8강에서 한국에 승부차기 패', '유로화 현금 통용 시작'], boom: 6 },
  2003: { t: ['베컴 레알 마드리드 입단 — 갈락티코 시대', '이라크 전쟁 반대 대규모 시위'] },
  2004: { t: ['유로 2004 — 스페인 조별 탈락', '마드리드 열차 폭탄 테러'] },
  2005: { t: ['스페인 이민자 대규모 합법화 조치 — 57만 명 서류 취득'], note: '이민자 가정의 신분 문제가 풀린다' },
  2006: { t: ['2006 독일 월드컵', 'FC 바르셀로나 챔피언스리그 우승'], boom: 5 },
  2007: { t: ['서브프라임 위기 시작 — 스페인 부동산 경고등'], money: -5 },
  2008: { t: ['세계 금융위기 — 스페인 건설업 붕괴', '스페인 유로 2008 우승'], money: -22, boom: 10 },
  2009: { t: ['FC 바르셀로나 6관왕', '스페인 실업률 18% 돌파'], money: -10 },
  2010: { t: ['2010 남아공 월드컵 — 스페인 우승'], boom: 14 },
  2011: { t: ['청년실업 45%', '15-M 인디그나도스 운동'], money: -12 },
  2012: { t: ['유로 2012 — 스페인 2연패', '스페인 은행 구제금융 신청'], money: -14, boom: 8 },
  2013: { t: ['네이마르 바르셀로나 이적', '스페인 실업률 26% 정점'], money: -8 },
  2014: { t: ['2014 브라질 월드컵 — 스페인 조별 탈락', '경기 회복 시작'], money: 4 },
  2015: { t: ['FIFA 부패 스캔들', '바르셀로나 유소년 영입 규정 위반 징계'] },
  2016: { t: ['유로 2016', '레스터 시티 프리미어리그 우승'] },
  2017: { t: ['카탈루냐 독립선언 파동 — 도시가 두 편으로 갈렸다', '네이마르 PSG 이적 (€222M)'], money: -6 },
  2018: { t: ['2018 러시아 월드컵', 'VAR 도입'] },
  2019: { t: ['유럽 이적시장 사상 최대 규모'] },
  2020: { t: ['코로나19 팬데믹 — 리그 중단, 무관중 경기', '구단 재정 위기 및 임금 삭감'], money: -18 },
  2021: { t: ['유로 2020 (1년 연기 개최)', '유러피언 슈퍼리그 파동 — 48시간 만에 붕괴', '메시, 바르셀로나를 떠나다'] },
  2022: { t: ['2022 카타르 월드컵 — 사상 첫 겨울 개최'], boom: 6 },
  2023: { t: ['루비알레스 사태 — #SeAcabó 운동', '사우디 리그의 대규모 자금 유입'] },
  2024: { t: ['유로 2024 — 스페인 우승'], boom: 10 },
  2025: { t: ['확대 클럽 월드컵 개최'] },
  2026: { t: ['2026 북중미 월드컵 — 48개국 체제'], boom: 8 },
};
const WORLD_CUP_YEARS = [2006, 2010, 2014, 2018, 2022, 2026];
/** 내장된 역사 이벤트 총 개수 */
export const HISTORY_COUNT = Object.values(HISTORY).reduce((s, h) => s + h.t.length, 0);

/* ─────────────────────────── 5. 캐릭터 생성 ─────────────────────────── */

export function newGame(opts = {}) {
  const seed = opts.seed ?? (Math.random() * 2 ** 31) | 0;
  const rng = makeRng(seed);

  const envId = opts.env ?? rng.weighted([
    { w: 20, v: 'IMM_LOW' }, { w: 18, v: 'LOC_LOW' }, { w: 17, v: 'IMM_MID' },
    { w: 20, v: 'LOC_MID' }, { w: 7, v: 'IMM_HIGH' }, { w: 8, v: 'LOC_HIGH' }, { w: 10, v: 'MIXED' },
  ]).v;
  const env = FAMILY_ENVS[envId];
  const persId = opts.personality ?? rng.pick(['CYNIC', 'PASSION', 'NEUTRAL']);
  const pers = PARENT_PERSONALITIES[persId];

  const bg = env.immigrant ? rng.pick(IMMIGRANT_BG) : null;
  const name = bg
    ? `${rng.pick(bg.first)} ${rng.pick(bg.last)}`
    : `${rng.pick(SPANISH_FIRST)} ${rng.pick(SPANISH_LAST)}`;
  const surname = name.split(' ').slice(1).join(' ');

  const father = {
    name: bg ? `${rng.pick(bg.pa)} ${surname}` : `${rng.pick(FATHER_ES)} ${surname}`,
    age1990: rng.int(28, 38), job: rng.pick(env.jobs), trust: 52,
  };
  const mother = {
    name: bg ? `${rng.pick(bg.ma)} ${surname}` : `${rng.pick(MOTHER_ES)} ${surname}`,
    age1990: rng.int(25, 35), job: rng.pick(env.jobs), trust: 60,
  };

  const posId = opts.position ?? rng.weighted([
    { w: 8, v: 'GK' }, { w: 16, v: 'CB' }, { w: 15, v: 'FB' }, { w: 18, v: 'CM' },
    { w: 14, v: 'AM' }, { w: 16, v: 'WG' }, { w: 13, v: 'ST' },
  ]).v;

  // 잠재력은 균등분포. 58~99 사이 어떤 값도 같은 확률로 나온다.
  // (우편향으로 두면 대부분이 저잠재력에 몰려 성장 속도 차이가 잘 드러나지 않는다)
  const potential = rng.int(58, 99);

  // 초기 부모 반응 — 성향 + 가정환경의 안전망 압력으로 결정된다
  let react = 1 + pers.bias - (env.safety > 70 ? 1 : 0);
  react = clamp(react, 0, 3);

  const p = {
    name, birthYear: 1990, env: envId, personality: persId,
    immigrantBg: bg ? bg.label : null,
    nationality: 'ESP', secondNationality: bg ? bg.nat : null,
    position: posId,
    ovr: 6, peakOvr: 6,
    hidden: {
      potential,
      injuryProne: clamp(round(rng.norm(50, 16)), 8, 95),
      bigMatch: clamp(round(rng.norm(52, 15)), 10, 96),
      adaptability: clamp(round(rng.norm(52, 15)), 8, 96),
      grit: clamp(round(rng.norm(55, 15)), 10, 98),
      absorption: clamp(round(rng.norm(52, 14)), 12, 95),
      consistency: clamp(round(rng.norm(50, 15)), 10, 95),
      lateBloomer: rng.chance(0.22),
      pro: clamp(round(rng.norm(50, 16)), 8, 96),
    },
    confidence: 50, stress: 20, fitness: 100, form: 55,
    willToPlay: 68, academic: clamp(round(env.academic + rng.norm(0, 8)), 10, 98),
    trait: { ambition: 50, pride: 50, loyalty: 50, adaptability: 50, risk: 50 },
    econ: { wageYear: 0, assets: 0, household: env.money, debt: 0, debtRate: 0, totalEarned: 0 },
    awards: { ballonDor: 0, ballonTop3: 0, uclTitles: 0, uclApps: 0, goldenBoot: 0, leagueMVP: 0, topScorer: 0 },
    club: null, loanFrom: null, contractUntil: null,
    reputation: 2, peakReputation: 0,
    ntTeam: null, ntLocked: false, injuryWeeks: 0,
    career: { apps: 0, goals: 0, assists: 0, caps: 0, ntGoals: 0, seasons: [], trophies: [] },
    active: true, retired: false, path: [], devEnv: null,
  };

  const g = {
    version: 3, seed, rng, player: p,
    world: { year: 1990, phase: 'SUMMER', reaction: react, academyAccess: 0, boom: 0 },
    npcs: {
      father, mother, coach: { trust: 50 }, agent: null,
      // 형 — 별도 트랙으로 진행되는 서브플롯
      sibling: {
        name: bg ? `${rng.pick(bg.first)} ${surname}` : `${rng.pick(SPANISH_FIRST)} ${surname}`,
        age1990: rng.int(2, 6),
        state: 'STABLE',      // STABLE → DRIFT → SLUM → INCIDENT → (RECOVER|PRISON|DEAD)
        risk: clamp(round(rng.norm(env.safety < 30 ? 42 : 24, 14)), 3, 88),
        helped: 0,
      },
    },
    memories: [], flags: {}, log: [], news: [],
    pending: null, turn: 0, over: false, ending: null,
  };

  pushLog(g, 'header', `${p.name} — 1990년 7월 18일, 바르셀로나`);
  pushLog(g, 'birth',
    `가정환경   ${env.label}${bg ? ` · ${bg.label} 출신` : ''}\n` +
    `아버지     ${father.name} (1990년 ${father.age1990}세) — ${father.job}\n` +
    `어머니     ${mother.name} (1990년 ${mother.age1990}세) — ${mother.job}\n` +
    `부모 성향  ${pers.label} — ${pers.blurb}\n` +
    `축구 반응  ${REACTIONS[react].label}\n` +
    `포지션     ${POSITIONS[posId].label}`);
  beginTurn(g);
  // 유년기는 플레이하지 않는다. 시뮬레이션만 돌리고 그 결과를 산문으로 제시한다.
  runBackstory(g);
  return g;
}

/** 0~15세를 헤드리스로 진행한 뒤, 결과 상태를 산문 배경설정으로 렌더한다. */
function runBackstory(g) {
  let guard = 0;
  g.flags._inBackstory = true;
  while (!g.over && ageOf(g) < 16 && guard++ < 120) autoStep(g);

  // 유년기 시뮬레이션에서 커리어가 끝나는 경우가 있다 (중도 포기 등).
  // 게임은 반드시 만 16세에서 시작하므로, 그 사건은 배경 서사로만 남기고
  // 16세 시점에 "무소속으로 다시 도전하는 상태"로 복원한다.
  if (g.over || !g.player.active || ageOf(g) < 16) {
    g.over = false; g.ending = null; g.pending = null;
    g.player.active = true; g.player.retired = false;
    g.flags.injuryEnded = false; g.flags.drifting = false; g.flags.lifeTrack = null;
    g.flags.aqCount = 0;
    if (hasMemory(g, 'quit') || hasMemory(g, 'washout')) {
      g.flags.youthDropout = true;
      g.player.club = null;
      g.player.willToPlay = clamp(g.player.willToPlay + 22, 0, 100);
    }
    while (ageOf(g) < 16) { g.world.phase = 'SUMMER'; g.world.year += 1; }
    g.world.phase = 'SUMMER';
  }
  g.flags._inBackstory = false;
  // 16~17세는 1군이 아니라 유소년 단계다. 팀명과 신분을 그에 맞게 바꾼다.
  if (g.player.club && !g.player.club.youth) {
    const base = g.player.club;
    g.player.club = {
      ...base, youth: true,
      seniorName: base.name,
      name: `${base.name} 후베닐 A`,
      league: '후베닐 디비시온 데 오노르',
    };
  }

  // 시작 능력은 전원 50으로 고정한다. 배경설정은 소속 팀과 훈련 환경(devEnv)을 통해서만
  // 작동하고, 이후 성장 속도는 잠재력이 결정한다.
  g.player.ovr = START_OVR;
  g.player.peakOvr = START_OVR;

  // 배경 시뮬 마지막 턴이 걸어둔 이벤트는 리셋 전 능력치로 만들어진 것이다.
  // 그대로 두면 능력 50짜리 16세에게 1부 빅클럽 오퍼가 남는다. 버리고 다시 뽑는다.
  if (!g.over) { g.pending = null; pickEvent(g); }

  const prose = buildBackstory(g);
  g.backstory = prose;
  // 유년기 턴 로그를 지우고 배경설정으로 대체한다
  g.log = [];
  pushLog(g, 'header', `${g.player.name} — 1990년 7월 18일, 바르셀로나`);
  pushLog(g, 'backstory', prose);
  setNews(g, `${g.world.year}년: 만 16세. 프로가 되기 위한 첫 여름.`);
}

function buildBackstory(g) {
  const p = g.player, f = g.npcs.father, m = g.npcs.mother, sib = g.npcs.sibling;
  const env = FAMILY_ENVS[p.env];
  const L = [];

  L.push(`${p.name}. 1990년 7월 18일, 바르셀로나 산츠 지구.`);
  L.push('');
  if (env.immigrant) {
    L.push(`아버지 ${f.name}은 ${p.immigrantBg}에서 왔다. 1990년 당시 ${f.age1990}세, 직업은 ${f.job}였다.`);
    L.push(`올림픽을 앞둔 도시는 사람을 무한히 필요로 했고, 서류가 완전하지 않은 남자에게도 일을 줬다.`);
    L.push(`어머니 ${m.name}(${m.age1990}세)은 ${m.job}으로 새벽에 나갔다. 두 사람이 벌어오는 돈으로 살았다.`);
  } else {
    L.push(`아버지 ${f.name}(${f.age1990}세)은 ${f.job}, 어머니 ${m.name}(${m.age1990}세)은 ${m.job}이다.`);
    L.push(`이 도시에서 3대를 살았고, 가족 모두가 어느 팀을 응원하는지는 태어날 때 이미 정해져 있었다.`);
  }
  L.push(env.blurb);
  L.push('');

  if (hasMemory(g, 'no_money_youth')) {
    L.push(`축구를 시작한 건 선택이 아니라 위치였다. 아파트 아래 골목이 경기장이었다.`);
    L.push(`여섯 살에 동네 클럽 등록 시즌이 왔지만 회비를 내지 못했다. 몇 년을 골목에서만 찼다.`);
  } else if (g.flags.registered) {
    L.push(`여섯 살에 동네 클럽 유소년팀에 등록했다. 유니폼은 사이즈가 두 단계 커서 무릎까지 내려왔다.`);
  } else {
    L.push(`정식 등록 없이 학교와 골목에서만 찼다. 아무도 지켜보지 않는 축구였다.`);
  }
  if (hasMemory(g, 'promise_school')) L.push(`아홉 살에 "성적은 유지하겠다"는 조건으로 축구를 허락받았다. 그 약속은 아직 유효하다.`);
  L.push('');

  L.push(`2002년 여름, 열두 살에 FC 바르셀로나 유소년 테스트를 봤다. 400명이 왔다.`);
  if (env.immigrant) L.push(`접수처에서 서류를 두 번 확인받았다. 앞의 아이들은 한 번이었다.`);
  if (hasMemory(g, 'academy_in')) {
    L.push(`합격했다. 라 마시아 숙소에 짐을 풀었다. 같은 방 아이 셋 다 자기 지역에서 제일 잘하는 애였다.`);
  } else if (hasMemory(g, 'rejection')) {
    L.push(`사흘 뒤 리포트가 왔다. 불합격.`);
    L.push('');
    L.push(`  "나쁜 선수가 아니다. 다만 현재 신체조건과 포지션 경쟁을 고려하면,`);
    L.push(`   지금 우리 시스템에 넣어야 할 필연성이 낮다."`);
    L.push('');
    L.push(`그 문장을 종이에 적어 서랍에 넣었다. 지금도 거기 있다.`);
  }
  L.push('');

  const yc = p.club ? p.club.name : '무소속';
  L.push(`이후 ${yc} 유소년팀에서 뛰었다.`);
  const inj = (p.career.injuries || [])[0];
  if (inj) L.push(`${inj.age}세에 ${inj.name}으로 ${inj.weeks}주를 쉬었다. 그때 몸이 예전과 달라졌다.`);
  if (sib.state !== 'STABLE') L.push(`형 ${sib.name}은 학교를 그만뒀다. 동네에서 형의 이름이 다르게 불리기 시작했다.`);
  L.push(`학업은 ${p.academic >= 65 ? '상위권으로 유지했다' : p.academic >= 45 ? '중간 정도였다' : '거의 놓았다'}.`);
  L.push('');

  if (g.flags.youthDropout) {
    L.push(`한번은 완전히 그만뒀다. 축구화를 신발장 맨 아래로 밀어 넣고 몇 달을 보냈다.`);
    L.push(`다시 시작한 이유는 스스로도 설명하지 못한다. 지금은 소속팀이 없다.`);
    L.push('');
  }
  L.push(`${g.world.year}년 여름. 만 16세. 후베닐 계약이 끝난다.`);
  L.push(`현재 능력 ${ability(g)} (${abilityLabel(ability(g))}) · 소속 ${yc}`);
  L.push(`이 도시에서 유소년 등록 선수가 프로 계약에 도달하는 비율은 1% 아래다. 여기서부터가 시작이다.`);
  return L.join('\n');
}

/** 1990년 바르셀로나 정착 에피소드 */
function settlementStory(g) {
  const env = FAMILY_ENVS[g.player.env];
  const f = g.npcs.father, m = g.npcs.mother;
  const bg = g.player.immigrantBg;
  const common = `1990년 7월의 바르셀로나는 공사장이다. 2년 뒤 올림픽을 치르기 위해 도시 전체를 뒤집어 놓았고, 어디를 가도 크레인과 철골이 보인다. 그 소음 속에서 아이가 태어났다.`;
  if (env.immigrant) {
    return `${common}\n\n${f.name}과 ${m.name}은 ${bg}에서 왔다. ${f.age1990}세와 ${m.age1990}세. ` +
      `${f.job}과 ${m.job}으로 버틴다. 서류는 아직 완전하지 않고, 카탈루냐어는 시장에서 쓰는 말만 안다.\n\n` +
      `${env.blurb}\n\n` +
      `아파트는 엘리베이터가 없는 5층이다. 창문을 열면 아래 골목에서 아이들이 벽에 공을 차는 소리가 올라온다. ` +
      `이 소리는 앞으로 20년간 이 아이의 배경음이 된다.`;
  }
  return `${common}\n\n${f.name}(${f.age1990}세)은 ${f.job}, ${m.name}(${m.age1990}세)은 ${m.job}이다. ` +
    `이 도시에서 3대째 살았고, 가족 모두가 어느 팀을 응원하는지는 태어날 때 이미 정해져 있다.\n\n` +
    `${env.blurb}\n\n` +
    `창문을 열면 아래 골목에서 아이들이 벽에 공을 차는 소리가 올라온다. 이 소리는 앞으로 20년간 이 아이의 배경음이 된다.`;
}

export function rollSummary(g) {
  const env = FAMILY_ENVS[g.player.env];
  const pers = PARENT_PERSONALITIES[g.player.personality];
  return {
    name: g.player.name,
    env: env.label + (g.player.immigrantBg ? ` · ${g.player.immigrantBg} 출신` : ''),
    envBlurb: env.blurb,
    personality: pers.label, personalityBlurb: pers.blurb,
    reaction: REACTIONS[g.world.reaction].label,
    position: POSITIONS[g.player.position].label,
    father: `${g.npcs.father.name} (${g.npcs.father.age1990}세) — ${g.npcs.father.job}`,
    mother: `${g.npcs.mother.name} (${g.npcs.mother.age1990}세) — ${g.npcs.mother.job}`,
  };
}

/* ─────────────────────────── 6. 로그 / 기억 / 근황 ─────────────────────────── */

function pushLog(g, kind, text) {
  g.log.push({ kind, text, year: g.world.year, age: ageOf(g) });
  if (g.log.length > 420) g.log.splice(0, g.log.length - 420);
}
function remember(g, tag, text, importance = 0.5) {
  g.memories.push({ year: g.world.year, age: ageOf(g), tag, text, importance });
}
const hasMemory = (g, tag) => g.memories.some((m) => m.tag === tag);
const getMemory = (g, tag) => g.memories.find((m) => m.tag === tag);

function setNews(g, text) {
  g.news.unshift({ year: g.world.year, age: ageOf(g), text });
  if (g.news.length > 12) g.news.pop();
}

/** 부모 반응은 성적·이적·학업·부상에 따라 실시간으로 변한다 */
function shiftReaction(g, d, why) {
  const before = g.world.reaction;
  const bias = PARENT_PERSONALITIES[g.player.personality].bias;
  // 냉소적인 부모는 좋은 소식에 덜 반응하고, 열정적인 부모는 더 크게 반응한다
  const adj = d > 0 ? d + (bias > 0 ? 1 : bias < 0 ? -1 : 0) : d;
  g.world.reaction = clamp(g.world.reaction + adj, 0, 3);
  if (g.world.reaction !== before && why) {
    pushLog(g, 'parent', `부모의 반응이 「${REACTIONS[before].label}」 → 「${REACTIONS[g.world.reaction].label}」로 바뀌었다. (${why})`);
  }
}

/* ─────────────────────────── 7. 시간 ─────────────────────────── */

export function ageOf(g) {
  return g.world.phase === 'SUMMER' ? g.world.year - 1990 : g.world.year - 1991;
}
export function cadenceOf(age) { return age >= 16 && age <= 29 ? 'HALF' : 'YEAR'; }
const periodYears = (g) => (cadenceOf(ageOf(g)) === 'HALF' ? 0.5 : 1);

export function periodLabel(g) {
  const age = ageOf(g);
  if (g.world.phase === 'WINTER') return `${g.world.year}년 1월 · 겨울 이적시장 (만 ${age}세)`;
  if (age <= 15) return `${g.world.year}년 (만 ${age}세)`;
  return `${g.world.year}/${String((g.world.year + 1) % 100).padStart(2, '0')} 시즌 · 여름 이적시장 (만 ${age}세)`;
}
function advanceClock(g) {
  if (cadenceOf(ageOf(g)) === 'HALF') {
    if (g.world.phase === 'SUMMER') { g.world.phase = 'WINTER'; g.world.year += 1; }
    else g.world.phase = 'SUMMER';
  } else { g.world.phase = 'SUMMER'; g.world.year += 1; }
}

/* ─────────────────────────── 8. 성장 ─────────────────────────── */

/**
 * 성장 커브 — 16~23세가 최성장기, 28세에 피크를 찍고 이후 하락한다.
 */
function growthCurve(age, lateBloomer) {
  const a = lateBloomer ? age - 2 : age;
  if (a < 6) return 0;
  if (a < 8) return 0.9;
  if (a < 12) return 1.9;
  if (a < 16) return 2.5;
  if (a < 20) return 3.0;   // 16~19 최성장
  if (a < 24) return 2.7;   // 20~23 최성장
  if (a < 26) return 1.15;
  if (a < 28) return 0.6;
  if (a < 29) return 0.22;  // 28세 피크
  return 0;
}
/** 28세 피크 이후 매년 하락 */
export const PEAK_AGE = 28;
function declineFor(g, age, years) {
  const p = g.player;
  return years * (0.35 + Math.max(0, age - PEAK_AGE) * 0.30) * (1 + (60 - p.hidden.pro) / 200);
}

function trainingQuality(g) {
  const p = g.player;
  if (p.club) {
    let q = p.club.train;
    const last = p.career.seasons[p.career.seasons.length - 1];
    if (last && last.apps < 6 && ageOf(g) >= 17) q -= 12;
    return clamp(q, 20, 100);
  }
  return clamp(30 + (g.world.academyAccess ? 16 : 0) + p.econ.household * 0.12, 15, 70);
}

/** 환경 천장 — 잠재력은 환경이 허락하는 만큼만 열린다 */
/**
 * 잠재력 → 성장 속도 계수.
 * 전원이 50에서 출발하므로, 갈라지는 것은 "얼마나 빨리 자라는가"다.
 *   잠재력 95 → ×1.35 (17세부터 폭발)
 *   잠재력 75 → ×1.00
 *   잠재력 58 → ×0.75 (느리고 일찍 정지)
 * 이 수치는 플레이어에게 공개되지 않는다.
 */
function growthSpeed(p) {
  return clamp(0.75 + (p.hidden.potential - 58) * 0.01622, 0.6, 1.45);
}

function developmentCeiling(p) {
  const env = p.devEnv ?? 52;
  const raw = p.hidden.potential * clamp(0.72 + 0.28 * clamp((env - 30) / 55, 0, 1), 0.72, 1);
  // 전원이 50에서 출발하므로 천장이 50 아래로 계산되면 아예 성장하지 못한다.
  // 최소한 시작점보다는 위에 두어, 잠재력이 낮은 선수도 조금은 자라게 한다.
  return Math.max(raw, START_OVR + 3);
}

const GREW = [
  '이 기간, 눈에 보이게 달라졌다. 지난 시즌 자신을 막던 상대를 이제는 아무렇지 않게 지나간다.',
  '몸이 기술을 따라잡았다. 머리로 그리던 장면이 실제로 나오기 시작했다.',
  '코치가 훈련 중에 멈추고 다시 해보라고 했다. 좋은 뜻으로 멈춘 것이다.',
  '한 단계 올라갔다는 걸 스스로도 안다. 같은 상황에서 선택지가 두 개 더 보인다.',
];
const STALL = [
  '몸이 늘지 않는다. 훈련량은 그대로인데 경기에서는 계속 반 박자 늦는다.',
  '제자리다. 주변이 빠르게 느는 만큼, 제자리는 곧 뒤처지는 것이다.',
  '작년 영상과 올해 영상을 비교해봤다. 차이를 찾지 못했다.',
];

function applyGrowth(g) {
  const p = g.player;
  const age = ageOf(g);
  const years = periodYears(g);

  if (age >= 11 && age <= 22) {
    const tq = trainingQuality(g);
    p.devEnv = p.devEnv == null ? tq : p.devEnv * 0.78 + tq * 0.22;
  }
  if (age > PEAK_AGE) {
    p.ovr = clamp(p.ovr - declineFor(g, age, years), 20, 99);
    return;
  }
  if (!p.active) return;
  const curve = growthCurve(age, p.hidden.lateBloomer);
  if (curve === 0) return;
  const gap = developmentCeiling(p) - p.ovr;
  if (gap <= 0.3) { p.peakOvr = Math.max(p.peakOvr, p.ovr); return; }

  const mult = 0.45 + trainingQuality(g) / 150 + p.hidden.absorption / 220;
  const noise = 0.55 + g.rng.rightSkew(1.35) * 1.5;
  const stressPen = 1 - clamp(p.stress - 45, 0, 55) / 130;
  const injPen = p.injuryWeeks > 8 ? 0.55 : p.injuryWeeks > 0 ? 0.82 : 1;
  // 세미프로 기간에는 성장이 절반으로 느려진다 (승격으로 신분이 풀리면 즉시 해제된다)
  const semiPen = (g.flags.semiProLock && g.world.year < g.flags.semiProUntil) ? 0.5 : 1;
  const delta = clamp(years * curve * (gap / 100) * mult * noise * growthSpeed(p) * 6.4 * stressPen * injPen * semiPen, 0, 14);
  p.ovr = clamp(p.ovr + delta, 0, 99);
  p.peakOvr = Math.max(p.peakOvr, p.ovr);

  if (age >= 12 && delta > 3.6) pushLog(g, 'growth', g.rng.pick(GREW));
  else if (age >= 14 && delta < 0.7) pushLog(g, 'growth', g.rng.pick(STALL));
}

export function ability(g) { return round(g.player.ovr); }
export function abilityLabel(v) {
  if (v >= 85) return '월드클래스';
  if (v >= 76) return '1부 주전급';
  if (v >= 66) return '1부 로테이션급';
  if (v >= 57) return '2부 주전급';
  if (v >= 46) return '3부 주전급';
  if (v >= 34) return '유망주 수준';
  return '육성 단계';
}

/* ─────────────────────────── 9. 시즌 시뮬레이션 ─────────────────────────── */

function matchesInPeriod(g) {
  const age = ageOf(g);
  if (age < 10) return 0;
  const base = age < 16 ? 24 : (g.player.club && g.player.club.div === 1 && g.player.club.rep > 80 ? 44 : 36);
  // 2020년은 리그가 실제로 중단됐다 — 경기 수가 줄어든다
  const disruption = g.world.year === 2020 ? 0.72 : 1;
  return round(base * periodYears(g) * disruption);
}

/** 승격·강등으로 소속 부가 바뀌면 그 부의 리그를 기준으로 순위를 매긴다 */
function leagueForDiv(club) {
  const same = LEAGUES.find((l) => l.nat === club.nat && l.div === club.div);
  return same || leagueOf(club.leagueId);
}

/**
 * 리그 순위. 명성 백분위를 기준선으로 두되,
 *   ① 하위 리그일수록 전력 차가 작아 순위 변동이 크다 (parity)
 *   ② 주인공이 팀 평균을 크게 웃돌면 팀 순위를 실제로 끌어올린다
 * 이 두 항이 없으면 중위권 3부 클럽은 22팀 리그에서 영원히 승격하지 못한다.
 */
function leagueFinish(g, club, share = 1) {
  const lg = leagueForDiv(club);
  const size = lg ? lg.clubs.length : 20;
  const better = (lg ? lg.clubs : []).filter(([, r]) => r > club.rep).length;
  const expected = clamp(better + 1, 1, size);
  const parity = club.div === 1 ? 0.15 : club.div === 2 ? 0.22 : 0.30;
  // 벤치에 앉은 선수는 팀 순위를 끌어올리지도, 끌어내리지도 않는다
  const lift = clamp((g.player.ovr - teamAvgAt(club, g.world.year)) / 2.6, -3, 7) * clamp(share, 0, 1);
  return { finish: clamp(round(expected - lift + g.rng.norm(0, size * parity)), 1, size), size };
}

/**
 * 부상 유형표.
 *   ovr   즉각적인 능력 하락 (선수 생명을 위협하는 부상은 5~10)
 *   prone 이후 부상 빈도 증가폭 (재발성)
 */
export const INJURY_TYPES = [
  { id: 'BRUISE',    name: '타박·염좌',      w: 34, weeks: [1, 3],   ovr: [0, 0],  prone: 0,  desc: '며칠 절뚝였다. 그 정도다.' },
  { id: 'MUSCLE',    name: '근육 손상',      w: 22, weeks: [3, 6],   ovr: [0, 1],  prone: 2,  desc: '허벅지가 뭉쳤다. 무리한 일정의 대가다.' },
  { id: 'ANKLE',     name: '발목 인대 파열', w: 13, weeks: [8, 16],  ovr: [1, 3],  prone: 6,  desc: '발목이 돌아갔다. 붓기가 3주 동안 빠지지 않았다.' },
  { id: 'FRACTURE',  name: '골절',           w: 9,  weeks: [10, 20], ovr: [2, 4],  prone: 5,  desc: '뼈가 부러지는 소리를 본인이 들었다.' },
  { id: 'HAMSTRING', name: '햄스트링 파열',  w: 12, weeks: [8, 16],  ovr: [5, 7],  prone: 14, desc: '뒤에서 누가 걷어찬 것 같았다. 아무도 없었다. 햄스트링은 한 번 찢어지면 계속 찢어진다.' },
  { id: 'ACHILLES',  name: '아킬레스건 파열', w: 5, weeks: [28, 44], ovr: [7, 10], prone: 16, desc: '아킬레스가 끊어졌다. 뛰는 방식을 처음부터 다시 배워야 한다.' },
  { id: 'ACL',       name: '전방십자인대(ACL) 파열', w: 5, weeks: [32, 52], ovr: [8, 10], prone: 20, desc: '무릎이 안쪽으로 접혔다. 십자인대. 이 단어를 들은 선수의 절반은 예전으로 돌아가지 못한다.' },
];
const SEVERE = new Set(['HAMSTRING', 'ACHILLES', 'ACL']);

function rollInjury(g, age) {
  const p = g.player;
  // 나이가 많고 유리몸일수록 중상 비중이 올라간다
  const severeBias = 1 + Math.max(0, age - 27) * 0.12 + (p.hidden.injuryProne - 50) / 90;
  const t = g.rng.weighted(INJURY_TYPES.map((x) => ({
    w: SEVERE.has(x.id) || x.id === 'FRACTURE' ? x.w * severeBias : x.w, v: x,
  }))).v;

  const weeks = g.rng.int(t.weeks[0], t.weeks[1]);
  const ovrLoss = t.ovr[1] > 0 ? g.rng.int(t.ovr[0], t.ovr[1]) : 0;
  p.injuryWeeks += weeks;
  p.confidence = clamp(p.confidence - weeks * 0.5, 5, 98);
  if (ovrLoss > 0) {
    p.ovr = clamp(p.ovr - ovrLoss, 15, 99);
    // 잠재력 자체도 깎인다 — 예전 몸으로는 돌아가지 못한다
    p.hidden.potential = clamp(p.hidden.potential - Math.ceil(ovrLoss * 0.7), 40, 99);
  }
  if (t.prone > 0) p.hidden.injuryProne = clamp(p.hidden.injuryProne + t.prone, 8, 98);

  const severe = SEVERE.has(t.id);
  if (severe) {
    p.willToPlay -= g.rng.int(6, 18);
    p.career.injuries = (p.career.injuries || []);
    p.career.injuries.push({ year: g.world.year, age, name: t.name, weeks, ovrLoss });
    remember(g, 'major_injury', `${g.world.year}년, ${t.name}. ${weeks}주 결장, 능력 -${ovrLoss}. 커리어의 방향이 바뀌었다.`, 0.92);
    if (g.rng.chance(clamp(0.12 + (weeks - 28) / 90 + (55 - p.willToPlay) / 200 + (age > 30 ? 0.16 : 0), 0, 0.6))) {
      p.active = false; g.flags.injuryEnded = true;
      p.path.push(`${g.world.year} ${t.name}으로 커리어 종료`);
      remember(g, 'injury_retire', `${g.world.year}년, ${t.name} 끝에 선수 생활을 접었다.`, 1.0);
    }
  }
  return { type: t, weeks, ovrLoss, severe };
}

/** 부가 바뀌면 리그 이름·노출도도 그 부에 맞게 바꾼다 */
function relabelLeague(g, club) {
  const lg = LEAGUES.find((l) => l.nat === club.nat && l.div === club.div);
  if (!lg) return;
  club.league = lg.name;
  club.leagueId = lg.id;
  club.expo = clamp(round(clubRepAt(club, g.world.year) * (club.div === 1 ? 0.98 : club.div === 2 ? 0.62 : 0.34)), 6, 99);
}

function simulatePeriod(g) {
  const p = g.player;
  const age = ageOf(g);
  if (!p.active || age < 10) return null;
  if (p.injuryWeeks > 0) p.injuryWeeks = Math.max(0, p.injuryWeeks - periodYears(g) * 52);
  const club = p.club;
  if (!club) return null;

  const req = age < 17 ? 14 + (age - 10) * 3.8 + club.rep * 0.12 : club.req;
  const edge = p.ovr - req + (g.npcs.coach.trust - 50) / 5 + (p.form - 55) / 8 + g.rng.norm(0, 2.5);
  const share = clamp(sigmoid(edge / 6.5), 0.02, 0.97);
  const total = matchesInPeriod(g);
  const availability = clamp(1 - p.injuryWeeks / (periodYears(g) * 52), 0, 1);
  const apps = round(total * share * availability);

  const pos = POSITIONS[p.position];
  const perf = clamp(p.ovr - req, -25, 25);
  const bigMatch = club.div === 1 && club.rep > 78 ? (p.hidden.bigMatch - 50) / 12 : 0;
  const rating = clamp(6.35 + perf * 0.055 + bigMatch * 0.12 +
    g.rng.norm(0, 0.42) * (1 + (60 - p.hidden.consistency) / 140), 4.9, 9.4);
  const goals = Math.max(0, round(apps * pos.goal * (0.55 + clamp(perf + 14, 0, 40) / 40) * (rating / 6.9) * (0.65 + g.rng.f() * 0.75)));
  const assists = Math.max(0, round(apps * pos.assist * (0.6 + clamp(perf + 14, 0, 40) / 44) * (rating / 6.9) * (0.65 + g.rng.f() * 0.75)));

  const seniorClub = age >= 16 && !club.youth;
  if (seniorClub) { p.career.apps += apps; p.career.goals += goals; p.career.assists += assists; }
  p.form = clamp(45 + (rating - 6.4) * 22 + g.rng.norm(0, 5), 10, 98);
  g.npcs.coach.trust = clamp(g.npcs.coach.trust + (rating - 6.6) * 9 + (apps > total * 0.5 ? 3 : -2), 5, 98);
  p.confidence = clamp(p.confidence + (rating - 6.55) * 14 + (apps < 3 ? -6 : 2), 5, 98);
  p.stress = clamp(p.stress + (apps < 3 ? 5 : -3) + (club.comp - 70) / 12, 0, 100);

  const youthCap = age < 17 ? 0.22 : 1;
  const baseline = clamp(club.rep * 0.72, 4, 92) * clamp(0.4 + share, 0.4, 1.3) * youthCap;
  p.reputation += (baseline - p.reputation) * 0.28 * (periodYears(g) * 2);
  p.reputation = clamp(p.reputation + clamp((rating - 6.4) * 4 * (club.expo / 70) * (apps / Math.max(1, total * 0.4)) * youthCap, -6, 12), 0, 100);
  if (age >= 17) p.peakReputation = Math.max(p.peakReputation, p.reputation);

  // 부상 — 운이 아니라 조건부 확률. 유형에 따라 결과가 완전히 다르다.
  const load = apps / Math.max(1, total);
  const ageRisk = age < 18 ? 1.15 : age > 29 ? 1 + (age - 29) * 0.10 : 1;
  let injuryNote = null;
  if (g.rng.chance(clamp(0.055 * periodYears(g) * 2 * (0.5 + load) * (p.hidden.injuryProne / 55) * ageRisk *
      (1 + clamp(p.stress - 50, 0, 50) / 120), 0, 0.62))) {
    injuryNote = rollInjury(g, age);
  }

  // 부채 이자 — 갚지 않으면 늘어난다
  if (p.econ.debt > 0) {
    const interest = round(p.econ.debt * p.econ.debtRate * periodYears(g));
    p.econ.debt += interest;
    const pay = Math.min(p.econ.assets, round(p.econ.debt * 0.35));
    if (pay > 0) { p.econ.assets -= pay; p.econ.debt -= pay; }
    if (p.econ.debt <= 0) {
      p.econ.debt = 0; p.econ.debtRate = 0;
      p.stress = clamp(p.stress - 18, 0, 100);
      pushLog(g, 'debt', '빚을 다 갚았다. 통장을 확인하고 한참 앉아 있었다.');
      remember(g, 'debt_clear', `${g.world.year}년, 빚을 전부 청산했다.`, 0.8);
    } else if (interest > 0) {
      pushLog(g, 'debt', `부채 ${fmtMoney(p.econ.debt)} (이자 ${fmtMoney(interest)} 발생${pay ? ` · ${fmtMoney(pay)} 상환` : ''})`);
      p.stress = clamp(p.stress + 4, 0, 100);
    }
  }

  let salary = 0;
  if (seniorClub) {
    salary = salaryFor(club, p.ovr, g.world.year, p.reputation);
    p.econ.wageYear = salary;
    p.econ.assets += round(salary * periodYears(g) * 0.55);
    p.econ.totalEarned += round(salary * periodYears(g));
    if (salary > 400000 && !g.flags.bigWage) { g.flags.bigWage = true; shiftReaction(g, 2, '자식의 연봉이 집안 수입을 넘어섰다'); }
  }

  // 팀 성적 + 업적
  const ach = [];
  let finishRec = null, uclRec = null;
  const doFinish = g.world.phase === 'SUMMER' || cadenceOf(age) === 'YEAR';
  if (seniorClub && doFinish && apps >= 5) {
    const { finish, size } = leagueFinish(g, club, share);
    finishRec = { finish, size };
    if (finish === 1) {
      ach.push(club.div === 1 ? `${club.league} 우승` : `${club.league} 우승 · 승격`);
      p.career.trophies.push(`${g.world.year} ${club.league} 우승`);
      if (club.div > 1) { club.div -= 1; club.req += 6; relabelLeague(g, club); clearSemiPro(g, club); }
      shiftReaction(g, 1, '리그 우승');
    } else if (club.div > 1 && finish <= 2) {
      ach.push('승격'); club.div -= 1; club.req += 6; relabelLeague(g, club); clearSemiPro(g, club); g.flags.justPromoted = club.name;
    } else if (finish >= size - 1) {
      // 내려갈 리그가 실제로 존재할 때만 강등이다
      if (hasLowerDivision(club.nat, club.div)) {
        ach.push('강등'); club.div += 1; club.req -= 6; relabelLeague(g, club);
        g.flags.justRelegated = club.name;
        shiftReaction(g, -1, '팀 강등');
      } else {
        ach.push('승격 실패 · 리그 잔류');
        pushLog(g, 'season', `최하위 리그다. 더 내려갈 곳이 없다. 승격에 실패해 다음 시즌도 ${club.league}에서 뛴다.`);
      }
    } else if (finish <= 4 && club.div === 1) {
      ach.push(`리그 ${finish}위 · 유럽대항전 진출`);
    }
    if (goals >= 18 && club.div === 1 && g.rng.chance(0.45)) { ach.push('리그 득점왕'); p.career.trophies.push(`${g.world.year} 득점왕`); }
    if (rating >= 7.9 && apps >= total * 0.6) { ach.push('리그 MVP'); p.career.trophies.push(`${g.world.year} 리그 MVP`); }
    else if (rating >= 7.55 && apps >= total * 0.6) ach.push('리그 베스트 11');
  }
  // 유럽대항전 + 개인 수상
  if (seniorClub && doFinish) {
    const ucl = simulateEurope(g, club, apps, total, rating);
    uclRec = ucl;
    if (ucl) {
      ach.push(`UCL ${ucl.label}`);
      pushLog(g, 'ucl', `챔피언스리그 ${ucl.label}. 평판 +${ucl.gain}.`);
    }
    const ntRes = ntTournament(g);
    if (ntRes) {
      ach.push(`${ntRes.comp} ${ntRes.label}`);
      pushLog(g, 'nt', `${NT_NAME[g.player.ntTeam]} 대표팀 ${ntRes.comp} ${ntRes.label}. ${ntRes.caps}경기 출전.`);
    }
    const bd = ballonDorCheck(g, club, ucl, rating, goals, apps, share, ntRes);
    if (bd === 'WIN') { ach.push('발롱도르 수상'); pushLog(g, 'award', `◆ ${g.world.year} 발롱도르 수상. 이 시즌은 영구히 기록된다.`); }
    else if (bd === 'TOP3') { ach.push('발롱도르 후보'); pushLog(g, 'award', `${g.world.year} 발롱도르 최종 후보 3인에 들었다.`); }
  }
  if (injuryNote) ach.push(`${injuryNote.type.name} ${injuryNote.weeks}주${injuryNote.ovrLoss ? ` (능력 -${injuryNote.ovrLoss})` : ''}`);
  if (p.loanFrom) ach.push('임대');

  p.career.seasons.push({
    year: g.world.year, phase: g.world.phase, age,
    club: club.name, league: club.league, div: club.div,
    apps, goals, assists, rating: +rating.toFixed(2), salary, ach, senior: seniorClub,
    finish: finishRec ? finishRec.finish : null,
    size: finishRec ? finishRec.size : null,
    ucl: uclRec ? uclRec.label : null,
    ntCaps: 0,                                   // nationalTeamCheck 에서 이 기간 출전분만 채운다
    ntResult: null,                              // 국가대항전 성적
    ntName: p.ntTeam ? NT_NAME[p.ntTeam] : null,
  });

  let line = `${club.name} (${club.league}) — ${apps}경기 ${goals}골 ${assists}도움 · 평점 ${rating.toFixed(2)}`;
  if (salary) line += ` · 주급 ${fmtWeekly(salary)}`;
  if (apps === 0) line += '\n출전 기회를 전혀 얻지 못했다.';
  else if (share > 0.8) line += '\n확실한 주전이었다.';
  if (ach.length) line += `\n▸ ${ach.join(' · ')}`;
  pushLog(g, 'season', line);
  if (injuryNote) {
    const { type, weeks, ovrLoss, severe } = injuryNote;
    pushLog(g, 'injury',
      `[${type.name}] ${weeks}주 결장${ovrLoss ? ` · 현재 능력 -${ovrLoss}` : ''}\n${type.desc}` +
      (severe ? `\n이 부상 이후로 부상 빈도가 눈에 띄게 올라간다.` : ''));
    if (!g.player.active && g.flags.injuryEnded) pushLog(g, 'injury', '재활이 끝나지 않았다. 의사도, 구단도, 더는 다음을 말하지 않았다.');
  }

  // 근황 한 줄
  if (seniorClub) {
    setNews(g, apps === 0
      ? `${g.world.year}년: ${club.name}에서 출전 기회를 못 얻고 있다.`
      : `${g.world.year}년: ${club.name} 소속으로 ${apps}경기 ${goals}골, 평점 ${rating.toFixed(2)}.`);
  }

  // 성적에 따른 부모 반응
  if (age >= 14 && doFinish) {
    if (apps === 0) shiftReaction(g, -1, '한 시즌 무출장');
    else if (share > 0.65 && rating > 7.0) shiftReaction(g, 1, '주전으로 좋은 성적');
  }

  if (age >= 14) {
    let dw = 0;
    if (apps < Math.max(2, total * 0.15)) dw -= 7 * periodYears(g) * 2;
    else if (share > 0.6) dw += 4 * periodYears(g) * 2;
    if (club.div === 3 && age >= 20) dw -= 4 * periodYears(g) * 2;
    if (!salary && age >= 18) dw -= 6 * periodYears(g) * 2;
    dw += (p.hidden.grit - 50) / 14;
    p.willToPlay = clamp(p.willToPlay + dw, 0, 100);
  }
  return true;
}

/* ─────────────────────────── 9-b. 챔피언스리그 / 개인 수상 ─────────────────── */

const UCL_ROUND = ['조별리그 탈락', '16강', '8강', '4강', '준우승', '우승'];
const TOURN_ROUND = ['조별 탈락', '16강', '8강', '4강', '준우승', '우승'];
/** 유로 개최 연도 (주인공이 성인인 구간) */
const EURO_YEARS = [2008, 2012, 2016, 2021, 2024];
/** 실제 우승 기록 — 해당 연도 대표팀에 가중을 준다 */
const NT_TITLE_HISTORY = { ESP: { 2008: 1, 2010: 1, 2012: 1, 2024: 1 }, ARG: { 2022: 1 }, MAR: {}, SEN: { 2022: 0 } };
/** 유로에 나가는 국가 */
const EURO_NATIONS = new Set(['ESP', 'ROU']);

/**
 * 국가대항전(월드컵·유로) 성적. 발롱도르 최소 조건이자 시즌표의 '국가대항전' 열이 된다.
 */
function ntTournament(g) {
  const p = g.player;
  const y = g.world.year;
  const isWC = WORLD_CUP_YEARS.includes(y);
  const isEuro = EURO_YEARS.includes(y);
  if ((!isWC && !isEuro) || !p.ntTeam || !ntEligible(g)) return null;
  if (isEuro && !EURO_NATIONS.has(p.ntTeam)) return null;

  const comp = isWC ? '월드컵' : '유로';
  const bar = NT_BAR[p.ntTeam] ?? 70;
  // 스쿼드 진입 자체가 먼저다
  if (p.ovr + p.reputation * 0.3 < bar - 2) return null;

  let strength = (bar - 62) / 6 + (p.reputation - 60) / 13 + (p.hidden.bigMatch - 50) / 16 + g.rng.norm(0, 1.6);
  if ((NT_TITLE_HISTORY[p.ntTeam] || {})[y]) strength += 2.4;   // 실제 역사 가중
  const reach = clamp(Math.round(1 + strength), 0, 5);

  const caps = g.rng.int(3, 7);
  p.career.caps += caps;
  const goals = round(caps * POSITIONS[p.position].goal * 0.5 * g.rng.f() * 1.6);
  p.career.ntGoals += goals;
  recordCaps(g, caps, p.ntTeam);

  const gain = [0, 2, 4, 7, 10, 15][reach];
  p.reputation = clamp(p.reputation + gain, 0, 100);
  p.peakReputation = Math.max(p.peakReputation, p.reputation);
  if (reach === 5) {
    p.career.trophies.push(`${y} ${comp} 우승`);
    remember(g, 'nt_title', `${y}년 ${NT_NAME[p.ntTeam]} 대표팀으로 ${comp}에서 우승했다.`, 1.0);
  }
  return { comp, label: TOURN_ROUND[reach], reach, caps, goals };
}

/** 유럽대항전 — 소속 클럽의 그 해 명성으로 진출과 성적을 정한다 */
function simulateEurope(g, club, apps, total, rating) {
  const p = g.player;
  const rep = clubRepAt(club, g.world.year);
  if (club.div !== 1 || rep < 74 || apps < total * 0.25) return null;
  if (!g.rng.chance(clamp((rep - 70) / 30, 0.1, 0.95))) return null;

  p.awards.uclApps += 1;
  const strength = (rep - 72) / 5 + (p.ovr - teamAvgAt(club, g.world.year)) / 6 +
    (p.hidden.bigMatch - 50) / 14 + g.rng.norm(0, 1.5);
  const reach = clamp(Math.round(1 + strength), 0, 5);
  const label = UCL_ROUND[reach];
  const gain = [1, 3, 6, 10, 14, 20][reach];
  p.reputation = clamp(p.reputation + gain, 0, 100);
  p.peakReputation = Math.max(p.peakReputation, p.reputation);
  if (reach === 5) {
    p.awards.uclTitles += 1;
    p.career.trophies.push(`${g.world.year} 챔피언스리그 우승`);
  }
  return { label, reach, gain };
}

/**
 * 발롱도르 — 매년 1명. 목표 수상 확률은 커리어당 약 5%.
 * 클럽 수준·UCL 성적·평판·대표팀 성적을 합산한 점수로 판정한다.
 */
function ballonDorCheck(g, club, ucl, rating, goals, apps, share, ntRes) {
  const p = g.player;
  if (!club || club.div !== 1) return null;

  // ── 최소 조건: 팀이 UCL 또는 국가대항전에서 우승했고, 본인이 주전이어야 한다.
  //    첼시 백업이 후보 3위에 드는 일이 없게 만드는 게 이 게이트의 목적이다.
  const majorTitle = (ucl && ucl.reach === 5) || (ntRes && ntRes.reach === 5);
  const starter = share >= 0.70 && p.ovr >= teamAvgAt(club, g.world.year);
  if (!majorTitle || !starter) return null;

  const rep = clubRepAt(club, g.world.year);
  if (rep < 84 || p.reputation < 82) return null;

  let score = (p.reputation - 78) * 2.4 + (rep - 82) * 0.8 + (rating - 7.0) * 16 + goals * 0.5;
  if (ucl) score += [0, 4, 9, 16, 22, 34][ucl.reach];
  if (p.ntTeam === 'ESP') score += 6;
  if (g.flags.wcHero) score += 12;
  score += g.rng.norm(0, 9);

  // 발롱도르는 전 세계에서 매년 한 명이다. 자격을 갖췄어도 대부분은 다른 후보에게 밀린다.
  if (score > 70 && g.rng.chance(clamp((score - 70) / 105, 0.05, 0.36))) {
    p.awards.ballonDor += 1;
    p.career.trophies.push(`${g.world.year} 발롱도르 수상`);
    remember(g, 'ballon', `${g.world.year}년 발롱도르를 받았다.`, 1.0);
    return 'WIN';
  }
  if (score > 42) { p.awards.ballonTop3 += 1; p.career.trophies.push(`${g.world.year} 발롱도르 후보 3위권`); return 'TOP3'; }
  return null;
}

/* ─────────────────────────── 10. 국가대표 ─────────────────────────── */

/**
 * 대표팀이 볼 수 있는 무대인가.
 * 3부(프리메라 RFEF급) 선수는 어느 대표팀도 뽑지 않는다. 스카우팅 자체가 닿지 않는다.
 * 강팀(스페인·아르헨티나)은 1부 주전만, 중·약체는 2부까지 본다.
 */
/** 대표팀 평균 OVR — 경쟁 강도(NT_BAR)에서 파생 */
export function ntTeamAvg(nt) {
  return clamp(round(28 + (NT_BAR[nt] ?? 70) * 0.58), 40, 92);
}

/**
 * 포지션별 대표팀 평균. 전체 평균만 보면 "전체는 강한데 내 자리는 비어 있는" 상황을
 * 표현할 수 없다. 나라·포지션마다 한 번 굴려서 커리어 내내 고정한다.
 */
export function ntPosAvg(g, nt, pos) {
  g.world._ntPos = g.world._ntPos || {};
  const k = `${nt}:${pos}`;
  if (g.world._ntPos[k] == null) {
    g.world._ntPos[k] = clamp(round(ntTeamAvg(nt) + g.rng.norm(0, 5.5)), 35, 95);
  }
  return g.world._ntPos[k];
}

/** 포지션 희소성 — 대체 자원이 적은 자리는 기준이 느슨하다 */
const POS_SCARCITY = { GK: 3, CB: 2, FB: 1.5, CM: 0, AM: 0, WG: 0.5, ST: 1 };

/**
 * 소집 판정. 절대 OVR이 아니라 "포지션 경쟁자 대비"가 1순위다.
 * 전체 평균보다 낮아도 그 자리의 경쟁이 약하면 뽑힐 수 있다.
 */
export function ntCallChance(g) {
  const p = g.player;
  const nt = p.ntTeam || p.nationality;
  const teamAvg = ntTeamAvg(nt);
  const posAvg = ntPosAvg(g, nt, p.position);
  const last = p.career.seasons[p.career.seasons.length - 1];
  const recent = last ? (last.rating - 6.6) * 6 : 0;

  let score =
    (p.ovr - posAvg) * 0.95 +          // 포지션 경쟁이 가장 중요하다
    (p.ovr - teamAvg) * 0.35 +         // 전체 수준은 보조
    (p.form - 55) * 0.06 +
    (p.reputation - 40) * 0.06 +
    Math.min(p.career.caps, 40) * 0.05 + // 국제대회 경험
    recent +
    (POS_SCARCITY[p.position] ?? 0);

  // 최근 폼 폭발 / 부상 대체 차출 같은 예외
  if (p.form > 82) score += 3;
  if (p.injuryWeeks > 0) score -= 12;

  return { chance: clamp(sigmoid(score / 4.2), 0.01, 0.97), teamAvg, posAvg, score };
}

/** 대표팀 안에서 주인공의 위치 — 서술 분기 */
export function ntRole(gap) {
  if (gap >= 10) return 'CORE';
  if (gap >= 5) return 'LEADER';
  if (gap >= -2) return 'SQUAD';
  return 'FRINGE';
}
const NT_ROLE_TEXT = {
  CORE: [
    '내가 이 팀의 중심이야.',
    '이번 대회에서 무슨 일이 일어나든 내 책임이 크지.',
    '기자회견에 나가는 것도 나고, 지면 욕먹는 것도 나야.',
  ],
  LEADER: [
    '내가 이 선수들을 이끌어야 해.',
    '내가 잘하면 이 팀은 충분히 해볼 만하지.',
    '어린 선수들이 내 쪽을 보고 있는 게 느껴져.',
  ],
  SQUAD: [
    '이렇게 떨리는 건 처음이야.',
    '나도 이 팀의 한 명일 뿐이지.',
    '내가 실수하면 어떻게 하지.',
  ],
  FRINGE: [
    '여기 있는 게 아직도 안 믿겨.',
    '명단에 든 것만으로도 운이 좋았어.',
    '한 경기라도 뛰면 그걸로 남는 거지.',
  ],
};

export function ntEligible(g) {
  const p = g.player;
  if (!p.club || p.club.youth) return false;
  const bar = NT_BAR[p.ntTeam || 'ESP'] ?? 70;
  const maxDiv = bar >= 80 ? 1 : 2;
  if (p.club.div > maxDiv) return false;
  // 1부만 보는 강팀은 클럽 수준도 본다 (강등권 클럽의 백업은 뽑지 않는다)
  if (bar >= 80 && clubRepAt(p.club, g.world.year) < 62) return false;
  return true;
}

/** 이 기간에 실제로 소화한 A매치를 직전 시즌 기록에 적는다 */
function recordCaps(g, caps, nt) {
  const arr = g.player.career.seasons;
  const last = arr[arr.length - 1];
  if (!last || last.year !== g.world.year || last.phase !== g.world.phase) return;
  last.ntCaps = (last.ntCaps || 0) + caps;
  last.ntName = NT_NAME[nt];
}

/**
 * 아버지의 고용 상태 판정. 결정론적 체인("2008 → 반드시 실직")을 제거하고
 * 세계 경제 상태 × 가정의 안전망으로 확률을 계산한다.
 */
const FATHER_OUTCOME = {
  KEEP:   '직장 유지',
  PAYCUT: '임금 삭감',
  HOURS:  '근무시간 감소',
  FIRED:  '실직',
  MOVED:  '다른 직장으로 이동',
};
function rollFatherEmployment(g, pressure) {
  const env = FAMILY_ENVS[g.player.env];
  const f = g.npcs.father;
  if (f.status === '실직' || f.status === '은퇴') return null;
  const fragile = clamp(100 - env.safety, 8, 95);          // 안전망이 얇을수록 취약
  const r = g.rng.weighted([
    { w: 62 - fragile * 0.28 - pressure * 0.22, v: 'KEEP' },
    { w: 14 + fragile * 0.08 + pressure * 0.10, v: 'PAYCUT' },
    { w: 9 + fragile * 0.05 + pressure * 0.05, v: 'HOURS' },
    { w: 5 + fragile * 0.18 + pressure * 0.14, v: 'FIRED' },
    { w: 6 + fragile * 0.03, v: 'MOVED' },
  ]).v;
  f.status = FATHER_OUTCOME[r] === '직장 유지' ? null : FATHER_OUTCOME[r];
  f.statusYear = g.world.year;
  if (r === 'MOVED') f.job = g.rng.pick(env.jobs);
  const hit = { KEEP: 0, PAYCUT: -8, HOURS: -5, FIRED: -18, MOVED: -3 }[r];
  if (hit) g.player.econ.household = clamp(g.player.econ.household + hit, 0, 100);
  return { key: r, label: FATHER_OUTCOME[r], hit };
}

function nationalTeamCheck(g) {
  const p = g.player;
  const age = ageOf(g);
  if (!p.active || age < 18) return;
  const nt = p.ntTeam || 'ESP';
  const bar = NT_BAR[nt] ?? 70;

  // 소속 리그 수준이 대표팀 선발권 밖이면 이 기간에는 차출되지 않는다
  if (!ntEligible(g)) {
    if (p.ntTeam && p.club && !p.club.youth && p.club.div >= 3 && !g.flags._ntDropped) {
      g.flags._ntDropped = true;
      pushLog(g, 'nt', `${NT_NAME[p.ntTeam]} 대표팀 명단에서 빠졌다. ${DIV_LABEL[p.club.div]} 소속 선수를 부르는 감독은 없다.`);
    }
    return;
  }
  g.flags._ntDropped = false;

  if (!p.ntTeam) {
    if (g.rng.chance(ntCallChance(g).chance * 0.55)) {
      p.ntTeam = nt; p.career.caps += 1; recordCaps(g, 1, nt);
      pushLog(g, 'nt', `${NT_NAME[nt]} 대표팀 A매치 데뷔.`);
      remember(g, 'nt_debut', `${g.world.year}년 ${NT_NAME[nt]} 대표팀 데뷔`, 0.75);
      p.career.trophies.push(`${g.world.year} ${NT_NAME[nt]} 대표팀 데뷔`);
      shiftReaction(g, 2, '국가대표 발탁');
      setNews(g, `${g.world.year}년: ${NT_NAME[nt]} 대표팀에 처음 뽑혔다.`);
    }
    return;
  }
  if (g.rng.chance(ntCallChance(g).chance)) {
    const caps = round(periodYears(g) * g.rng.int(3, 9));
    p.career.caps += caps;
    p.career.ntGoals += round(caps * POSITIONS[p.position].goal * 0.6 * g.rng.f() * 1.6);
    recordCaps(g, caps, p.ntTeam);
  }
}

/* ─────────────────────────── 11. 이적 / 오퍼 ─────────────────────────── */

/** 빅클럽 기준 = 2015년 토트넘의 팀 평균 (= 80) */
export const BIG_CLUB_AVG = 80;
export const isBigClub = (g, club) => teamAvgAt(club, g.world.year) >= BIG_CLUB_AVG;

/**
 * 그 해 이적시장의 기후. 역사 이벤트가 시장 자체를 바꾼다.
 *   domestic — 자국(스페인) 경제위기: 구단 자금난 → 매각 의지, 해외 오퍼 증가
 *   global   — 세계 경제위기: 주급 동결 + 이적시장 동결 (빅클럽은 예외)
 */
export function marketClimate(g) {
  const y = g.world.year;
  const domestic = (y >= 2008 && y <= 2014) || (y >= 2020 && y <= 2021);
  const global = (y >= 2008 && y <= 2010) || (y >= 2020 && y <= 2021);
  const notes = [];
  if (domestic) notes.push('스페인 구단들이 자금난에 빠졌다. 팔 수 있는 선수는 팔려 나간다.');
  if (global) notes.push('세계적으로 이적시장이 얼어붙었다. 주급 인상은 사실상 동결이다. 돈이 있는 빅클럽만 예외다.');
  return { domestic, global, notes };
}

function scoutedValue(g, club) {
  const p = g.player;
  const bias = ageOf(g) <= 18 ? FAMILY_ENVS[p.env].scoutBias : 0;
  const err = g.rng.norm(0, 6.5) * (1 - (club.expo / 100) * 0.45);
  const cond = (p.form - 55) / 4 + g.rng.norm(0, 3);
  return p.ovr * 0.75 + (p.ovr + err) * 0.15 + (p.ovr + cond) * 0.10 + p.reputation * 0.12 + bias;
}

/** 그 해 팀 평균 능력 대비 내 위치 */
export function fitLabel(g, club) {
  const avg = teamAvgAt(club, g.world.year);
  const d = g.player.ovr - avg;
  if (d >= 4) return { label: '즉시 주전', d, avg };
  if (d >= -4) return { label: '주전 경쟁', d, avg };
  if (d >= -10) return { label: '로테이션·백업', d, avg };
  return { label: '전력 외', d, avg };
}

export function generateOffers(g, count = 3) {
  const p = g.player;
  const age = ageOf(g);
  const clim = marketClimate(g);
  const myAvg = p.club && !p.club.youth ? teamAvgAt(p.club, g.world.year) : null;
  // 직전 시즌 출전 지분 — 방출 대상이면 동급 이적 예외를 허용한다
  const last = p.career.seasons[p.career.seasons.length - 1];
  const benched = last ? last.apps < Math.max(4, 18 * 0.3) : false;
  const pool = CLUBS.filter((c) => {
    if (p.club && c.id === p.club.id) return false;
    if (c.youth || !clubExists(c, g.world.year)) return false;
    // ── 입단 판정: 주인공 능력 vs 그 해 팀 평균 능력
    const avg = teamAvgAt(c, g.world.year);
    const youthDiscount = age <= 21 ? 8 : 0;   // 유망주 할인
    if (scoutedValue(g, c) < avg - 10 - youthDiscount) return false;
    // 세미프로 고정: 24세 이전에는 1·2부로 갈 수 없다
    if (g.flags.semiProLock && age < 24 && c.div <= 2) return false;
    // 16~17세에 프로 계약을 따는 건 예외적인 조기 성장 사례뿐이다.
    // 하한이 낮으면 18세 진입 판정 전에 대부분이 이미 프로가 돼서 게이트가 무의미해진다.
    if (age <= 17 && p.ovr < 64) return false;
    // 성인 프로 계약의 절대 하한. 16~17세는 유망주 계약이므로 면제한다
    // (전원 50에서 출발하기 때문에 하한을 걸면 이 나이대 오퍼가 전부 막힌다).
    if (age >= 18 && p.ovr < 52) return false;
    if (p.ovr > avg + 16 && c.div >= 3) return false;

    // ── 내 수준보다 낮은 팀은 나를 데려갈 이유가 없다 (영구 이적에만 적용, 임대는 별도 규칙)
    //    유일한 예외: 사우디 리그가 능력 80+ 선수에게 현 주급의 5배를 제시하는 경우
    const saudiMoney = c.nat === 'SAU' && p.ovr >= 80 &&
      salaryFor(c, p.ovr, g.world.year, p.reputation) >= Math.max(1, p.econ.wageYear) * 5;
    if (avg < p.ovr && !saudiMoney) return false;

    // 팀 평균이 내 능력보다 크게 높으면 "즉시전력"이 아니다.
    // 그 경우 유망주 계약의 사유(어린 나이 + 높은 잠재력)가 반드시 있어야 한다.
    const prospect = age <= 21 && p.hidden.potential >= 78;
    if (avg > p.ovr + 6 && !prospect) return false;

    // ── 문제 2: 팀 평균이 ±5 이내로 비슷한 구단으로는 이적하지 않는다 (매각 메리트 없음)
    //    예외: 직전 시즌 출전이 30% 미만이면 "안 뛰니 보낸다" 로직으로 동급 이적 허용
    if (myAvg != null && Math.abs(avg - myAvg) <= 5 && !benched) return false;

    // ── 문제 1: 세계 경제위기에는 이적시장이 동결된다. 빅클럽만 예외.
    if (clim.global && !isBigClub(g, c) && g.rng.chance(0.72)) return false;
    if (c.nat !== 'ESP') {
      if (age < 18 && g.world.year >= 2001) return false; // FIFA 18세 미만 국제이적 제한
      if (p.reputation < 26 && age < 22) return false;
      // 이 리그들은 보통 커리어 후반부에 열린다. 단 사우디는 능력 80+ 에게는 나이와 무관하게 접근한다.
      if (['KOR', 'JPN', 'MLS', 'USA'].includes(c.nat) && age < 28) return false;
      if (c.nat === 'SAU' && age < 28 && p.ovr < 80) return false;
    }
    return true;
  });
  if (!pool.length) return [];
  const scored = pool.map((c) => ({
    // 자국 경제위기에는 스페인 구단이 팔고, 해외 오퍼의 비중이 올라간다
    w: (1 / (1 + Math.abs(scoutedValue(g, c) - teamAvgAt(c, g.world.year)) / 6)) *
       (clubRepAt(c, g.world.year) > 84 ? 0.6 : 1) *
       (c.nat === 'ESP' ? (clim.domestic ? 0.75 : 1.6) : (clim.domestic ? 1.9 : 1)),
    c,
  }));
  const out = [];
  for (let i = 0; i < count && scored.length; i++) {
    const pk = g.rng.weighted(scored);
    if (!pk) break;
    out.push(pk.c); scored.splice(scored.indexOf(pk), 1);
  }
  return out;
}

/** 스페인과 인접·근접한 리그 (임대는 되도록 가까운 곳으로) */
const NEIGHBOUR = { ESP: ['ESP', 'POR', 'FRA', 'ITA'], POR: ['POR', 'ESP'], FRA: ['FRA', 'ESP', 'BEL', 'ITA'] };

/**
 * 임대 가능 여부 — 세 조건을 모두 만족해야 한다.
 *   ① 소속팀 평균 - 임대팀 평균 >= 10
 *   ② |주인공 능력 - 소속팀 평균| >= 10  (팀 수준에 못 미침)
 *   ③ 나이 <= 30
 */
export function loanTargets(g, count = 2) {
  const p = g.player;
  const age = ageOf(g);
  if (!p.club || p.loanFrom || age > 30) return [];              // 조건 ③
  if (p.club.youth) return [];                                   // 후베닐 선수는 임대 대상이 아니다
  const myAvg = teamAvgAt(p.club, g.world.year);
  // 조건 ②: 소속팀 평균에 10 이상 "못 미칠" 때만. 절대값으로 두면 팀보다 잘하는
  // 선수를 하위 리그로 임대 보내는 결과가 나온다 — 임대는 못 뛰는 선수를 보내는 제도다.
  if (myAvg - p.ovr < 10) return [];                             // 조건 ②
  const near = NEIGHBOUR[p.club.nat] || [p.club.nat];
  const cand = CLUBS.filter((c) => {
    if (c.youth || c.id === p.club.id || !clubExists(c, g.world.year)) return false;
    if (!near.includes(c.nat)) return false;                      // 인접국/자국 우선
    const avg = teamAvgAt(c, g.world.year);
    if (myAvg - avg < 10) return false;                           // 조건 ①
    if (p.ovr < avg - 12) return false;                           // 임대처에서도 뛸 수 있어야 한다
    return true;
  });
  if (!cand.length) return [];
  // 자국을 우선하고, 내 능력에 가장 맞는 팀을 뽑는다
  const scored = cand.map((c) => ({
    w: (c.nat === p.club.nat ? 2.2 : 1) / (1 + Math.abs(p.ovr - teamAvgAt(c, g.world.year)) / 5), c,
  }));
  const out = [];
  for (let i = 0; i < count && scored.length; i++) {
    const pk = g.rng.weighted(scored);
    if (!pk) break;
    out.push(pk.c); scored.splice(scored.indexOf(pk), 1);
  }
  return out;
}

/**
 * 구단이 이적을 거부할 확률. 기본 35%에서 상황에 따라 10~70%로 움직인다.
 * 핵심 전력일수록 안 놔주고, 안 뛰거나 계약이 얼마 안 남았으면 놔준다.
 */
export function refusalChance(g, target) {
  const p = g.player;
  if (!p.club || p.club.youth || p.loanFrom) return 0;
  const myAvg = teamAvgAt(p.club, g.world.year);
  let x = 0.35;
  x += (g.npcs.coach.trust - 50) / 220;              // 감독 신뢰가 높으면 안 놔준다
  x += clamp(p.ovr - myAvg, -10, 15) / 60;           // 팀 대비 상위 전력이면 안 놔준다
  if (((p.contractUntil || 0) - g.world.year) <= 1) x -= 0.18;  // 계약 만료 임박
  const last = p.career.seasons[p.career.seasons.length - 1];
  if (last && last.apps < 6) x -= 0.15;              // 안 뛰는 선수는 붙잡지 않는다
  if (marketClimate(g).domestic) x -= 0.12;          // 자금난이면 오히려 팔고 싶다
  if (g.flags.wantsOut && g.world.year - g.flags.wantsOut <= 1) x -= 0.14;
  if (target && isBigClub(g, target)) x -= 0.05;     // 빅클럽 오퍼는 거절하기 어렵다
  return clamp(x, 0.10, 0.70);
}

function joinClub(g, club, opts = {}) {
  const p = g.player;
  p.club = { ...club };
  p.loanFrom = opts.loanFrom || null;
  p.loanUntil = opts.loanFrom ? g.world.year + 1 : null;   // 임대는 1년 뒤 여름에 복귀
  p.contractUntil = opts.loanFrom
    ? p.contractUntil
    : g.world.year + (opts.years ?? (ageOf(g) < 20 ? 3 : 4));
  g.npcs.coach = { trust: clamp(48 + g.rng.norm(0, 9) + (opts.wanted ? 10 : 0), 10, 90), unknown: false };
  p.stress = clamp(p.stress + clamp((club.comp - 65) / 6 - (p.hidden.adaptability - 50) / 8, -6, 14), 0, 100);
  p.path.push(`${g.world.year} ${club.name}${opts.loanFrom ? ' (임대)' : ''}`);
  pushLog(g, 'transfer', `${club.name} 합류 — ${club.league} (${DIV_LABEL[club.div]}) · 클럽 명성 ${club.rep}`);
  setNews(g, `${g.world.year}년: ${club.name}${opts.loanFrom ? '으로 임대' : '에 합류'}했다.`);
  if (club.div === 1 && club.rep >= 75) shiftReaction(g, 2, '명문 클럽 이적');
  else if (club.div === 1) shiftReaction(g, 1, '1부 리그 이적');
}

const stars = (v) => '★'.repeat(clamp(round((v / 100) * 5), 1, 5)) + '☆'.repeat(5 - clamp(round((v / 100) * 5), 1, 5));

/** 이적 오퍼 → 선택지 (배지 정보 포함) */
function offerChoices(g, offers, { loan = false, agreed = false } = {}) {
  return offers.map((c) => {
    const cur = g.player.club;
    const up = cur ? c.rep > cur.rep + 6 : true;
    const fit = fitLabel(g, c);
    return {
      t: `"${c.name}로 가자." — ${/\d부/.test(c.league) ? c.league : `${c.league} (${DIV_LABEL[c.div]})`}${loan ? ' · 임대' : ''}`,
      meta: `팀 평균 ${fit.avg} · 내 능력 ${ability(g)} → ${fit.label}` +
        (fit.avg > g.player.ovr + 6 ? ' (유망주 계약)' : '') +
        ` · 예상 주급 ${fmtWeekly(salaryFor(c, g.player.ovr, g.world.year, g.player.reputation))}`,
      fit,
      tags: up ? ['ambition', 'risk'] : ['safe'],
      fx: (gg) => {
        const from = gg.player.club;
        // 구단이 거부할 수 있다
        if (!loan && !agreed && gg.rng.chance(refusalChance(gg, c))) {
          gg.flags.transferBlocked = { name: c.name, id: c.id };
          gg.player.stress += 12;
          return;
        }
        gg.flags.transferBlocked = null;
        joinClub(gg, c, { years: loan ? 1 : 4, wanted: !up, loanFrom: loan ? from : null });
        if (!loan) gg.player.reputation += up ? 4 : 1;
      },
      out: (gg) => gg.flags.transferBlocked
        ? `구단이 이적을 거부했다.\n\n단장은 "지금은 팀 계획의 일부"라는 말만 반복했다. ${c.name} 측은 제안을 철회하지 않았지만,\n이적료 협상 테이블 자체가 열리지 않았다. 나는 여기 남는다. 원하지 않는 방식으로.`
        : up
        ? `${c.name}. 여기서는 아무것도 보장되지 않는다. 그게 온 이유다.`
        : `${c.name}. 매주 90분을 뛸 수 있다면 리그 이름은 숫자일 뿐이다.`,
    };
  });
}

/* ─────────────────────────── 12. 이벤트 ─────────────────────────── */

const EVENTS = [];
const ev = (o) => EVENTS.push(o);
const A = (g) => ageOf(g);
const ENV = (g) => FAMILY_ENVS[g.player.env];

ev({
  id: 'first_ball', once: true, when: (g) => A(g) === 6, w: () => 900,
  body: (g) => {
    const e = ENV(g);
    return `여섯 살. 동네 클럽 유소년팀 등록 시즌이다.\n\n` +
      `가정환경: ${e.label} — ${e.blurb}\n` +
      `부모 반응: ${REACTIONS[g.world.reaction].label} — ${REACTIONS[g.world.reaction].blurb}\n\n` +
      `등록하려면 회비를 내야 하고, 누군가는 매주 아이를 데려다줘야 한다.`;
  },
  choices: () => [
    { t: '"등록하자. 골목에서만 차면 아무도 안 봐."', meta: '정식 유소년 코스의 출발점', risk: 'SAFE', parent: 1, injury: 1, tags: ['ambition'],
      fx: (gg) => {
        const ok = gg.rng.chance(clamp(0.32 + gg.player.econ.household / 140 + gg.world.reaction * 0.13, 0.1, 0.95));
        if (ok) {
          joinClub(gg, deriveClub('동네 클럽 유소년팀', 34, { id: 'youth', name: '바르셀로나 지역 유소년리그', nat: 'ESP', div: 3, home: true, youth: true }), { years: 8 });
          gg.player.willToPlay += 12; gg.flags.registered = true;
        } else {
          gg.player.willToPlay += 4;
          remember(gg, 'no_money_youth', '회비를 감당하지 못해 등록하지 못했다. 골목에서만 찼다.', 0.7);
        }
      },
      out: (gg) => gg.flags.registered
        ? '유니폼을 받았다. 사이즈가 두 단계 커서 무릎까지 내려온다.'
        : '회비를 낼 수 없었다. 대신 광장에서 해가 질 때까지 찼다.' },
    { t: '"학교랑 골목이면 됐어. 돈 드는 건 못 해."', meta: '비용 0 · 노출 없음', risk: 'MID', parent: 0, injury: 0, tags: ['safe'],
      fx: (gg) => { gg.player.willToPlay += 6; gg.player.academic += 6; },
      out: () => '등록비도, 데려다줄 사람도 필요 없다. 대신 아무도 지켜보지 않는다.' },
  ],
});

ev({
  id: 'parent_turn', once: true, when: (g) => A(g) === 9, w: () => 900,
  body: (g) => `아홉 살. 지역 리그에서 눈에 띄기 시작했다.\n\n` +
    `아버지 ${g.npcs.father.name} (${g.npcs.father.job}) · 어머니 ${g.npcs.mother.name} (${g.npcs.mother.job})\n` +
    `부모 성향: ${PARENT_PERSONALITIES[g.player.personality].label}\n` +
    `현재 반응: ${REACTIONS[g.world.reaction].label} — ${REACTIONS[g.world.reaction].blurb}`,
  choices: () => [
    { t: '"성적은 지키겠다고 약속하자. 그거면 훈련을 늘릴 수 있어."', meta: '학업 +  스트레스 +', risk: 'SAFE', parent: 1, injury: 0, tags: ['discipline'],
      fx: (gg) => { shiftReaction(gg, 1, '학업 유지 약속'); gg.player.stress += 8; gg.player.academic += 6; },
      out: (gg) => { remember(gg, 'promise_school', `${gg.world.year}년, 성적 유지를 조건으로 축구를 허락받았다.`, 0.7); return '거래가 성립했다. 이 약속은 20년 뒤에 다시 소환된다.'; } },
    { t: '"그냥 말해버리자. 나 축구밖에 없어."', meta: '성공 시 반응 급상승 / 실패 시 급하락', risk: 'HIGH', parent: 2, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => {
        const ok = gg.rng.chance(0.38 + gg.world.reaction * 0.12);
        shiftReaction(gg, ok ? 2 : -1, ok ? '아이의 각오를 인정' : '충돌');
        gg.player.willToPlay += 10; gg.player.academic -= 8; gg.player.trait.pride += 8;
      },
      out: (gg) => gg.world.reaction >= 2
        ? '한참 말이 없다가 고개를 끄덕였다. "그럼 진짜로 해라."'
        : '방문이 닫혔다. 그 뒤로 식탁에서 축구 얘기가 사라졌다.' },
    { t: '"말해서 뭐 해. 그냥 계속 나가면 되지."', meta: '독기 + · 부모 반응 변화 없음', risk: 'MID', parent: 0, injury: 0, tags: [],
      fx: (gg) => { gg.player.hidden.grit += 8; gg.player.willToPlay += 4; },
      out: () => '허락도 반대도 받지 않았다. 그냥 매일 나갔다.' },
  ],
});

ev({
  id: 'academy_trial', once: true, when: (g) => A(g) === 12, w: () => 900,
  body: (g) => `2002년. FC 바르셀로나 유소년 테스트.\n라 마시아는 1979년부터 숙소를 운영해온 곳이고, 이 도시의 모든 아이가 여기를 목표로 한다.\n\n` +
    `3일간의 테스트. 같은 나이 아이가 400명 넘게 왔다.` +
    (ENV(g).immigrant ? `\n\n접수처에서 서류를 두 번 확인받았다. 앞의 아이들은 한 번이었다.` : ''),
  choices: () => [
    { t: '"하던 대로 하자. 여기서 나를 바꾸면 남는 게 없어."', meta: '변동성 낮음', risk: 'MID', parent: 0, injury: 0, tags: ['pride'], fx: (gg) => { gg.flags.trialStyle = 'self'; }, out: () => '3일이 지나갔다.' },
    { t: '"평가지에 맞춰주자. 튀어서 떨어지는 애를 너무 많이 봤어."', meta: '기본 점수 + / 잠재력 높으면 손해', risk: 'SAFE', parent: 0, injury: 0, tags: ['safe'], fx: (gg) => { gg.flags.trialStyle = 'safe'; }, out: () => '3일이 지나갔다.' },
    { t: '"한 장면이라도 만들어야지. 안 보이면 어차피 끝이잖아."', meta: '±9점 도박', risk: 'HIGH', parent: 0, injury: 1, tags: ['risk'], fx: (gg) => { gg.flags.trialStyle = 'flash'; }, out: () => '3일이 지나갔다.' },
  ],
  after: (g) => { g.flags.pendingTrial = true; },
});

ev({
  id: 'trial_result', once: true, when: (g) => g.flags.pendingTrial, w: () => 9999,
  body: (g) => {
    const p = g.player;
    const PEER = 34;
    const dev = clamp(50 + (p.ovr - PEER) * 2.4, 0, 100);
    let base = dev * 0.62 + clamp(p.hidden.potential + 6, 0, 100) * 0.22 + clamp(45 + p.hidden.grit * 0.3, 0, 100) * 0.16;
    if (g.flags.trialStyle === 'flash') base += g.rng.chance(0.5) ? 9 : -9;
    if (g.flags.trialStyle === 'safe') base += 3 - Math.max(0, (p.hidden.potential - 80) * 0.2);
    base += ENV(g).scoutBias;
    const score = base * 0.75 + (base + g.rng.norm(0, 9)) * 0.15 + (base + g.rng.norm(0, 7)) * 0.10;
    g.flags.trialPass = score >= 71;
    return g.flags.trialPass
      ? `[평가 리포트]\n또래 대비 기량 ${round(dev)}/100 · 성장 가능성 상위\n\n결과: 합격.`
      : `[평가 리포트]\n또래 대비 기량 ${round(dev)}/100\n\n결과: 불합격.\n\n리포트 마지막 줄:\n"나쁜 선수가 아니다. 다만 현재 신체조건과 포지션 경쟁을 고려하면, 지금 우리 시스템에 넣어야 할 필연성이 낮다."`;
  },
  choices: (g) => {
    g.flags.pendingTrial = false;
    if (g.flags.trialPass) {
      return [{ t: '"들어가자. 여기서 안 되면 어디서도 안 돼."', meta: '최고의 훈련 환경 · 최악의 경쟁', risk: 'MID', parent: 2, injury: 1, tags: [],
        fx: (gg) => {
          gg.world.academyAccess = 2;
          joinClub(gg, clubById('esp1:FC Barcelona'), { wanted: true, years: 6 });
          gg.player.stress += 14; gg.player.confidence += 12;
          shiftReaction(gg, 2, '라 마시아 합격');
          remember(gg, 'academy_in', `${gg.world.year}년, FC 바르셀로나 유소년 합격.`, 0.85);
          gg.player.career.trophies.push('2002 라 마시아 입단');
        },
        out: () => '숙소에 짐을 풀었다. 같은 방 아이 셋 다 자기 지역에서 제일 잘하는 애였다.' }];
    }
    return [
      { t: '"저 문장은 외워두자. 언젠가 갚아줄 거니까."', meta: '독기 + · 스트레스 +', risk: 'MID', parent: 0, injury: 0, tags: ['ambition', 'pride'],
        fx: (gg) => { gg.player.hidden.grit += 6; gg.player.stress += 8; gg.player.trait.pride += 8; },
        out: (gg) => { remember(gg, 'rejection', `${gg.world.year}년 바르셀로나 유소년 탈락. 리포트 문장을 외웠다.`, 0.95); return '"필연성이 낮다"는 문장을 종이에 적어 서랍에 넣었다.'; } },
      { t: '"당분간 공은 보지 말자. 지금은 못 하겠어."', meta: '자신감 − · 축구 의지 −', risk: 'HIGH', parent: -1, injury: 0, tags: [],
        fx: (gg) => { gg.player.confidence -= 16; gg.player.willToPlay -= 10; shiftReaction(gg, -1, '탈락 후 방황'); },
        out: (gg) => { remember(gg, 'rejection', `${gg.world.year}년 탈락. 그 여름을 통째로 잃었다.`, 0.85); return '두 달 동안 아무것도 하지 않았다.'; } },
      { t: '"울 시간에 전화나 돌리자. 받아줄 데는 있어."', meta: '적응력 +', risk: 'SAFE', parent: 0, injury: 0, tags: ['safe'],
        fx: (gg) => { gg.player.hidden.adaptability += 6; gg.player.stress -= 4; },
        out: (gg) => { remember(gg, 'rejection', `${gg.world.year}년 탈락. 바로 다음 팀을 알아봤다.`, 0.7); return '울 시간에 전화를 돌렸다.'; } },
    ];
  },
  after: (g) => { if (!g.flags.trialPass) g.flags.pendingYouth = true; },
});

ev({
  id: 'youth_offers', once: true, when: (g) => g.flags.pendingYouth, w: () => 9999,
  body: () => '탈락 소식이 돌자 오히려 연락이 왔다. 스카우트들은 바르셀로나가 놓친 아이를 좋아한다.',
  choices: (g) => {
    g.flags.pendingYouth = false;
    const a = clubById('esp1:Real Betis'), b = clubById('esp3:CE Sabadell'), c = clubById('esp2:CD Tenerife');
    return [
      { t: `"${a.name}로 가자. 집은 못 보겠지만 여기 있으면 안 늘어."`, meta: '훈련 ★★★★☆ / 생활 ★★☆☆☆', risk: 'HIGH', parent: 1, injury: 1, tags: ['ambition', 'risk'],
        fx: (gg) => { joinClub(gg, a, { years: 6 }); gg.player.stress += 16; gg.flags.leftHome = true; gg.player.trait.ambition += 8; },
        out: () => '열두 살에 기차를 혼자 탔다. 어머니는 플랫폼에서 끝까지 손을 흔들었다.' },
      { t: `"${b.name}로 가자. 매일 집에서 저녁 먹는 것도 무시할 게 아니야."`, meta: '훈련 ★★☆☆☆ / 생활 ★★★★★', risk: 'SAFE', parent: 1, injury: 0, tags: ['safe'],
        fx: (gg) => { joinClub(gg, b, { years: 6 }); gg.player.stress -= 6; shiftReaction(gg, 1, '집 근처 클럽 선택'); },
        out: () => '매일 집에서 저녁을 먹는다. 부모님이 가장 안심한 선택이었다.' },
      { t: `"${c.name}로 가자. 아무도 날 모르는 데서 다시 시작하고 싶어."`, meta: '적응력 + / 스트레스 ++', risk: 'HIGH', parent: -1, injury: 1, tags: ['risk'],
        fx: (gg) => { joinClub(gg, c, { years: 6 }); gg.player.hidden.adaptability += 8; gg.player.stress += 20; gg.flags.leftHome = true; },
        out: () => '섬으로 갔다. 여기서는 아무도 내가 탈락한 애라는 걸 모른다.' },
    ];
  },
});

/**
 * 18세 프로 진입 점수. 나이가 아니라 상태가 결정한다.
 * 잠재력과 "실제 프로 진입 가능성"을 별개로 취급한다 —
 * 잠재력이 높아도 부상·출전 부족·노출 부족으로 떨어질 수 있다.
 */
export function proEntryScore(g) {
  const p = g.player;
  const last = p.career.seasons[p.career.seasons.length - 1];
  const parts = {
    현재능력: (p.ovr - 52) * 3.4,
    잠재력: (p.hidden.potential - 74) * 0.85,
    최근경기력: (p.form - 55) * 0.22,
    출전시간: last ? clamp(last.apps, 0, 22) * 0.55 - 4 : -6,
    소속팀수준: p.club ? (clubRepAt(p.club, g.world.year) - 45) * 0.16 : -8,
    스카우트노출: (p.reputation - 10) * 0.35,
    부상: p.injuryWeeks > 0 ? -16 : 0,
    에이전트: g.npcs.agent ? 5 : -2,
    가계압박: p.econ.household < 30 ? -3 : 0,
    학업: p.academic > 78 ? -2 : 0,
    야망: (p.trait.ambition - 50) * 0.14,
    자기관리: (p.hidden.pro - 50) * 0.12,
    자신감: (p.confidence - 50) * 0.10,
  };
  let total = 0;
  for (const k in parts) total += parts[k];
  return { total: total + g.rng.norm(0, 7), parts };
}

ev({
  id: 'pro_entry', once: true,
  // 16~17세에 이미 프로 계약을 딴 예외 사례는 이 판정을 거치지 않는다
  when: (g) => g.world.phase === 'SUMMER' && A(g) === 18 && g.player.active &&
    (!g.player.club || g.player.club.youth),
  w: () => 20000,   // 18세 여름에는 반드시 이 판정을 통과해야 한다
  body: (g) => {
    const sc = proEntryScore(g);
    g.flags._peScore = sc.total;
    g.flags._pePass = sc.total >= 26;
    const offers = g.flags._pePass ? generateOffers(g, 3) : [];
    g.flags._peOffers = offers.map((c) => c.id);
    const top = Object.entries(sc.parts).filter(([, v]) => Math.abs(v) >= 2)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5)
      .map(([k, v]) => `  ${k} ${v > 0 ? '+' : ''}${v.toFixed(1)}`).join('\n');

    const head = `${g.world.year}년 여름. 만 18세. 후베닐 계약이 끝나는 나이다.\n\n` +
      `현재 능력 ${ability(g)} · 최근 폼 ${round(g.player.form)} · ` +
      `${g.player.injuryWeeks > 0 ? `부상 ${round(g.player.injuryWeeks)}주 잔여` : '건강'}\n` +
      `소속 ${g.player.club ? g.player.club.name : '무소속'}\n\n` +
      `[스카우팅 평가 요인]\n${top}\n\n`;

    if (g.flags._pePass && offers.length) {
      return head + `프로 계약 제안이 왔다. 실제로 협상 테이블이 열린 구단은 아래가 전부다.\n` +
        `이 목록에 없는 팀은 지금 나를 원하지 않는다.`;
    }
    if (g.flags._pePass) {
      return head + `평가는 나쁘지 않았다. 문제는 타이밍이다. 이번 여름 1·2부에서 내 포지션을 찾는 구단이 없다.\n` +
        `에이전트는 "3부에서 경기 수를 쌓고 다시 보자"고 했다.`;
    }
    return head + `프로 계약 제안은 오지 않았다.\n\n` +
      `이 나라에서 유소년 등록 선수가 1·2부 계약에 도달하는 비율은 한 자릿수다. 그 안에 들지 못했다.\n` +
      `남은 길은 3부다. 세미프로 주급으로, 아무도 보지 않는 경기장에서 다시 시작하는 것.`;
  },
  choices: (g) => {
    const offers = (g.flags._peOffers || []).map(clubById).filter(Boolean);
    if (g.flags._pePass && offers.length) {
      const list = offerChoices(g, offers, { agreed: true });
      list.push({ t: '"조건이 안 맞아. 3부에서 경기 수부터 쌓자."', meta: '세미프로 전환 · 성장 ×0.5 · 24세까지 1·2부 이적 불가',
        tags: ['safe'], fx: (gg) => enterSemiPro(gg), out: () => '제안을 접었다. 3부에서 다시 시작한다.' });
      return list;
    }
    return [
      { t: '"3부에서 시작하자. 여기서 증명하면 돼."', meta: '성장 속도 ×0.5 · 24세까지 1·2부 이적 불가 · 팀 승격 시 즉시 해제',
        tags: ['discipline'],
        fx: (gg) => enterSemiPro(gg),
        out: (gg) => `${gg.player.club.name} 3부 계약. 주급은 아르바이트 수준이야.\n` +
          `스물넷까지는 위에서 나를 사갈 수 없어. 먼저 올라가는 방법은 하나뿐이지 — 이 팀을 승격시키는 것.` },
      { t: '"이 조건이면 안 해. 다른 팀을 더 찾아보자."', meta: '무소속 유지 · 축구 의지 − · 다음 여름 재시도',
        tags: ['pride', 'risk'],
        fx: (gg) => { gg.player.club = null; gg.player.loanFrom = null; gg.player.loanUntil = null; gg.player.willToPlay -= 14; gg.player.stress += 12; },
        out: () => '여름이 끝났다. 전화는 오지 않았다. 무적 상태로 겨울을 보낸다.' },
    ];
  },
  after: (g) => { g.flags.proEntryDone = true; },
});

ev({
  // (비활성) pro_entry 가 이 역할을 대체했다. 다요소 판정으로 옮겨졌다.
  id: 'youth_release', once: true,
  when: () => false,
  w: () => 0,
  body: (g) => `만 18세. 유소년 계약이 끝나는 나이다.\n\n` +
    `현재 능력 ${ability(g)} (${abilityLabel(ability(g))})\n\n` +
    `프로 계약 제안은 오지 않았다. 유소년팀은 다음 학년을 받아야 한다.\n` +
    `이 나라에서 유소년 등록 선수 중 프로 계약에 도달하는 비율은 1% 아래다. 그 통계 안에 들지 못했다.`,
  choices: (g) => {
    const low = CLUBS.filter((c) => c.nat === 'ESP' && c.div === 3 && !c.youth);
    return [
      { t: '"트라이아웃이라도 돌자. 아직 안 끝났어."', meta: `성공 확률 능력 의존 (현재 ${ability(g)})`, risk: 'HIGH', parent: 0, injury: 1, tags: ['ambition', 'risk'],
        fx: (gg) => {
          if (gg.rng.chance(clamp((gg.player.ovr - 40) / 26, 0.03, 0.7))) {
            joinClub(gg, gg.rng.pick(low), { years: 2 });
            remember(gg, 'trial_success', `${gg.world.year}년, 3부 트라이아웃을 통과해 첫 프로 계약을 맺었다.`, 0.85);
          } else {
            gg.player.active = false;
            gg.player.path.push(`${gg.world.year} 프로 진출 실패`);
            remember(gg, 'washout', `${gg.world.year}년, 18세에 프로 계약을 얻지 못했다.`, 1.0);
          }
        },
        out: (gg) => gg.player.active
          ? '3부 계약서에 서명했다. 주급은 아르바이트 수준이지만, 프로 선수다.'
          : '여섯 팀을 돌았다. 여섯 번 다 "연락드리겠습니다"였고, 아무도 연락하지 않았다.' },
      { t: '"접자. 여기서 더 붙잡으면 시간만 버려."', meta: '커리어 종료 · 학업/직업 트랙', risk: 'SAFE', parent: 1, injury: 0, tags: ['safe'],
        fx: (gg) => {
          gg.player.active = false; gg.player.academic += 10;
          gg.player.path.push(`${gg.world.year} 축구 중단`);
          remember(gg, 'washout', `${gg.world.year}년, 18세에 축구를 접었다.`, 1.0);
        },
        out: () => '마지막 훈련이 끝나고 라커룸에서 이름표를 떼는 데 10초가 걸렸다.' },
    ];
  },
});

ev({
  id: 'father_joblss', once: true,
  // 아버지가 실제로 일을 잃은 뒤에만 발동한다 (연도가 원인이 아니다)
  when: (g) => g.player.active && A(g) >= 18 && A(g) <= 30 && g.world.phase === 'SUMMER' &&
    g.npcs.father.status === '실직',
  w: () => 300,
  body: (g) => {
    const f = g.npcs.father, m = g.npcs.mother;
    const age = f.age1990 + (g.world.year - 1990);
    const mortgage = 620 + g.rng.int(0, 180);
    g.flags._mortgage = mortgage;
    const crisis = g.world.year >= 2008 && g.world.year <= 2013;
    return `${g.world.year}년 여름.${crisis ? ' 스페인 실업률이 20%를 넘었다. 크레인이 멈춘 도시에서 일자리가 사라지고 있다.' : ''}\n\n` +
      `아버지 ${f.name}이 일하던 곳이 문을 닫았다. ${age}세, ${f.job}. 이 나이에 다음 자리는 없다.\n` +
      `아버지는 그 얘기를 한 달 뒤에 했다. 그동안 매일 아침 같은 시간에 집을 나갔다고 했다.\n` +
      `어머니 ${m.name}은 ${m.job} 일을 야간까지 늘렸다.\n\n` +
      `집 대출이 남아 있다. 월 €${mortgage}.\n\n` +
      `나는 지금 ${g.player.club ? g.player.club.name : '무소속'}에서 주급 ${fmtWeekly(g.player.econ.wageYear)}을 받는다.\n` +
      `세후로 나누면 이 집 생활비의 절반쯤 된다. 만 ${A(g)}세에 처음으로, 내 계약이 가족의 재무 계획에 들어갔다.\n\n` +
      `식탁에서 아무도 그 얘기를 먼저 꺼내지 않는다. 그게 이 집의 방식이다.\n` +
      `나는 훈련이 끝나고 차 안에서 계산기를 두 번 두드렸다.`;
    },
  choices: (g) => {
    const total = g.flags._mortgage * 12 * 8;
    const rich = g.player.econ.assets >= total * 1.15;   // 문제 6: 돈이 있으면 대출을 끼지 않는다
    const list = [];
    if (rich) list.push({
      t: '남은 대출을 일시불로 갚아버린다.',
      meta: `자산 ${fmtMoney(total)} 지출 · 부채 없음 · 가족 관계 최상`,
      tags: ['family'],
      fx: (gg) => {
        gg.player.econ.assets -= total;
        gg.npcs.father.trust = 98; gg.npcs.father.status = '실직'; gg.npcs.father.statusYear = gg.world.year;
        gg.player.stress -= 4;
        remember(gg, 'paid_off_home', `${gg.world.year}년, 부모님 집 대출을 한 번에 갚았다.`, 0.9);
      },
      out: () => '은행에 가서 한 번에 정리했다. 통장 숫자가 확 줄었지만, 이자라는 단어를 다시 볼 일이 없어졌다.\n어머니가 서류를 액자에 넣어뒀다.',
    });
    if (!rich) list.push({
      t: '내 주급으로 집 대출을 넘겨받는다.',
      meta: `부채 ${fmtMoney(total)} 이전 (은행 이자 9%) · 자산 축적 대폭 감소 · 가족 관계 최상`,
      tags: ['family'],
      fx: (gg) => {
        gg.player.econ.debt += total;
        gg.player.econ.debtRate = 0.09;
        gg.npcs.father.trust = 98; gg.player.stress += 10;
        shiftReaction(gg, 1, '가족의 대출을 넘겨받음');
        remember(gg, 'took_mortgage', `${gg.world.year}년, 아버지의 집 대출을 내 이름으로 넘겼다.`, 0.9);
      },
      out: () => '서류에 서명하는 데 20분이 걸렸다. 아버지는 그 자리에 오지 않았다.\n집을 지켰다. 대신 앞으로 몇 년간 내 통장은 내 것이 아니다.' });
    list.push({ t: '"돈 되는 데로 가자. 지금은 집이 먼저야."',
      meta: '다음 이적시장에서 연봉 높은 오퍼를 우선 수락 · 축구적 성장 리스크',
      tags: ['ambition'],
      fx: (gg) => { gg.flags.chaseMoney = true; gg.player.stress += 6; remember(gg, 'chase_money', `${gg.world.year}년, 가계 때문에 돈을 따라가기로 했다.`, 0.75); },
      out: () => '에이전트에게 전화했다. "주급 제일 높은 데로 보내주세요."\n그 통화 이후, 내 커리어의 기준이 하나 바뀌었다.' });
    list.push({ t: '"생활비는 매달 보내자. 대신 커리어는 안 건드려."',
      meta: `자산 축적 −30% · 스트레스 + · 부채 없음`,
      tags: ['safe'],
      fx: (gg) => { gg.flags.sendsMoney = true; gg.player.stress += 8; gg.player.econ.household = clamp(gg.player.econ.household + 8, 0, 100); },
      out: () => '매달 정해진 날에 송금한다. 아버지는 한 번도 고맙다고 하지 않았고, 나는 그걸 이해했다.' });
    return list;
  },
});

ev({
  id: 'sibling_bail', once: true,
  when: (g) => g.player.active && A(g) >= 19 && A(g) <= 30 && g.npcs.sibling.risk > 50,
  w: (g) => 16 + (g.npcs.sibling.risk - 50) * 1.8,
  body: (g) => {
    const sib = g.npcs.sibling;
    const bail = 9000 + g.rng.int(0, 8) * 1000;
    g.flags._bail = bail;
    return `${g.world.year}년 1월. 겨울 이적시장이 열린 주에 전화가 왔다.\n\n` +
      `새벽 두 시였다. 어머니 목소리가 아니었다. 경찰서 통역이었다.\n` +
      `형 ${sib.name}이 산츠 역 뒤편에서 붙잡혔다. 소지 혐의. 판매 목적이 붙으면 형량이 달라진다고 했다.\n` +
      `보석금 ${fmtMoney(bail)}. 사흘 안에.\n\n` +
      `이 동네에서 형의 이름은 몇 년 전부터 다르게 불렸다. 축구를 그만둔 뒤 형은 나보다 훨씬 빠르게 어른이 됐고,\n` +
      `어떤 방식으로 돈을 벌었는지 가족 모두가 알면서 아무도 묻지 않았다.\n` +
      `나는 그 돈으로 산 축구화를 두 번 신었다.\n\n` +
      `지금 통장에 ${fmtMoney(g.player.econ.assets)}이 있다.\n` +
      `어머니는 울지 않았다. 그게 더 견디기 어려웠다.\n` +
      `전화를 끊고 훈련장에 나갔다. 그날 슈팅이 하나도 안 들어갔다.`;
  },
  choices: (g) => (g.player.econ.assets >= g.flags._bail * 1.2 ? [
    { t: '"그냥 내 돈으로 내자. 이제 그럴 수 있잖아."',
      meta: `자산 ${fmtMoney(g.flags._bail)} 지출 · 부채 없음 · 형 관계 회복`,
      tags: ['family'],
      fx: (gg) => {
        gg.player.econ.assets -= gg.flags._bail;
        gg.npcs.sibling.helped += 1; gg.npcs.sibling.risk -= 18; gg.player.stress += 8;
        remember(gg, 'bail_paid_cash', `${gg.world.year}년, 형의 보석금을 내 돈으로 냈다.`, 0.85);
      },
      out: () => '계좌 이체 한 번으로 끝났다. 스무 살의 나에게는 불가능했던 일이다.\n형은 사흘 뒤에 나왔고, 아무 말도 하지 않고 내 어깨를 한 번 쳤다.' },
  ] : [
    { t: '"사채라도 쓰자. 형을 저기 두고 잠이 오겠어?"',
      meta: `부채 ${fmtMoney(g.flags._bail)} (연이자 34%) · 스트레스 ++ · 형 관계 회복`,
      tags: ['family', 'risk'],
      fx: (gg) => {
        gg.player.econ.debt += gg.flags._bail; gg.player.econ.debtRate = 0.34;
        gg.player.stress += 18; gg.npcs.sibling.helped += 1; gg.npcs.sibling.risk -= 18;
        remember(gg, 'bail_paid', `${gg.world.year}년, 형의 보석금을 사채로 냈다.`, 0.9);
      },
      out: () => '형은 사흘 뒤에 나왔다. 아무 말도 하지 않고 내 어깨를 한 번 쳤다.\n이자 34%. 이 숫자가 앞으로 몇 년간 내 이적 협상을 지배한다.' },
    { t: '"통장 털고 나머지는 구단에 부탁하자. 창피한 건 나중 문제야."',
      meta: '자산 소진 · 구단 신뢰 −8 · 감독이 사정을 알게 됨',
      tags: ['safe'],
      fx: (gg) => {
        const short = Math.max(0, gg.flags._bail - gg.player.econ.assets);
        gg.player.econ.assets = Math.max(0, gg.player.econ.assets - gg.flags._bail);
        if (short > 0) { gg.player.econ.debt += short; gg.player.econ.debtRate = 0.0; }
        gg.npcs.coach.trust -= 8; gg.npcs.sibling.risk -= 12; gg.npcs.sibling.helped += 1;
        remember(gg, 'bail_club', `${gg.world.year}년, 구단 가불로 형의 보석금을 냈다.`, 0.85);
      },
      out: () => '단장실에서 30분을 설명했다. 이자는 없다고 했다.\n다음 주부터 감독이 나를 다르게 봤다. 좋은 쪽인지 나쁜 쪽인지는 아직 모른다.' },
    { t: '"이번엔 안 내자. 계속 이러면 나도 같이 가라앉아."',
      meta: '부채 0 · 형 관계 파탄 · 스트레스 +++ · 30대 이벤트 분기 결정',
      tags: [],
      fx: (gg) => {
        gg.player.stress += 26; gg.npcs.sibling.risk += 14; gg.npcs.sibling.state = 'INCIDENT';
        gg.flags.abandonedSibling = true;
        remember(gg, 'bail_refused', `${gg.world.year}년, 형의 보석금을 내지 않았다.`, 0.95);
      },
      out: () => '전화를 끊고 다시 걸지 않았다.\n그해 여름 어머니 집에 가지 않았다. 이 결정은 십 년 뒤에 다시 돌아온다.' },
  ]),
});

ev({
  id: 'loan_shark',
  when: (g) => g.player.active && g.player.econ.debt > 20000 && g.player.econ.debtRate > 0.2,
  once: true, w: () => 300,
  body: (g) => `훈련장 주차장에 낯선 차가 서 있었다.\n\n` +
    `두 사람이 내려서 내 이름을 정확히 불렀다. 소속팀도, 다음 원정 일정도 알고 있었다.\n` +
    `현재 부채 ${fmtMoney(g.player.econ.debt)}. 연이자 34%는 원금을 2년마다 두 배로 만든다.\n\n` +
    `그들은 위협하지 않았다. 오히려 정중했다. 그게 더 무서웠다.\n` +
    `"경기 잘 보고 있습니다. 다음 달까지만요."\n\n` +
    `구단에 알리면 계약에 도덕 조항이 걸린다. 언론이 알면 이적 시장에서 값이 떨어진다.\n` +
    `혼자 해결해야 한다는 것만 확실하다.`,
  choices: () => [
    { t: '"구단에 털어놓자. 이자 34%는 혼자 감당이 안 돼."', meta: '이자 34% → 9% · 평판 −5 · 감독 신뢰 −6', tags: ['safe'],
      fx: (gg) => { gg.player.econ.debtRate = 0.09; gg.player.reputation -= 5; gg.npcs.coach.trust -= 6; gg.player.stress -= 10; },
      out: () => '단장이 은행을 연결해줬다. 대신 그 얘기가 라커룸에 돌았다.' },
    { t: '"이적해서 계약금으로 한 번에 털자."', meta: '다음 이적에서 연봉보다 계약금 우선 · 축구적 후퇴 가능', tags: ['risk'],
      fx: (gg) => { gg.flags.chaseMoney = true; gg.player.stress += 8; },
      out: () => '에이전트에게 상황을 전부 말했다. "그럼 조건은 제가 정합니다."' },
    { t: '"버티자. 시즌만 끝나면 갚을 수 있어."', meta: '이자 계속 · 스트레스 +++ · 성장률 패널티', tags: ['pride'],
      fx: (gg) => { gg.player.stress += 22; },
      out: () => '버텼다. 그 시즌 내내 밤에 잠들기까지 두 시간이 걸렸다.' },
  ],
});

ev({
  id: 'summer_market', when: (g) => g.world.phase === 'SUMMER' && A(g) >= 16 && g.player.active && !(A(g) >= 18 && (!g.player.club || g.player.club.youth)), w: () => 100,
  body: (g) => {
    const p = g.player;
    const offers = generateOffers(g, 3);
    g.flags._offers = offers.map((c) => c.id);
    const cur = p.club
      ? `현 소속   ${p.club.name} (${p.club.league} · ${DIV_LABEL[p.club.div]})\n감독 신뢰 ${round(g.npcs.coach.trust)}/100 · 계약 만료 ${p.contractUntil}년`
      : '현 소속   무소속';
    return `${cur}\n현재 능력 ${ability(g)} (${abilityLabel(ability(g))}) · 평판 ${round(p.reputation)}\n\n` +
      (offers.length ? '── 들어온 제안 ──' : '── 제안 없음 ──\n올여름은 전화가 조용하다.');
  },
  choices: (g) => {
    const offers = (g.flags._offers || []).map(clubById).filter(Boolean);
    const list = offerChoices(g, offers);
    if (g.player.club) {
      list.push({ t: '"남자. 여기서 증명하면 되지."', meta: '감독 신뢰 + · 스트레스 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['loyalty'],
        fx: (gg) => { gg.npcs.coach.trust += 6; gg.player.stress -= 4; gg.player.trait.loyalty += 5; },
        out: () => '떠나는 게 쉬웠을 것이다. 남는 쪽을 골랐다.' });
      const lt = loanTargets(g, 2);
      if (lt.length) list.push(...offerChoices(g, lt, { loan: true }));
      // 이적 요청은 "오퍼가 없을 때"만 의미가 있다. 이미 협상 테이블이 열려 있으면 숨긴다.
      if (!offers.length) list.push({ t: '"이적 요청하자. 여기서는 더 안 늘어."',
        meta: `구단 반응 즉시 확인 (예상 거부율 ${Math.round(refusalChance(g, null) * 100)}%) · 감독 신뢰 −12`,
        tags: ['ambition'],
        fx: (gg) => { gg.npcs.coach.trust -= 12; gg.flags.requestPending = true; },
        out: () => '단장실 문을 두드렸다.' });
    } else if (!offers.length) {
      list.push({ t: '"일단 몸이나 만들면서 기다리자. 전화는 오겠지."', meta: '축구 의지 − · 스트레스 +', risk: 'HIGH', parent: -1, injury: 0, tags: [],
        fx: (gg) => { gg.player.willToPlay -= 10; gg.player.stress += 10; shiftReaction(gg, -1, '소속팀 없음'); },
        out: () => '전화는 오지 않았다. 그래도 다음 주에도 나갔다.' });
    }
    return list;
  },
});

ev({
  id: 'transfer_request', when: (g) => !!g.flags.requestPending && g.player.active && g.player.club, w: () => 9999,
  body: (g) => {
    const p = g.player;
    const club = p.club;
    const myAvg = teamAvgAt(club, g.world.year);
    const chance = refusalChance(g, null);
    // 구단의 답은 여기서 결정된다
    const accepted = !g.rng.chance(chance);
    g.flags._reqAccepted = accepted;
    const offers = accepted ? generateOffers(g, 3) : [];
    g.flags._reqOffers = offers.map((c) => c.id);
    if (!accepted) {
      const alt = generateOffers(g, 1);
      g.flags._reqTarget = alt.length ? { name: alt[0].name, id: alt[0].id } : null;
    }

    const head = `단장실에 들어갔다. 이적 요청을 정식으로 꺼냈다.\n\n` +
      `${club.name} · 팀 평균 ${myAvg} · 내 능력 ${ability(g)} · 감독 신뢰 ${round(g.npcs.coach.trust)}/100\n` +
      `계약 만료 ${p.contractUntil}년\n\n`;

    if (accepted) {
      return head +
        `단장은 오래 생각하지 않았다.\n` +
        `"막지 않겠다. 조건이 맞는 곳이 오면 보내주지."\n\n` +
        (offers.length
          ? `에이전트가 그날 저녁에 명단을 들고 왔다. 실제로 움직일 수 있는 곳은 아래가 전부다.`
          : `문제는 그 다음이었다. 허락은 받았는데, 이번 시장에 나를 원하는 구단이 없다.\n` +
            `에이전트는 "겨울까지 기다려보자"고 했다. 그 말을 몇 번째 듣는지 모르겠다.`);
    }
    return head +
      `단장이 서류를 덮었다.\n` +
      `"지금은 팀 계획의 일부다. 이번 여름에는 못 보낸다."\n\n` +
      `${g.npcs.coach.trust > 62 ? '감독이 나를 붙잡는 쪽이었다. 신뢰가 높은 게 이럴 때는 족쇄가 된다.' : '팀 사정이지 내 실력 문제는 아니라고 했다. 위로가 되지는 않는다.'}\n` +
      `요청했다는 사실만 라커룸에 남았다. 이 상태로 시즌을 시작하면 어떻게 되는지는 나도 안다.`;
  },
  choices: (g) => {
    g.flags.requestPending = false;
    if (g.flags._reqAccepted) {
      const offers = (g.flags._reqOffers || []).map(clubById).filter(Boolean);
      const list = offerChoices(g, offers, { agreed: true });   // 구단이 이미 허락했다
      list.push({ t: '"조건이 안 맞네. 한 시즌 더 남자."', meta: '잔류 · 감독 신뢰 −6 · 다음 여름 거부율 하락',
        tags: ['loyalty'],
        fx: (gg) => { gg.npcs.coach.trust -= 6; gg.flags.wantsOut = gg.world.year; },
        out: () => '허락은 받았지만 갈 곳이 마땅치 않았다. 남았다. 단장은 다음 여름을 약속했다.' });
      return list;
    }
    // 거부 — 태업할지 받아들일지
    const tgt = g.flags._reqTarget;
    return [
      { t: '"훈련을 놓자. 데리고 있는 게 손해라고 느껴야 풀어줄 거야."',
        meta: '결과 3분기: 징계(출전 급감) / 이적 허가 / 상승 조건 재계약',
        tags: ['risk', 'pride'],
        fx: (gg) => {
          const lev = gg.player.reputation + (gg.player.ovr - teamAvgAt(gg.player.club, gg.world.year)) * 2;
          const r = gg.rng.f();
          if (r < 0.34) {
            gg.flags.holdoutResult = 'DISCIPLINE';
            gg.npcs.coach.trust = clamp(gg.npcs.coach.trust - 34, 5, 95);
            gg.player.form = clamp(gg.player.form - 22, 10, 98);
            gg.player.reputation = clamp(gg.player.reputation - 8, 0, 100);
            gg.player.stress += 20;
            remember(gg, 'holdout_punished', `${gg.world.year}년, 이적 요청이 거부된 뒤 태업으로 징계를 받았다.`, 0.88);
          } else if (tgt && r < 0.34 + clamp(0.30 + lev / 400, 0.2, 0.5)) {
            gg.flags.holdoutResult = 'RELEASED';
            const target = CLUBS.find((c) => c.id === tgt.id);
            if (target) joinClub(gg, target, { years: 4, wanted: true });
            remember(gg, 'holdout_won', `${gg.world.year}년, 태업 끝에 ${tgt.name} 이적을 받아냈다.`, 0.85);
          } else {
            gg.flags.holdoutResult = 'RENEW';
            gg.player.contractUntil = gg.world.year + 4;
            gg.flags.wageBump = 1.9;
            gg.npcs.coach.trust = clamp(gg.npcs.coach.trust - 8, 5, 95);
            remember(gg, 'holdout_renew', `${gg.world.year}년, 태업 끝에 조건을 올려 재계약했다.`, 0.8);
          }
        },
        out: (gg) => ({
          DISCIPLINE: '2주째 훈련에서 감독이 나를 불러 세웠다. 그날로 1군 명단에서 빠졌다.\n예비 명단에서 시즌을 보냈다. 이 도박은 실패했다.',
          RELEASED: '한 달 만에 구단이 손을 들었다. "팀 분위기를 해치는 선수는 데리고 있지 않는다."\n원하는 곳으로 갔다. 대신 이 도시에서의 평판은 남았다.',
          RENEW: '구단이 다른 카드를 냈다. 주급을 두 배 가까이 올린 재계약서였다.\n서명했다. 이적은 못 했지만, 이겼다고 볼 수도 있다.',
        }[gg.flags.holdoutResult] || '') },
      { t: '"받아들이자. 프로답게 뛰면 다음 여름엔 안 막겠지."',
        meta: '감독 신뢰 + · 다음 여름 거부율 하락', tags: ['loyalty', 'discipline'],
        fx: (gg) => {
          gg.npcs.coach.trust = clamp(gg.npcs.coach.trust + 14, 5, 95);
          gg.player.stress = clamp(gg.player.stress - 8, 0, 100);
          gg.flags.wantsOut = gg.world.year;
        },
        out: () => '프로답게 뛰었다. 단장이 시즌 끝에 "다음 여름에는 막지 않겠다"고 했다.\n그 말을 믿을지는 다음 여름에 알게 된다.' },
    ];
  },
});

ev({
  id: 'holdout', when: (g) => !!g.flags.transferBlocked && g.player.active, w: () => 9999,
  body: (g) => {
    const t = g.flags.transferBlocked;
    return `${t.name}으로의 이적이 구단에서 막혔다.\n\n` +
      `프리시즌 첫 훈련에 나갔다. 감독은 아무 일도 없었던 것처럼 인사했고,\n` +
      `나는 아무 일도 없었던 것처럼 인사를 받았다. 라커룸의 몇 명은 이미 알고 있었다.\n\n` +
      `에이전트는 두 가지 길을 말했다. 하나는 이 시즌을 그냥 뛰는 것.\n` +
      `다른 하나는 훈련 강도를 의도적으로 떨어뜨려서, 구단이 나를 파는 게 이득이라고 판단하게 만드는 것.\n\n` +
      `후자는 도박이다. 성공하면 겨울에 나갈 수 있다.\n` +
      `실패하면 징계 명단에 올라가고, 그 시즌은 통째로 사라진다. 만 ${A(g)}세에 한 시즌은 짧지 않다.\n\n` +
      `창밖으로 훈련장이 보인다. 아직 아무도 나오지 않았다.`;
  },
  choices: (g) => [
    { t: '"훈련을 놓자. 데리고 있는 게 손해라고 느껴야 풀어줄 거야."',
      meta: '결과 3분기: 징계(출전 급감) / 이적 허가 / 상승 조건 재계약',
      tags: ['risk', 'pride'],
      fx: (gg) => {
        const t = gg.flags.transferBlocked;
        gg.flags.transferBlocked = null;
        // 지분: 태업의 결과는 세 갈래다
        const lev = gg.player.reputation + (gg.player.ovr - teamAvgAt(gg.player.club, gg.world.year)) * 2;
        const r = gg.rng.f();
        if (r < 0.34) {
          gg.flags.holdoutResult = 'DISCIPLINE';
          gg.npcs.coach.trust = clamp(gg.npcs.coach.trust - 34, 5, 95);
          gg.player.form = clamp(gg.player.form - 22, 10, 98);
          gg.player.reputation = clamp(gg.player.reputation - 8, 0, 100);
          gg.player.stress += 20;
          remember(gg, 'holdout_punished', `${gg.world.year}년, 태업으로 징계를 받아 한 시즌을 잃었다.`, 0.88);
        } else if (r < 0.34 + clamp(0.30 + lev / 400, 0.2, 0.5)) {
          gg.flags.holdoutResult = 'RELEASED';
          const target = CLUBS.find((c) => c.id === t.id);
          if (target) joinClub(gg, target, { years: 4, wanted: true });
          remember(gg, 'holdout_won', `${gg.world.year}년, 태업 끝에 ${t.name} 이적을 받아냈다.`, 0.85);
        } else {
          gg.flags.holdoutResult = 'RENEW';
          gg.player.contractUntil = gg.world.year + 4;
          gg.flags.wageBump = 1.9;
          gg.npcs.coach.trust = clamp(gg.npcs.coach.trust - 8, 5, 95);
          remember(gg, 'holdout_renew', `${gg.world.year}년, 태업 끝에 조건을 올려 재계약했다.`, 0.8);
        }
      },
      out: (gg) => ({
        DISCIPLINE: '2주째 훈련에서 감독이 나를 불러 세웠다. 그날로 1군 명단에서 빠졌다.\n예비 명단에서 시즌을 보냈다. 이 도박은 실패했다.',
        RELEASED: '한 달 만에 구단이 손을 들었다. "팀 분위기를 해치는 선수는 데리고 있지 않는다."\n원하는 곳으로 갔다. 대신 이 도시에서의 평판은 남았다.',
        RENEW: '구단이 다른 카드를 냈다. 주급을 두 배 가까이 올린 재계약서였다.\n서명했다. 이적은 못 했지만, 이겼다고 볼 수도 있다.',
      }[gg.flags.holdoutResult] || '') },
    { t: '"받아들이자. 프로답게 뛰면 다음 여름엔 안 막겠지."',
      meta: '감독 신뢰 + · 스트레스 − · 다음 여름 이적 거부율 하락',
      tags: ['loyalty', 'discipline'],
      fx: (gg) => {
        gg.flags.transferBlocked = null;
        gg.npcs.coach.trust = clamp(gg.npcs.coach.trust + 14, 5, 95);
        gg.player.stress = clamp(gg.player.stress - 8, 0, 100);
        gg.flags.wantsOut = gg.world.year;   // 다음 여름 협상까지만 유효
      },
      out: () => '프로답게 뛰었다. 단장이 시즌 끝에 "다음 여름에는 막지 않겠다"고 했다.\n그 말을 믿을지는 다음 여름에 알게 된다.' },
  ],
});

ev({
  id: 'winter_market', when: (g) => g.world.phase === 'WINTER' && A(g) >= 16 && g.player.active && g.player.club, w: () => 100,
  body: (g) => {
    const last = g.player.career.seasons[g.player.career.seasons.length - 1];
    const benched = last && last.apps < 6;
    const offers = benched ? generateOffers(g, 2) : [];
    g.flags._offers = offers.map((c) => c.id);
    g.flags._loans = loanTargets(g, 2).map((c) => c.id);
    return `${g.player.club.name} · 전반기 ${last ? `${last.apps}경기 ${last.goals}골` : '기록 없음'}\n감독 신뢰 ${round(g.npcs.coach.trust)}/100\n\n` +
      (benched ? '이 상태로 후반기를 보내면 시즌 하나가 통째로 사라진다.\n에이전트: "6개월 임대로 나가야 해."'
               : '전반기는 나쁘지 않았다. 체력이 떨어지는 시기다.');
  },
  choices: (g) => {
    const offers = (g.flags._offers || []).map(clubById).filter(Boolean);
    const loans = (g.flags._loans || []).map(clubById).filter(Boolean);
    const list = [...offerChoices(g, offers), ...offerChoices(g, loans, { loan: true })];
    list.push({ t: '"어디가 좀 안 좋은데, 참고 뛰자. 지금 빠지면 자리 없어져."',
      meta: '부상 위험 ++ · 감독 신뢰 + · 컨디션 −', tags: ['pride', 'risk'],
      fx: (gg) => {
        gg.player.hidden.injuryProne = clamp(gg.player.hidden.injuryProne + 11, 3, 99);
        gg.npcs.coach.trust += 9;
        gg.player.fitness = clamp(gg.player.fitness - 12, 20, 100);
        gg.player.stress += 10;
        gg.flags.playingHurt = true;
      },
      out: () => '진통제를 맞고 나갔다. 감독은 그걸 알고, 알면서 계속 명단에 넣었다.\n무릎이 아픈 건 시즌 끝나고 생각하기로 했다.' });
    list.push({ t: '"감독한테 로테이션 좀 돌려달라고 하자. 이대로는 시즌을 못 버텨."',
      meta: '출전 감소 · 부상 위험 − · 감독 신뢰 −', tags: ['discipline'],
      fx: (gg) => {
        gg.npcs.coach.trust -= 11;
        gg.player.hidden.injuryProne = clamp(gg.player.hidden.injuryProne - 8, 3, 99);
        gg.player.fitness = clamp(gg.player.fitness + 15, 20, 100);
        gg.player.form -= 5;
        gg.flags.rotationAsked = true;
      },
      out: () => '면담을 신청했다. 감독은 알겠다고 했는데 표정이 안 좋았다.\n다음 세 경기에서 두 번 벤치였다. 몸은 확실히 나아졌다.' });
    return list;
  },
});

ev({
  id: 'promo_relegation',
  when: (g) => g.world.phase === 'SUMMER' && g.player.active && g.player.club && (g.flags.justPromoted || g.flags.justRelegated),
  w: () => 4000,
  body: (g) => {
    const up = !!g.flags.justPromoted;
    const c = g.player.club;
    const avg = teamAvgAt(c, g.world.year);
    if (up) {
      return `승격했다.\n\n마지막 라운드가 끝나고 그라운드에 사람들이 넘어 들어왔다. 누군가 내 유니폼을 벗겨 갔고,\n` +
        `나는 상의 없이 30분 동안 관중석 쪽을 보며 서 있었다. 3부에서 2부로, 혹은 2부에서 1부로.\n` +
        `이 클럽이 몇 년을 기다린 승격인지 라커룸의 나이 든 선수들이 울면서 말해줬다.\n\n` +
        `문제는 다음 시즌이다. ${c.name}은 이제 ${DIV_LABEL[c.div]}이고, 팀 평균 능력은 ${avg}로 다시 계산된다.\n` +
        `내 능력은 ${ability(g)}다. 승격한 팀은 여름에 반드시 선수를 사 온다. 그 선수가 내 자리로 온다.\n\n` +
        `에이전트는 두 가지를 말했다. 하나는 여기서 버티면 1부 무대를 밟는다는 것.\n` +
        `다른 하나는, 버티지 못하면 반년 뒤 임대 명단에 올라간다는 것.`;
    }
    return `강등됐다.\n\n원정 라커룸에서 결과를 들었다. 아무도 소리를 지르지 않았다. 그게 더 이상했다.\n` +
      `${c.name}은 다음 시즌 ${DIV_LABEL[c.div]}에서 시작한다. 예산이 절반으로 줄고, 주력 선수는 전부 팔린다.\n` +
      `구단은 내 연봉도 재조정하겠다고 통보했다.\n\n` +
      `팀 평균 능력은 ${avg}로 내려갔다. 내 능력은 ${ability(g)}다.\n` +
      `이 리그에서는 내가 가장 잘하는 선수 중 하나가 된다. 매주 90분을 뛸 수 있다.\n` +
      `대신 아무도 보지 않는 곳에서 뛴다는 뜻이기도 하다. 스카우트는 강등된 팀의 경기를 보지 않는다.\n\n` +
      `스물 몇 살의 한 시즌은 짧지 않다. 여기서 두 시즌을 보내면 그 뒤는 없다.`;
  },
  choices: (g) => {
    const up = !!g.flags.justPromoted;
    g.flags.justPromoted = null; g.flags.justRelegated = null;
    const out = [
      { t: up ? '"남자. 이 팀으로 1부를 밟아보자."' : '"남자. 여기서 다시 올려놓으면 되지."',
        meta: up ? '주전 경쟁 · 감독 신뢰 +' : '확실한 주전 · 노출 하락',
        tags: ['loyalty'],
        fx: (gg) => { gg.npcs.coach.trust += 10; gg.player.stress += up ? 8 : -6; gg.player.trait.loyalty += 6; },
        out: () => up ? '유니폼을 그대로 입었다. 프리시즌에 영입된 선수가 내 포지션이었다.'
                      : '남았다. 이 리그에서 나는 가장 좋은 선수다. 그게 위로가 되지는 않는다.' },
      { t: '"이적 요청하자. 여기 더 있으면 썩어."', meta: '여름 시장의 오퍼로 이동', tags: ['ambition'],
        fx: (gg) => { gg.npcs.coach.trust -= 12; gg.flags.requestPending = true; },
        out: () => '구단은 화를 냈지만 막지는 않았다.' },
    ];
    return out;
  },
});

ev({
  id: 'contract_renewal', when: (g) => A(g) >= 19 && g.player.active && g.player.club && g.world.year >= g.player.contractUntil - 1 && g.world.phase === 'SUMMER', w: () => 190,
  body: (g) => `${g.player.club.name}과의 계약이 ${g.player.contractUntil}년에 끝난다.\n현재 연봉 ${fmtMoney(g.player.econ.wageYear)} · 감독 신뢰 ${round(g.npcs.coach.trust)}/100`,
  choices: () => [
    { t: '"재계약하자. 지금은 안정이 필요해."', meta: '연봉 ×1.45 · 4년 연장', risk: 'SAFE', parent: 1, injury: 0, tags: ['safe', 'loyalty'],
      fx: (gg) => {
        gg.player.contractUntil = gg.world.year + 4; gg.player.stress -= 8; gg.npcs.coach.trust += 6;
        const frozen = marketClimate(gg).global && !isBigClub(gg, gg.player.club);
        gg.flags.wageBump = frozen ? 1.0 : 1.45;
        gg.flags.wageFrozen = frozen;
      },
      out: (gg) => gg.flags.wageFrozen
        ? '4년 연장. 다만 주급은 동결이다. 구단은 "지금 시장에서는 이게 최선"이라고 했고, 그건 사실이었다.'
        : '4년 연장. 주급이 올랐다.' },
    { t: '"세게 요구하자. 이 정도 받을 자격은 있잖아."', meta: '성공 시 연봉 ×2.0 / 실패 시 신뢰 −16', risk: 'HIGH', parent: 0, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => {
        if (gg.player.reputation + gg.npcs.coach.trust / 2 > 92) { gg.player.contractUntil = gg.world.year + 4; gg.flags.wageBump = 2.0; }
        else { gg.npcs.coach.trust -= 16; gg.player.stress += 12; gg.flags.standoff = true; }
      },
      out: (gg) => gg.flags.standoff ? '구단이 제안을 철회했다. 팬들은 "돈만 아는 선수"라고 쓴다.' : '요구가 통했다.' },
    { t: '"계약을 흘리자. FA로 나가면 조건은 내가 골라."', meta: '이적료 0 · 야유 · 신뢰 −20', risk: 'HIGH', parent: -1, injury: 0, tags: ['risk', 'ambition'],
      fx: (gg) => { gg.npcs.coach.trust -= 20; gg.player.stress += 14; gg.flags.goingFA = true; },
      out: () => '이적료 없이 나갈 수 있다. 대신 이번 시즌 내내 야유를 듣는다.' },
  ],
});

ev({
  id: 'manager_change', when: (g) => A(g) >= 17 && g.player.active && g.player.club, w: () => 18,
  body: (g) => {
    g.npcs.coach.unknown = true;   // 새 감독의 평가가 나오기 전까지 신뢰도는 미정이다
    return `${g.player.club.name} 감독이 경질됐다.\n\n` +
      `발표는 화요일 아침에 났다. 훈련장에 기자가 열 명 넘게 왔고, 우리는 실내에서 몸만 풀었다.\n` +
      `그동안 쌓아온 신뢰 ${round(g.npcs.coach.trust)}는 이제 아무 의미가 없다.\n` +
      `새 감독은 목요일에 온다. 그때까지 내 서열은 미정이다.`;
  },
  choices: () => [
    { t: '"맞춰주자. 살아남는 게 먼저야."', meta: '적응력에 따라 신뢰 결정', risk: 'MID', parent: 0, injury: 0, tags: ['adaptability'],
      fx: (gg) => { gg.npcs.coach.trust = clamp(50 + (gg.player.hidden.adaptability - 50) / 2 + gg.rng.norm(0, 8), 10, 95); gg.npcs.coach.unknown = false; gg.player.trait.adaptability += 8; },
      out: (gg) => gg.npcs.coach.trust > 60 ? '새 감독의 첫 명단에 이름이 있었다.' : '맞추려 했지만, 그가 원하는 선수는 내가 아니었다.' },
    { t: '"내 걸로 밀고 가자. 바꿔서 애매해지면 그게 끝이야."', meta: '성공 시 신뢰 +16 / 실패 시 −22', risk: 'HIGH', parent: 0, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => { const ok = gg.rng.chance(0.42 + (gg.player.ovr - 68) / 60); gg.npcs.coach.trust = ok ? clamp(gg.npcs.coach.trust + 16, 10, 95) : clamp(gg.npcs.coach.trust - 22, 5, 95); gg.npcs.coach.unknown = false; },
      out: (gg) => gg.npcs.coach.trust > 55 ? '감독이 결국 나에게 맞춰 팀을 짰다.' : '벤치에서 후반기를 보냈다.' },
  ],
});

ev({
  // 금융위기는 "고정 스토리"가 아니라 세계 상태 변화다. 아버지의 결과는 확률로 갈린다.
  // 18세 프로 진입 판정이 끝난 뒤에만 발동한다 — 그 전에 걸리면 게이트를 우회해 계약이 생긴다
  id: 'crisis2008', once: true,
  when: (g) => g.world.year >= 2008 && g.world.year <= 2010 && A(g) >= 18 && A(g) <= 20 &&
    (g.flags.proEntryDone || (g.player.club && !g.player.club.youth)),
  w: () => 1400,
  body: (g) => {
    const e = ENV(g);
    const f = g.npcs.father;
    const res = rollFatherEmployment(g, 55);
    g.flags._crisisRes = res ? res.key : 'NONE';
    const head = `${g.world.year}년. 금융위기의 여파가 스페인을 정면으로 때렸다. 건설업이 멈추고 실업률이 치솟는다.\n\n` +
      `${e.label} 가정 — 안전망 ${e.safety}/100\n${f.name} · ${f.job}\n\n`;
    if (!res) return head + `아버지는 이미 일을 놓은 상태다. 이번 위기는 그 사실을 더 분명하게 만들 뿐이다.`;
    const tail = {
      KEEP: `아버지의 자리는 남았다. 주변에서 사람이 계속 빠져나가는 걸 보면서, 아버지는 아무 말도 하지 않았다.\n가계는 버틴다. 다만 집 안 공기가 달라졌다.`,
      PAYCUT: `임금이 깎였다. 같은 시간을 일하고 더 적게 받는다.\n아버지는 그걸 "일이 있는 게 어디냐"고 표현했다.`,
      HOURS: `근무시간이 줄었다. 오후 세 시에 집에 있는 아버지를 처음 봤다.\n둘 다 어색해서 아무 말도 안 했다.`,
      FIRED: `아버지가 일을 잃었다. 그 얘기를 한 달 뒤에 했다.\n그동안 매일 아침 같은 시간에 집을 나갔다고 했다.`,
      MOVED: `아버지가 다른 일자리로 옮겼다. ${f.job}. 예전보다 못한 조건이지만 일은 있다.`,
    }[res.key];
    return head + tail + `\n\n가계 ${res.hit ? res.hit : '변동 없음'} → 현재 ${round(g.player.econ.household)}/100`;
  },
  choices: () => [
    { t: '"지금 서명하자. 집이 먼저 무너지면 축구도 없어."', meta: '즉시 수입 · 학업 포기', risk: 'MID', parent: 2, injury: 1, tags: ['ambition'],
      fx: (gg) => {
        gg.player.econ.household = clamp(gg.player.econ.household + 14, 0, 100);
        // 세미프로 신분이면 이 계약도 3부를 벗어나지 못한다
        const minDiv = (gg.flags.semiProLock && ageOf(gg) < 24) ? 3 : 2;
        const dom = CLUBS.filter((c) => c.nat === 'ESP' && c.div >= minDiv && scoutedValue(gg, c) >= c.req - 8);
        joinClub(gg, dom.length ? gg.rng.pick(dom) : clubById('esp3:CE Sabadell'), { years: 3 });
        shiftReaction(gg, 2, '가계를 구한 계약'); gg.player.stress += 14; gg.flags.breadwinner = true;
        remember(gg, 'breadwinner', '2008년 금융위기. 18세에 내 연봉이 집안의 주 수입이 됐다.', 0.95);
      },
      out: () => '열여덟에 가장이 됐다. 그 순간 아버지의 눈을 봤다. 고마움과 미안함이 같이 있었다.' },
    { t: '"학교도 붙잡자. 떨어질 데는 있어야지."', meta: '안전망 확보 · 성장 −', risk: 'SAFE', parent: -1, injury: 0, tags: ['safe'],
      fx: (gg) => {
        // 가계 타격은 body 의 고용 판정에서 이미 반영됐다. 여기서 또 깎지 않는다.
        gg.player.hidden.absorption -= 6; gg.player.willToPlay -= 6; gg.player.academic += 12; gg.flags.university = true;
        remember(gg, 'crisis_safe', '2008년 위기 앞에서 안전한 길을 택했다.', 0.8);
      },
      out: () => '축구는 계속한다. 다만 이제 우선순위가 두 번째다.' },
  ],
});

ev({
  id: 'covid', once: true, when: (g) => g.world.year === 2020 && g.player.active && A(g) >= 25, w: () => 3000,
  body: (g) => `2020년 3월. 리그가 멈췄다.\n\n${g.player.club ? g.player.club.name : '소속팀'}이 전 선수 임금 삭감안을 통보했다. 무관중 경기가 언제까지 갈지 아무도 모른다.\n\n만 ${A(g)}세. 커리어에서 반년은 짧지 않다.`,
  choices: () => [
    { t: '"서명하자. 지금 버티면 팀이 먼저 죽어."', meta: '연봉 −25% · 신뢰 ++', risk: 'SAFE', parent: 0, injury: 0, tags: ['loyalty'],
      fx: (gg) => { gg.player.econ.wageYear = round(gg.player.econ.wageYear * 0.75); gg.npcs.coach.trust += 14; gg.player.reputation += 3; },
      out: () => '주장단과 함께 삭감안에 서명했다. 팬들이 그걸 기억한다.' },
    { t: '"거부하자. 계약은 계약이잖아."', meta: '연봉 유지 · 신뢰 −18 · 평판 −', risk: 'HIGH', parent: -1, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => { gg.npcs.coach.trust -= 18; gg.player.reputation -= 6; gg.player.stress += 10; },
      out: () => '법적으로는 이겼다. 라커룸에서는 졌다.' },
    { t: '"거실에서라도 하자. 재개되면 몸 된 놈이 뛰는 거야."', meta: '건강 ++ · 부상 위험 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['discipline'],
      fx: (gg) => { gg.player.fitness = clamp(gg.player.fitness + 16, 0, 100); gg.player.hidden.injuryProne -= 6; gg.player.econ.wageYear = round(gg.player.econ.wageYear * 0.8); },
      out: () => '거실에서 매일 두 시간. 리그가 재개됐을 때 몸이 가장 좋은 선수 중 하나였다.' },
  ],
});

ev({
  id: 'nt_choice', once: true,
  when: (g) => g.player.secondNationality && A(g) >= 19 && A(g) <= 27 && !g.player.ntTeam &&
    !g.player.ntLocked && g.player.reputation > 26 && g.player.club && !g.player.club.youth && g.player.club.div <= 2,
  w: () => 250,
  body: (g) => {
    const s = g.player.secondNationality;
    return `이중국적자다. 두 협회가 모두 연락을 해왔다.\n\n` +
      `· 스페인 — 경쟁 강도 ${NT_BAR.ESP}/100. 부를지 알 수 없다.\n` +
      `· ${NT_NAME[s]} — 경쟁 강도 ${NT_BAR[s]}/100. 지금 가면 바로 주전이고, 메이저 대회에 나갈 수 있다.\n\n` +
      `FIFA 규정상 A매치 메이저 대회에 출전하는 순간 이 선택은 영구히 닫힌다.`;
  },
  choices: (g) => [
    { t: `"${NT_NAME[g.player.secondNationality]}로 가자. 부르는 데서 뛰는 게 맞지."`, meta: '즉시 주전 · 메이저 대회 출전 가능', risk: 'MID', parent: 1, injury: 0, tags: ['risk'],
      fx: (gg) => {
        gg.player.ntTeam = gg.player.secondNationality; gg.player.reputation += 8;
        remember(gg, 'nt_switch', `${gg.world.year}년, 스페인 대신 ${NT_NAME[gg.player.ntTeam]} 대표팀을 선택했다.`, 0.85);
      },
      out: (gg) => `${NT_NAME[gg.player.ntTeam]} 유니폼을 입었다. 부모님이 그 경기를 보며 울었다.` },
    { t: '"기다리자. 이 유니폼이 아니면 의미가 없어."', meta: '못 뽑힐 가능성 있음', risk: 'HIGH', parent: 0, injury: 0, tags: ['pride'],
      fx: (gg) => { gg.player.trait.pride += 10; gg.flags.waitedESP = true; },
      out: () => '한 번도 부르지 않을 수도 있다. 그래도 이 유니폼이어야 했다.' },
  ],
});

ev({
  id: 'world_cup',
  when: (g) => WORLD_CUP_YEARS.includes(g.world.year) && g.world.phase === 'SUMMER' &&
    A(g) >= 20 && A(g) <= 36 && g.player.active && g.player.ntTeam && ntEligible(g),
  w: () => 800,
  body: (g) => {
    const call = ntCallChance(g);
    g.flags._wcIn = g.rng.chance(call.chance);
    g.flags._ntGap = round(g.player.ovr - call.teamAvg);
    g.flags._ntTeamAvg = call.teamAvg;
    g.flags._ntPosAvg = call.posAvg;
    const club = g.player.club;
    const gap = g.flags._ntGap;
    const teamAvg = g.flags._ntTeamAvg, posAvg = g.flags._ntPosAvg;
    const stat = `대표팀 평균 ${teamAvg} · ${POSITIONS[g.player.position].label} 평균 ${posAvg} · 내 능력 ${ability(g)}`;

    if (!g.flags._wcIn) {
      const why = g.player.injuryWeeks > 0 ? '부상이 결정적이었다.'
        : g.player.ovr < posAvg - 3 ? `내 자리에는 나보다 나은 선수가 이미 있다.`
        : '마지막 두 자리에서 밀렸다.';
      return `${g.world.year} 월드컵 ${NT_NAME[g.player.ntTeam]} 최종 명단이 발표됐다. 이름이 없다.\n\n` +
        `${stat}\n\n${why}\n예비 명단 마지막 줄에 있었다는 건 나중에 알았다.`;
    }
    const role = ntRole(gap);
    const lines = NT_ROLE_TEXT[role].join('\n');
    const head = {
      CORE: '팀의 중심으로 뽑혔다. 감독이 첫 인터뷰에서 내 이름을 세 번 말했다.',
      LEADER: '주축으로 뽑혔다. 라커룸에서 내 자리가 문 쪽이 아니라 안쪽이다.',
      SQUAD: '명단에 들었다. 스물세 명 중 하나다.',
      FRINGE: '명단에 들었다. 솔직히 마지막 자리였다.',
    }[role];
    return `${g.world.year} 월드컵 ${NT_NAME[g.player.ntTeam]} 최종 명단이 발표됐다. 이름이 있다.\n\n` +
      `${club.name}(${club.league}) 소속\n${stat}\n\n${head}\n\n${lines}`;
  },
  choices: (g) => {
    if (!g.flags._wcIn) return [{ t: '"TV로 보자. 지금 할 수 있는 게 없어."', meta: '자신감 − · 독기 +', risk: 'SAFE', parent: -1, injury: 0, tags: [],
      fx: (gg) => { gg.player.confidence -= 10; gg.player.hidden.grit += 8; remember(gg, 'wc_missed', `${gg.world.year}년 월드컵 명단 탈락.`, 0.8); },
      out: () => '4년 뒤에는 서른이 넘는다. 그 계산을 하고 있는 자신이 싫었다.' }];
    return [{ t: '"나가자. 이거 하나 보고 여기까지 왔잖아."', meta: '빅매치 멘탈 판정', risk: 'MID', parent: 2, injury: 1, tags: [],
      fx: (gg) => {
        gg.player.ntLocked = true;
        const perf = gg.player.hidden.bigMatch + gg.rng.norm(0, 14);
        gg.player.career.caps += gg.rng.int(2, 6);
        if (perf > 70) {
          gg.player.reputation = clamp(gg.player.reputation + 18, 0, 100);
          gg.player.career.trophies.push(`${gg.world.year} 월드컵 활약`);
          gg.flags.wcHero = true; shiftReaction(gg, 2, '월드컵 활약');
          remember(gg, 'wc_hero', `${gg.world.year}년 월드컵에서 인생 경기를 했다.`, 1.0);
        } else if (perf < 40) {
          gg.player.reputation = clamp(gg.player.reputation - 8, 0, 100);
          remember(gg, 'wc_flop', `${gg.world.year}년 월드컵. 큰 무대에서 얼어붙었다.`, 0.9);
        } else remember(gg, 'wc_played', `${gg.world.year}년 월드컵 출전.`, 0.75);
      },
      out: (gg) => gg.flags.wcHero ? '90분 동안, 전 세계가 이 이름을 배웠다.'
        : hasMemory(gg, 'wc_flop') ? '빅매치 멘탈이라는 게 정말 있다는 걸 가장 나쁜 방식으로 확인했다.'
        : '월드컵에 나갔다. 그 사실은 남는다.' }];
  },
});

ev({
  id: 'catalonia_2017', once: true, when: (g) => g.world.year === 2017 && g.player.active && A(g) >= 20, w: () => 900,
  body: (g) => `2017년 10월. 카탈루냐 독립선언 파동으로 도시가 두 편으로 갈렸다.\n\n` +
    `기자들이 라커룸 앞에서 정치적 입장을 묻는다. 무슨 말을 해도 절반이 등을 돌린다.` +
    (ENV(g).immigrant ? '\n\n이민자 가정 출신이라는 점까지 같이 소환된다.' : ''),
  choices: () => [
    { t: '"말하자. 침묵도 어차피 대답으로 읽혀."', meta: '팔로워 ++ / 절반의 반발', risk: 'HIGH', parent: 0, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => { gg.player.reputation += gg.rng.chance(0.5) ? 8 : -8; gg.player.stress += 12; },
      out: () => '한쪽에서는 영웅이 됐고, 한쪽에서는 배신자가 됐다.' },
    { t: '"저는 축구 선수입니다 — 그 한 줄로 넘기자."', meta: '무난 · 스트레스 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['safe'],
      fx: (gg) => { gg.player.stress -= 4; },
      out: () => '가장 안전한 문장을 골랐다. 아무도 만족하지 않았지만 아무도 화내지 않았다.' },
  ],
});

ev({
  id: 'revenge', once: true, when: (g) => hasMemory(g, 'rejection') && g.player.active && g.player.club && g.player.club.div === 1 && A(g) >= 20, w: () => 300,
  body: (g) => {
    const m = getMemory(g, 'rejection');
    return `이번 주말 상대는 FC 바르셀로나다.\n\n${m.age}세였던 ${m.year}년, 그곳에서 떨어졌다.\n리포트에는 "지금 우리 시스템에 넣어야 할 필연성이 낮다"고 적혀 있었다.\n\n그때 평가서를 쓴 스카우트는 지금도 그 조직에 있다.`;
  },
  choices: () => [
    { t: '"이 경기에 다 걸자. 10년 기다렸어."', meta: '빅매치 멘탈 판정', risk: 'HIGH', parent: 1, injury: 1, tags: ['pride'],
      fx: (gg) => {
        const perf = gg.player.hidden.bigMatch + gg.player.hidden.grit * 0.4 + gg.rng.norm(0, 16);
        if (perf > 75) { gg.player.reputation += 14; gg.player.confidence += 20; gg.flags.revengeDone = true; remember(gg, 'revenge', `${gg.world.year}년, 나를 떨어뜨린 팀을 상대로 인생 경기를 했다.`, 0.95); }
        else { gg.player.confidence -= 10; remember(gg, 'revenge_fail', `${gg.world.year}년, 그 팀 앞에서 아무것도 못 했다.`, 0.8); }
      },
      out: (gg) => gg.flags.revengeDone
        ? '골을 넣고 관중석 쪽을 한참 봤다. 누구를 보는지는 나만 알았다.'
        : '90분 동안 공을 다섯 번 잡았다. 경기 후 아무도 그 얘기를 꺼내지 않았다.' },
    { t: '"평소처럼 하자. 20년 전 일이잖아."', meta: '스트레스 − · 폼 +', risk: 'SAFE', parent: 0, injury: 0, tags: ['discipline'],
      fx: (gg) => { gg.player.stress -= 8; gg.player.form += 5; },
      out: () => '경기가 끝나고 나서야, 손이 떨렸다는 걸 알았다.' },
  ],
});

ev({
  id: 'captaincy', once: true, when: (g) => A(g) >= 25 && g.player.active && g.player.club && g.npcs.coach.trust > 68 && g.player.reputation > 40, w: () => 130,
  body: (g) => `감독이 주장 완장을 제안한다. ${g.player.club.name}에서 가장 오래된 선수가 됐다는 뜻이기도 하다.`,
  choices: () => [
    { t: '"완장 받자. 이제 그럴 나이지."', meta: '빅매치 멘탈 + · 스트레스 +', risk: 'MID', parent: 2, injury: 0, tags: ['pride'],
      fx: (gg) => { gg.flags.captain = true; gg.player.hidden.bigMatch += 8; gg.player.reputation += 6; gg.player.stress += 12; gg.player.career.trophies.push(`${gg.player.club.name} 주장`); shiftReaction(gg, 1, '주장 선임'); },
      out: (gg) => { remember(gg, 'captain', `${gg.world.year}년 ${gg.player.club.name} 주장이 됐다.`, 0.8); return '완장을 차고 처음 라커룸에서 말을 했다. 목소리가 떨렸다.'; } },
    { t: '"거절하자. 내 경기부터 챙겨야 해."', meta: '스트레스 − · 신뢰 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['safe'],
      fx: (gg) => { gg.player.stress -= 6; gg.npcs.coach.trust -= 6; },
      out: () => '완장은 다른 선수에게 갔다.' },
  ],
});

ev({
  id: 'quit_temptation', when: (g) => A(g) >= 15 && A(g) <= 24 && g.player.willToPlay < 42 && g.player.active, w: () => 260,
  body: (g) => `축구를 계속할 이유를 못 찾겠다.\n\n출전 시간은 줄고, 몸은 아프고, 같이 시작한 애들 절반은 이미 그만뒀다.\n` +
    `${g.npcs.mother.name}이 조용히 다른 얘기를 꺼낸다.\n\n(축구 의지 ${round(g.player.willToPlay)}/100 · 학업 ${round(g.player.academic)}/100)`,
  choices: () => [
    { t: '"그만두자. 더 붙잡을 이유를 못 찾겠어."', meta: '커리어 종료', risk: 'HIGH', parent: 0, injury: 0, tags: ['safe'],
      fx: (gg) => { gg.player.active = false; gg.player.path.push(`${gg.world.year} 축구 중단`); remember(gg, 'quit', `${gg.world.year}년, ${A(gg)}세에 축구를 그만뒀다.`, 1.0); },
      out: () => '축구화를 신발장 맨 아래로 밀어 넣었다. 그날 밤 오래 잤다.' },
    { t: '"한 시즌만 더 해보자."', meta: '축구 의지 +18', risk: 'MID', parent: 0, injury: 0, tags: ['discipline'],
      fx: (gg) => { gg.player.willToPlay += 18; gg.player.stress += 6; },
      out: () => '"한 시즌만." 이 말을 앞으로 몇 번 더 하게 된다.' },
    { t: '"수준 낮춰서라도 뛰자. 벤치에서 썩는 게 더 무서워."', meta: '3부 이적 · 출전 확보', risk: 'SAFE', parent: -1, injury: 0, tags: ['adaptability'],
      fx: (gg) => {
        gg.player.willToPlay += 14;
        const low = CLUBS.filter((c) => c.nat === 'ESP' && c.div === 3);
        if (low.length) joinClub(gg, gg.rng.pick(low), { years: 3 });
      },
      out: () => '수준은 낮아졌다. 대신 매주 90분을 뛴다. 그것만으로 다른 사람이 된 것 같다.' },
  ],
});

ev({
  id: 'aging', when: (g) => A(g) >= 30 && g.player.active && g.player.club, w: () => 150,
  body: (g) => `만 ${A(g)}세. 회복이 느려졌다. 경기 다음 날 종아리가 이틀을 아프다.\n\n${g.player.club.name} · 현재 능력 ${ability(g)} · 누적 자산 ${fmtMoney(g.player.econ.assets)}`,
  choices: () => [
    { t: '"아직 안 밀렸어. 계속 붙자."', meta: '스트레스 + · 부상 위험 +', risk: 'HIGH', parent: 0, injury: 2, tags: ['pride'],
      fx: (gg) => { gg.player.stress += 12; gg.npcs.coach.trust -= 4; gg.player.hidden.injuryProne += 6; },
      out: () => '아직 진 게 아니다. 다만 예전보다 훨씬 아프다.' },
    { t: '"20분씩 나가는 것도 역할이지. 받아들이자."', meta: '신뢰 ++ · 부상 위험 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['adaptability'],
      fx: (gg) => { gg.npcs.coach.trust += 14; gg.player.stress -= 10; gg.player.hidden.injuryProne -= 6; gg.flags.veteran = true; },
      out: () => '20분씩 나가서 경기를 정리한다. 어린 선수들이 질문을 하러 온다.' },
  ],
});

ev({
  id: 'father_callback', once: true, when: (g) => A(g) >= 31 && hasMemory(g, 'promise_school'), w: () => 200,
  body: (g) => {
    const m = getMemory(g, 'promise_school');
    const f = g.npcs.father;
    return `${f.name}과 저녁을 먹는다. ${f.age1990 + (g.world.year - 1990)}세. 이제 그는 늙었다.\n\n` +
      `"${m.year}년에 네가 성적 유지한다고 해서 축구 시켜준 거 기억나냐."\n\n잠시 말이 없다가,\n\n"그때 내가 반대만 했으면… 지금 너는 어디 있었을까 싶다."`;
  },
  choices: () => [
    { t: '"아버지가 허락해줘서 여기까지 온 거예요."', meta: '스트레스 −− · 관계 회복', risk: 'SAFE', parent: 1, injury: 0, tags: ['family'],
      fx: (gg) => { gg.player.stress -= 14; gg.flags.fatherResolved = true; shiftReaction(gg, 1, '아버지와 화해'); },
      out: (gg) => { remember(gg, 'father_resolved', '아버지와 화해했다. 30년 걸렸다.', 0.95); return '아버지가 고개를 끄덕이고 접시를 치웠다. 그게 그 사람의 방식이다.'; } },
    { t: '"저는 허락 없어도 했을 거예요."', meta: '자존심 +', risk: 'MID', parent: 0, injury: 0, tags: ['pride'],
      fx: (gg) => { gg.player.trait.pride += 10; },
      out: () => '아버지가 웃었다. "그래, 너는 그랬겠지."' },
  ],
});

ev({
  id: 'retirement', when: (g) => A(g) >= 33 && g.player.active, w: (g) => 80 + (A(g) - 33) * 120 + (g.player.ovr < 58 ? 90 : 0),
  body: (g) => `만 ${A(g)}세. 은퇴를 생각하기 시작했다.\n\n통산 ${g.player.career.apps}경기 ${g.player.career.goals}골 ${g.player.career.assists}도움 · A매치 ${g.player.career.caps}경기\n누적 자산 ${fmtMoney(g.player.econ.assets)}`,
  choices: () => [
    { t: '"한 시즌 더 뛰자. 아직 걸을 수 있잖아."', meta: '능력 하락 계속', risk: 'MID', parent: 0, injury: 2, tags: ['pride'], fx: () => {}, out: () => '"마지막 한 시즌." 이 말도 몇 번째다.' },
    { t: '"이번 시즌으로 끝내자. 질질 끄는 건 싫어."', meta: '평판 + · 커리어 종료', risk: 'SAFE', parent: 0, injury: 0, tags: ['discipline'],
      fx: (gg) => { gg.flags.farewell = true; gg.player.reputation += 6; },
      out: () => '발표한 다음 경기, 원정 관중석에서도 박수가 나왔다.' },
    { t: '"자격증 준비하자. 축구 안에 남고 싶어."', meta: '은퇴 후 지도자 트랙', risk: 'SAFE', parent: 1, injury: 0, tags: ['adaptability'],
      fx: (gg) => { gg.flags.coachingLicense = true; gg.flags.farewell = true; },
      out: (gg) => { remember(gg, 'coaching', 'UEFA 지도자 코스를 시작했다.', 0.7); return '전술 노트를 다시 쓰기 시작했다. 이번에는 남을 위해서.'; } },
  ],
});

ev({
  id: 'after_quit',
  when: (g) => !g.player.active && !g.player.retired && A(g) <= 26 && !g.flags.injuryEnded && (g.flags.aqCount || 0) < 3,
  w: () => 9999,
  body: (g) => {
    const since = A(g) - (getMemory(g, 'quit')?.age ?? A(g));
    return since <= 1
      ? '축구를 그만뒀다. 처음 몇 달은 홀가분했고, 그 다음 몇 달은 견디기 어려웠다.'
      : `축구 없이 ${since}년을 살았다. 가끔 경기장 옆을 지나면 발이 멈춘다.`;
  },
  choices: (g) => {
    const list = [
      { t: '"뭐라도 배우자. 이대로 있으면 안 돼."', meta: '평범한 삶의 안전망 · 드물게 크게 성공', risk: 'SAFE', parent: 1, injury: 0, tags: ['safe'],
        fx: (gg) => {
          gg.flags.drifting = false;
          gg.player.econ.assets += 14000;
          // 크게 성공하는 경우는 소수다. 학업 기반과 가정의 자본이 확률을 만든다.
          const pSucc = clamp(0.10 + (gg.player.academic - 45) / 190 + gg.player.econ.household / 400, 0.04, 0.42);
          gg.flags.lifeTrack = gg.rng.chance(pSucc) ? 'SUCCESS' : 'NORMAL';
        },
        out: (gg) => gg.flags.lifeTrack === 'SUCCESS'
          ? '공을 놓은 손으로 다른 것을 잡았다. 몇 년 뒤 그게 더 커진다.'
          : '평범한 삶이 생각보다 나쁘지 않다.' },
      { t: '"동네 팀에서라도 차자. 그게 그냥 축구지."', meta: '스트레스 − · 평범한 트랙', risk: 'SAFE', parent: 0, injury: 0, tags: [],
        fx: (gg) => { gg.player.willToPlay += 14; gg.player.stress -= 10; gg.flags.drifting = false; gg.flags.lifeTrack = gg.flags.lifeTrack || 'NORMAL'; },
        out: () => '수요일 저녁 리그. 아무도 스카우트하지 않지만, 이게 축구다.' },
      { t: '"아무것도 하지 말자. 지금은 못 하겠어."', meta: '표류 · Bad End 위험', risk: 'HIGH', parent: -1, injury: 0, tags: [],
        fx: (gg) => { gg.player.stress += 14; gg.flags.drifting = true; gg.flags.lifeTrack = 'BAD'; },
        out: () => '낮과 밤이 뒤집혔다. 동네 사람들이 뭐라고 하는지는 안다.' },
    ];
    if (g.player.willToPlay > 52 && A(g) <= 23 && g.player.ovr > 42) list.push({
      t: '다시 도전한다. 3부 트라이아웃.', meta: '성공 확률 능력 의존', risk: 'HIGH', parent: 0, injury: 1, tags: ['ambition', 'risk'],
      fx: (gg) => {
        if (gg.rng.chance(0.3 + (gg.player.ovr - 50) / 90)) {
          gg.player.active = true; gg.flags.drifting = false;
          joinClub(gg, gg.rng.pick(CLUBS.filter((c) => c.nat === 'ESP' && c.div === 3)), { years: 2 });
          remember(gg, 'comeback', `${gg.world.year}년, 축구로 돌아왔다.`, 0.9);
        } else gg.player.willToPlay -= 20;
      },
      out: (gg) => gg.player.active ? '3부 계약. 주급은 아르바이트 수준이다. 다시 선수다.' : '트라이아웃에서 떨어졌다. 이번에는 담담했다.' });
    return list;
  },
});

/* ─────────────────────────── 12-b. 역사 이벤트의 영향 설명 ─────────────────── */

/**
 * 역사 이벤트가 이번 기간에 실제로 무엇을 바꾸는지 서술한다.
 * 여기 적히는 항목은 전부 엔진에 실제로 구현된 효과여야 한다 —
 * 설명과 동작이 어긋나면 그게 더 나쁘다.
 */
function historyImpact(g, h) {
  const y = g.world.year;
  const p = g.player;
  const f = g.npcs.father;
  const L = [];

  if (h.money && h.money < 0) {
    L.push(`가계 ${h.money} → 현재 가계 ${round(p.econ.household)}/100. ` +
      `${f.name}의 일(${f.status === '실직' ? '실직 상태' : f.job})이 직접 영향권에 들어간다.`);
    if (p.econ.household < 30) L.push('가계가 30 미만이라, 앞으로의 선택에서 안전한 쪽(돈)이 계속 끌어당긴다.');
  } else if (h.money && h.money > 0) {
    L.push(`가계 +${h.money} → 현재 ${round(p.econ.household)}/100. 일자리가 늘어난다.`);
  }
  if (h.boom) L.push(`축구 열기 +${h.boom} — 유소년 등록과 스카우팅 활동이 늘어난다.`);

  const clim = marketClimate(g);
  if (clim.global) {
    L.push(`이적시장 동결 — 팀 평균 ${BIG_CLUB_AVG} 미만 구단의 오퍼가 대부분 사라진다. ` +
      `돈이 있는 빅클럽만 예외다.`);
    L.push('재계약 주급 동결 — 빅클럽 소속이 아니면 이번 재계약에서 인상이 없다.');
  }
  if (clim.domestic) {
    L.push('스페인 구단 자금난 — 자국 오퍼가 줄고 해외 오퍼가 늘어난다. ' +
      '구단이 나를 붙잡을 이유도 줄어서 이적 거부율이 내려간다.');
  }
  if (y === 2020) L.push('무관중·일정 중단 — 이번 시즌 경기 수와 주급 모두 영향을 받는다.');
  if (y === 2023) {
    L.push('사우디 리그 자금 유입 — 능력 80 이상이면 나이와 무관하게, ' +
      '현 주급의 5배 규모 제안이 들어올 수 있다.');
  }
  if (WORLD_CUP_YEARS.includes(y) || EURO_YEARS.includes(y)) {
    L.push(p.ntTeam
      ? `${NT_NAME[p.ntTeam]} 대표팀 소속 — 이번 대회 성적이 평판과 발롱도르 판정에 직접 반영된다.`
      : '대표팀에 뽑히지 않은 상태다 — 이번 대회는 나와 무관하게 지나간다.');
  }
  return L;
}

/**
 * 프로 진입 실패 → 3부 세미프로. 성장 속도 절반, 24세까지 1·2부 이적 불가.
 * 그 전에 벗어나는 길은 하나뿐이다 — 소속팀과 함께 승격하는 것 (clearSemiPro).
 */
function enterSemiPro(g) {
  // 게이트에서 떨어진 선수가 3부 상위권 팀에 갈 리 없다. 명성이 낮은 쪽으로 기운다.
  const low = CLUBS.filter((c) => c.nat === 'ESP' && c.div === 3 && !c.youth);
  const club = g.rng.weighted(low.map((c) => ({ w: clamp(40 - c.rep, 4, 40), v: c }))).v;
  joinClub(g, club, { years: 3 });
  g.flags.semiProUntil = g.world.year + 6;
  g.flags.semiProLock = true;
  remember(g, 'semipro', `${g.world.year}년, 1·2부 계약에 실패해 3부에서 시작했다.`, 0.9);
}

/** 팀과 함께 3부를 벗어나면 세미프로 신분이 끝난다 (성장 페널티·이적 제한 동시 해제) */
function clearSemiPro(g, club) {
  if (!g.flags.semiProLock || club.div > 2) return;
  g.flags.semiProLock = false;
  g.flags.semiProUntil = 0;
  pushLog(g, 'season', `팀과 같이 올라왔다. 세미프로 계약이 ${club.league} 정식 계약으로 바뀐다.`);
  remember(g, 'semipro_out', `${g.world.year}년, ${club.name}와 함께 3부를 벗어났다.`, 0.85);
}

/* ─────────────────────────── 13. 턴 루프 ─────────────────────────── */

function eligible(g) {
  const out = [];
  for (const e of EVENTS) {
    if (e.once && g.flags[`_done_${e.id}`]) continue;
    let ok = false; try { ok = e.when(g); } catch { ok = false; }
    if (!ok) continue;
    let w = 0; try { w = e.w(g); } catch { w = 0; }
    if (w > 0) out.push({ w, e });
  }
  return out;
}
function setPending(g, e) {
  if (e.once) g.flags[`_done_${e.id}`] = true;
  if (e.id === 'after_quit') g.flags.aqCount = (g.flags.aqCount || 0) + 1;
  g.pending = { id: e.id, body: e.body(g), choices: e.choices(g), _after: e.after };
}

export function beginTurn(g) {
  if (g.over) return g;
  g.turn++;
  const age = ageOf(g);
  pushLog(g, 'period', periodLabel(g));

  // ── 문제 5 수정: 임대 만료 시 원소속으로 복귀한다 (이전에는 임대처에 영구 잔류)
  if (g.player.loanFrom && g.world.phase === 'SUMMER' && g.world.year >= (g.player.loanUntil ?? 0)) {
    // 무소속이 된 상태(계약 거절 등)에서는 복귀할 임대가 성립하지 않는다
    if (!g.player.club) { g.player.loanFrom = null; g.player.loanUntil = null; }
  }
  if (g.player.loanFrom && g.world.phase === 'SUMMER' && g.world.year >= (g.player.loanUntil ?? 0)) {
    const from = g.player.loanFrom;
    const back = CLUBS.find((c) => c.id === from.id) || from;
    const loanClub = g.player.club;
    g.player.loanFrom = null; g.player.loanUntil = null;
    g.player.club = { ...back };
    g.player.contractUntil = Math.max(g.player.contractUntil || 0, g.world.year + 1);
    g.npcs.coach = { trust: clamp(46 + g.rng.norm(0, 9), 10, 88) };
    g.player.path.push(`${g.world.year} ${back.name} 복귀`);
    pushLog(g, 'transfer',
      `임대 종료 — ${loanClub.name}에서 ${back.name}으로 복귀했다.\n` +
      `팀 평균 ${teamAvgAt(back, g.world.year)} · 내 능력 ${ability(g)}. 감독은 처음부터 다시 봐야 한다.`);
    setNews(g, `${g.world.year}년: 임대를 마치고 ${back.name}으로 복귀했다.`);
  }

  const h = HISTORY[g.world.year];
  if (h && g.world.phase === 'SUMMER' && !g.flags[`_h${g.world.year}`]) {
    g.flags[`_h${g.world.year}`] = true;
    if (h.money) g.player.econ.household = clamp(g.player.econ.household + h.money, 0, 100);
    if (h.boom) g.world.boom += h.boom;
    const impact = historyImpact(g, h);
    pushLog(g, 'history',
      h.t.map((x) => `◆ ${x}`).join('\n') +
      (impact.length ? `\n\n[이번 기간에 미치는 영향]\n` + impact.map((x) => `· ${x}`).join('\n') : ''));
  }

  // 부모 상태 갱신 — 실직 후 재취업하거나, 나이가 차면 은퇴한다
  const fa = g.npcs.father.age1990 + (g.world.year - 1990);
  if (g.npcs.father.status === '실직' && g.world.year - (g.npcs.father.statusYear || 0) >= 2) {
    if (fa >= 65) { g.npcs.father.status = '은퇴'; pushLog(g, 'parent', `아버지가 일을 완전히 놓았다. ${fa}세.`); }
    else if (g.rng.chance(0.35)) {
      g.npcs.father.status = '재취업';
      g.npcs.father.job = g.rng.pick(FAMILY_ENVS[g.player.env].jobs);
      pushLog(g, 'parent', `아버지가 다시 일을 구했다. ${g.npcs.father.job}. 예전 급여의 절반이다.`);
    }
  } else if (!g.npcs.father.status && fa >= 66) {
    g.npcs.father.status = '은퇴';
  }

  // 아버지 고용은 매년 확률적으로 움직인다 (경제 상태가 압력을 만든다)
  if (g.world.phase === 'SUMMER' && ageOf(g) >= 17 && g.npcs.father.status !== '은퇴') {
    const clim = marketClimate(g);
    const pressure = (clim.global ? 40 : 0) + (clim.domestic ? 25 : 0);
    if (g.rng.chance(pressure > 0 ? 0.30 : 0.07)) {
      const r = rollFatherEmployment(g, pressure);
      if (r && r.key !== 'KEEP') pushLog(g, 'parent', `아버지 — ${r.label}. 가계 ${r.hit} → ${round(g.player.econ.household)}/100`);
    }
  }

  applyGrowth(g);
  simulatePeriod(g);
  if (g.flags.wageBump) { g.player.econ.wageYear = round(g.player.econ.wageYear * g.flags.wageBump); g.flags.wageBump = 0; }
  nationalTeamCheck(g);

  if (age >= 37 || (g.flags.farewell && g.flags._farewellDone && g.world.phase === 'SUMMER')) return finish(g);
  if (g.flags.farewell) g.flags._farewellDone = true;
  if (!g.player.active && (age >= 27 || g.flags.injuryEnded)) return finish(g);

  return pickEvent(g);
}

/** 현재 상태로 이번 턴의 이벤트를 고른다. 지문·선택지는 이 시점의 능력치로 만들어진다. */
function pickEvent(g) {
  const age = ageOf(g);
  const picked = g.rng.weighted(eligible(g));
  if (!picked) {
    if (age <= 11) { pushLog(g, 'system', '별일 없이 한 해가 지나갔다.'); advanceClock(g); return beginTurn(g); }
    g.pending = { id: 'quiet', body: '특별한 일 없이 지나갔다. 커리어의 대부분은 이런 기간이다.',
      choices: [{ t: '"넘기자."', risk: 'SAFE', parent: 0, injury: 0, tags: [], fx: () => {}, out: () => '' }] };
    return g;
  }
  setPending(g, picked.e);
  return g;
}

const CHAIN = ['trial_result', 'youth_offers', 'after_quit', 'transfer_request', 'holdout'];

export function choose(g, index) {
  if (g.over || !g.pending) return g;
  const ch = g.pending.choices[index];
  if (!ch) return g;

  pushLog(g, 'event', g.pending.body);
  pushLog(g, 'choice', `▸ ${ch.t}`);

  const map = { ambition: 'ambition', pride: 'pride', family: 'loyalty', loyalty: 'loyalty', risk: 'risk', adaptability: 'adaptability' };
  for (const tag of ch.tags || []) {
    const k = map[tag];
    if (k) g.player.trait[k] = clamp(g.player.trait[k] + 4, 0, 100);
    if (tag === 'safe') g.player.trait.risk = clamp(g.player.trait.risk - 3, 0, 100);
  }

  try { ch.fx(g); } catch {}
  let out = ''; try { out = ch.out(g) || ''; } catch {}
  if (out) pushLog(g, 'outcome', out);

  const after = g.pending._after;
  g.pending = null;
  if (after) { try { after(g); } catch {} }

  const hd = g.player.hidden;
  for (const k of ['injuryProne', 'bigMatch', 'adaptability', 'grit', 'absorption', 'consistency', 'pro']) hd[k] = clamp(hd[k], 3, 99);
  g.player.willToPlay = clamp(g.player.willToPlay, 0, 100);
  g.player.stress = clamp(g.player.stress, 0, 100);
  g.player.confidence = clamp(g.player.confidence, 0, 100);
  g.player.fitness = clamp(g.player.fitness, 20, 100);
  g.player.academic = clamp(g.player.academic, 0, 100);

  const chain = EVENTS.find((e) => {
    if (!CHAIN.includes(e.id)) return false;
    if (e.once && g.flags[`_done_${e.id}`]) return false;
    try { return e.when(g); } catch { return false; }
  });
  if (chain) { setPending(g, chain); return g; }

  advanceClock(g);
  return beginTurn(g);
}

/** 유년기를 건너뛰고 18세로 점프 */
export function skipToEighteen(g) {
  let guard = 0;
  while (!g.over && ageOf(g) < 18 && guard++ < 200) autoStep(g);
  return g;
}

/* ─────────────────────────── 14. 엔딩 (36 매트릭스) ─────────────────────────── */

export function peakSeniorDiv(g) {
  return g.player.career.seasons.reduce((b, s) => (s.senior && s.age >= 17 && s.apps >= 8 ? Math.min(b, s.div) : b), 9);
}
function peakClubRep(g) {
  return g.player.career.seasons.reduce((b, s) => {
    if (!s.senior || s.age < 17 || s.apps < 8) return b;
    const c = CLUBS.find((x) => x.name === s.club);
    return c ? Math.max(b, c.rep) : b;
  }, 0);
}

/** 프로 6티어 + 미진출 3종 = 9 티어 */
export const TIERS = {
  T1: { t: 'Tier 1 · All-Time GOAT', d: '세대의 기준이 된 선수. 이 이름 없이는 이 시대의 축구를 설명할 수 없다.' },
  T2: { t: 'Tier 2 · Global Megastar', d: '빅클럽의 주축이자 대표팀의 얼굴. 전 세계가 이름을 안다.' },
  T3: { t: 'Tier 3 · 대륙급 에이스', d: '유럽 1부의 확실한 주전. 국가대표에서도 자리를 잡았다.' },
  T4: { t: 'Tier 4 · 1부 리그 스타터', d: '1부 무대에서 커리어를 완주했다. 그 문턱을 넘는 사람이 몇 안 된다.' },
  T5: { t: 'Tier 5 · 하부리그 저니맨', d: '2·3부를 오가며 축구로 먹고살았다. 아무도 다큐를 찍지 않는 커리어.' },
  T6: { t: 'Tier 6 · 로컬 벤치 워머', d: '프로 계약서에 서명은 했다. 대부분의 시간은 벤치에 있었다.' },
  NP_BAD: { t: 'Bad End · 뒷골목', d: '축구가 사라진 자리에 아무것도 들어오지 않았다.' },
  NP_NORMAL: { t: 'Normal End · 평범한 생활인', d: '축구는 어린 시절의 일이 됐다. 그게 실패라고 말할 사람은 없다.' },
  NP_SUCCESS: { t: 'Success End · 타 분야 성공', d: '공을 놓은 뒤에 오히려 크게 됐다. 인생은 축구보다 길었다.' },
};

/** 4개 가정환경 그룹 × 9 티어 = 36개 엔딩 셀 */
const GROUP_LABEL = {
  IMM_LOW: '이민자 하위·다문화',
  IMM_HIGH: '이민자 중상위',
  LOC_LOW: '원주민 하위·중위',
  LOC_HIGH: '원주민 상위',
};
const EPILOGUE = {
  T1: {
    IMM_LOW: '서류 확인을 두 번 받던 아이가, 이 나라 축구의 상징이 됐다. 부모가 처음 도착한 항구에 그의 이름을 딴 유소년 센터가 세워졌다.',
    IMM_HIGH: '가문의 명예를 공부로 증명하라던 집에서, 다른 방식으로 그것을 증명했다. 아버지는 결국 모든 경기 티켓을 모았다.',
    LOC_LOW: '동네 광장의 그 벽에 명판이 붙었다. "여기서 시작했다."',
    LOC_HIGH: '기품 없는 직업이라던 집안이, 이제 그 이름으로 불린다.',
  },
  T2: {
    IMM_LOW: '두 개의 여권을 가진 아이가 두 나라의 자랑이 됐다. 어느 쪽에서도 완전히 자기 편은 아니었지만.',
    IMM_HIGH: '이민 1세대가 세운 사업보다, 2세대가 세운 이름이 더 커졌다.',
    LOC_LOW: '가난이 익숙했던 집에 이제 걱정이 없다. 그 사실에 적응하는 데 몇 년이 걸렸다.',
    LOC_HIGH: '엘리트 가문이 축구를 인정하게 만들었다. 그것도 하나의 승리다.',
  },
  T3: {
    IMM_LOW: '1부 리그의 주전. 이민자 가정의 아이가 여기까지 온 것은 통계적으로 거의 일어나지 않는 일이다.',
    IMM_HIGH: '안정을 원했던 부모가 이제는 원정 경기까지 따라온다.',
    LOC_LOW: '동네에서 가장 성공한 사람이 됐다. 그 동네를 떠나지는 않았다.',
    LOC_HIGH: '집안의 기대와는 다른 트랙이었지만, 결국 같은 계층에 도착했다.',
  },
  T4: {
    IMM_LOW: '1부 무대를 밟았다. 그 사실 하나로 동네 아이들의 진로 계산이 바뀌었다.',
    IMM_HIGH: '"공부를 했어야 했다"는 말은 더 이상 나오지 않는다.',
    LOC_LOW: '축구로 집을 샀다. 아버지가 평생 못 한 일이었다.',
    LOC_HIGH: '집안에서는 여전히 "그 정도면 됐다"고 말한다. 본인은 다르게 생각한다.',
  },
  T5: {
    IMM_LOW: '화려하지 않았다. 다만 축구로 가족을 먹였고, 그게 원래 목표였다.',
    IMM_HIGH: '부모가 옳았을지도 모른다. 그래도 후회는 하지 않는다.',
    LOC_LOW: '2부와 3부를 오갔다. 매주 90분을 뛰는 삶이었다.',
    LOC_HIGH: '집안의 우려가 절반은 맞았다. 절반은 틀렸다.',
  },
  T6: {
    IMM_LOW: '프로 계약서에 서명했다는 사실만은 남았다. 그것도 아무나 하는 게 아니다.',
    IMM_HIGH: '결국 학위가 더 쓸모 있었다. 그래도 벤치에서 본 1부 경기장은 기억에 남는다.',
    LOC_LOW: '벤치가 대부분이었다. 그래도 프로였다.',
    LOC_HIGH: '짧게 프로였다가 집안 사업으로 돌아갔다.',
  },
  NP_BAD: {
    IMM_LOW: '축구가 유일한 탈출구였고, 그 문이 닫혔다. 돌아갈 곳이 원래 없었다.',
    IMM_HIGH: '집안의 기대와 자신의 실패 사이에서 오래 표류했다.',
    LOC_LOW: '동네를 벗어나지 못했다. 광장에는 아직 그 벽이 있다.',
    LOC_HIGH: '가진 것이 많았는데도 방향을 찾지 못했다. 그게 더 오래 아팠다.',
  },
  NP_NORMAL: {
    IMM_LOW: '부모가 원했던 안정을 결국 손에 넣었다. 축구는 어린 시절의 일이 됐다.',
    IMM_HIGH: '집안이 처음부터 원했던 길로 돌아갔다. 나쁘지 않은 삶이다.',
    LOC_LOW: '평범한 직장, 평범한 주말. 일요일에는 여전히 경기를 본다.',
    LOC_HIGH: '예정된 트랙으로 복귀했다. 아무도 그것을 실패라고 부르지 않았다.',
  },
  NP_SUCCESS: {
    IMM_LOW: '축구를 놓은 손으로 다른 것을 잡았고, 그게 더 크게 됐다. 이민 1세대의 계획보다 멀리 갔다.',
    IMM_HIGH: '가문이 원한 트랙에서 정점을 찍었다. 축구는 좋은 이야기거리가 됐다.',
    LOC_LOW: '스물넷에 시작한 일이 마흔에 회사가 됐다. 유소년 팀을 하나 후원하고 있다.',
    LOC_HIGH: '집안의 자산을 몇 배로 키웠다. 사무실에는 열두 살 때의 팀 사진이 걸려 있다.',
  },
};

export function classify(g) {
  const p = g.player;
  const div = peakSeniorDiv(g);
  const rep = peakClubRep(g);
  const apps = p.career.apps;
  const peakRep = p.peakReputation || 0;

  // 프로 미진출 — 성인 무대에서 25경기도 뛰지 못한 인생
  if (div === 9 || apps < 25) {
    const track = g.flags.lifeTrack;
    if (track === 'BAD' || g.flags.drifting) return 'NP_BAD';
    if (track === 'SUCCESS') return 'NP_SUCCESS';
    if (track === 'NORMAL') return 'NP_NORMAL';
    // 진로를 정하는 이벤트를 만나지 못한 경우 (부상 은퇴 등) 는 학업/자산으로 갈린다
    if (p.academic > 70 || p.econ.assets > 100000) return 'NP_SUCCESS';
    return 'NP_NORMAL';
  }
  // 프로 6티어
  // T1은 발롱도르로 잠근다 — 난이도를 낮춰도 GOAT가 흔해지지 않게
  if (p.awards.ballonDor >= 1) return 'T1';
  if (div === 1 && rep >= 87 && peakRep > 74 && apps > 380) return 'T2';   // 빅클럽 주축
  if (div === 1 && apps > 285) return 'T3';                                  // 1부 정착
  if (div === 1 && apps > 40) return 'T4';                                   // 1부를 밟았으나 정착 실패
  if (apps > 200) return 'T5';
  return 'T6';
}

export function finish(g) {
  const p = g.player;
  g.over = true; p.retired = true;
  const key = classify(g);
  const tier = TIERS[key];
  const group = FAMILY_ENVS[p.env].group;

  const turning = g.memories.slice().sort((a, b) => b.importance - a.importance)[0];
  const regret = g.memories
    .filter((m) => ['major_injury', 'wc_flop', 'revenge_fail', 'quit', 'no_money_youth', 'crisis_safe', 'wc_missed'].includes(m.tag))
    .sort((a, b) => b.importance - a.importance)[0];

  g.ending = {
    key, group,
    t: tier.t, d: tier.d,
    epilogue: (EPILOGUE[key] && EPILOGUE[key][group]) || '',
    groupLabel: GROUP_LABEL[group],
    cell: `${key} × ${group}`,
    bio: {
      name: p.name, span: `1990–${g.world.year}`,
      env: FAMILY_ENVS[p.env].label + (p.immigrantBg ? ` · ${p.immigrantBg} 출신` : ''),
      personality: PARENT_PERSONALITIES[p.personality].label,
      reaction: REACTIONS[g.world.reaction].label,
      father: `${g.npcs.father.name} — ${g.npcs.father.job}`,
      mother: `${g.npcs.mother.name} — ${g.npcs.mother.job}`,
      position: POSITIONS[p.position].label,
      apps: p.career.apps, goals: p.career.goals, assists: p.career.assists,
      caps: p.career.caps, ntGoals: p.career.ntGoals,
      ntTeam: p.ntTeam ? NT_NAME[p.ntTeam] : '없음',
      trophies: p.career.trophies,
      awards: p.awards,
      injuries: p.career.injuries || [],
      debt: p.econ.debt > 0 ? fmtMoney(p.econ.debt) : '없음',
      totalEarned: fmtMoney(p.econ.totalEarned),
      assets: fmtMoney(p.econ.assets),
      peakSalary: fmtWeekly(Math.max(0, ...p.career.seasons.map((s) => s.salary || 0))),
      peakOvr: round(p.peakOvr), finalOvr: round(p.ovr),
      revealedPotential: p.hidden.potential,
      unrealized: Math.max(0, round(p.hidden.potential - p.peakOvr)),
      turning: turning ? `${turning.year}년 — ${turning.text}` : '없음',
      regret: regret ? `${regret.year}년 — ${regret.text}` : '없음',
      memories: g.memories.slice().sort((a, b) => a.year - b.year),
      table: careerTable(g),
    },
  };
  pushLog(g, 'header', `커리어 종료 — ${tier.t}`);
  pushLog(g, 'system', tier.d);
  if (g.ending.epilogue) pushLog(g, 'outcome', g.ending.epilogue);
  g.pending = null;
  return g;
}

/** 시즌별 커리어 표. 반년 단위 시즌은 같은 시즌으로 합산한다. */
export function careerTable(g) {
  const rows = new Map();
  for (const s of g.player.career.seasons) {
    if (!s.senior) continue;
    const start = s.phase === 'WINTER' ? s.year - 1 : s.year;
    const key = `${start}:${s.club}`;
    const prev = rows.get(key);
    if (prev) {
      prev.apps += s.apps; prev.goals += s.goals; prev.assists += s.assists;
      prev.rating = +(((prev.rating * prev._n) + s.rating) / (prev._n + 1)).toFixed(2);
      prev._n += 1;
      prev.salary = Math.max(prev.salary, s.salary);
      if (s.finish) { prev.finish = s.finish; prev.size = s.size; }
      if (s.ucl) prev.ucl = s.ucl;
      if (s.ntCaps) { prev.ntCaps = s.ntCaps; prev.ntName = s.ntName; }
      if (s.ntResult) prev.ntResult = s.ntResult;
      for (const a of s.ach) if (!prev.ach.includes(a)) prev.ach.push(a);
    } else {
      rows.set(key, {
        season: `${start}/${String((start + 1) % 100).padStart(2, '0')}`,
        age: s.age, club: s.club, league: s.league, div: s.div,
        apps: s.apps, goals: s.goals, assists: s.assists, rating: s.rating,
        salary: s.salary, ach: [...s.ach], _n: 1,
        finish: s.finish, size: s.size, ucl: s.ucl, ntCaps: s.ntCaps, ntName: s.ntName, ntResult: s.ntResult,
      });
    }
  }
  return [...rows.values()].map((r) => {
    delete r._n;
    return {
      ...r,
      salaryText: r.salary ? fmtWeekly(r.salary) : '-',
      finishText: r.finish ? `${r.finish}위/${r.size}` : '-',
      uclText: r.ucl || '-',
      ntText: r.ntResult
        ? `${r.ntResult}${r.ntCaps ? ` · ${r.ntCaps}경기` : ''}`
        : (r.ntCaps ? `${r.ntName} ${r.ntCaps}경기` : '-'),
    };
  });
}

/* ─────────────────────────── 15. 대시보드 ─────────────────────────── */

export function dashboard(g) {
  const p = g.player;
  const abil = ability(g);
  const r = REACTIONS[g.world.reaction];
  return {
    backstory: g.backstory || '',
    period: periodLabel(g), age: ageOf(g), name: p.name,
    nationality: p.immigrantBg ? `스페인 (${p.immigrantBg} 배경)` : '스페인',
    position: POSITIONS[p.position].label,
    club: p.club ? `${p.club.name}${p.loanFrom ? ` (${p.loanFrom.name} 임대)` : ''}` : '무소속',
    // 리그명에 이미 "(3부)" 같은 표기가 있으면 티어를 중복 표기하지 않는다
    league: p.club ? (/\d부/.test(p.club.league) ? p.club.league : `${p.club.league} · ${DIV_LABEL[p.club.div]}`) : '-',
    ability: abil, abilityLabel: abilityLabel(abil), potential: '????',
    form: round(p.form),
    condition: `${round(p.fitness)}%`,
    health: p.injuryWeeks > 0 ? `부상 ${round(p.injuryWeeks)}주` : '건강',
    mental: p.stress > 70 ? '불안' : p.confidence > 70 ? '최상' : p.confidence > 45 ? '보통' : '흔들림',
    family: {
      env: FAMILY_ENVS[p.env].label,
      personality: PARENT_PERSONALITIES[p.personality].label,
      reaction: r.label, reactionIdx: g.world.reaction, reactionBlurb: r.blurb,
      father: `${g.npcs.father.name} · ${g.npcs.father.status ? `${g.npcs.father.status}${g.npcs.father.status === '재취업' ? ` (${g.npcs.father.job})` : ''}` : g.npcs.father.job}`,
      mother: `${g.npcs.mother.name} · ${g.npcs.mother.job}`,
      household: g.player.econ.household >= 65 ? '안정' : g.player.econ.household >= 38 ? '보통' : '어려움',
    },
    econ: {
      wage: p.econ.wageYear ? fmtWeekly(p.econ.wageYear) : '-',
      wageYearly: p.econ.wageYear ? fmtMoney(p.econ.wageYear) : '-',
      assets: fmtMoney(p.econ.assets),
      debt: p.econ.debt > 0 ? `${fmtMoney(p.econ.debt)} (이자 ${Math.round(p.econ.debtRate * 100)}%)` : '없음',
      hasDebt: p.econ.debt > 0,
    },
    teamAvg: p.club && !p.club.youth ? teamAvgAt(p.club, g.world.year) : null,
    fit: p.club && !p.club.youth ? fitLabel(g, p.club).label : null,
    awards: p.awards,
    sibling: g.npcs.sibling ? `${g.npcs.sibling.name} — ${{ STABLE: '안정', DRIFT: '이탈', SLUM: '슬럼', INCIDENT: '사건 이후', RECOVER: '회복', PRISON: '수감', DEAD: '사망' }[g.npcs.sibling.state]}` : '-',
    injuries: (p.career.injuries || []).slice(-3),
    coach: g.npcs.coach.unknown ? '(미정)' : String(round(g.npcs.coach.trust)),
    contract: p.contractUntil ? `${p.contractUntil}년까지` : '-',
    career: { apps: p.career.apps, goals: p.career.goals, assists: p.career.assists, caps: p.career.caps, reputation: round(p.reputation) },
    table: careerTable(g),
    climate: marketClimate(g).notes,
    news: g.news.slice(0, 5),
    trophies: p.career.trophies.slice(-6),
  };
}

/* ─────────────────────────── 16. 자동 플레이 / 배치 ─────────────────────────── */

function scoreChoice(g, ch) {
  const t = g.player.trait;
  let s = 10 + g.rng.norm(0, 3);
  for (const tag of ch.tags || []) {
    if (tag === 'ambition') s += (t.ambition - 45) * 0.22;
    if (tag === 'pride') s += (t.pride - 45) * 0.18;
    if (tag === 'family' || tag === 'loyalty') s += (t.loyalty - 45) * 0.20;
    if (tag === 'risk') s += (t.risk - 50) * 0.20;
    if (tag === 'adaptability') s += (t.adaptability - 45) * 0.18;
    if (tag === 'discipline') s += 2;
    if (tag === 'safe') s += (55 - t.risk) * 0.16 + (g.player.econ.household < 30 ? 3 : 0);
  }
  return s;
}

export function autoStep(g) {
  if (g.over || !g.pending) return g;
  const scored = g.pending.choices.map((c, i) => ({ i, s: scoreChoice(g, c) }));
  scored.sort((a, b) => b.s - a.s);
  return choose(g, g.rng.chance(0.72) ? scored[0].i : g.rng.pick(scored).i);
}

export function autoPlay(g, maxTurns = 400) {
  let n = 0;
  while (!g.over && n++ < maxTurns) autoStep(g);
  if (!g.over) finish(g);
  return g;
}

export function batch(n = 1000, opts = {}) {
  const counts = {}, envs = {}, cells = {}, samples = [];
  const base = opts.seed ?? 12345;
  for (let i = 0; i < n; i++) {
    const g = newGame({ ...opts, seed: (base + i * 7919) | 0 });
    autoPlay(g);
    counts[g.ending.key] = (counts[g.ending.key] || 0) + 1;
    envs[g.player.env] = (envs[g.player.env] || 0) + 1;
    cells[g.ending.cell] = (cells[g.ending.cell] || 0) + 1;
    if (samples.length < (opts.keepSamples ?? 10)) {
      samples.push({
        seed: g.seed, name: g.player.name, ending: g.ending.key, tier: g.ending.t,
        env: FAMILY_ENVS[g.player.env].label, pers: PARENT_PERSONALITIES[g.player.personality].label,
        react: REACTIONS[g.world.reaction].label,
        pot: g.player.hidden.potential, peak: round(g.player.peakOvr),
        apps: g.player.career.apps, goals: g.player.career.goals, caps: g.player.career.caps,
        path: g.player.path.join(' → '),
      });
    }
  }
  return { n, counts, envs, cells, samples };
}

export const _internal = { EVENTS, LEAGUES, growthCurve, developmentCeiling, salaryFor, GROUP_LABEL, EPILOGUE };
