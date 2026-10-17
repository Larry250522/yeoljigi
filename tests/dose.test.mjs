// 체온 구간 · 해열제 기록 견주기 · 포장 설명서 내용 — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR, INGREDIENTS, PRODUCTS, URINE_TAG, ageMonths, alertsFor, careTip, checkDose, feverEpisode, feverLevel, groupLog, lastUrine,
  tempTrend,
} from '../js/dose.js';
import * as dose from '../js/dose.js';

const T0 = new Date('2026-10-11T09:00:00+09:00');
const at = (h) => new Date(T0.getTime() + h * HOUR).toISOString();
const med = (ingredient, mg, h) => ({ type: 'med', ingredient, mg, at: at(h) });
const temp = (value, h) => ({ type: 'temp', temp: value, at: at(h) });

test('체온 구간', () => {
  assert.equal(feverLevel(36.5).key, 'normal');
  assert.equal(feverLevel(37.5).key, 'mild');
  assert.equal(feverLevel(37.9).key, 'mild');
  assert.equal(feverLevel(38.0).key, 'fever');
  assert.equal(feverLevel(39.0).key, 'high');
  assert.equal(feverLevel(40.2).key, 'severe');
  assert.equal(feverLevel(35.0).key, 'low');
  assert.equal(feverLevel('x'), null);
});

test('만 개월 수', () => {
  assert.equal(ageMonths('2026-01-15', new Date('2026-10-14')), 8);
  assert.equal(ageMonths('2026-01-15', new Date('2026-10-15')), 9);
  assert.equal(ageMonths('', T0), null);
});

// ── 0.7.0 — 계산 · 판정을 빼고 기록 · 설명서 내용만 ──────────
const texts = (r) => r.messages.map((m) => m.text).join(' ');

test('먹일 양 · 다음 시각을 계산하는 함수가 없다', () => {
  for (const name of ['doseRange', 'dailyMaxMg', 'dailyLeft', 'nextDose', 'ageRow']) assert.equal(dose[name], undefined, name);
});

test('같은 계열 간격 — 기록과 간격 안내를 견줘 알리되 막지 않는다', () => {
  const history = [med('acetaminophen', 150, 0)];
  const early = checkDose({ ingredient: 'acetaminophen', at: at(3), history });
  assert.equal(early.level, 'warn');
  assert.match(texts(early), /같은 계열 약 기록이 3시간 전에 있어요\. 간격 안내는 4시간 이상/);
  assert.equal(checkDose({ ingredient: 'acetaminophen', at: at(4), history }).messages.length, 0);
  // 이부프로펜 · 덱시부프로펜은 같은 계열
  assert.equal(checkDose({ ingredient: 'dexibuprofen', at: at(3), history: [med('ibuprofen', 100, 0)] }).level, 'warn');
});

test('판정하는 말이 없다 — 「괜찮다」 · 「안 된다」 · 「먹일 수 있다」 · 「권장량」', () => {
  const cases = [
    checkDose({ ingredient: 'acetaminophen', at: at(1), history: [med('acetaminophen', 150, 0), med('ibuprofen', 100, 0.5)] }),
    checkDose({ ingredient: 'acetaminophen', at: at(20), history: [0, 4, 8, 12, 16].map((h) => med('acetaminophen', 120, h)) }),
    checkDose({ ingredient: 'acetaminophen', at: at(8), history: [med('acetaminophen', 150, 10)] }),
  ];
  for (const r of cases) {
    assert.notEqual(r.level, 'block');
    assert.doesNotMatch(texts(r), /괜찮|넘습니다|지켜 주세요|먹일 수 있|권장량|가능/);
  }
});

test('교차 — 다른 계열 기록이 2시간 안에 있으면 알린다', () => {
  const history = [med('acetaminophen', 150, 0)];
  assert.match(texts(checkDose({ ingredient: 'ibuprofen', at: at(1), history })), /다른 계열 약 기록이 1시간 전에/);
  assert.equal(checkDose({ ingredient: 'ibuprofen', at: at(2), history }).messages.length, 0);
});

test('하루 횟수 — 직전 24시간 기록 수를 설명서 횟수와 견준다', () => {
  const r = checkDose({ ingredient: 'acetaminophen', at: at(20), history: [0, 4, 8, 12, 16].map((h) => med('acetaminophen', 120, h)) });
  assert.match(texts(r), /6번째 기록이에요\. 설명서는 하루 5번까지/);
  // 지난 시각으로 넣는 기록 — 뒤쪽 24시간 창도 센다
  const back = checkDose({ ingredient: 'acetaminophen', at: at(0), history: [4, 8, 12, 16, 20].map((h) => med('acetaminophen', 120, h)) });
  assert.match(texts(back), /6번째/);
  // 뒤에 같은 계열 기록이 있으면
  assert.match(texts(checkDose({ ingredient: 'acetaminophen', at: at(8), history: [med('acetaminophen', 150, 10)] })), /2시간 뒤에 같은 계열/);
});

test('내 약마다 하루 횟수 — 좌약 「1일 2~3회」', () => {
  const sup = (h) => ({ ...med('acetaminophen', 125, h), medId: 'sup' });
  const history = [sup(0), sup(5), sup(10)];
  const fourth = checkDose({ ingredient: 'acetaminophen', at: at(15), history, medId: 'sup', medMaxPerDay: 3 });
  assert.match(texts(fourth), /이 약 4번째 기록이에요\. 내 약 설정은 하루 3번까지/);
  assert.equal(checkDose({ ingredient: 'acetaminophen', at: at(15), history, medId: 'syr' }).messages.length, 0, '다른 약은 성분 횟수로');
});

test('나이 — 3개월 미만 · 이부프로펜 6개월 미만은 알린다', () => {
  assert.equal(checkDose({ ingredient: 'acetaminophen', months: 2 }).level, 'warn');
  assert.equal(checkDose({ ingredient: 'ibuprofen', months: 5 }).level, 'warn');
  assert.equal(checkDose({ ingredient: 'ibuprofen', months: 8 }).level, 'ok');
});

test('계열 기록 모아 보기 — 마지막 · 지난 시간 · 24시간 횟수(자정이 아니라 직전 24시간)', () => {
  const history = [med('acetaminophen', 150, 0), med('acetaminophen', 150, 5), med('ibuprofen', 100, 2)];
  const apap = groupLog('APAP', history, new Date(at(6.5)));
  assert.equal(apap.last.at, at(5));
  assert.equal(apap.sinceH, 1.5);
  assert.equal(apap.countInDay, 2);
  assert.equal(apap.intervalH, 4);
  assert.equal(apap.maxPerDay, 5);
  assert.equal(groupLog('APAP', history, new Date(at(24.5))).countInDay, 1, '첫 기록이 24시간 밖으로');
  assert.equal(groupLog('NSAID', history, new Date(at(6.5))).intervalH, 6);
  const none = groupLog('NSAID', [], T0);
  assert.equal(none.last, null);
  assert.equal(none.countInDay, 0);
  assert.equal(groupLog('APAP', [med('acetaminophen', 150, 8)], new Date(at(6))).last, null, '앞으로의 기록은 보지 않는다');
  assert.equal(Object.hasOwn(apap, 'at') || Object.hasOwn(apap, 'canNow'), false, '다음 시각을 내지 않는다');
});

test('설명서 내용 — 허가 문구 · 이부프로펜 나이별 표', () => {
  assert.match(INGREDIENTS.acetaminophen.label.single, /10~15mg/);
  assert.match(INGREDIENTS.acetaminophen.label.day, /5번까지 .*75mg/);
  assert.match(INGREDIENTS.dexibuprofen.label.day, /30kg 이하는 300mg/);
  // 어린이부루펜시럽 허가 나이별 표(1~2세 50~100mg · 400mg … 11~14세 200~250mg · 1000mg)
  assert.deepEqual(INGREDIENTS.ibuprofen.ageTable.map((r) => [r.singleMin, r.single, r.day]),
    [[50, 100, 400], [100, 150, 600], [150, 200, 800], [200, 250, 1000]]);
  for (const ing of Object.values(INGREDIENTS)) {
    assert.ok(ing.label && ing.label.single && ing.label.day && ing.label.interval, ing.name);
    assert.ok(ing.minIntervalH > 0 && ing.maxPerDay > 0, ing.name);
  }
});

test('열 에피소드 — 24시간 넘게 비면 새로', () => {
  const history = [temp(38.5, 0), temp(37.0, 10), temp(38.2, 20), temp(38.4, 30)];
  const ep = feverEpisode(history, new Date(at(31)));
  assert.equal(ep.start.toISOString(), at(0));
  assert.equal(ep.hours, 30);
  const gap = [temp(38.5, 0), temp(38.4, 30)];
  assert.equal(feverEpisode(gap, new Date(at(31))).start.toISOString(), at(30));
  assert.equal(feverEpisode(gap, new Date(at(60))), null);
});

test('짚어 줄 것', () => {
  const baby = { birth: '2026-08-20' };
  assert.equal(alertsFor(baby, [temp(38.1, 0)], new Date(at(1)))[0].level, 'urgent');
  const kid = { birth: '2024-01-01' };
  assert.deepEqual(alertsFor(kid, [temp(38.1, 0)], new Date(at(1))), []);
  const long = [0, 24, 48, 72].map((h) => temp(38.6, h));
  assert.ok(alertsFor(kid, long, new Date(at(73))).some((a) => a.title.includes('3일')));
  const sym = [{ type: 'symptom', tags: ['경련'], at: at(0) }];
  assert.equal(alertsFor(kid, sym, new Date(at(1)))[0].level, 'urgent');
});

test('체온 한 줄 안내', () => {
  assert.match(careTip(38.5), /1시간쯤 뒤/);
  assert.match(careTip(37.6), /1~2시간/);
  assert.equal(careTip('x'), '');
});

test('체온 추세 — 앞 체온과 견주고 24시간 최고를 고른다', () => {
  const now = new Date(at(6));
  const t = tempTrend([temp(39.4, 1), temp(38.6, 3), temp(38.0, 5)], now);
  assert.equal(t.last.temp, 38.0);
  assert.equal(t.prev.temp, 38.6);
  assert.equal(t.diff, -0.6);
  assert.equal(t.max.temp, 39.4);
  // 앞 체온이 24시간 넘게 지난 것이면 견주지 않는다
  const far = tempTrend([temp(39, -30), temp(37.2, 5)], now);
  assert.equal(far.prev, null);
  assert.equal(far.diff, null);
  assert.equal(tempTrend([], now), null);
  assert.equal(tempTrend([temp(38, 8)], now), null, '앞으로의 기록은 보지 않는다');
});

test('소변 — 열이 나는 동안 기록이 8시간 넘게 비면 짚는다', () => {
  const pee = (h) => ({ type: 'symptom', tags: [URINE_TAG], at: at(h) });
  const child = { birth: '2023-01-01' };
  const history = [temp(38.8, 0), pee(0), temp(38.5, 9)];
  assert.equal(lastUrine(history, new Date(at(9))).at, at(0));
  const has = (h, list = history) => alertsFor(child, list, new Date(at(h))).some((a) => a.title.startsWith('소변'));
  assert.equal(has(7), false, '8시간 전에는 조용히');
  assert.equal(has(9), true);
  assert.equal(has(9, [temp(36.8, 0), pee(0), temp(36.9, 9)]), false, '열이 없으면 짚지 않는다');
  assert.equal(has(9, [temp(38.8, 0), temp(38.5, 9)]), false, '소변을 기록해 오지 않은 아이는 짚지 않는다');
  assert.equal(has(25, [temp(38.8, 0), pee(0), temp(38.5, 24)]), false, '기록을 그만둔 지 하루가 넘으면 짚지 않는다');
});

test('지침 반영 — 나이에 따른 열 기간 · 3~6개월 39℃ · 경련 이력', () => {
  const toddler = { birth: '2025-06-01' };            // 16개월
  const fever = (hs) => hs.map((h) => temp(38.6, h));
  const titles = (child, list, h) => alertsFor(child, list, new Date(at(h))).map((a) => a.title);
  assert.ok(titles(toddler, fever([0, 12, 25]), 25.5).includes('열이 하루 넘게 이어짐'), '두 돌 전은 24시간');
  const kid = { birth: '2022-01-01' };
  assert.deepEqual(titles(kid, fever([0, 12, 25]), 25.5), [], '두 돌 뒤는 72시간까지 조용히');
  assert.ok(titles(kid, fever([0, 20, 40, 60, 80, 100, 121]), 121.5).includes('열이 5일 넘게 이어짐'));
  assert.ok(!titles(kid, fever([0, 20, 40, 60, 80, 100, 121]), 121.5).includes('열이 3일 넘게 이어짐'), '5일이면 한 단계만');
  const infant = { birth: '2026-06-01' };             // 4개월
  assert.ok(titles(infant, [temp(39.1, 0)], 1).includes('생후 3~6개월 · 39℃ 이상'));
  assert.ok(!titles(infant, [temp(38.6, 0)], 1).includes('생후 3~6개월 · 39℃ 이상'));
  const seizure = alertsFor({ birth: '2022-01-01', seizure: true }, [temp(38.5, 0)], new Date(at(1)));
  assert.ok(seizure.some((a) => a.level === 'info' && a.call));
  assert.equal(alertsFor({ birth: '2022-01-01', seizure: true }, [temp(37, 0)], new Date(at(1))).length, 0, '열이 없으면 조용히');
});

test('이부프로펜 계열 전에 — 수두 · 탈수 기록, 38℃ 아래 투약은 막지 않고 알린다', () => {
  const sym = (tags, h) => ({ type: 'symptom', tags, at: at(h) });
  const texts = (r) => r.messages.map((m) => m.text).join(' ');
  const pox = checkDose({ ingredient: 'ibuprofen', at: new Date(at(48)), history: [sym(['수두'], 0)] });
  assert.equal(pox.level, 'warn');
  assert.match(texts(pox), /수두/);
  const dry = checkDose({ ingredient: 'dexibuprofen', at: new Date(at(5)), history: [sym(['구토', '설사'], 1)] });
  assert.match(texts(dry), /구토 · 설사 기록/);
  const apap = checkDose({ ingredient: 'acetaminophen', at: new Date(at(5)), history: [sym(['수두', '구토'], 1)] });
  assert.doesNotMatch(texts(apap), /수두|구토/, '아세트아미노펜 계열에는 붙이지 않는다');
  const low = checkDose({ ingredient: 'acetaminophen', at: new Date(at(5)), history: [temp(37.6, 4)] });
  assert.equal(low.level, 'info');
  assert.match(texts(low), /37.6℃/);
});

test('체온 안내 — 처지면 해열제보다 진료', () => {
  assert.match(careTip(38.6), /처지거나 잘 깨지 않으면 해열제보다 진료가 먼저/);
  assert.doesNotMatch(careTip(38.6), /처지면 해열제를/);
});

test('제품 목록 — 성분 · 함량 · 같은 이름 다른 성분', () => {
  const ids = new Set();
  for (const p of PRODUCTS) {
    assert.ok(INGREDIENTS[p.ingredient], p.name);
    assert.ok(p.conc > 0 && ['mL', '개'].includes(p.unit), p.name);
    assert.ok(!ids.has(p.id), `${p.id} 겹침`);
    ids.add(p.id);
  }
  const by = (id) => PRODUCTS.find((p) => p.id === id);
  // 이름이 같은 「챔프」 · 「콜대원키즈」는 계열이 다르다
  assert.equal(INGREDIENTS[by('champ').ingredient].group, 'APAP');
  assert.equal(INGREDIENTS[by('champ-ibu').ingredient].group, 'NSAID');
  assert.equal(INGREDIENTS[by('coldaewon-pen').ingredient].group, 'APAP');
  assert.equal(INGREDIENTS[by('coldaewon-ibu').ingredient].group, 'NSAID');
  // 함량 — 160mg/5mL · 100mg/5mL · 60mg/5mL
  assert.equal(by('tylenol-susp').conc, 32);
  assert.equal(by('brufen').conc, 20);
  assert.equal(by('maxibupen').conc, 12);
  assert.equal(by('maxibupen').ingredient, 'dexibuprofen');
  // 좌약은 허가 「1일 2~3회」
  assert.equal(by('suspen-supp').maxPerDay, 3);
});

test('제품 목록 — 원문으로 더한 제품 · 종합감기약', () => {
  const by = (id) => PRODUCTS.find((p) => p.id === id);
  assert.equal(by('setopen').conc, 32);                 // 「100mL 중 아세트아미노펜 3200 밀리그램」
  assert.equal(by('kidsnpen').ingredient, 'ibuprofen');
  assert.equal(by('anypen').ingredient, 'dexibuprofen');
  assert.equal(by('anypen').conc, 12);
  assert.equal(by('champ-cold').conc, 14);              // 「1포(5 밀리리터) 중 아세트아미노펜 70 밀리그램」
  assert.equal(by('champ-cold-hi').conc, 15);           // 「1포(10 밀리리터) 중 … 150 밀리그램」
  assert.equal(by('coldaewon-cold-s').maxPerDay, 3);   // 「1일 3회 식후 30분」
  for (const p of PRODUCTS.filter((x) => x.combo)) {
    assert.equal(p.ingredient, 'acetaminophen', p.name);
    assert.equal(p.minAgeMonths, 24, `${p.name} 만 2세부터`);
  }
  assert.equal(PRODUCTS.some((p) => p.name.includes('콜대원키즈콜드시럽')), false, '허가 만료');
  // 만 2세 전 아이에게 종합감기약 — 막지 않고 알린다
  const r = checkDose({ ingredient: 'acetaminophen', at: new Date(at(0)), months: 18, medMinAgeMonths: 24 });
  assert.equal(r.level, 'warn');
  assert.match(r.messages.map((m) => m.text).join(' '), /만 2세부터/);
});
