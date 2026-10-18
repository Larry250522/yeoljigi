// 백업 합치기 · 기록 링크 · 물 기록 · 글자 크기 — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import * as share from '../js/share.js';
import { summary } from '../js/report.js';
import { WATER_TAG, lastTagged } from '../js/dose.js';

const at = (h) => new Date(Date.parse('2026-10-18T12:00:00+09:00') - h * 3600_000).toISOString();
const temp = (id, h, t, extra = {}) => ({ id, childId: 'c1', type: 'temp', temp: t, at: at(h), createdAt: at(h), ...extra });
const backup = (state) => ({ app: 'yeoljigi', exportedAt: at(0), ...state });
const mine = () => store._setState({
  children: [{ id: 'c1', name: '하율', birth: '2023-05-02' }],
  entries: [temp('a', 5, 38.5), temp('b', 3, 39.0)],
});

test('합치기 — 지금 기록은 그대로 두고 없던 기록만 더한다(옛 주소 백업을 새 주소에)', () => {
  mine();
  const r = store.mergeData(backup({
    children: [{ id: 'c1', name: '하율', birth: '2023-05-02' }],
    entries: [temp('a', 5, 38.5), temp('old', 30, 37.9)],
  }));
  assert.equal(r.entries, 1);
  assert.deepEqual(store.get().entries.map((e) => e.id).sort(), ['a', 'b', 'old']);
  assert.equal(store.mergeData(backup({ children: [{ id: 'c1', name: '하율' }], entries: [temp('old', 30, 37.9)] })).entries, 0,
    '두 번 합쳐도 같다');
});

test('합치기 — 다른 휴대폰에서 따로 만든 같은 이름의 아이는 한 아이로, 같은 때 같은 값은 한 번만', () => {
  mine();
  const r = store.mergeData(backup({
    children: [{ id: 'other', name: '하율', weight: 13 }],
    entries: [{ ...temp('x', 3, 39.0), childId: 'other' }, { ...temp('y', 1, 38.2), childId: 'other' }],
  }));
  assert.equal(r.children, 0);
  assert.deepEqual(r.kids, ['c1']);
  assert.equal(r.entries, 1, '같은 때 39.0℃ 는 이미 있다');
  assert.equal(store.get().children[0].weight, 13, '없던 몸무게는 채운다');
  assert.ok(store.get().entries.every((e) => e.childId === 'c1'));
});

test('합치기 — 생년월일이 다른 같은 이름은 다른 아이', () => {
  mine();
  const r = store.mergeData(backup({ children: [{ id: 'k2', name: '하율', birth: '2025-01-01' }], entries: [] }));
  assert.equal(r.children, 1);
  assert.equal(store.get().children.length, 2);
});

test('합치기 — 나중에 고친 쪽이 남고, 지운 기록은 되살아나지 않는다', () => {
  mine();
  store.saveEntry({ id: 'b', temp: 39.4 });                 // 이 휴대폰에서 고침 → updatedAt
  const gone = store.removeEntry('a');
  assert.ok(gone && store.get().removed.a, '지운 때를 기억한다');
  const r = store.mergeData(backup({
    children: [{ id: 'c1', name: '하율' }],
    entries: [temp('a', 5, 38.5), temp('b', 3, 39.0, { updatedAt: '2026-01-01T00:00:00Z' })],
  }));
  assert.equal(r.entries, 0);
  assert.equal(r.updated, 0, '옛 고침은 덮지 않는다');
  assert.equal(store.get().entries.find((e) => e.id === 'b').temp, 39.4);
  assert.ok(!store.get().entries.some((e) => e.id === 'a'));

  // 다른 휴대폰에서 지운 기록은 여기서도 빠진다
  const r2 = store.mergeData(backup({ children: [{ id: 'c1', name: '하율' }], entries: [], removed: { b: at(0) } }));
  assert.equal(r2.removed, 1);
  assert.equal(store.get().entries.length, 0);
});

test('합치기 — 되돌리기한 기록은 지운 표시를 지운다', () => {
  mine();
  const gone = store.removeEntry('a');
  store.restoreEntry(gone);
  assert.equal(store.get().removed.a, undefined);
});

test('합치기 — 약이 없는 자료가 여기서 지운 기본 약을 되살리지 않는다 · 같은 약은 하나로', () => {
  store._setState({ children: [{ id: 'c1', name: '하율' }], meds: [{ id: 'm-mine', name: '세토펜', ingredient: 'acetaminophen', conc: 32 }] });
  store.mergeData(backup({ children: [{ id: 'c1', name: '하율' }], entries: [] }));
  assert.deepEqual(store.get().meds.map((m) => m.id), ['m-mine']);
  store.mergeData(backup({ children: [{ id: 'c1', name: '하율' }],
    meds: [{ id: 'm-theirs', name: '세토펜', ingredient: 'acetaminophen', conc: 32 }],
    entries: [{ id: 'd', childId: 'c1', type: 'med', medId: 'm-theirs', name: '세토펜', ingredient: 'acetaminophen', amount: 5, mg: 160, at: at(1) }] }));
  assert.deepEqual(store.get().meds.map((m) => m.id), ['m-mine']);
  assert.equal(store.get().entries[0].medId, 'm-mine', '이 약의 하루 횟수에 함께 센다');
});

test('합치기 — 열지기 백업이 아니면 아무것도 바꾸지 않는다', () => {
  mine();
  for (const bad of [{}, { app: 'yeoljigi', children: [] }, { app: 'other', children: [{ id: 'z', name: 'z' }] }]) {
    assert.throws(() => store.mergeData(bad));
  }
  assert.equal(store.get().entries.length, 2);
});

test('바꾸기로 불러와도 글자 크기는 이 휴대폰의 것', () => {
  mine();
  store.get().settings.text = 'xl';
  store.importJson(JSON.stringify(backup({ children: [{ id: 'c9', name: '서아' }], settings: { text: 'md' } })));
  assert.equal(store.get().settings.text, 'xl');
  assert.equal(store.normalize({ settings: { text: 'huge' } }).settings.text, 'md');
});

test('기록 링크 — 한 아이의 최근 기록만, 줄여 담고 그대로 읽힌다', async () => {
  store._setState({
    children: [{ id: 'c1', name: '하율' }, { id: 'c2', name: '서아' }],
    entries: [temp('a', 5, 38.5), temp('old', 100, 37.9), { ...temp('s', 1, 38.0), childId: 'c2' },
      { id: 'd', childId: 'c1', type: 'med', medId: 'm-ibu', name: '이부프로펜 시럽', ingredient: 'ibuprofen', amount: 5, mg: 100, at: at(2) }],
    settings: { theme: 'dark' },
  });
  const pack = store.sharePack('c1', 72, new Date(at(0)));
  assert.deepEqual(pack.children.map((c) => c.id), ['c1']);
  assert.deepEqual(pack.entries.map((e) => e.id).sort(), ['a', 'd']);
  assert.deepEqual(pack.meds.map((m) => m.id), ['m-ibu'], '쓴 약만');
  assert.equal(pack.settings, undefined, '설정은 보내지 않는다');

  const link = await share.linkFor(pack, 'https://yeoljigi.github.io/#old');
  assert.match(link, /^https:\/\/yeoljigi\.github\.io\/#share=z[A-Za-z0-9_-]+$/);
  assert.ok(link.length < share.MAX_LINK);
  const back = await share.decode(share.fromHash(new URL(link).hash));
  assert.deepEqual(back, pack);

  // 받은 휴대폰 — 비어 있어도 아이와 함께 들어온다
  store._setState({});
  const r = store.mergeData(back);
  assert.equal(r.children, 1);
  assert.equal(r.entries, 2);
});

test('기록 링크 — 줄이지 않은 꼴 · 깨진 글', async () => {
  const plain = `j${Buffer.from(JSON.stringify({ a: '하율' })).toString('base64url')}`;
  assert.deepEqual(await share.decode(plain), { a: '하율' });
  await assert.rejects(share.decode('x123'));
  await assert.rejects(share.decode('zzzz'));
  assert.equal(share.fromHash('#other'), null);
  assert.equal(share.fromHash(''), null);
});

test('물 기록 — 진료용 요약에 한 줄로, 증상 목록에는 넣지 않는다', () => {
  const now = new Date(at(0));
  const history = [
    { type: 'symptom', tags: [WATER_TAG], at: at(4) },
    { type: 'symptom', tags: [WATER_TAG], at: at(1) },
    { type: 'symptom', tags: ['소변 봄', WATER_TAG], at: at(2) },
    { type: 'symptom', tags: [WATER_TAG], memo: '200mL', at: at(3) },
  ];
  const text = summary({ name: '하율' }, history, now);
  assert.match(text, /물 마심 4번 · 마지막 10\/18 오전 11:00/);
  assert.match(text, /소변 1번/);
  assert.match(text, /- .*물 마심 — 200mL/, '메모가 있으면 목록에도');
  assert.equal(text.match(/^- .*물 마심/gm).length, 1);
  assert.equal(lastTagged(history, WATER_TAG, now).at, at(1));
});
