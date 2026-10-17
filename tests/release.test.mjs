// 판 올리기 · 지켜야 할 말 — node --test (CI 에서 놓치기 쉬운 것)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('판 번호 — env.js VERSION · sw.js CACHE · package.json 이 같다', async () => {
  const version = /VERSION = '([^']+)'/.exec(await read('js/env.js'))[1];
  assert.equal(/CACHE = 'yeoljigi-([^']+)'/.exec(await read('sw.js'))[1], version, 'sw.js CACHE 를 안 바꾸면 휴대폰이 예전 파일을 쓴다');
  assert.equal(JSON.parse(await read('package.json')).version, version);
});

test('서비스 워커가 캐시하는 파일이 모두 있다', async () => {
  const sw = await read('sw.js');
  const shell = /const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)).filter((p) => p !== './');
  for (const path of shell) await assert.doesNotReject(read(path), path);
});

// 0.7.0 — 먹일 양 · 다음 시각을 정해 주는 말을 화면 코드에 다시 들이지 않는다(CLAUDE.md 「안전」 · README 「계산하지 않는 이유」)
test('판정 · 처방 말이 화면 코드에 없다', async () => {
  const banned = ['권장량', '지금 가능', '다시 먹일 수 있', '부터 먹일 수', '먹일 수 있는 때', '남은 양', '그래도 기록', '괜찮아요'];
  for (const path of ['js/app.js', 'js/sheets.js', 'js/report.js', 'js/notify.js', 'js/dose.js', 'index.html', 'manifest.webmanifest']) {
    const text = (await read(path)).split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line)).join('\n');
    for (const word of banned) assert.ok(!text.includes(word), `${path} 에 「${word}」`);
  }
});

test('주소 — 링크 미리보기가 지금 배포 주소를 가리킨다', async () => {
  const html = await read('index.html');
  assert.match(html, /og:url" content="https:\/\/yeoljigi\.github\.io\/"/);
  assert.doesNotMatch(html, /larry250522|larrykim-dev\.github\.io/i);
});
