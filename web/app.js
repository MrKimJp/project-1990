/* PROJECT 1990 — 텍스트 UI 레이어.
 * 이 파일은 엔진의 상태를 "표시"만 한다. 어떤 판정도 여기서 하지 않는다. */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

const UI = {
  screen: 'start',
  pick: { origin: 'ESP', parents: 'WORKING', seed: '' },
  game: null,
};

/* ─────────────── 시작 화면 ─────────────── */

function renderStart() {
  const root = $('#app');
  root.innerHTML = '';
  root.appendChild(masthead());

  const lede = el('div', 'lede');
  lede.innerHTML =
    '1990년에 태어난 한 아이의 인생을 <em>0세부터 36세까지</em> 시뮬레이션한다.<br>' +
    '경기를 직접 플레이하지 않는다. 대신 <em>부모를 설득하고, 클럽을 고르고, 부상을 견디고, 은퇴를 결정한다.</em><br>' +
    '<span class="muted">잠재력은 끝까지 공개되지 않는다. 커리어가 끝난 뒤에만, 무엇을 못 썼는지 알 수 있다.</span>';
  root.appendChild(lede);

  // Step 1 — 국적
  const c1 = el('div', 'card');
  c1.appendChild(el('h2', null, 'Step 1 — 출생 국적'));
  const g1 = el('div', 'opt-grid');
  for (const id of Object.keys(ORIGINS)) {
    const o = ORIGINS[id];
    const b = el('button', 'opt' + (UI.pick.origin === id ? ' sel' : ''));
    const t = el('div', 'ttl');
    t.appendChild(el('span', null, `${o.flag} ${o.label}`));
    t.appendChild(el('span', 'tag ' + (o.difficulty === '헬난이도' ? 'hell' : 'std'), o.difficulty));
    b.appendChild(t);
    b.appendChild(el('div', 'dsc', o.blurb + '\n→ ' + o.thesis));
    b.onclick = () => { UI.pick.origin = id; renderStart(); };
    g1.appendChild(b);
  }
  c1.appendChild(g1);
  root.appendChild(c1);

  // Step 2 — 부모
  const c2 = el('div', 'card');
  c2.appendChild(el('h2', null, 'Step 2 — 부모의 직업 및 가정 환경'));
  const g2 = el('div', 'opt-grid');
  for (const id of Object.keys(PARENTS)) {
    const p = PARENTS[id];
    const b = el('button', 'opt' + (UI.pick.parents === id ? ' sel' : ''));
    b.appendChild(el('div', 'ttl', p.label));
    b.appendChild(el('div', 'dsc', p.blurb));
    b.onclick = () => { UI.pick.parents = id; renderStart(); };
    g2.appendChild(b);
  }
  c2.appendChild(g2);
  root.appendChild(c2);

  // 시작
  const c3 = el('div', 'card');
  const r = el('div', 'row');
  const seedIn = el('input');
  seedIn.type = 'text';
  seedIn.placeholder = 'seed (선택)';
  seedIn.value = UI.pick.seed;
  seedIn.oninput = (e) => { UI.pick.seed = e.target.value; };
  const start = el('button', 'btn primary', '인생을 시작한다 →');
  start.onclick = () => {
    const s = UI.pick.seed.trim();
    const seed = s === '' ? (Math.random() * 2 ** 31) | 0 : hashSeed(s);
    UI.game = newGame({ origin: UI.pick.origin, parents: UI.pick.parents, seed });
    UI.screen = 'game';
    render();
  };
  const bt = el('button', 'btn ghost', '엔진 검증 (자동 시뮬 1,000회)');
  bt.onclick = () => { UI.screen = 'batch'; render(); };
  r.appendChild(start);
  r.appendChild(seedIn);
  r.appendChild(bt);
  c3.appendChild(r);
  c3.appendChild(el('div', 'muted', '같은 seed = 같은 인생. 비워두면 무작위.'));
  root.appendChild(c3);
  root.appendChild(footer());
}

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
  m.appendChild(el('div', 'sub', 'Football Life Simulation · 1990—2026'));
  return m;
}
function footer() {
  const f = el('div', 'foot');
  f.textContent = '엔진은 결과를 결정한다. 텍스트는 그 결과를 설명한다. · 구단명은 실제 명칭이며 모든 수치는 창작 밸런스 값이다.';
  return f;
}

/* ─────────────── 대시보드 ─────────────── */

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

function renderDash(g) {
  const d = dashboard(g);
  const card = el('div', 'card dash');
  card.appendChild(el('div', 'period', d.period));
  card.appendChild(el('div', 'who', `${g.player.name} · 만 ${d.age}세`));
  card.appendChild(el('div', 'club', `${d.club}\n${d.league} · ${d.position}`));

  const s0 = sec('컨디션');
  s0.appendChild(kv('폼(Form)', '★'.repeat(Math.max(1, Math.round(d.form / 20))) + '☆'.repeat(5 - Math.max(1, Math.round(d.form / 20)))));
  s0.appendChild(kv('사기', d.morale, d.morale === '최상' ? 'good' : d.morale === '불안' || d.morale === '흔들림' ? 'warn' : ''));
  s0.appendChild(kv('신체 상태', d.fitness, d.fitness.includes('부상') ? 'bad' : 'good'));
  s0.appendChild(kv('기간 기록', d.seasonLine, 'mute'));
  card.appendChild(s0);

  const s1 = sec('Visible Stats (1~20)');
  for (const k of Object.keys(d.stats)) {
    // 12/20 이상은 프로 수준으로 본다 — 눈에 바로 들어오게 강조색을 준다
    const row = el('div', 'stat' + (d.stats[k] >= 12 ? ' hi' : ''));
    row.appendChild(el('div', 'sl', STAT_LABELS[k]));
    const bar = el('div', 'sb');
    const fill = el('i');
    fill.style.width = `${(d.stats[k] / 20) * 100}%`;
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(el('div', 'sv', String(d.stats[k])));
    s1.appendChild(row);
  }
  s1.appendChild(kv('잠재력 (PA)', d.potential, 'mute'));
  card.appendChild(s1);

  const s2 = sec('Socio-Economic');
  s2.appendChild(kv('기본 연봉', d.econ.wage));
  s2.appendChild(kv('누적 자산', d.econ.assets));
  s2.appendChild(kv('광고 수입', d.econ.endorsements));
  s2.appendChild(kv('SNS 팔로워', d.econ.followers));
  s2.appendChild(kv('가문 내 영향력', d.econ.familyInfluence, Number(d.econ.familyInfluence.replace('%', '')) > 50 ? 'good' : ''));
  card.appendChild(s2);

  const s3 = sec('관계');
  s3.appendChild(kv('아버지', String(d.social.father)));
  s3.appendChild(kv('어머니', String(d.social.mother)));
  s3.appendChild(kv('감독 신뢰', String(d.social.coach), d.social.coach > 65 ? 'good' : d.social.coach < 35 ? 'bad' : ''));
  if (d.age <= 20) s3.appendChild(kv('부모의 축구 수용도', String(d.social.parentBuyIn), d.social.parentBuyIn < 35 ? 'bad' : ''));
  s3.appendChild(kv('라이벌', d.social.rival, 'mute'));
  s3.appendChild(kv('사촌', d.social.cousin, 'mute'));
  card.appendChild(s3);

  const s4 = sec('통산');
  s4.appendChild(kv('경기 / 골 / 도움', `${d.career.apps} / ${d.career.goals} / ${d.career.assists}`));
  s4.appendChild(kv('A매치', String(d.career.caps)));
  s4.appendChild(kv('평판', String(d.career.reputation)));
  card.appendChild(s4);

  card.appendChild(el('div', 'hidden-note',
    'Hidden: 잠재력 · 유리몸 지수 · 빅매치 멘탈 · 적응력 · 독기는 플레이 중 열람할 수 없다.'));
  return card;
}

/* ─────────────── 게임 화면 ─────────────── */

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
  for (const b of g.log) {
    const blk = el('div', 'blk ' + b.kind);
    blk.textContent = b.text;
    log.appendChild(blk);
  }
  logCard.appendChild(log);

  if (g.pending) {
    const ch = el('div', 'choices');
    g.pending.choices.forEach((c, i) => {
      const b = el('button', 'choice-btn');
      b.appendChild(el('span', 'n', `[${i + 1}]`));
      b.appendChild(el('span', null, c.t));
      b.onclick = () => { choose(g, i); render(); };
      ch.appendChild(b);
    });
    logCard.appendChild(ch);
  }
  right.appendChild(logCard);

  const tools = el('div', 'card');
  const tr = el('div', 'row');
  if (ageOf(g) <= 7) {
    const skip = el('button', 'btn ghost', '유년기 빠르게 넘기기 (8세까지 자동)');
    skip.onclick = () => { while (!g.over && ageOf(g) < 8) autoStep(g); render(); };
    tr.appendChild(skip);
  }
  const auto1 = el('button', 'btn ghost', '이 턴 자동 선택');
  auto1.onclick = () => { autoStep(g); render(); };
  const restart = el('button', 'btn ghost', '처음부터');
  restart.onclick = () => { UI.screen = 'start'; UI.game = null; render(); };
  tr.appendChild(auto1);
  tr.appendChild(restart);
  tools.appendChild(tr);
  tools.appendChild(el('div', 'muted', `seed ${g.seed} · turn ${g.turn} · 가변형 타임라인: ${cadenceOf(ageOf(g)) === 'HALF' ? '반년 단위 (16~29세)' : '1년 단위'}`));
  right.appendChild(tools);

  stage.appendChild(right);
  root.appendChild(stage);
  root.appendChild(footer());
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
}

/* ─────────────── 엔딩 화면 ─────────────── */

function renderEnding() {
  const g = UI.game;
  const b = g.ending.bio;
  const root = $('#app');
  root.innerHTML = '';
  root.appendChild(masthead());

  const k = el('div', 'card ending-key');
  k.appendChild(el('div', 'k', g.ending.t));
  k.appendChild(el('div', 'd', g.ending.d));
  root.appendChild(k);

  const c = el('div', 'card bio');
  c.appendChild(el('h2', null 	, 'Career Biography'));
  const g2 = el('div', 'grid2');
  const L = el('div'), R = el('div');
  L.appendChild(kv('이름', b.name));
  L.appendChild(kv('생몰', b.span));
  L.appendChild(kv('출생', b.origin));
  L.appendChild(kv('가정', b.parents));
  L.appendChild(kv('포지션', b.position));
  L.appendChild(kv('통산 경기', String(b.apps)));
  L.appendChild(kv('골 / 도움', `${b.goals} / ${b.assists}`));
  L.appendChild(kv('대표팀', `${b.ntTeam} — ${b.caps}경기 ${b.ntGoals}골`));
  R.appendChild(kv('누적 자산', b.assets));
  R.appendChild(kv('SNS 팔로워', b.followers));
  R.appendChild(kv('가문 내 영향력', b.familyInfluence));
  R.appendChild(kv('최종 능력', String(b.finalOvr), 'mute'));
  R.appendChild(kv('전성기 능력', String(b.peakOvr), 'good'));
  R.appendChild(kv('잠재력 (PA) — 최초 공개', String(b.revealedPotential), 'warn'));
  R.appendChild(kv('쓰지 못한 재능', `-${b.unrealized}`, b.unrealized > 12 ? 'bad' : 'mute'));
  R.appendChild(kv('라이벌', b.rival, 'mute'));
  g2.appendChild(L); g2.appendChild(R);
  c.appendChild(g2);

  const s = sec('커리어 경로');
  s.appendChild(el('div', 'muted', b.path.join('  →  ') || '기록 없음'));
  c.appendChild(s);

  if (b.trophies.length) {
    const t = sec('주요 이력');
    t.appendChild(el('div', 'muted', b.trophies.join(' · ')));
    c.appendChild(t);
  }

  const q = sec('결정적 장면');
  q.appendChild(kv('전환점', b.turning));
  q.appendChild(kv('가장 후회되는 순간', b.regret));
  q.appendChild(kv('가장 중요했던 사람', b.keyPerson));
  q.appendChild(kv('사촌', b.cousin));
  c.appendChild(q);
  root.appendChild(c);

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
  tl.appendChild(line);
  root.appendChild(tl);

  const act = el('div', 'card');
  const r = el('div', 'row');
  const again = el('button', 'btn primary', '다른 인생을 살아본다');
  again.onclick = () => { UI.screen = 'start'; UI.game = null; render(); };
  const same = el('button', 'btn ghost', '같은 조건으로 한 번 더');
  same.onclick = () => {
    UI.game = newGame({ origin: UI.pick.origin, parents: UI.pick.parents, seed: (Math.random() * 2 ** 31) | 0 });
    UI.screen = 'game'; render();
  };
  r.appendChild(again); r.appendChild(same);
  act.appendChild(r);
  act.appendChild(el('div', 'muted', `seed ${g.seed} — 이 인생을 다시 보려면 이 숫자를 입력하면 된다.`));
  root.appendChild(act);
  root.appendChild(footer());
  window.scrollTo(0, 0);
}

/* ─────────────── 배치 검증 화면 ─────────────── */

const ORDER = ['WORLD_CLASS', 'TOP_FLIGHT', 'PRO', 'SECOND_DIV', 'SEMI_PRO', 'COLLEGE', 'INJURY_OUT', 'COACH', 'QUIT', 'NEVER_MADE_IT'];

function renderBatch() {
  const root = $('#app');
  root.innerHTML = '';
  root.appendChild(masthead());

  const info = el('div', 'card');
  info.appendChild(el('h2', null, '엔진 검증 — 플레이어 UI보다 먼저 만들어야 하는 도구'));
  info.appendChild(el('div', 'muted',
    '"1990년생 아이를 36세까지 N번 자동 시뮬레이션했을 때, 매번 다른 이야기가 나오는가?"\n' +
    '같은 엔진에 서로 다른 출생 조건을 넣었을 때 결과 분포가 실제로 갈라지는지가 이 프로젝트의 1차 검증 기준이다.'));
  const r = el('div', 'row');
  const n = el('input'); n.type = 'number'; n.value = '1000'; n.min = '50'; n.max = '5000';
  const run = el('button', 'btn primary', '두 지역 비교 실행');
  const back = el('button', 'btn ghost', '← 돌아가기');
  back.onclick = () => { UI.screen = 'start'; render(); };
  const out = el('div');
  run.onclick = () => {
    run.disabled = true;
    out.innerHTML = '';
    const sp = el('div', 'muted'); sp.innerHTML = '<span class="spin"></span> 시뮬레이션 중…';
    out.appendChild(sp);
    setTimeout(() => {
      out.innerHTML = '';
      const cnt = Math.max(50, Math.min(5000, Number(n.value) || 1000));
      for (const o of ['ESP', 'USA']) {
        const t0 = performance.now();
        const res = batch(cnt, { origin: o, parents: UI.pick.parents, keepSamples: 5 });
        out.appendChild(batchCard(o, res, performance.now() - t0));
      }
      run.disabled = false;
    }, 30);
  };
  r.appendChild(run); r.appendChild(n); r.appendChild(back);
  info.appendChild(r);
  root.appendChild(info);
  root.appendChild(out);
  root.appendChild(footer());
}

function batchCard(originId, res, ms) {
  const o = ORIGINS[originId];
  const c = el('div', 'card');
  c.appendChild(el('h2', null, `${o.flag} ${o.label} — ${res.n} playthroughs (${Math.round(ms)}ms)`));
  for (const k of ORDER) {
    const n = res.counts[k] || 0;
    const pct = (n / res.n) * 100;
    const row = el('div', 'brow');
    row.appendChild(el('div', 'nm', ENDING_LABELS[k].t));
    row.appendChild(el('div', 'ct', String(n)));
    row.appendChild(el('div', 'pc', pct.toFixed(1) + '%'));
    const bb = el('div', 'bb'); const i = el('i'); i.style.width = `${Math.min(100, pct * 2.6)}%`;
    bb.appendChild(i); row.appendChild(bb);
    c.appendChild(row);
  }
  const pro = ['WORLD_CLASS', 'TOP_FLIGHT', 'PRO'].reduce((s, k) => s + (res.counts[k] || 0), 0);
  const paid = pro + (res.counts.SECOND_DIV || 0) + (res.counts.SEMI_PRO || 0);
  const s = sec('요약');
  s.appendChild(kv('1부 이상 프로', ((pro / res.n) * 100).toFixed(1) + '%', 'good'));
  s.appendChild(kv('축구로 급여를 받은 인생', ((paid / res.n) * 100).toFixed(1) + '%'));
  s.appendChild(kv('축구를 그만둔 인생', (((res.counts.QUIT || 0) / res.n) * 100).toFixed(1) + '%', 'warn'));
  c.appendChild(s);

  const sm = sec('샘플 — 같은 재능이 다른 인생이 되는가');
  for (const x of res.samples) {
    const d = el('div', 'muted');
    d.style.marginBottom = '7px';
    d.textContent = `PA ${x.pot} → 전성기 ${x.peak} (쓰지 못한 재능 ${x.pot - x.peak}) · ${x.apps}경기 ${x.goals}골 · A매치 ${x.caps} · ${ENDING_LABELS[x.ending].t}\n${x.path || '클럽 이력 없음'}`;
    d.style.whiteSpace = 'pre-wrap';
    sm.appendChild(d);
  }
  c.appendChild(sm);
  return c;
}

/* ─────────────── 라우터 ─────────────── */

function render() {
  if (UI.game && UI.game.over) { renderEnding(); return; }
  if (UI.screen === 'game') { renderGame(); return; }
  if (UI.screen === 'batch') { renderBatch(); return; }
  renderStart();
}

document.addEventListener('keydown', (e) => {
  if (UI.screen !== 'game' || !UI.game || !UI.game.pending) return;
  const i = parseInt(e.key, 10);
  if (i >= 1 && i <= UI.game.pending.choices.length) { choose(UI.game, i - 1); render(); }
});

render();
