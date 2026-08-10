#!/usr/bin/env node
/**
 * 엔진 검증기 — 플레이어 UI보다 먼저 만들고, 밸런싱은 여기서 잡는다.
 *   node tools/batch.mjs            # 1000회
 *   node tools/batch.mjs 3000       # 회수 지정
 *   node tools/batch.mjs 1000 IMM_LOW   # 가정환경 고정
 */
import { batch, TIERS, FAMILY_ENVS, CLUB_COUNT, HISTORY_COUNT, LEAGUE_LIST, _internal } from '../src/engine.js';

const n = Number(process.argv[2]) || 1000;
const envArg = process.argv[3];

const ORDER = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'NP_SUCCESS', 'NP_NORMAL', 'NP_BAD'];
const bar = (pct, w = 26) => '█'.repeat(Math.round((pct / 100) * w)) + '░'.repeat(w - Math.round((pct / 100) * w));

console.log(`\n데이터베이스: 클럽 ${CLUB_COUNT}개 / 리그 ${LEAGUE_LIST.length}개 / 역사 이벤트 ${HISTORY_COUNT}개`);
console.log(`리그 구성: ${LEAGUE_LIST.filter((l) => l.div === 1).length}개 1부 · ${LEAGUE_LIST.filter((l) => l.div === 2).length}개 2부 · ${LEAGUE_LIST.filter((l) => l.div === 3).length}개 3부`);

function report(title, res) {
  console.log(`\n${'═'.repeat(66)}\n  ${title} — ${res.n} playthroughs\n${'═'.repeat(66)}`);
  for (const k of ORDER) {
    const c = res.counts[k] || 0;
    const pct = (c / res.n) * 100;
    console.log(`  ${TIERS[k].t.padEnd(28)} ${String(c).padStart(5)}  ${pct.toFixed(1).padStart(5)}%  ${bar(pct)}`);
  }
  const pro = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].reduce((s, k) => s + (res.counts[k] || 0), 0);
  const elite = ['T1', 'T2', 'T3'].reduce((s, k) => s + (res.counts[k] || 0), 0);
  console.log('  ' + '─'.repeat(62));
  console.log(`  프로 진출: ${((pro / res.n) * 100).toFixed(1)}%   1부 정착(T1~T3): ${((elite / res.n) * 100).toFixed(1)}%`);
  console.log(`  도달한 엔딩 셀: ${Object.keys(res.cells).length} / 36`);

  console.log('\n  샘플 — 같은 재능이 다른 인생이 되는가');
  for (const s of res.samples) {
    console.log(`    · ${s.env} / 부모 ${s.pers} → 최종반응 ${s.react}`);
    console.log(`      PA${String(s.pot).padStart(2)} → 피크 ${String(s.peak).padStart(2)} (미달 ${String(s.pot - s.peak).padStart(2)}) | ${String(s.apps).padStart(3)}경기 ${String(s.goals).padStart(3)}골 A매치${String(s.caps).padStart(3)} | ${s.tier}`);
    console.log(`      ${(s.path || '클럽 이력 없음').slice(0, 130)}`);
  }
}

const t0 = Date.now();
if (envArg) {
  report(FAMILY_ENVS[envArg].label, batch(n, { env: envArg, keepSamples: 6 }));
} else {
  report('전체 (가정환경 랜덤)', batch(n, { keepSamples: 6 }));
  console.log('\n\n── 가정환경별 프로 진출률 (환경이 결과를 가르는가) ──');
  const rows = [];
  for (const id of Object.keys(FAMILY_ENVS)) {
    const r = batch(Math.max(300, Math.round(n / 2)), { env: id, keepSamples: 0 });
    const pro = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].reduce((s, k) => s + (r.counts[k] || 0), 0);
    const elite = ['T1', 'T2', 'T3'].reduce((s, k) => s + (r.counts[k] || 0), 0);
    rows.push({ label: FAMILY_ENVS[id].label, pro: (pro / r.n) * 100, elite: (elite / r.n) * 100, bad: ((r.counts.NP_BAD || 0) / r.n) * 100 });
  }
  console.log(`  ${'가정환경'.padEnd(16)} ${'프로'.padStart(7)} ${'1부정착'.padStart(8)} ${'BadEnd'.padStart(8)}`);
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(16)} ${r.pro.toFixed(1).padStart(6)}% ${r.elite.toFixed(1).padStart(7)}% ${r.bad.toFixed(1).padStart(7)}%  ${bar(r.pro, 18)}`);
  }
}
console.log(`\n소요 ${((Date.now() - t0) / 1000).toFixed(2)}s\n`);
