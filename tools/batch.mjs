#!/usr/bin/env node
/**
 * 엔진 검증기 — 플레이어 UI보다 먼저 만들고, 밸런싱은 여기서 잡는다.
 *   node tools/batch.mjs            # 1000회
 *   node tools/batch.mjs 3000       # 회수 지정
 *   node tools/batch.mjs 1000 IMM_LOW   # 가정환경 고정
 */
import { batch, TIERS, CLUB_COUNT, HISTORY_COUNT, LEAGUE_LIST, _internal } from '../src/engine.js';

const n = Number(process.argv[2]) || 1000;

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
  console.log(`  도달한 엔딩 셀: ${Object.keys(res.cells).length} / 9`);

  console.log('\n  샘플 — 같은 시작(능력 50)에서 다른 인생이 되는가');
  for (const s of res.samples) {
    console.log(`    · ${s.nat} / ${s.position}`);
    console.log(`      PA${String(s.pot).padStart(2)} → 피크 ${String(s.peak).padStart(2)} (미달 ${String(s.pot - s.peak).padStart(2)}) | ${String(s.apps).padStart(3)}경기 ${String(s.goals).padStart(3)}골 A매치${String(s.caps).padStart(3)} | ${s.tier}`);
    console.log(`      ${(s.path || '클럽 이력 없음').slice(0, 130)}`);
  }
}

const t0 = Date.now();
report('전체', batch(n, { keepSamples: 6 }));
console.log(`\n소요 ${((Date.now() - t0) / 1000).toFixed(2)}s\n`);
