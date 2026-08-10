#!/usr/bin/env node
/**
 * 빌드 — 엔진 + CSS + UI를 단일 파일로 인라인한다.
 * 산출물:
 *   docs/index.html     완전 독립 실행 파일 (GitHub Pages가 /docs에서 서빙)
 *   dist/index.html     같은 파일 (로컬에서 바로 열어볼 때)
 *   dist/artifact.html  <head>/<body> 없는 조각 (Claude Artifact 배포용)
 *
 * 번들러를 쓰지 않는 이유: 의존성 0으로 유지해서 어디서든 `node build.mjs`로 끝나게 한다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

const engine = read('src/engine.js')
  // ESM export를 제거해 클래식 스크립트 하나의 스코프로 합친다.
  // engine.js는 선언형 export만 사용하므로 이 치환으로 충분하다.
  .replace(/^export\s+(?=(function|const|class|let|var)\s)/gm, '');

if (/^export\s/m.test(engine)) {
  console.error('✗ 처리되지 못한 export 문이 남아 있습니다. build.mjs의 치환 규칙을 확인하세요.');
  process.exit(1);
}

const css = read('web/style.css');
const app = read('web/app.js');

const TITLE = 'PROJECT 1990: Football Legend';
const DESC = '1990년생 축구선수 한 명의 인생을 0세부터 36세까지 시뮬레이션하는 텍스트 기반 라이프 시뮬레이션 RPG.';

const body = `<style>
${css}
</style>

<div id="app"></div>

<script>
"use strict";
/* ══════════ SIMULATION ENGINE ══════════ */
${engine}
/* ══════════ UI LAYER ══════════ */
${app}
</script>
`;

for (const d of ['dist', 'docs']) mkdirSync(join(root, d), { recursive: true });

writeFileSync(join(root, 'dist/artifact.html'), body);

const standalone = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESC}">
<meta name="color-scheme" content="dark">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0}</style>
</head>
<body>
${body}</body>
</html>
`;

// docs/ 는 GitHub Pages 서빙용, dist/ 는 로컬 확인용 — 내용은 동일하다.
writeFileSync(join(root, 'docs/index.html'), standalone);
writeFileSync(join(root, 'dist/index.html'), standalone);

const kb = (s) => `${(s.length / 1024).toFixed(1)}KB`;
console.log(`✓ docs/index.html     ${kb(standalone)} (GitHub Pages)`);
console.log(`✓ dist/index.html     ${kb(standalone)} (standalone)`);
console.log(`✓ dist/artifact.html  ${kb(body)} (fragment)`);
