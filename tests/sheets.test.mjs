// 친 체온 읽기 — node --test (화면 없이 부를 수 있는 것만)
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('친 체온 — 「38.5」 · 「38,5」 · 「385」', async () => {
  const { parseTemp } = await import('../js/sheets.js');
  assert.equal(parseTemp('38.5'), 38.5);
  assert.equal(parseTemp('38,5'), 38.5);
  assert.equal(parseTemp('385'), 38.5);
  assert.equal(parseTemp('39'), 39);
  assert.equal(parseTemp('38.'), 38);
  assert.equal(parseTemp('3'), null);
  assert.equal(parseTemp('450'), null);
  assert.equal(parseTemp('abc'), null);
});
