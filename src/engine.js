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
const LEAGUES = [
  { id: 'esp1', name: '라리가', nat: 'ESP', div: 1, home: true, clubs: [
    ['Real Madrid', 97], ['FC Barcelona', 96], ['Atlético Madrid', 88], ['Sevilla FC', 82],
    ['Valencia CF', 80], ['Villarreal CF', 78], ['Real Sociedad', 77], ['Athletic Club', 77],
    ['Real Betis', 75], ['Girona FC', 70], ['RCD Espanyol', 70], ['RC Celta de Vigo', 69],
    ['Getafe CF', 68], ['CA Osasuna', 68], ['RCD Mallorca', 66], ['Rayo Vallecano', 65],
    ['Deportivo Alavés', 63], ['UD Las Palmas', 62], ['Cádiz CF', 60], ['UD Almería', 58],
  ] },
  { id: 'esp2', name: '세군다 디비시온', nat: 'ESP', div: 2, home: true, clubs: [
    ['Deportivo La Coruña', 66], ['Real Zaragoza', 64], ['Real Valladolid', 63],
    ['Sporting de Gijón', 62], ['Levante UD', 62], ['Racing de Santander', 61],
    ['Málaga CF', 61], ['SD Eibar', 60], ['Elche CF', 58], ['Real Oviedo', 57],
    ['CD Leganés', 56], ['CD Tenerife', 55], ['SD Huesca', 55], ['FC Cartagena', 52],
    ['Albacete Balompié', 52], ['Burgos CF', 50], ['CD Mirandés', 48], ['CD Castellón', 47],
    ['FC Andorra', 46], ['Racing de Ferrol', 45], ['CD Eldense', 44], ['SD Amorebieta', 43],
  ] },
  { id: 'esp3', name: '프리메라 RFEF (3부)', nat: 'ESP', div: 3, home: true, clubs: [
    ['Real Murcia', 45], ['Gimnàstic de Tarragona', 44], ['AD Alcorcón', 45],
    ['CD Lugo', 43], ['Cultural Leonesa', 42], ['SD Ponferradina', 42],
    ['Sevilla Atlético', 41], ['CE Sabadell', 40], ['Villarreal CF B', 40],
    ['Betis Deportivo', 39], ['CA Osasuna B', 38], ['Barakaldo CF', 38],
    ['Algeciras CF', 38], ['CD Alcoyano', 37], ['Terrassa FC', 36],
    ['Unionistas de Salamanca', 36], ['Marbella FC', 35], ['Linares Deportivo', 35],
    ['CF Talavera', 34], ['Antequera CF', 33], ['UE Cornellà', 33], ['CE Europa', 32],
  ] },
  { id: 'eng1', name: '프리미어리그', nat: 'ENG', div: 1, clubs: [
    ['Manchester City', 96], ['Liverpool', 94], ['Arsenal', 92], ['Manchester United', 90],
    ['Chelsea', 89], ['Tottenham Hotspur', 86], ['Newcastle United', 82], ['Aston Villa', 80],
    ['Brighton & Hove Albion', 76], ['West Ham United', 76], ['Everton', 72],
    ['Wolverhampton', 72], ['Crystal Palace', 70], ['Fulham', 70], ['Brentford', 69],
    ['Nottingham Forest', 68], ['AFC Bournemouth', 66], ['Burnley', 62],
    ['Sheffield United', 60], ['Luton Town', 58],
  ] },
  { id: 'eng2', name: '챔피언십 (2부)', nat: 'ENG', div: 2, clubs: [
    ['Leicester City', 66], ['Southampton', 64], ['Leeds United', 63], ['Sunderland', 58],
    ['Norwich City', 58], ['West Bromwich Albion', 57], ['Middlesbrough', 56], ['Watford', 55],
    ['Coventry City', 54], ['Hull City', 52], ['Bristol City', 51], ['Preston North End', 50],
    ['Cardiff City', 50], ['Millwall', 49],
  ] },
  { id: 'eng3', name: '리그 원 (3부)', nat: 'ENG', div: 3, clubs: [
    ['Derby County', 46], ['Portsmouth', 46], ['Bolton Wanderers', 45], ['Barnsley', 44],
    ['Oxford United', 42], ['Blackpool', 42], ['Charlton Athletic', 42], ['Wigan Athletic', 40],
    ['Shrewsbury Town', 36], ['Cambridge United', 34],
  ] },
  { id: 'ita1', name: '세리에 A', nat: 'ITA', div: 1, clubs: [
    ['Inter Milan', 92], ['Juventus', 90], ['AC Milan', 90], ['Napoli', 86],
    ['Atalanta', 84], ['AS Roma', 84], ['Lazio', 82], ['Fiorentina', 78],
    ['Bologna', 74], ['Torino', 72], ['Udinese', 68], ['Genoa', 66],
    ['Monza', 64], ['Sassuolo', 63], ['Hellas Verona', 62], ['Cagliari', 60],
    ['Empoli', 59], ['US Lecce', 59], ['Frosinone', 56], ['Salernitana', 56],
  ] },
  { id: 'ita2', name: '세리에 B (2부)', nat: 'ITA', div: 2, clubs: [
    ['Parma', 58], ['Sampdoria', 58], ['Palermo', 56], ['Venezia', 54],
    ['Como', 52], ['Cremonese', 52], ['Bari', 50], ['Brescia', 50],
    ['Pisa', 48], ['Cesena', 47], ['Modena', 46], ['Reggiana', 44],
  ] },
  { id: 'ger1', name: '분데스리가', nat: 'GER', div: 1, clubs: [
    ['Bayern München', 95], ['Bayer Leverkusen', 88], ['Borussia Dortmund', 87],
    ['RB Leipzig', 85], ['VfB Stuttgart', 78], ['Eintracht Frankfurt', 78],
    ['SC Freiburg', 74], ['Borussia Mönchengladbach', 72], ['VfL Wolfsburg', 72],
    ['TSG Hoffenheim', 71], ['Werder Bremen', 70], ['Union Berlin', 70],
    ['1. FC Köln', 66], ['FC Augsburg', 66], ['1. FSV Mainz 05', 65],
    ['VfL Bochum', 62], ['1. FC Heidenheim', 58], ['SV Darmstadt 98', 56],
  ] },
  { id: 'ger2', name: '2. 분데스리가', nat: 'GER', div: 2, clubs: [
    ['Hamburger SV', 64], ['FC Schalke 04', 65], ['Hertha BSC', 62], ['Hannover 96', 58],
    ['Fortuna Düsseldorf', 56], ['1. FC Nürnberg', 56], ['FC St. Pauli', 56],
    ['1. FC Kaiserslautern', 54], ['Karlsruher SC', 52], ['SC Paderborn', 51],
    ['Holstein Kiel', 50], ['Greuther Fürth', 49],
  ] },
  { id: 'fra1', name: '리그 1', nat: 'FRA', div: 1, clubs: [
    ['Paris Saint-Germain', 93], ['AS Monaco', 84], ['Olympique de Marseille', 82],
    ['Lille OSC', 80], ['Olympique Lyonnais', 79], ['OGC Nice', 76], ['RC Lens', 76],
    ['Stade Rennais', 75], ['Toulouse FC', 66], ['Stade de Reims', 66],
    ['Montpellier HSC', 65], ['FC Nantes', 65], ['RC Strasbourg', 64],
    ['Stade Brestois', 62], ['FC Lorient', 60], ['Le Havre AC', 58],
    ['FC Metz', 57], ['Clermont Foot', 55],
  ] },
  { id: 'fra2', name: '리그 2', nat: 'FRA', div: 2, clubs: [
    ['AS Saint-Étienne', 60], ['Girondins de Bordeaux', 60], ['AJ Auxerre', 54],
    ['Angers SCO', 53], ['SM Caen', 50], ['EA Guingamp', 48], ['AC Ajaccio', 47],
    ['Grenoble Foot', 45], ['Stade Lavallois', 44], ['Pau FC', 42],
  ] },
  { id: 'por1', name: '프리메이라 리가', nat: 'POR', div: 1, clubs: [
    ['SL Benfica', 84], ['FC Porto', 84], ['Sporting CP', 84], ['SC Braga', 76],
    ['Vitória de Guimarães', 68], ['Boavista FC', 60], ['FC Famalicão', 58],
    ['Rio Ave FC', 56], ['GD Estoril Praia', 56], ['FC Arouca', 54],
    ['Gil Vicente FC', 54], ['Moreirense FC', 53], ['Casa Pia AC', 50],
    ['Portimonense SC', 50], ['GD Chaves', 49], ['FC Vizela', 48],
  ] },
  { id: 'ned1', name: '에레디비시', nat: 'NED', div: 1, clubs: [
    ['PSV Eindhoven', 84], ['AFC Ajax', 82], ['Feyenoord', 82], ['AZ Alkmaar', 74],
    ['FC Twente', 72], ['FC Utrecht', 68], ['Vitesse', 62], ['SC Heerenveen', 62],
    ['NEC Nijmegen', 60], ['Sparta Rotterdam', 58], ['Go Ahead Eagles', 56],
    ['Fortuna Sittard', 54], ['PEC Zwolle', 54], ['RKC Waalwijk', 52],
    ['Heracles Almelo', 52], ['Almere City', 50],
  ] },
  { id: 'bel1', name: '벨기에 프로리그', nat: 'BEL', div: 1, clubs: [
    ['Club Brugge', 74], ['RSC Anderlecht', 72], ['KRC Genk', 70], ['KAA Gent', 68],
    ['Royal Antwerp', 68], ['Union Saint-Gilloise', 66], ['Standard Liège', 64],
    ['Cercle Brugge', 60], ['KV Mechelen', 56], ['OH Leuven', 54],
  ] },
  { id: 'tur1', name: '쉬페르 리그', nat: 'TUR', div: 1, clubs: [
    ['Galatasaray', 76], ['Fenerbahçe', 76], ['Beşiktaş', 72], ['Trabzonspor', 68],
    ['Başakşehir', 62], ['Adana Demirspor', 56], ['Konyaspor', 54], ['Sivasspor', 52],
  ] },
  { id: 'sam1', name: '남미 명문 (브라질·아르헨티나)', nat: 'SAM', div: 1, clubs: [
    ['Flamengo', 80], ['Palmeiras', 80], ['River Plate', 78], ['Boca Juniors', 78],
    ['São Paulo FC', 74], ['Corinthians', 74], ['Grêmio', 72], ['Internacional', 71],
    ['Atlético Mineiro', 72], ['Racing Club', 66], ['Independiente', 66],
    ['Peñarol', 62], ['Nacional', 62], ['Colo-Colo', 62],
  ] },
  { id: 'mls1', name: 'MLS', nat: 'USA', div: 1, clubs: [
    ['Inter Miami CF', 70], ['LAFC', 68], ['LA Galaxy', 66], ['Seattle Sounders', 64],
    ['Atlanta United', 63], ['Columbus Crew', 62], ['NY Red Bulls', 61],
    ['Portland Timbers', 60], ['Toronto FC', 59], ['Sporting KC', 58],
    ['FC Cincinnati', 60], ['Austin FC', 57],
  ] },
  { id: 'kor1', name: 'K리그 1', nat: 'KOR', div: 1, clubs: [
    ['전북 현대', 60], ['울산 HD', 60], ['FC 서울', 58], ['포항 스틸러스', 57],
    ['수원 삼성', 54], ['대구 FC', 52], ['인천 유나이티드', 51], ['광주 FC', 50],
  ] },
  { id: 'jpn1', name: 'J1 리그', nat: 'JPN', div: 1, clubs: [
    ['가와사키 프론탈레', 64], ['요코하마 F 마리노스', 63], ['우라와 레즈', 62],
    ['감바 오사카', 60], ['비셀 고베', 61], ['가시마 앤틀러스', 60],
    ['FC 도쿄', 58], ['세레소 오사카', 57],
  ] },
  { id: 'sau1', name: '사우디 프로리그', nat: 'SAU', div: 1, clubs: [
    ['Al Hilal', 74], ['Al Nassr', 72], ['Al Ittihad', 70], ['Al Ahli', 68],
    ['Al Shabab', 62], ['Al Ettifaq', 60],
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

function salaryFor(club, ovr, year, rep) {
  const base = { 1: 850000, 2: 170000, 3: 32000 }[club.div] ?? 32000;
  const repMul = Math.pow(clamp(club.rep, 20, 100) / 62, 1.9);
  const abilityMul = 0.45 + clamp(ovr - club.req + 12, 0, 34) / 30;
  const fameMul = 0.8 + rep / 180;
  const era = clamp(0.34 + (year - 2000) * 0.033, 0.3, 1.2);
  return round(base * repMul * abilityMul * fameMul * era);
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

  // 난이도 하향: 잠재력 분포를 상향한다 (1부 정착 40~50% 목표)
  const potential = clamp(round(63 + rng.rightSkew(1.55) * 36 + rng.norm(0, 2)), 58, 99);

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
        risk: clamp(round(rng.norm(env.safety < 30 ? 58 : 32, 16)), 5, 92),
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
  while (!g.over && ageOf(g) < 16 && guard++ < 120) autoStep(g);
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
function developmentCeiling(p) {
  const env = p.devEnv ?? 52;
  // 난이도 하향: 나쁜 환경에서도 재능이 더 많이 열린다 (하한 0.52 → 0.72)
  return p.hidden.potential * clamp(0.72 + 0.28 * clamp((env - 30) / 55, 0, 1), 0.72, 1);
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
  const delta = clamp(years * curve * (gap / 100) * mult * noise * 6.4 * stressPen * injPen, 0, 14);
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
  return round(base * periodYears(g));
}

function leagueFinish(g, club) {
  const lg = leagueOf(club.leagueId);
  const size = lg ? lg.clubs.length : 20;
  const better = (lg ? lg.clubs : []).filter(([, r]) => r > club.rep).length;
  return { finish: clamp(round(better + 1 + g.rng.norm(0, size * 0.13)), 1, size), size };
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
  const doFinish = g.world.phase === 'SUMMER' || cadenceOf(age) === 'YEAR';
  if (seniorClub && doFinish && apps >= 5) {
    const { finish, size } = leagueFinish(g, club);
    if (finish === 1) {
      ach.push(club.div === 1 ? `${club.league} 우승` : `${club.league} 우승 · 승격`);
      p.career.trophies.push(`${g.world.year} ${club.league} 우승`);
      if (club.div > 1) { club.div -= 1; club.req += 6; }
      shiftReaction(g, 1, '리그 우승');
    } else if (club.div > 1 && finish <= 2) {
      ach.push('승격'); club.div -= 1; club.req += 6; g.flags.justPromoted = club.name;
    } else if (finish >= size - 2) {
      ach.push('강등'); if (club.div < 3) { club.div += 1; club.req -= 6; }
      g.flags.justRelegated = club.name;
      shiftReaction(g, -1, '팀 강등');
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
    if (ucl) {
      ach.push(`UCL ${ucl.label}`);
      pushLog(g, 'ucl', `챔피언스리그 ${ucl.label}. 평판 +${ucl.gain}.`);
    }
    const bd = ballonDorCheck(g, club, ucl, rating, goals, apps);
    if (bd === 'WIN') { ach.push('발롱도르 수상'); pushLog(g, 'award', `◆ ${g.world.year} 발롱도르 수상. 이 시즌은 영구히 기록된다.`); }
    else if (bd === 'TOP3') { ach.push('발롱도르 후보'); pushLog(g, 'award', `${g.world.year} 발롱도르 최종 후보 3인에 들었다.`); }
  }
  if (injuryNote) ach.push(`${injuryNote.type.name} ${injuryNote.weeks}주${injuryNote.ovrLoss ? ` (능력 -${injuryNote.ovrLoss})` : ''}`);
  if (p.loanFrom) ach.push('임대');

  p.career.seasons.push({
    year: g.world.year, phase: g.world.phase, age,
    club: club.name, league: club.league, div: club.div,
    apps, goals, assists, rating: +rating.toFixed(2), salary, ach, senior: seniorClub,
  });

  let line = `${club.name} (${club.league}) — ${apps}경기 ${goals}골 ${assists}도움 · 평점 ${rating.toFixed(2)}`;
  if (salary) line += ` · 연봉 ${fmtMoney(salary)}`;
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
function ballonDorCheck(g, club, ucl, rating, goals, apps) {
  const p = g.player;
  if (!club || club.div !== 1) return null;
  const rep = clubRepAt(club, g.world.year);
  if (rep < 82 || p.reputation < 78) return null;

  let score = (p.reputation - 78) * 2.4 + (rep - 82) * 0.8 + (rating - 7.0) * 16 + goals * 0.5;
  if (ucl) score += [0, 4, 9, 16, 22, 34][ucl.reach];
  if (p.ntTeam === 'ESP') score += 6;
  if (g.flags.wcHero) score += 12;
  score += g.rng.norm(0, 9);

  if (score > 49) {
    p.awards.ballonDor += 1;
    p.career.trophies.push(`${g.world.year} 발롱도르 수상`);
    remember(g, 'ballon', `${g.world.year}년 발롱도르를 받았다.`, 1.0);
    return 'WIN';
  }
  if (score > 42) { p.awards.ballonTop3 += 1; p.career.trophies.push(`${g.world.year} 발롱도르 후보 3위권`); return 'TOP3'; }
  return null;
}

/* ─────────────────────────── 10. 국가대표 ─────────────────────────── */

function nationalTeamCheck(g) {
  const p = g.player;
  const age = ageOf(g);
  if (!p.active || age < 18) return;
  const nt = p.ntTeam || 'ESP';
  const bar = NT_BAR[nt] ?? 70;
  if (!p.ntTeam) {
    if (p.ovr + p.reputation * 0.25 > bar - 4 && g.rng.chance(0.55)) {
      p.ntTeam = nt; p.career.caps += 1;
      pushLog(g, 'nt', `${NT_NAME[nt]} 대표팀 A매치 데뷔.`);
      remember(g, 'nt_debut', `${g.world.year}년 ${NT_NAME[nt]} 대표팀 데뷔`, 0.75);
      p.career.trophies.push(`${g.world.year} ${NT_NAME[nt]} 대표팀 데뷔`);
      shiftReaction(g, 2, '국가대표 발탁');
      setNews(g, `${g.world.year}년: ${NT_NAME[nt]} 대표팀에 처음 뽑혔다.`);
    }
    return;
  }
  if (p.ovr + p.reputation * 0.22 > bar - 6) {
    const caps = round(periodYears(g) * g.rng.int(3, 9));
    p.career.caps += caps;
    p.career.ntGoals += round(caps * POSITIONS[p.position].goal * 0.6 * g.rng.f() * 1.6);
  }
}

/* ─────────────────────────── 11. 이적 / 오퍼 ─────────────────────────── */

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

export function generateOffers(g, count = 6) {
  const p = g.player;
  const age = ageOf(g);
  const pool = CLUBS.filter((c) => {
    if (p.club && c.id === p.club.id) return false;
    if (c.youth || !clubExists(c, g.world.year)) return false;
    // ── 입단 판정: 주인공 능력 vs 그 해 팀 평균 능력
    const avg = teamAvgAt(c, g.world.year);
    const youthDiscount = age <= 21 ? 8 : 0;   // 유망주 할인
    if (scoutedValue(g, c) < avg - 10 - youthDiscount) return false;
    // 성인 프로 계약의 절대 하한
    if (age >= 16 && p.ovr < 52) return false;
    if (p.ovr > avg + 16 && c.div >= 3) return false;
    if (c.nat !== 'ESP') {
      if (age < 18 && g.world.year >= 2001) return false; // FIFA 18세 미만 국제이적 제한
      if (p.reputation < 26 && age < 22) return false;
      if (['SAU', 'KOR', 'JPN', 'MLS', 'USA'].includes(c.nat) && age < 28) return false; // 이 리그들은 보통 커리어 후반부
    }
    return true;
  });
  if (!pool.length) return [];
  const scored = pool.map((c) => ({
    w: (1 / (1 + Math.abs(scoutedValue(g, c) - teamAvgAt(c, g.world.year)) / 6)) *
       (clubRepAt(c, g.world.year) > 84 ? 0.6 : 1) * (c.nat === 'ESP' ? 1.6 : 1),
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
  const myAvg = teamAvgAt(p.club, g.world.year);
  if (Math.abs(p.ovr - myAvg) < 10) return [];                   // 조건 ②
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

function joinClub(g, club, opts = {}) {
  const p = g.player;
  p.club = { ...club };
  p.loanFrom = opts.loanFrom || null;
  p.contractUntil = g.world.year + (opts.years ?? (ageOf(g) < 20 ? 3 : 4));
  g.npcs.coach = { trust: clamp(48 + g.rng.norm(0, 9) + (opts.wanted ? 10 : 0), 10, 90) };
  p.stress = clamp(p.stress + clamp((club.comp - 65) / 6 - (p.hidden.adaptability - 50) / 8, -6, 14), 0, 100);
  p.path.push(`${g.world.year} ${club.name}${opts.loanFrom ? ' (임대)' : ''}`);
  pushLog(g, 'transfer', `${club.name} 합류 — ${club.league} (${DIV_LABEL[club.div]}) · 클럽 명성 ${club.rep}`);
  setNews(g, `${g.world.year}년: ${club.name}${opts.loanFrom ? '으로 임대' : '에 합류'}했다.`);
  if (club.div === 1 && club.rep >= 75) shiftReaction(g, 2, '명문 클럽 이적');
  else if (club.div === 1) shiftReaction(g, 1, '1부 리그 이적');
}

const stars = (v) => '★'.repeat(clamp(round((v / 100) * 5), 1, 5)) + '☆'.repeat(5 - clamp(round((v / 100) * 5), 1, 5));

/** 이적 오퍼 → 선택지 (배지 정보 포함) */
function offerChoices(g, offers, { loan = false } = {}) {
  return offers.map((c) => {
    const cur = g.player.club;
    const up = cur ? c.rep > cur.rep + 6 : true;
    const fit = fitLabel(g, c);
    return {
      t: `${c.name} — ${c.league} (${DIV_LABEL[c.div]})${loan ? ' [임대]' : ''}`,
      meta: `팀 평균 능력 ${fit.avg} · 내 능력 ${ability(g)} → ${fit.label} · 예상 연봉 ${fmtMoney(salaryFor(c, g.player.ovr, g.world.year, g.player.reputation))}`,
      fit,
      tags: up ? ['ambition', 'risk'] : ['safe'],
      fx: (gg) => {
        const from = gg.player.club;
        joinClub(gg, c, { years: loan ? 1 : 4, wanted: !up, loanFrom: loan ? from : null });
        if (!loan) gg.player.reputation += up ? 4 : 1;
      },
      out: () => up
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
    { t: '동네 클럽에 등록한다.', meta: '정식 유소년 코스의 출발점', risk: 'SAFE', parent: 1, injury: 1, tags: ['ambition'],
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
    { t: '학교와 골목 축구로 충분하다.', meta: '비용 0 · 대신 아무도 지켜보지 않는다', risk: 'MID', parent: 0, injury: 0, tags: ['safe'],
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
    { t: '성적을 유지하겠다고 약속하고 축구를 늘린다.', meta: '학업 +  스트레스 +', risk: 'SAFE', parent: 1, injury: 0, tags: ['discipline'],
      fx: (gg) => { shiftReaction(gg, 1, '학업 유지 약속'); gg.player.stress += 8; gg.player.academic += 6; },
      out: (gg) => { remember(gg, 'promise_school', `${gg.world.year}년, 성적 유지를 조건으로 축구를 허락받았다.`, 0.7); return '거래가 성립했다. 이 약속은 20년 뒤에 다시 소환된다.'; } },
    { t: '"축구밖에 없어요." 정면으로 부딪친다.', meta: '성공 시 반응 급상승 / 실패 시 급하락', risk: 'HIGH', parent: 2, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => {
        const ok = gg.rng.chance(0.38 + gg.world.reaction * 0.12);
        shiftReaction(gg, ok ? 2 : -1, ok ? '아이의 각오를 인정' : '충돌');
        gg.player.willToPlay += 10; gg.player.academic -= 8; gg.player.trait.pride += 8;
      },
      out: (gg) => gg.world.reaction >= 2
        ? '한참 말이 없다가 고개를 끄덕였다. "그럼 진짜로 해라."'
        : '방문이 닫혔다. 그 뒤로 식탁에서 축구 얘기가 사라졌다.' },
    { t: '아무 말 하지 않고 혼자 계속한다.', meta: '독기 + · 부모 반응 변화 없음', risk: 'MID', parent: 0, injury: 0, tags: [],
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
    { t: '내 플레이를 한다. 하던 대로.', meta: '변동성 낮음', risk: 'MID', parent: 0, injury: 0, tags: ['pride'], fx: (gg) => { gg.flags.trialStyle = 'self'; }, out: () => '3일이 지나갔다.' },
    { t: '평가 기준에 맞춘다. 안전하게.', meta: '기본 점수 + / 잠재력 높으면 손해', risk: 'SAFE', parent: 0, injury: 0, tags: ['safe'], fx: (gg) => { gg.flags.trialStyle = 'safe'; }, out: () => '3일이 지나갔다.' },
    { t: '무리해서라도 눈에 띄는 장면을 만든다.', meta: '±9점 도박', risk: 'HIGH', parent: 0, injury: 1, tags: ['risk'], fx: (gg) => { gg.flags.trialStyle = 'flash'; }, out: () => '3일이 지나갔다.' },
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
      return [{ t: '라 마시아에 들어간다.', meta: '최고의 훈련 환경 · 최악의 경쟁', risk: 'MID', parent: 2, injury: 1, tags: [],
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
      { t: '증명해 보이겠다고 마음을 굳힌다.', meta: '독기 + · 스트레스 +', risk: 'MID', parent: 0, injury: 0, tags: ['ambition', 'pride'],
        fx: (gg) => { gg.player.hidden.grit += 6; gg.player.stress += 8; gg.player.trait.pride += 8; },
        out: (gg) => { remember(gg, 'rejection', `${gg.world.year}년 바르셀로나 유소년 탈락. 리포트 문장을 외웠다.`, 0.95); return '"필연성이 낮다"는 문장을 종이에 적어 서랍에 넣었다.'; } },
      { t: '한동안 공을 보지 않았다.', meta: '자신감 − · 축구 의지 −', risk: 'HIGH', parent: -1, injury: 0, tags: [],
        fx: (gg) => { gg.player.confidence -= 16; gg.player.willToPlay -= 10; shiftReaction(gg, -1, '탈락 후 방황'); },
        out: (gg) => { remember(gg, 'rejection', `${gg.world.year}년 탈락. 그 여름을 통째로 잃었다.`, 0.85); return '두 달 동안 아무것도 하지 않았다.'; } },
      { t: '바로 다른 팀을 알아본다.', meta: '적응력 +', risk: 'SAFE', parent: 0, injury: 0, tags: ['safe'],
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
      { t: `${a.name} 유소년 — 최고의 환경. 집을 떠나야 한다.`, meta: '훈련 ★★★★☆ / 생활 ★★☆☆☆', risk: 'HIGH', parent: 1, injury: 1, tags: ['ambition', 'risk'],
        fx: (gg) => { joinClub(gg, a, { years: 6 }); gg.player.stress += 16; gg.flags.leftHome = true; gg.player.trait.ambition += 8; },
        out: () => '열두 살에 기차를 혼자 탔다. 어머니는 플랫폼에서 끝까지 손을 흔들었다.' },
      { t: `${b.name} 유소년 — 집에서 30분. 현실적인 선택.`, meta: '훈련 ★★☆☆☆ / 생활 ★★★★★', risk: 'SAFE', parent: 1, injury: 0, tags: ['safe'],
        fx: (gg) => { joinClub(gg, b, { years: 6 }); gg.player.stress -= 6; shiftReaction(gg, 1, '집 근처 클럽 선택'); },
        out: () => '매일 집에서 저녁을 먹는다. 부모님이 가장 안심한 선택이었다.' },
      { t: `${c.name} 유소년 — 아무도 모르는 곳에서 다시 시작한다.`, meta: '적응력 + / 스트레스 ++', risk: 'HIGH', parent: -1, injury: 1, tags: ['risk'],
        fx: (gg) => { joinClub(gg, c, { years: 6 }); gg.player.hidden.adaptability += 8; gg.player.stress += 20; gg.flags.leftHome = true; },
        out: () => '섬으로 갔다. 여기서는 아무도 내가 탈락한 애라는 걸 모른다.' },
    ];
  },
});

ev({
  id: 'youth_release', once: true,
  when: (g) => g.world.phase === 'SUMMER' && A(g) === 18 && g.player.active && (!g.player.club || g.player.club.youth),
  w: () => 5000,
  body: (g) => `만 18세. 유소년 계약이 끝나는 나이다.\n\n` +
    `현재 능력 ${ability(g)} (${abilityLabel(ability(g))})\n\n` +
    `프로 계약 제안은 오지 않았다. 유소년팀은 다음 학년을 받아야 한다.\n` +
    `이 나라에서 유소년 등록 선수 중 프로 계약에 도달하는 비율은 1% 아래다. 그 통계 안에 들지 못했다.`,
  choices: (g) => {
    const low = CLUBS.filter((c) => c.nat === 'ESP' && c.div === 3 && !c.youth);
    return [
      { t: '하부리그 트라이아웃을 돌아본다.', meta: `성공 확률 능력 의존 (현재 ${ability(g)})`, risk: 'HIGH', parent: 0, injury: 1, tags: ['ambition', 'risk'],
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
      { t: '축구를 접고 다른 길을 찾는다.', meta: '커리어 종료 · 학업/직업 트랙', risk: 'SAFE', parent: 1, injury: 0, tags: ['safe'],
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
  when: (g) => g.player.active && A(g) >= 18 && A(g) <= 26 && g.world.phase === 'SUMMER',
  w: (g) => (g.world.year >= 2008 && g.world.year <= 2013 ? 260 : 70),
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
      `나는 지금 ${g.player.club ? g.player.club.name : '무소속'}에서 연봉 ${fmtMoney(g.player.econ.wageYear)}을 받는다.\n` +
      `세후로 나누면 이 집 생활비의 절반쯤 된다. 만 ${A(g)}세에 처음으로, 내 계약이 가족의 재무 계획에 들어갔다.\n\n` +
      `식탁에서 아무도 그 얘기를 먼저 꺼내지 않는다. 그게 이 집의 방식이다.\n` +
      `나는 훈련이 끝나고 차 안에서 계산기를 두 번 두드렸다.`;
    },
  choices: (g) => [
    { t: '내 연봉으로 집 대출을 넘겨받는다.',
      meta: `부채 ${fmtMoney(g.flags._mortgage * 12 * 8)} 이전 (은행 이자 9%) · 자산 축적 대폭 감소 · 가족 관계 최상`,
      tags: ['family'],
      fx: (gg) => {
        gg.econDebtNote = true;
        gg.player.econ.debt += gg.flags._mortgage * 12 * 8;
        gg.player.econ.debtRate = 0.09;
        gg.npcs.father.trust = 98; gg.player.stress += 10;
        shiftReaction(gg, 1, '가족의 대출을 넘겨받음');
        remember(gg, 'took_mortgage', `${gg.world.year}년, 아버지의 집 대출을 내 이름으로 넘겼다.`, 0.9);
      },
      out: () => '서류에 서명하는 데 20분이 걸렸다. 아버지는 그 자리에 오지 않았다.\n집을 지켰다. 대신 앞으로 몇 년간 내 통장은 내 것이 아니다.' },
    { t: '돈이 되는 이적을 우선한다.',
      meta: '다음 이적시장에서 연봉 높은 오퍼를 우선 수락 · 축구적 성장 리스크',
      tags: ['ambition'],
      fx: (gg) => { gg.flags.chaseMoney = true; gg.player.stress += 6; remember(gg, 'chase_money', `${gg.world.year}년, 가계 때문에 돈을 따라가기로 했다.`, 0.75); },
      out: () => '에이전트에게 전화했다. "연봉 제일 높은 데로 보내주세요."\n그 통화 이후, 내 커리어의 기준이 하나 바뀌었다.' },
    { t: '매달 생활비를 보내되 커리어는 그대로 간다.',
      meta: `자산 축적 −30% · 스트레스 + · 부채는 생기지 않는다`,
      tags: ['safe'],
      fx: (gg) => { gg.flags.sendsMoney = true; gg.player.stress += 8; gg.player.econ.household = clamp(gg.player.econ.household + 8, 0, 100); },
      out: () => '매달 정해진 날에 송금한다. 아버지는 한 번도 고맙다고 하지 않았고, 나는 그걸 이해했다.' },
  ],
});

ev({
  id: 'sibling_bail', once: true,
  when: (g) => g.player.active && A(g) >= 19 && A(g) <= 30 && g.npcs.sibling.risk > 45,
  w: (g) => 40 + (g.npcs.sibling.risk - 45) * 3,
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
  choices: (g) => [
    { t: '사채를 써서 보석금을 전액 낸다.',
      meta: `부채 ${fmtMoney(g.flags._bail)} (연이자 34%) · 스트레스 ++ · 형 관계 회복`,
      tags: ['family', 'risk'],
      fx: (gg) => {
        gg.player.econ.debt += gg.flags._bail; gg.player.econ.debtRate = 0.34;
        gg.player.stress += 18; gg.npcs.sibling.helped += 1; gg.npcs.sibling.risk -= 18;
        remember(gg, 'bail_paid', `${gg.world.year}년, 형의 보석금을 사채로 냈다.`, 0.9);
      },
      out: () => '형은 사흘 뒤에 나왔다. 아무 말도 하지 않고 내 어깨를 한 번 쳤다.\n이자 34%. 이 숫자가 앞으로 몇 년간 내 이적 협상을 지배한다.' },
    { t: '통장을 비우고 나머지는 구단에 가불을 요청한다.',
      meta: '자산 소진 · 구단 신뢰 −8 · 감독이 사정을 알게 된다',
      tags: ['safe'],
      fx: (gg) => {
        const short = Math.max(0, gg.flags._bail - gg.player.econ.assets);
        gg.player.econ.assets = Math.max(0, gg.player.econ.assets - gg.flags._bail);
        if (short > 0) { gg.player.econ.debt += short; gg.player.econ.debtRate = 0.0; }
        gg.npcs.coach.trust -= 8; gg.npcs.sibling.risk -= 12; gg.npcs.sibling.helped += 1;
        remember(gg, 'bail_club', `${gg.world.year}년, 구단 가불로 형의 보석금을 냈다.`, 0.85);
      },
      out: () => '단장실에서 30분을 설명했다. 이자는 없다고 했다.\n다음 주부터 감독이 나를 다르게 봤다. 좋은 쪽인지 나쁜 쪽인지는 아직 모른다.' },
    { t: '내지 않는다.',
      meta: '부채 0 · 형 관계 파탄 · 스트레스 +++ · 30대 이벤트 분기 결정',
      tags: [],
      fx: (gg) => {
        gg.player.stress += 26; gg.npcs.sibling.risk += 14; gg.npcs.sibling.state = 'INCIDENT';
        gg.flags.abandonedSibling = true;
        remember(gg, 'bail_refused', `${gg.world.year}년, 형의 보석금을 내지 않았다.`, 0.95);
      },
      out: () => '전화를 끊고 다시 걸지 않았다.\n그해 여름 어머니 집에 가지 않았다. 이 결정은 십 년 뒤에 다시 돌아온다.' },
  ],
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
    { t: '구단에 알리고 저리 대출로 전환한다.', meta: '이자 34% → 9% · 평판 −5 · 감독 신뢰 −6', tags: ['safe'],
      fx: (gg) => { gg.player.econ.debtRate = 0.09; gg.player.reputation -= 5; gg.npcs.coach.trust -= 6; gg.player.stress -= 10; },
      out: () => '단장이 은행을 연결해줬다. 대신 그 얘기가 라커룸에 돌았다.' },
    { t: '이적으로 계약금을 만들어 한 번에 정리한다.', meta: '다음 이적에서 연봉보다 계약금 우선 · 축구적 후퇴 가능', tags: ['risk'],
      fx: (gg) => { gg.flags.chaseMoney = true; gg.player.stress += 8; },
      out: () => '에이전트에게 상황을 전부 말했다. "그럼 조건은 제가 정합니다."' },
    { t: '버틴다. 시즌만 끝나면 갚을 수 있다.', meta: '이자 계속 · 스트레스 +++ · 성장률 패널티', tags: ['pride'],
      fx: (gg) => { gg.player.stress += 22; },
      out: () => '버텼다. 그 시즌 내내 밤에 잠들기까지 두 시간이 걸렸다.' },
  ],
});

ev({
  id: 'summer_market', when: (g) => g.world.phase === 'SUMMER' && A(g) >= 16 && g.player.active && !(A(g) >= 18 && (!g.player.club || g.player.club.youth)), w: () => 100,
  body: (g) => {
    const p = g.player;
    const offers = generateOffers(g, 4);
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
      list.push({ t: '남는다. 이 팀에서 증명한다.', meta: '감독 신뢰 + · 스트레스 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['loyalty'],
        fx: (gg) => { gg.npcs.coach.trust += 6; gg.player.stress -= 4; gg.player.trait.loyalty += 5; },
        out: () => '떠나는 게 쉬웠을 것이다. 남는 쪽을 골랐다.' });
      const lt = loanTargets(g, 2);
      if (lt.length) list.push(...offerChoices(g, lt, { loan: true }));
    } else if (!offers.length) {
      list.push({ t: '무적 상태로 훈련하며 기다린다.', meta: '축구 의지 − · 스트레스 +', risk: 'HIGH', parent: -1, injury: 0, tags: [],
        fx: (gg) => { gg.player.willToPlay -= 10; gg.player.stress += 10; shiftReaction(gg, -1, '소속팀 없음'); },
        out: () => '전화는 오지 않았다. 그래도 다음 주에도 나갔다.' });
    }
    return list;
  },
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
    list.push({ t: '남아서 후반기 경쟁을 정면으로 한다.', meta: '스트레스 + · 감독 신뢰 +', risk: 'MID', parent: 0, injury: 1, tags: ['pride'],
      fx: (gg) => { gg.player.stress += 10; gg.npcs.coach.trust += 4; },
      out: () => '훈련장에서 가장 먼저 나오고 가장 늦게 들어갔다.' });
    list.push({ t: '몸 상태 관리에 집중하며 후반기를 준비한다.', meta: '건강 ++ · 부상 위험 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['discipline'],
      fx: (gg) => { gg.player.fitness = clamp(gg.player.fitness + 12, 0, 100); gg.player.hidden.injuryProne -= 5; gg.player.form -= 4; },
      out: () => '2월에 몸이 가벼웠다. 3월에 그게 결과로 나왔다.' });
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
      { t: up ? '남는다. 이 팀으로 1부를 밟는다.' : '남는다. 이 팀에서 다시 올라간다.',
        meta: up ? '주전 경쟁 · 감독 신뢰 +' : '확실한 주전 · 노출 하락',
        tags: ['loyalty'],
        fx: (gg) => { gg.npcs.coach.trust += 10; gg.player.stress += up ? 8 : -6; gg.player.trait.loyalty += 6; },
        out: () => up ? '유니폼을 그대로 입었다. 프리시즌에 영입된 선수가 내 포지션이었다.'
                      : '남았다. 이 리그에서 나는 가장 좋은 선수다. 그게 위로가 되지는 않는다.' },
      { t: '이적을 요청한다.', meta: '여름 시장의 오퍼로 이동', tags: ['ambition'],
        fx: (gg) => { gg.npcs.coach.trust -= 12; gg.flags.wantsOut = true; },
        out: () => '구단은 화를 냈지만 막지는 않았다.' },
    ];
    return out;
  },
});

ev({
  id: 'contract_renewal', when: (g) => A(g) >= 19 && g.player.active && g.player.club && g.world.year >= g.player.contractUntil - 1 && g.world.phase === 'SUMMER', w: () => 190,
  body: (g) => `${g.player.club.name}과의 계약이 ${g.player.contractUntil}년에 끝난다.\n현재 연봉 ${fmtMoney(g.player.econ.wageYear)} · 감독 신뢰 ${round(g.npcs.coach.trust)}/100`,
  choices: () => [
    { t: '재계약한다. 안정을 택한다.', meta: '연봉 ×1.45 · 4년 연장', risk: 'SAFE', parent: 1, injury: 0, tags: ['safe', 'loyalty'],
      fx: (gg) => { gg.player.contractUntil = gg.world.year + 4; gg.player.stress -= 8; gg.npcs.coach.trust += 6; gg.flags.wageBump = 1.45; },
      out: () => '4년 연장. 연봉이 올랐다.' },
    { t: '주급 인상을 강하게 요구한다.', meta: '성공 시 연봉 ×2.0 / 실패 시 신뢰 −16', risk: 'HIGH', parent: 0, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => {
        if (gg.player.reputation + gg.npcs.coach.trust / 2 > 92) { gg.player.contractUntil = gg.world.year + 4; gg.flags.wageBump = 2.0; }
        else { gg.npcs.coach.trust -= 16; gg.player.stress += 12; gg.flags.standoff = true; }
      },
      out: (gg) => gg.flags.standoff ? '구단이 제안을 철회했다. 팬들은 "돈만 아는 선수"라고 쓴다.' : '요구가 통했다.' },
    { t: '계약을 흘려서 자유계약(FA)으로 나간다.', meta: '이적료 0 · 야유 · 신뢰 −20', risk: 'HIGH', parent: -1, injury: 0, tags: ['risk', 'ambition'],
      fx: (gg) => { gg.npcs.coach.trust -= 20; gg.player.stress += 14; gg.flags.goingFA = true; },
      out: () => '이적료 없이 나갈 수 있다. 대신 이번 시즌 내내 야유를 듣는다.' },
  ],
});

ev({
  id: 'manager_change', when: (g) => A(g) >= 17 && g.player.active && g.player.club, w: () => 45,
  body: (g) => `${g.player.club.name} 감독이 경질됐다. 쌓아온 신뢰 ${round(g.npcs.coach.trust)}는 리셋이다.`,
  choices: () => [
    { t: '새 감독의 전술에 맞춘다.', meta: '적응력에 따라 신뢰 결정', risk: 'MID', parent: 0, injury: 0, tags: ['adaptability'],
      fx: (gg) => { gg.npcs.coach.trust = clamp(50 + (gg.player.hidden.adaptability - 50) / 2 + gg.rng.norm(0, 8), 10, 95); gg.player.trait.adaptability += 8; },
      out: (gg) => gg.npcs.coach.trust > 60 ? '새 감독의 첫 명단에 이름이 있었다.' : '맞추려 했지만, 그가 원하는 선수는 내가 아니었다.' },
    { t: '내 강점을 그대로 밀고 간다.', meta: '성공 시 신뢰 +16 / 실패 시 −22', risk: 'HIGH', parent: 0, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => { const ok = gg.rng.chance(0.42 + (gg.player.ovr - 68) / 60); gg.npcs.coach.trust = ok ? clamp(gg.npcs.coach.trust + 16, 10, 95) : clamp(gg.npcs.coach.trust - 22, 5, 95); },
      out: (gg) => gg.npcs.coach.trust > 55 ? '감독이 결국 나에게 맞춰 팀을 짰다.' : '벤치에서 후반기를 보냈다.' },
  ],
});

ev({
  id: 'crisis2008', once: true, when: (g) => g.world.year === 2008 && A(g) >= 17 && A(g) <= 18, w: () => 3000,
  body: (g) => {
    const e = ENV(g);
    const hit = round((100 - e.money) * 0.35 + g.rng.int(0, 18));
    g.flags._hit = hit;
    return `2008년. 세계 금융위기가 스페인을 정면으로 때렸다. 건설업이 멈추고 실업률이 치솟는다.\n\n` +
      `${g.npcs.father.name}의 일(${g.npcs.father.job})이 직접 타격을 받았다.\n${e.label} — 가계 타격 -${hit}\n\n` +
      `아이러니한 상황이 됐다. 그동안 "안정적인 길"을 말하던 부모가, 지금 당장 현금이 들어오는 쪽을 보고 있다.`;
  },
  choices: () => [
    { t: '지금 프로 계약에 서명해서 가계를 구한다.', meta: '즉시 수입 · 학업 포기', risk: 'MID', parent: 2, injury: 1, tags: ['ambition'],
      fx: (gg) => {
        gg.player.econ.household = clamp(gg.player.econ.household - gg.flags._hit * 0.4, 0, 100);
        const dom = CLUBS.filter((c) => c.nat === 'ESP' && c.div >= 2 && scoutedValue(gg, c) >= c.req - 8);
        joinClub(gg, dom.length ? gg.rng.pick(dom) : clubById('esp3:CE Sabadell'), { years: 3 });
        shiftReaction(gg, 2, '가계를 구한 계약'); gg.player.stress += 14; gg.flags.breadwinner = true;
        remember(gg, 'breadwinner', '2008년 금융위기. 18세에 내 연봉이 집안의 주 수입이 됐다.', 0.95);
      },
      out: () => '열여덟에 가장이 됐다. 그 순간 아버지의 눈을 봤다. 고마움과 미안함이 같이 있었다.' },
    { t: '학업을 병행하며 안전하게 간다.', meta: '안전망 확보 · 성장 −', risk: 'SAFE', parent: -1, injury: 0, tags: ['safe'],
      fx: (gg) => {
        gg.player.econ.household = clamp(gg.player.econ.household - gg.flags._hit * 0.7, 0, 100);
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
    { t: '삭감안에 동의하고 팀에 협조한다.', meta: '연봉 −25% · 신뢰 ++', risk: 'SAFE', parent: 0, injury: 0, tags: ['loyalty'],
      fx: (gg) => { gg.player.econ.wageYear = round(gg.player.econ.wageYear * 0.75); gg.npcs.coach.trust += 14; gg.player.reputation += 3; },
      out: () => '주장단과 함께 삭감안에 서명했다. 팬들이 그걸 기억한다.' },
    { t: '거부한다. 계약은 계약이다.', meta: '연봉 유지 · 신뢰 −18 · 평판 −', risk: 'HIGH', parent: -1, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => { gg.npcs.coach.trust -= 18; gg.player.reputation -= 6; gg.player.stress += 10; },
      out: () => '법적으로는 이겼다. 라커룸에서는 졌다.' },
    { t: '봉쇄 기간 내내 혼자 몸을 만든다.', meta: '건강 ++ · 부상 위험 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['discipline'],
      fx: (gg) => { gg.player.fitness = clamp(gg.player.fitness + 16, 0, 100); gg.player.hidden.injuryProne -= 6; gg.player.econ.wageYear = round(gg.player.econ.wageYear * 0.8); },
      out: () => '거실에서 매일 두 시간. 리그가 재개됐을 때 몸이 가장 좋은 선수 중 하나였다.' },
  ],
});

ev({
  id: 'nt_choice', once: true, when: (g) => g.player.secondNationality && A(g) >= 19 && A(g) <= 27 && !g.player.ntTeam && !g.player.ntLocked && g.player.reputation > 26, w: () => 250,
  body: (g) => {
    const s = g.player.secondNationality;
    return `이중국적자다. 두 협회가 모두 연락을 해왔다.\n\n` +
      `· 스페인 — 경쟁 강도 ${NT_BAR.ESP}/100. 부를지 알 수 없다.\n` +
      `· ${NT_NAME[s]} — 경쟁 강도 ${NT_BAR[s]}/100. 지금 가면 바로 주전이고, 메이저 대회에 나갈 수 있다.\n\n` +
      `FIFA 규정상 A매치 메이저 대회에 출전하는 순간 이 선택은 영구히 닫힌다.`;
  },
  choices: (g) => [
    { t: `${NT_NAME[g.player.secondNationality]} 대표팀을 선택한다.`, meta: '즉시 주전 · 메이저 대회 출전 가능', risk: 'MID', parent: 1, injury: 0, tags: ['risk'],
      fx: (gg) => {
        gg.player.ntTeam = gg.player.secondNationality; gg.player.reputation += 8;
        remember(gg, 'nt_switch', `${gg.world.year}년, 스페인 대신 ${NT_NAME[gg.player.ntTeam]} 대표팀을 선택했다.`, 0.85);
      },
      out: (gg) => `${NT_NAME[gg.player.ntTeam]} 유니폼을 입었다. 부모님이 그 경기를 보며 울었다.` },
    { t: '스페인 대표팀을 끝까지 기다린다.', meta: '못 뽑힐 수도 있다', risk: 'HIGH', parent: 0, injury: 0, tags: ['pride'],
      fx: (gg) => { gg.player.trait.pride += 10; gg.flags.waitedESP = true; },
      out: () => '한 번도 부르지 않을 수도 있다. 그래도 이 유니폼이어야 했다.' },
  ],
});

ev({
  id: 'world_cup', when: (g) => WORLD_CUP_YEARS.includes(g.world.year) && g.world.phase === 'SUMMER' && A(g) >= 20 && A(g) <= 36 && g.player.active && g.player.ntTeam, w: () => 800,
  body: (g) => {
    g.flags._wcIn = g.player.ovr + g.player.reputation * 0.3 + g.rng.norm(0, 5) > (NT_BAR[g.player.ntTeam] ?? 70) + 2;
    return g.flags._wcIn
      ? `${g.world.year} 월드컵 ${NT_NAME[g.player.ntTeam]} 최종 명단이 발표됐다. 이름이 있다.`
      : `${g.world.year} 월드컵 최종 명단이 발표됐다. 이름이 없다.`;
  },
  choices: (g) => {
    if (!g.flags._wcIn) return [{ t: 'TV로 본다.', meta: '자신감 − · 독기 +', risk: 'SAFE', parent: -1, injury: 0, tags: [],
      fx: (gg) => { gg.player.confidence -= 10; gg.player.hidden.grit += 8; remember(gg, 'wc_missed', `${gg.world.year}년 월드컵 명단 탈락.`, 0.8); },
      out: () => '4년 뒤에는 서른이 넘는다. 그 계산을 하고 있는 자신이 싫었다.' }];
    return [{ t: '대회에 나간다.', meta: '빅매치 멘탈에 따라 결과가 갈린다', risk: 'MID', parent: 2, injury: 1, tags: [],
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
    { t: '입장을 밝힌다.', meta: '팔로워 ++ / 절반의 반발', risk: 'HIGH', parent: 0, injury: 0, tags: ['pride', 'risk'],
      fx: (gg) => { gg.player.reputation += gg.rng.chance(0.5) ? 8 : -8; gg.player.stress += 12; },
      out: () => '한쪽에서는 영웅이 됐고, 한쪽에서는 배신자가 됐다.' },
    { t: '"저는 축구 선수입니다"로 넘긴다.', meta: '무난 · 스트레스 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['safe'],
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
    { t: '이 한 경기에 모든 것을 건다.', meta: '빅매치 멘탈 판정', risk: 'HIGH', parent: 1, injury: 1, tags: ['pride'],
      fx: (gg) => {
        const perf = gg.player.hidden.bigMatch + gg.player.hidden.grit * 0.4 + gg.rng.norm(0, 16);
        if (perf > 75) { gg.player.reputation += 14; gg.player.confidence += 20; gg.flags.revengeDone = true; remember(gg, 'revenge', `${gg.world.year}년, 나를 떨어뜨린 팀을 상대로 인생 경기를 했다.`, 0.95); }
        else { gg.player.confidence -= 10; remember(gg, 'revenge_fail', `${gg.world.year}년, 그 팀 앞에서 아무것도 못 했다.`, 0.8); }
      },
      out: (gg) => gg.flags.revengeDone
        ? '골을 넣고 관중석 쪽을 한참 봤다. 누구를 보는지는 나만 알았다.'
        : '90분 동안 공을 다섯 번 잡았다. 경기 후 아무도 그 얘기를 꺼내지 않았다.' },
    { t: '평소처럼 한다. 20년 전 일이다.', meta: '스트레스 − · 폼 +', risk: 'SAFE', parent: 0, injury: 0, tags: ['discipline'],
      fx: (gg) => { gg.player.stress -= 8; gg.player.form += 5; },
      out: () => '경기가 끝나고 나서야, 손이 떨렸다는 걸 알았다.' },
  ],
});

ev({
  id: 'captaincy', once: true, when: (g) => A(g) >= 25 && g.player.active && g.player.club && g.npcs.coach.trust > 68 && g.player.reputation > 40, w: () => 130,
  body: (g) => `감독이 주장 완장을 제안한다. ${g.player.club.name}에서 가장 오래된 선수가 됐다는 뜻이기도 하다.`,
  choices: () => [
    { t: '받는다.', meta: '빅매치 멘탈 + · 스트레스 +', risk: 'MID', parent: 2, injury: 0, tags: ['pride'],
      fx: (gg) => { gg.flags.captain = true; gg.player.hidden.bigMatch += 8; gg.player.reputation += 6; gg.player.stress += 12; gg.player.career.trophies.push(`${gg.player.club.name} 주장`); shiftReaction(gg, 1, '주장 선임'); },
      out: (gg) => { remember(gg, 'captain', `${gg.world.year}년 ${gg.player.club.name} 주장이 됐다.`, 0.8); return '완장을 차고 처음 라커룸에서 말을 했다. 목소리가 떨렸다.'; } },
    { t: '거절한다. 내 경기에 집중하고 싶다.', meta: '스트레스 − · 신뢰 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['safe'],
      fx: (gg) => { gg.player.stress -= 6; gg.npcs.coach.trust -= 6; },
      out: () => '완장은 다른 선수에게 갔다.' },
  ],
});

ev({
  id: 'quit_temptation', when: (g) => A(g) >= 15 && A(g) <= 24 && g.player.willToPlay < 42 && g.player.active, w: () => 260,
  body: (g) => `축구를 계속할 이유를 못 찾겠다.\n\n출전 시간은 줄고, 몸은 아프고, 같이 시작한 애들 절반은 이미 그만뒀다.\n` +
    `${g.npcs.mother.name}이 조용히 다른 얘기를 꺼낸다.\n\n(축구 의지 ${round(g.player.willToPlay)}/100 · 학업 ${round(g.player.academic)}/100)`,
  choices: () => [
    { t: '그만둔다.', meta: '커리어 종료', risk: 'HIGH', parent: 0, injury: 0, tags: ['safe'],
      fx: (gg) => { gg.player.active = false; gg.player.path.push(`${gg.world.year} 축구 중단`); remember(gg, 'quit', `${gg.world.year}년, ${A(gg)}세에 축구를 그만뒀다.`, 1.0); },
      out: () => '축구화를 신발장 맨 아래로 밀어 넣었다. 그날 밤 오래 잤다.' },
    { t: '한 시즌만 더 해본다.', meta: '축구 의지 +18', risk: 'MID', parent: 0, injury: 0, tags: ['discipline'],
      fx: (gg) => { gg.player.willToPlay += 18; gg.player.stress += 6; },
      out: () => '"한 시즌만." 이 말을 앞으로 몇 번 더 하게 된다.' },
    { t: '수준을 낮춰서라도 매주 뛸 수 있는 팀으로 간다.', meta: '3부 이적 · 출전 확보', risk: 'SAFE', parent: -1, injury: 0, tags: ['adaptability'],
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
    { t: '주전 경쟁을 계속한다.', meta: '스트레스 + · 부상 위험 +', risk: 'HIGH', parent: 0, injury: 2, tags: ['pride'],
      fx: (gg) => { gg.player.stress += 12; gg.npcs.coach.trust -= 4; gg.player.hidden.injuryProne += 6; },
      out: () => '아직 진 게 아니다. 다만 예전보다 훨씬 아프다.' },
    { t: '베테랑 역할을 받아들인다.', meta: '신뢰 ++ · 부상 위험 −', risk: 'SAFE', parent: 0, injury: 0, tags: ['adaptability'],
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
    { t: '"허락해줘서 여기까지 온 거예요."', meta: '스트레스 −− · 관계 회복', risk: 'SAFE', parent: 1, injury: 0, tags: ['family'],
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
    { t: '한 시즌 더 뛴다.', meta: '능력 하락 계속', risk: 'MID', parent: 0, injury: 2, tags: ['pride'], fx: () => {}, out: () => '"마지막 한 시즌." 이 말도 몇 번째다.' },
    { t: '이번 시즌을 마지막으로 정하고 은퇴를 발표한다.', meta: '평판 + · 커리어 종료', risk: 'SAFE', parent: 0, injury: 0, tags: ['discipline'],
      fx: (gg) => { gg.flags.farewell = true; gg.player.reputation += 6; },
      out: () => '발표한 다음 경기, 원정 관중석에서도 박수가 나왔다.' },
    { t: '지도자 자격증을 준비하며 마무리한다.', meta: '은퇴 후 지도자 트랙', risk: 'SAFE', parent: 1, injury: 0, tags: ['adaptability'],
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
      { t: '학업/직업 훈련에 집중한다.', meta: '평범한 삶의 안전망 · 드물게 크게 성공', risk: 'SAFE', parent: 1, injury: 0, tags: ['safe'],
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
      { t: '동네 팀에서 취미로 계속 찬다.', meta: '스트레스 − · 평범한 트랙', risk: 'SAFE', parent: 0, injury: 0, tags: [],
        fx: (gg) => { gg.player.willToPlay += 14; gg.player.stress -= 10; gg.flags.drifting = false; gg.flags.lifeTrack = gg.flags.lifeTrack || 'NORMAL'; },
        out: () => '수요일 저녁 리그. 아무도 스카우트하지 않지만, 이게 축구다.' },
      { t: '아무것도 하지 않는다.', meta: '표류 · Bad End 위험', risk: 'HIGH', parent: -1, injury: 0, tags: [],
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

  const h = HISTORY[g.world.year];
  if (h && g.world.phase === 'SUMMER' && !g.flags[`_h${g.world.year}`]) {
    g.flags[`_h${g.world.year}`] = true;
    pushLog(g, 'history', h.t.map((x) => `◆ ${x}`).join('\n'));
    if (h.money) g.player.econ.household = clamp(g.player.econ.household + h.money, 0, 100);
    if (h.boom) g.world.boom += h.boom;
  }

  applyGrowth(g);
  simulatePeriod(g);
  if (g.flags.wageBump) { g.player.econ.wageYear = round(g.player.econ.wageYear * g.flags.wageBump); g.flags.wageBump = 0; }
  nationalTeamCheck(g);

  if (age >= 37 || (g.flags.farewell && g.flags._farewellDone && g.world.phase === 'SUMMER')) return finish(g);
  if (g.flags.farewell) g.flags._farewellDone = true;
  if (!g.player.active && (age >= 27 || g.flags.injuryEnded)) return finish(g);

  const picked = g.rng.weighted(eligible(g));
  if (!picked) {
    if (age <= 11) { pushLog(g, 'system', '별일 없이 한 해가 지나갔다.'); advanceClock(g); return beginTurn(g); }
    g.pending = { id: 'quiet', body: '특별한 일 없이 지나갔다. 커리어의 대부분은 이런 기간이다.',
      choices: [{ t: '다음 기간으로.', risk: 'SAFE', parent: 0, injury: 0, tags: [], fx: () => {}, out: () => '' }] };
    return g;
  }
  setPending(g, picked.e);
  return g;
}

const CHAIN = ['trial_result', 'youth_offers', 'after_quit'];

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
  if (div === 1 && rep >= 80 && peakRep > 66 && apps > 260) return 'T2';   // 빅클럽 주축
  if (div === 1 && apps > 420) return 'T3';                                  // 1부 정착
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
      peakSalary: fmtMoney(Math.max(0, ...p.career.seasons.map((s) => s.salary || 0))),
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
      for (const a of s.ach) if (!prev.ach.includes(a)) prev.ach.push(a);
    } else {
      rows.set(key, {
        season: `${start}/${String((start + 1) % 100).padStart(2, '0')}`,
        age: s.age, club: s.club, league: s.league, div: s.div,
        apps: s.apps, goals: s.goals, assists: s.assists, rating: s.rating,
        salary: s.salary, ach: [...s.ach], _n: 1,
      });
    }
  }
  return [...rows.values()].map((r) => { delete r._n; return { ...r, salaryText: r.salary ? fmtMoney(r.salary) : '-' }; });
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
      father: `${g.npcs.father.name} · ${g.npcs.father.job}`,
      mother: `${g.npcs.mother.name} · ${g.npcs.mother.job}`,
    },
    econ: {
      wage: p.econ.wageYear ? fmtMoney(p.econ.wageYear) : '-',
      assets: fmtMoney(p.econ.assets),
      debt: p.econ.debt > 0 ? `${fmtMoney(p.econ.debt)} (이자 ${Math.round(p.econ.debtRate * 100)}%)` : '없음',
      hasDebt: p.econ.debt > 0,
    },
    teamAvg: p.club && !p.club.youth ? teamAvgAt(p.club, g.world.year) : null,
    fit: p.club && !p.club.youth ? fitLabel(g, p.club).label : null,
    awards: p.awards,
    sibling: g.npcs.sibling ? `${g.npcs.sibling.name} — ${{ STABLE: '안정', DRIFT: '이탈', SLUM: '슬럼', INCIDENT: '사건 이후', RECOVER: '회복', PRISON: '수감', DEAD: '사망' }[g.npcs.sibling.state]}` : '-',
    injuries: (p.career.injuries || []).slice(-3),
    coach: round(g.npcs.coach.trust),
    contract: p.contractUntil ? `${p.contractUntil}년까지` : '-',
    career: { apps: p.career.apps, goals: p.career.goals, assists: p.career.assists, caps: p.career.caps, reputation: round(p.reputation) },
    table: careerTable(g),
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
