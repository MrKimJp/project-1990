#!/usr/bin/env node
/**
 * 엔진 검증기 — 플레이어 UI보다 먼저 만들어야 하는 도구.
 *
 * "1990년생 아이를 36세까지 N번 자동 시뮬레이션했을 때, 매번 다른 이야기가 나오는가?"
 *
 * 사용법:
 *   node tools/batch.mjs                     # 두 지역 1000회씩
 *   node tools/batch.mjs 2000 ESP WORKING    # 회수/지역/부모 지정
 */
import { batch, ENDING_LABELS, ORIGINS, PARENTS } from '../src/engine.js';

const n = Number(process.argv[2]) || 1000;
const originArg = process.argv[3];
const parentArg = process.argv[4];

const ORDER = [
  'WORLD_CLASS', 'TOP_FLIGHT', 'PRO', 'SECOND_DIV', 'SEMI_PRO',
  'COLLEGE', 'INJURY_OUT', 'COACH', 'QUIT', 'NEVER_MADE_IT',
];

function bar(pct, width = 28) {
  const f = Math.round((pct / 100) * width);
  return '█'.repeat(f) + '░'.repeat(width - f);
}

function report(title, res) {
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  ${title}  —  ${res.n} playthroughs`);
  console.log('═'.repeat(64));
  for (const k of ORDER) {
    const c = res.counts[k] || 0;
    const pct = (c / res.n) * 100;
    console.log(
      `  ${ENDING_LABELS[k].t.padEnd(24)} ${String(c).padStart(5)}  ${pct.toFixed(1).padStart(5)}%  ${bar(pct)}`
    );
  }
  const proLike = ['WORLD_CLASS', 'TOP_FLIGHT', 'PRO'].reduce((s, k) => s + (res.counts[k] || 0), 0);
  const anyPaid = proLike + (res.counts.SECOND_DIV || 0) + (res.counts.SEMI_PRO || 0);
  console.log('  ' + '─'.repeat(60));
  console.log(`  1부 이상 프로: ${((proLike / res.n) * 100).toFixed(1)}%   축구로 급여 받음: ${((anyPaid / res.n) * 100).toFixed(1)}%`);

  console.log('\n  최고 도달 클럽 티어 분포');
  for (const t of [1, 2, 3, 4, 5, 6, 9]) {
    const c = res.tiers[t] || 0;
    if (!c) continue;
    const lbl = t === 9 ? '해당 없음(8경기 이상 소화 클럽 없음)' : `티어 ${t}`;
    console.log(`    ${lbl.padEnd(34)} ${String(c).padStart(5)}  ${((c / res.n) * 100).toFixed(1)}%`);
  }

  console.log('\n  샘플 커리어 (같은 재능이 다른 인생이 되는가?)');
  for (const s of res.samples) {
    console.log(`    · PA${String(s.pot).padStart(2)} → 피크 ${String(s.peak).padStart(2)} (미달 ${String(s.pot - s.peak).padStart(2)}) | ${String(s.apps).padStart(3)}경기 ${String(s.goals).padStart(3)}골 A매치${String(s.caps).padStart(3)} | ${ENDING_LABELS[s.ending].t}`);
    console.log(`      ${s.path.slice(0, 150) || '(클럽 이력 없음)'}`);
  }
}

const t0 = Date.now();
if (originArg) {
  report(
    `${ORIGINS[originArg].label} / ${PARENTS[parentArg || 'WORKING'].label}`,
    batch(n, { origin: originArg, parents: parentArg || 'WORKING', keepSamples: 8 })
  );
} else {
  for (const o of ['ESP', 'USA']) {
    for (const p of ['WORKING', 'ELITE', 'ATHLETE']) {
      report(`${ORIGINS[o].flag} ${ORIGINS[o].label} / ${PARENTS[p].label}`, batch(n, { origin: o, parents: p, keepSamples: 4 }));
    }
  }
}
console.log(`\n소요: ${((Date.now() - t0) / 1000).toFixed(2)}s\n`);
