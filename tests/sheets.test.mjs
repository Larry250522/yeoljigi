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

test('저장 시각 — 5분 안쪽 앞날은 지금으로, 그보다 뒤는 받지 않는다', async () => {
  const { pickWhen } = await import('../js/sheets.js');
  const now = new Date('2026-10-11T03:00:00Z');
  const soon = pickWhen(new Date(now.getTime() + 3 * 60000), now);
  assert.equal(soon.at.getTime(), now.getTime(), '계산 · 알림에서 빠지지 않게 지금으로 맞춘다');
  assert.ok(pickWhen(new Date(now.getTime() + 6 * 60000), now).error);
  const past = new Date(now.getTime() - 30 * 60000);
  assert.equal(pickWhen(past, now).at, past);
  assert.ok(pickWhen(new Date('x'), now).error);
});
