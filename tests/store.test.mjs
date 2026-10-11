// 저장 · 백업 — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { doseMessage, summary } from '../js/report.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()] };
}

test('깨진 저장 자료는 지우지 않고 옆에 남긴다', () => {
  const s = memory();
  s.setItem('yeoljigi.v1', '{깨짐');
  const state = store.load(s);
  assert.equal(state.children.length, 0);
  assert.ok(s.keys().some((k) => k.startsWith('yeoljigi.v1.broken-')));
});

test('가져오기 — 모르는 성분의 약 · 아이 없는 기록은 버리고 활성 아이를 맞춘다', () => {
  const data = {
    children: [{ id: 'c1', name: '하율' }],
    meds: [{ id: 'x', name: '?', ingredient: 'aspirin', conc: 1 }],
    entries: [{ id: 'e1', childId: 'c1', type: 'temp', temp: 38, at: '2026-10-11T00:00:00Z' }, { id: 'e2', type: 'temp' }],
    settings: { activeChildId: 'gone' },
  };
  const out = store.normalize(data);
  assert.equal(out.entries.length, 1);
  assert.equal(out.meds.length, 0, '모르는 성분은 용량을 셀 수 없어 버린다');
  assert.equal(out.settings.activeChildId, 'c1');
  assert.throws(() => store.normalize(null));
});

test('진료용 요약', () => {
  const now = new Date('2026-10-11T12:00:00+09:00');
  const iso = (h) => new Date(now.getTime() - h * 3600e3).toISOString();
  const text = summary({ name: '하율', birth: '2023-05-02', weight: 13.2, seizure: true }, [
    { type: 'temp', temp: 38.6, at: iso(5), site: '귀' },
    { type: 'temp', temp: 39.2, at: iso(3) },
    { type: 'med', name: '아세트아미노펜 시럽', ingredient: 'acetaminophen', amount: 5.5, unit: 'mL', mg: 176, at: iso(2.5) },
    { type: 'symptom', tags: ['기침'], memo: '밤에 심함', at: iso(1) },
  ], now);
  assert.match(text, /하율 · 3세 5개월 · 13.2kg/);
  assert.match(text, /최고 체온: 39.2℃/);
  assert.match(text, /해열제 1번/);
  assert.match(text, /기침 — 밤에 심함/);
  assert.match(text, /열성 경련 과거력 있음/);
});

test('깨진 칸이 있는 기록은 버린다 — 화면이 그리다 멈추지 않게', () => {
  const out = store.normalize({
    children: [{ id: 'c1', name: 7, color: 'url(x)' }, { id: 'c2' }],
    entries: [
      { id: 'a', childId: 'c1', type: 'temp', temp: 'hot', at: '2026-10-11T00:00:00Z' },
      { id: 'b', childId: 'c1', type: 'symptom', tags: 'x', at: '2026-10-11T00:00:00Z' },
      { id: 'c', childId: 'c1', type: 'temp', temp: 38.2, at: 'nope' },
      { id: 'd', childId: 'c1', type: 'med', ingredient: 'acetaminophen', amount: 5, mg: 160, at: '2026-10-11T00:00:00Z' },
      { id: 'e', childId: 'gone', type: 'temp', temp: 38, at: '2026-10-11T00:00:00Z' },
    ],
    settings: { theme: 'neon' },
  });
  assert.equal(out.children.length, 1);
  assert.equal(out.children[0].name, '7');
  assert.notEqual(out.children[0].color, 'url(x)');
  assert.deepEqual(out.entries.map((e) => e.id), ['b', 'd']);
  assert.deepEqual(out.entries[0].tags, []);
  assert.equal(out.settings.theme, 'system');
});

test('열지기 백업이 아니면 불러오지 않는다', () => {
  store._setState({ children: [{ id: 'c1', name: '하율' }], entries: [] });
  for (const bad of ['[]', '{}', '{"foo":1}', '{"app":"yeoljigi","children":[]}']) {
    assert.throws(() => store.importJson(bad));
  }
  assert.equal(store.get().children.length, 1, '지금 기록은 그대로');
});

test('저장소를 읽기만 해도 예외가 나는 브라우저 — 멈추지 않고 메모리로 돈다', () => {
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  const state = store.load(blocked);
  assert.equal(state.children.length, 0);
  assert.equal(store.isPersistent(), false);
});

test('가족에게 보낼 글 — 먹인 약과 계열마다 다음 때', () => {
  const now = new Date('2026-10-11T14:00:00+09:00');
  const iso = (h) => new Date(now.getTime() - h * 3600_000).toISOString();
  const given = { type: 'med', name: '아세트아미노펜 시럽', ingredient: 'acetaminophen', amount: 6, unit: 'mL', mg: 192, at: iso(0) };
  const history = [given, { type: 'temp', temp: 39.1, at: iso(0.2) }, { type: 'symptom', tags: ['소변 봄'], at: iso(1) }];
  const text = doseMessage({ name: '하율', weight: 13 }, given, history, now);
  assert.match(text, /\[하율\] 10\/11 오후 2:00 아세트아미노펜 시럽 6mL 먹였어요 \(아세트아미노펜 192mg\)/);
  assert.match(text, /마지막 체온 39.1℃/);
  assert.match(text, /아세트아미노펜 계열: 10\/11 오후 6:00부터 \(4시간 간격\)/);
  assert.match(text, /이부프로펜 계열: 10\/11 오후 4:00부터 \(다른 계열과 2시간\)/);
  assert.match(text, /마지막 소변 10\/11 오후 1:00/);
  assert.match(text, /오후 2:00 기록 기준/);
});

test('진료용 요약 — 소변은 증상 목록 대신 한 줄로', () => {
  const now = new Date('2026-10-11T14:00:00+09:00');
  const iso = (h) => new Date(now.getTime() - h * 3600_000).toISOString();
  const text = summary({ name: '하율' }, [
    { type: 'symptom', tags: ['소변 봄'], at: iso(5) },
    { type: 'symptom', tags: ['소변 봄'], at: iso(2) },
    { type: 'symptom', tags: ['구토'], at: iso(1) },
  ], now);
  assert.match(text, /소변 2번 · 마지막 10\/11 오후 12:00/);
  assert.doesNotMatch(text, /- .*소변 봄/);
  assert.match(text, /- .*구토/);
});

test('아이 상태 — 1~5 만 남기고 요약에 함께', () => {
  const out = store.normalize({ children: [{ id: 'c1', name: '하율' }], entries: [
    { id: 'a', childId: 'c1', type: 'temp', temp: 38.4, wellbeing: 2, at: '2026-10-11T03:00:00Z' },
    { id: 'b', childId: 'c1', type: 'temp', temp: 38.1, wellbeing: 9, at: '2026-10-11T04:00:00Z' },
  ] });
  assert.deepEqual(out.entries.map((e) => e.wellbeing), [2, null]);
  const text = summary({ name: '하율' }, out.entries, new Date('2026-10-11T05:00:00Z'));
  assert.match(text, /38.4℃ \(힘들어함\)/);
});

test('내 약 하루 횟수 — 1~6 만 남긴다', () => {
  const out = store.normalize({ children: [{ id: 'c1', name: '하율' }], meds: [
    { id: 'a', name: '좌약', ingredient: 'acetaminophen', conc: 125, unit: '개', maxPerDay: 3 },
    { id: 'b', name: '시럽', ingredient: 'acetaminophen', conc: 32, maxPerDay: 'x' },
    { id: 'c', name: '시럽2', ingredient: 'ibuprofen', conc: 20, maxPerDay: 9 },
  ] });
  assert.deepEqual(out.meds.map((m) => m.maxPerDay), [3, null, null]);
});
