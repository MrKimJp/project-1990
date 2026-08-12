/* PROJECT 1990 Copero Edition — UI 레이어.
 * 엔진 상태를 "표시"만 한다. 어떤 판정도 여기서 하지 않는다. */

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const UI = { screen: 'start', game: null, preview: null, seedText: '' };

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 1;
}
function masthead() {
  const m = el('div', 'masthead');
  const h = el('h1');
  h.appendChild(el('span', null, 'Project'));
  h.appendChild(document.createTextNode(' 1990'));
  m.appendChild(h);
  m.appendChild(el('div', 'sub', `Football Legend · Copero Edition · 클럽 ${CLUB_COUNT} · 역사 이벤트 ${HISTORY_COUNT}`));
  return m;
}
function footer() {
  return el('div', 'foot', '엔진이 결과를 결정하고 텍스트가 그것을 설명한다 · 구단명은 실제 명칭이며 모든 수치는 창작 밸런스 값이다');
}
function kv(k, v, cls) {
  const r = el('div', 'kv');
  r.appendChild(el('span', 'k', k));
  r.appendChild(el('span', 'v' + (cls ? ' ' + cls : ''), v));
  return r;
}
function sec(label) {
  const s = el('div', 'dsec');
  s.appendChild(el('div', 'lbl', label));
  return s;
}

/* ─────────── 시작 화면 (출생 조건은 전부 랜덤 롤) ─────────── */

function renderStart() {
  const root = $('#app');
  root.innerHTML = '';
  root.appendChild(masthead());

  const lede = el('div', 'lede');
  lede.innerHTML =
    '1990년 바르셀로나 출생. <em>만 16세, 프로가 되기 위한 첫 여름부터</em> 시작한다.<br>' +
    '0~15세는 플레이하지 않지만 시뮬레이션은 돌아간다 — 그 결과가 <em>배경설정</em>으로 주어진다.<br>' +
    '<em>매 시즌 이적시장에서 팀을 고르고, 팀 평균 능력과 자신을 비교하고, 부상과 빚을 견디고, 은퇴를 결정한다.</em><br>' +
    '<span class="muted">28세에 능력이 피크를 찍고 이후 하락한다. 잠재력은 은퇴할 때까지 공개되지 않는다.</span>';
  root.appendChild(lede);

  if (!UI.preview) UI.preview = newGame({ seed: (Math.random() * 2 ** 31) | 0 });
  const r = rollSummary(UI.preview);

  const c = el('div', 'card');
  c.appendChild(el('h2', null, '출생 조건 (무작위)'));
  c.appendChild(kv('이름', r.name, 'gold'));
  c.appendChild(kv('가정환경', r.env));
  c.appendChild(el('div', 'muted', r.envBlurb));
  const s1 = sec('가족');
  s1.appendChild(kv('아버지', r.father));
  s1.appendChild(kv('어머니', r.mother));
  s1.appendChild(kv('부모 성향', r.personality, 'gold'));
  s1.appendChild(el('div', 'muted', r.personalityBlurb));
  s1.appendChild(kv('축구 반응', r.reaction));
  s1.appendChild(kv('포지션', r.position));
  c.appendChild(s1);
  root.appendChild(c);

  const act = el('div', 'card');
  const row = el('div', 'row');
  const start = el('button', 'btn primary', '이 인생을 시작한다 →');
  start.onclick = () => { UI.game = UI.preview; UI.preview = null; UI.screen = 'game'; render(); };
  const reroll = el('button', 'btn', '다시 굴리기');
  reroll.onclick = () => { UI.preview = newGame({ seed: (Math.random() * 2 ** 31) | 0 }); render(); };
  const seedIn = el('input');
  seedIn.type = 'text'; seedIn.placeholder = 'seed (선택)'; seedIn.value = UI.seedText;
  seedIn.oninput = (e) => { UI.seedText = e.target.value; };
  const apply = el('button', 'btn ghost', 'seed 적용');
  apply.onclick = () => {
    const t = UI.seedText.trim();
    UI.preview = newGame({ seed: t === '' ? (Math.random() * 2 ** 31) | 0 : hashSeed(t) });
    render();
  };
  const bt = el('button', 'btn ghost', '엔진 검증 (자동 시뮬)');
  bt.onclick = () => { UI.screen = 'batch'; render(); };
  [start, reroll, seedIn, apply, bt].forEach((x) => row.appendChild(x));
  act.appendChild(row);
  act.appendChild(el('div', 'muted', `seed ${UI.preview.seed} · 같은 seed = 같은 인생`));
  root.appendChild(act);
  root.appendChild(footer());
}

/* ─────────── 좌측 Copero 대시보드 ─────────── */

function renderDash(g) {
  const d = dashboard(g);
  const card = el('div', 'card dash');
  card.appendChild(el('div', 'period', d.period));
  card.appendChild(el('div', 'who', d.name));

  const p0 = sec('프로필');
  p0.appendChild(kv('나이', `만 ${d.age}세 (1990년생)`));
  p0.appendChild(kv('국적', d.nationality));
  p0.appendChild(kv('포지션', d.position));
  p0.appendChild(kv('소속팀', d.club, 'gold'));
  p0.appendChild(kv('리그', d.league));
  p0.appendChild(kv('계약', d.contract, 'mute'));
  card.appendChild(p0);

  // 현재 능력 — 세부 스탯 없음
  const ca = el('div', 'ca');
  ca.appendChild(el('div', 'n', String(d.ability)));
  const meta = el('div', 'meta');
  meta.appendChild(el('div', 't', 'Current Ability'));
  meta.appendChild(el('div', 'd', d.abilityLabel));
  ca.appendChild(meta);
  ca.appendChild(el('div', 'pa', `PA\n${d.potential}`));
  const s1 = sec('능력 / 컨디션');
  s1.appendChild(ca);
  s1.appendChild(kv('폼(Form)', '★'.repeat(Math.max(1, Math.round(d.form / 20))) + '☆'.repeat(5 - Math.max(1, Math.round(d.form / 20)))));
  s1.appendChild(kv('컨디션', d.condition));
  s1.appendChild(kv('멘탈', d.mental, d.mental === '최상' ? 'good' : d.mental === '불안' ? 'bad' : d.mental === '흔들림' ? 'warn' : ''));
  s1.appendChild(kv('신체 건강', d.health, d.health === '건강' ? 'good' : 'bad'));
  if (d.teamAvg != null) {
    s1.appendChild(kv('팀 평균 능력', `${d.teamAvg} (내 능력 ${d.ability})`, d.ability >= d.teamAvg ? 'good' : 'warn'));
    s1.appendChild(kv('팀 내 위치', d.fit, d.fit === '즉시 주전' ? 'good' : d.fit === '전력 외' ? 'bad' : ''));
  }
  if (d.club !== '무소속') s1.appendChild(kv('감독 신뢰', String(d.coach), d.coach > 65 ? 'good' : d.coach < 35 ? 'bad' : ''));
  if (d.injuries.length) {
    s1.appendChild(kv('부상 이력', d.injuries.map((x) => `${x.name}(-${x.ovrLoss})`).join(', '), 'bad'));
  }
  card.appendChild(s1);

  // 부모 및 가정
  const s2 = sec('부모 및 가정');
  s2.appendChild(kv('가정환경', d.family.env));
  s2.appendChild(kv('아버지', d.family.father, 'mute'));
  s2.appendChild(kv('어머니', d.family.mother, 'mute'));
  s2.appendChild(kv('부모 성향', d.family.personality, 'gold'));
  s2.appendChild(kv('형', d.sibling, 'mute'));
  s2.appendChild(kv('가계 상태', d.family.household,
    d.family.household === '안정' ? 'good' : d.family.household === '어려움' ? 'bad' : 'warn'));
  card.appendChild(s2);

  // 경제 / 통산
  const s3 = sec('수입 / 통산');
  s3.appendChild(kv('주급', d.econ.wage, 'good'));
  s3.appendChild(kv('연봉 환산', d.econ.wageYearly, 'mute'));
  s3.appendChild(kv('누적 자산', d.econ.assets, 'good'));
  s3.appendChild(kv('부채', d.econ.debt, d.econ.hasDebt ? 'bad' : 'mute'));
  s3.appendChild(kv('경기 / 골 / 도움', `${d.career.apps} / ${d.career.goals} / ${d.career.assists}`));
  s3.appendChild(kv('A매치', String(d.career.caps)));
  s3.appendChild(kv('평판', String(d.career.reputation)));
  card.appendChild(s3);

  // 시즌별 커리어 기록
  const s4 = sec('시즌별 커리어 기록');
  s4.appendChild(careerTableEl(d.table));
  card.appendChild(s4);

  const aw = d.awards;
  if (aw.ballonDor || aw.ballonTop3 || aw.uclApps) {
    const sa = sec('개인 수상 / 유럽대항전');
    if (aw.ballonDor) sa.appendChild(kv('발롱도르', `${aw.ballonDor}회 수상`, 'gold'));
    if (aw.ballonTop3) sa.appendChild(kv('발롱도르 후보', `${aw.ballonTop3}회`, 'gold'));
    if (aw.uclApps) sa.appendChild(kv('UCL 참가', `${aw.uclApps}시즌`));
    if (aw.uclTitles) sa.appendChild(kv('UCL 우승', `${aw.uclTitles}회`, 'gold'));
    card.appendChild(sa);
  }
  if (d.trophies.length) {
    const s5 = sec('트로피 / 수상');
    const chips = el('div', 'chips');
    d.trophies.forEach((t) => chips.appendChild(el('span', 'chip', t)));
    s5.appendChild(chips);
    card.appendChild(s5);
  }

  if (d.climate && d.climate.length) {
    const sc = sec('이적시장 기후');
    d.climate.forEach((t) => sc.appendChild(el('div', 'muted', '· ' + t)));
    card.appendChild(sc);
  }

  const s6 = sec('선수 근황');
  const ul = el('ul', 'news');
  d.news.forEach((n) => ul.appendChild(el('li', null, n.text)));
  if (!d.news.length) ul.appendChild(el('li', null, '아직 기록된 근황이 없다.'));
  s6.appendChild(ul);
  card.appendChild(s6);

  return card;
}

function careerTableEl(rows) {
  if (!rows.length) return el('div', 'empty', '아직 성인 무대 기록이 없다.');
  const wrap = el('div', 'tbl-wrap');
  const t = el('table', 'career');
  const thead = el('thead'); const htr = el('tr');
  ['시즌', '소속팀', '리그', '순위', '출전', '골', '도움', '평점', '주급', '클럽대항전', '국가대항전', '트로피/업적']
    .forEach((h) => htr.appendChild(el('th', null, h)));
  thead.appendChild(htr); t.appendChild(thead);
  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    tr.appendChild(el('td', null, r.season));
    tr.appendChild(el('td', 'club', r.club));
    tr.appendChild(el('td', 'lg', `${r.league.replace(/\s*\(.*\)$/, '')} ${r.div}부`));
    tr.appendChild(el('td', 'rank', r.finishText));
    tr.appendChild(el('td', null, String(r.apps)));
    tr.appendChild(el('td', null, String(r.goals)));
    tr.appendChild(el('td', null, String(r.assists)));
    tr.appendChild(el('td', null, r.rating.toFixed(2)));
    tr.appendChild(el('td', 'sal', r.salaryText));
    tr.appendChild(el('td', 'cup', r.uclText));
    tr.appendChild(el('td', 'nt', r.ntText));
    tr.appendChild(el('td', 'ach', r.ach.join(', ') || '—'));
    tb.appendChild(tr);
  }
  t.appendChild(tb); wrap.appendChild(t);
  return wrap;
}

/* ─────────── 우측 서사 + 선택지 배지 ─────────── */

function choiceButton(c, i, onPick) {
  const b = el('button', 'choice-btn');
  const hd = el('div', 'hd');
  hd.appendChild(el('span', 'n', `[${i + 1}]`));
  hd.appendChild(el('span', null, c.t));
  b.appendChild(hd);
  // 위험도·부모 반응 배지는 제거했다. 대신 실제 수치 결과만 보여준다.
  if (c.meta) b.appendChild(el('div', 'meta', c.meta));
  if (c.fit) {
    const bd = el('div', 'badges');
    const cls = c.fit.d >= 4 ? 'safe' : c.fit.d >= -4 ? 'mid' : 'high';
    bd.appendChild(el('span', 'bdg ' + cls, c.fit.label));
    b.appendChild(bd);
  }
  b.onclick = onPick;
  return b;
}

function renderGame() {
  const g = UI.game;
  const root = $('#app');
  root.innerHTML = '';
  root.appendChild(masthead());

  const stage = el('div', 'stage');
  stage.appendChild(renderDash(g));

  const right = el('div');
  const logCard = el('div', 'card');
  const log = el('div', 'log');
  for (const b of g.log) log.appendChild(el('div', 'blk ' + b.kind, b.text));
  if (g.pending) log.appendChild(el('div', 'blk log-end', '── 현재 상황 ──'));
  logCard.appendChild(log);

  // 문제 4·7 수정: 이벤트 본문은 선택 "전에" 보여야 한다.
  // 이전에는 choose() 시점에만 로그에 들어가서, 플레이어는 본문 없이 선택지만 봤다.
  if (g.pending && g.pending.body) {
    const now = el('div', 'now');
    now.appendChild(el('div', 'now-tag', periodLabel(g)));
    now.appendChild(el('div', 'now-body', g.pending.body));
    logCard.appendChild(now);
  }

  if (g.pending) {
    const ch = el('div', 'choices');
    g.pending.choices.forEach((c, i) => {
      ch.appendChild(choiceButton(c, i, () => { choose(g, i); render(); }));
    });
    logCard.appendChild(ch);
  }
  right.appendChild(logCard);

  const tools = el('div', 'card');
  const tr = el('div', 'row');
  const auto1 = el('button', 'btn ghost', '이 턴 자동 선택');
  auto1.onclick = () => { autoStep(g); render(); };
  const restart = el('button', 'btn ghost', '처음부터');
  restart.onclick = () => { UI.game = null; UI.preview = null; UI.screen = 'start'; render(); };
  tr.appendChild(auto1); tr.appendChild(restart);
  tools.appendChild(tr);
  tools.appendChild(el('div', 'muted',
    `seed ${g.seed} · turn ${g.turn} · ${cadenceOf(ageOf(g)) === 'HALF' ? '반년 단위 (16~29세)' : '1년 단위'}`));
  right.appendChild(tools);

  stage.appendChild(right);
  root.appendChild(stage);
  root.appendChild(footer());
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
}

/* ─────────── 엔딩 ─────────── */

function renderEnding() {
  const g = UI.game;
  const b = g.ending.bio;
  const root = $('#app');
  root.innerHTML = '';
  root.appendChild(masthead());

  const k = el('div', 'card ending-key');
  k.appendChild(el('div', 'k', g.ending.t));
  k.appendChild(el('div', 'd', g.ending.d));
  if (g.ending.epilogue) k.appendChild(el('div', 'epi', g.ending.epilogue));
  k.appendChild(el('div', 'cell', `엔딩 매트릭스 ${g.ending.cell} · 가정환경 그룹: ${g.ending.groupLabel}`));
  root.appendChild(k);

  const c = el('div', 'card bio');
  c.appendChild(el('h2', null, 'Career Biography'));
  const gr = el('div', 'grid2'); const L = el('div'), R = el('div');
  L.appendChild(kv('이름', b.name)); L.appendChild(kv('생몰', b.span));
  L.appendChild(kv('가정환경', b.env)); L.appendChild(kv('아버지', b.father));
  L.appendChild(kv('어머니', b.mother)); L.appendChild(kv('부모 성향', b.personality));
  L.appendChild(kv('최종 축구 반응', b.reaction)); L.appendChild(kv('포지션', b.position));
  R.appendChild(kv('통산 경기', String(b.apps)));
  R.appendChild(kv('골 / 도움', `${b.goals} / ${b.assists}`));
  R.appendChild(kv('대표팀', `${b.ntTeam} — ${b.caps}경기 ${b.ntGoals}골`));
  R.appendChild(kv('최고 연봉', b.peakSalary, 'good'));
  R.appendChild(kv('누적 자산', b.assets, 'good'));
  R.appendChild(kv('전성기 능력', String(b.peakOvr), 'gold'));
  R.appendChild(kv('잠재력(PA) 최초 공개', String(b.revealedPotential), 'warn'));
  R.appendChild(kv('쓰지 못한 재능', `-${b.unrealized}`, b.unrealized > 12 ? 'bad' : 'mute'));
  R.appendChild(kv('발롱도르', b.awards.ballonDor ? `${b.awards.ballonDor}회` : '없음', b.awards.ballonDor ? 'gold' : 'mute'));
  R.appendChild(kv('UCL 우승 / 참가', `${b.awards.uclTitles}회 / ${b.awards.uclApps}시즌`));
  R.appendChild(kv('통산 수령액', b.totalEarned, 'good'));
  R.appendChild(kv('남은 부채', b.debt, b.debt === '없음' ? 'mute' : 'bad'));
  gr.appendChild(L); gr.appendChild(R); c.appendChild(gr);

  if (b.injuries.length) {
    const si = sec('주요 부상 이력');
    b.injuries.forEach((x) => si.appendChild(kv(`${x.year}년 (만 ${x.age}세)`, `${x.name} · ${x.weeks}주 · 능력 -${x.ovrLoss}`, 'bad')));
    c.appendChild(si);
  }
  const q = sec('결정적 장면');
  q.appendChild(kv('전환점', b.turning));
  q.appendChild(kv('가장 후회되는 순간', b.regret));
  c.appendChild(q);
  if (b.trophies.length) {
    const t = sec('트로피 / 수상');
    const chips = el('div', 'chips');
    b.trophies.forEach((x) => chips.appendChild(el('span', 'chip', x)));
    t.appendChild(chips); c.appendChild(t);
  }
  root.appendChild(c);

  const tc = el('div', 'card');
  tc.appendChild(el('h2', null, '시즌별 커리어 기록 (통산)'));
  tc.appendChild(careerTableEl(b.table));
  root.appendChild(tc);

  const tl = el('div', 'card');
  tl.appendChild(el('h2', null, '인생 타임라인'));
  const line = el('div', 'timeline');
  for (const m of b.memories) {
    const row = el('div', 'tl' + (m.importance >= 0.8 ? ' big' : ''));
    row.appendChild(el('div', 'yr', `${m.year}년 · 만 ${m.age}세`));
    row.appendChild(el('div', 'tx', m.text));
    line.appendChild(row);
  }
  if (!b.memories.length) line.appendChild(el('div', 'muted', '기록된 기억이 없다.'));
  tl.appendChild(line); root.appendChild(tl);

  const act = el('div', 'card');
  const row = el('div', 'row');
  const again = el('button', 'btn primary', '다른 인생을 살아본다');
  again.onclick = () => { UI.game = null; UI.preview = null; UI.screen = 'start'; render(); };
  row.appendChild(again);
  act.appendChild(row);
  act.appendChild(el('div', 'muted', `seed ${g.seed} — 이 인생을 다시 보려면 이 숫자를 입력하면 된다.`));
  root.appendChild(act);
  root.appendChild(footer());
  window.scrollTo(0, 0);
}

/* ─────────── 배치 검증 ─────────── */

const ORDER = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'NP_SUCCESS', 'NP_NORMAL', 'NP_BAD'];

function renderBatch() {
  const root = $('#app');
  root.innerHTML = '';
  root.appendChild(masthead());
  const info = el('div', 'card');
  info.appendChild(el('h2', null, '엔진 검증 — 가정환경이 결과를 가르는가'));
  info.appendChild(el('div', 'muted',
    '같은 엔진에 서로 다른 가정환경을 넣었을 때 결과 분포가 실제로 갈라지는지가 이 프로젝트의 1차 검증 기준이다.\n' +
    '능력치에는 어떤 환경 보정도 없다. 차이는 전부 기회에 대한 접근성에서 나온다.'));
  const row = el('div', 'row');
  const n = el('input'); n.type = 'number'; n.value = '500'; n.min = '50'; n.max = '3000';
  const run = el('button', 'btn primary', '가정환경 7종 비교 실행');
  const back = el('button', 'btn ghost', '← 돌아가기');
  back.onclick = () => { UI.screen = 'start'; render(); };
  const out = el('div');
  run.onclick = () => {
    run.disabled = true; out.innerHTML = '';
    const sp = el('div', 'muted'); sp.innerHTML = '<span class="spin"></span> 시뮬레이션 중…';
    out.appendChild(sp);
    setTimeout(() => {
      out.innerHTML = '';
      const cnt = Math.max(50, Math.min(3000, Number(n.value) || 500));
      for (const id of Object.keys(FAMILY_ENVS)) {
        const t0 = performance.now();
        out.appendChild(batchCard(id, batch(cnt, { env: id, keepSamples: 2 }), performance.now() - t0));
      }
      run.disabled = false;
    }, 30);
  };
  row.appendChild(run); row.appendChild(n); row.appendChild(back);
  info.appendChild(row);
  root.appendChild(info); root.appendChild(out); root.appendChild(footer());
}

function batchCard(envId, res, ms) {
  const c = el('div', 'card');
  c.appendChild(el('h2', null, `${FAMILY_ENVS[envId].label} — ${res.n}회 (${Math.round(ms)}ms)`));
  for (const k of ORDER) {
    const v = res.counts[k] || 0;
    const pct = (v / res.n) * 100;
    const r = el('div', 'brow');
    r.appendChild(el('div', 'nm', TIERS[k].t));
    r.appendChild(el('div', 'ct', String(v)));
    r.appendChild(el('div', 'pc', pct.toFixed(1) + '%'));
    const bb = el('div', 'bb'); const i = el('i');
    i.style.width = `${Math.min(100, pct * 2.4)}%`; bb.appendChild(i); r.appendChild(bb);
    c.appendChild(r);
  }
  const pro = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].reduce((s, k) => s + (res.counts[k] || 0), 0);
  const elite = ['T1', 'T2', 'T3'].reduce((s, k) => s + (res.counts[k] || 0), 0);
  const s = sec('요약');
  s.appendChild(kv('프로 진출', ((pro / res.n) * 100).toFixed(1) + '%', 'good'));
  s.appendChild(kv('1부 정착 (T1~T3)', ((elite / res.n) * 100).toFixed(1) + '%', 'gold'));
  s.appendChild(kv('Bad End', (((res.counts.NP_BAD || 0) / res.n) * 100).toFixed(1) + '%', 'bad'));
  c.appendChild(s);
  return c;
}

/* ─────────── 라우터 ─────────── */

function render() {
  if (UI.game && UI.game.over) return renderEnding();
  if (UI.screen === 'game') return renderGame();
  if (UI.screen === 'batch') return renderBatch();
  return renderStart();
}
document.addEventListener('keydown', (e) => {
  if (UI.screen !== 'game' || !UI.game || !UI.game.pending) return;
  const i = parseInt(e.key, 10);
  if (i >= 1 && i <= UI.game.pending.choices.length) { choose(UI.game, i - 1); render(); }
});
render();
