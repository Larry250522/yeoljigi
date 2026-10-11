// 체온 구간 · 용량 · 복용 간격 — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR, URINE_TAG, ageMonths, ageRow, alertsFor, careTip, checkDose, dailyLeft, dailyMaxMg, doseRange, feverEpisode, feverLevel, lastUrine,
  nextDose, tempTrend,
} from '../js/dose.js';

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

test('체중별 용량 — 아세트아미노펜 32mg/mL, 12kg', () => {
  const r = doseRange('acetaminophen', 12, 32);
  assert.deepEqual(r.mg, [120, 180]);
  assert.deepEqual(r.amount, [3.8, 5.6]);   // 아래는 올리고 위는 내린다
  assert.equal(r.capped, false);
});

test('체중별 용량 — 어른 1회 최대량을 넘지 않는다', () => {
  const r = doseRange('ibuprofen', 60, 20);
  assert.equal(r.mg[1], 400);
  assert.equal(r.capped, true);
  assert.equal(doseRange('ibuprofen', 0, 20), null);
});

test('같은 계열은 간격 전이면 막는다', () => {
  const history = [med('acetaminophen', 150, 0)];
  const early = checkDose({ ingredient: 'acetaminophen', mg: 150, at: at(3), weightKg: 12, history });
  assert.equal(early.level, 'block');
  const later = checkDose({ ingredient: 'acetaminophen', mg: 150, at: at(4), weightKg: 12, history });
  assert.equal(later.level, 'ok');
});

test('이부프로펜 · 덱시부프로펜은 같은 계열', () => {
  const history = [med('ibuprofen', 100, 0)];
  const r = checkDose({ ingredient: 'dexibuprofen', mg: 70, at: at(3), weightKg: 12, history });
  assert.equal(r.level, 'block');
});

test('교차 복용 — 다른 계열은 2시간 안이면 경고만', () => {
  const history = [med('acetaminophen', 150, 0)];
  assert.equal(checkDose({ ingredient: 'ibuprofen', mg: 100, at: at(1), weightKg: 12, history }).level, 'warn');
  assert.equal(checkDose({ ingredient: 'ibuprofen', mg: 100, at: at(2), weightKg: 12, history }).level, 'ok');
});

test('1회 최대량을 넘으면 막는다', () => {
  const r = checkDose({ ingredient: 'acetaminophen', mg: 300, at: at(0), weightKg: 12, history: [] });
  assert.equal(r.level, 'block');
});

test('하루 횟수 — 아세트아미노펜 5번까지', () => {
  const history = [0, 4, 8, 12, 16].map((h) => med('acetaminophen', 120, h));
  const r = checkDose({ ingredient: 'acetaminophen', mg: 120, at: at(20), weightKg: 12, history });
  assert.equal(r.level, 'block');
  assert.ok(r.messages.some((m) => m.text.includes('6번째')));
});

test('하루 최대량(mg) — 1회 허용 폭 안이어도 24시간 합이 넘으면 막는다', () => {
  // 12kg 아세트아미노펜 하루 900mg. 189mg(1회 최대 180mg 의 5% 허용 안) × 5 = 945mg
  const history = [0, 4, 8, 12].map((h) => med('acetaminophen', 189, h));
  const r = checkDose({ ingredient: 'acetaminophen', mg: 189, at: at(16), weightKg: 12, history });
  assert.equal(r.level, 'block');
  assert.ok(r.messages.some((m) => m.text.includes('하루 최대량')));
  assert.notEqual(checkDose({ ingredient: 'acetaminophen', mg: 180, at: at(16), weightKg: 12,
    history: [0, 4, 8, 12].map((h) => med('acetaminophen', 180, h)) }).level, 'block');
});

test('이부프로펜 계열 하루 최대량은 이부프로펜 · 덱시부프로펜을 비율로 더한다', () => {
  // 12kg: 이부프로펜 하루 480mg, 덱시부프로펜 하루 300mg(30kg 이하 허가 상한) → 120 · 120 · 120(0.75) + 덱시 75(0.25) = 1.0
  const history = [0, 6, 12].map((h) => med('ibuprofen', 120, h));
  assert.equal(checkDose({ ingredient: 'dexibuprofen', mg: 75, at: at(18), weightKg: 12, history }).level, 'ok');
  const r = checkDose({ ingredient: 'dexibuprofen', mg: 84, at: at(18), weightKg: 12, history });
  assert.equal(r.level, 'block');
  assert.ok(r.messages.some((m) => m.text.includes('하루 최대량')));
});

test('덱시부프로펜 — 체중 30kg 이하는 하루 300mg(맥시부펜 허가)', () => {
  assert.equal(dailyMaxMg('dexibuprofen', 20), 300);
  assert.equal(dailyMaxMg('dexibuprofen', 30), 300);
  assert.equal(dailyMaxMg('dexibuprofen', 10), 280);
  assert.equal(dailyMaxMg('dexibuprofen', 40), 1120);
  assert.equal(dailyMaxMg('ibuprofen', 20), 500);
  assert.equal(dailyMaxMg('acetaminophen', 20), 1500);
});

test('지난 시각으로 넣은 기록 — 뒤에 있는 같은 계열 약도 본다', () => {
  // 10시에 먹인 기록이 있는데 8시에 먹였다고 넣으면 2시간 간격 — 막는다
  const history = [med('acetaminophen', 150, 10)];
  const r = checkDose({ ingredient: 'acetaminophen', mg: 150, at: at(8), weightKg: 12, history });
  assert.equal(r.level, 'block');
  assert.ok(r.messages.some((m) => m.text.includes('뒤에')));
  assert.equal(checkDose({ ingredient: 'acetaminophen', mg: 150, at: at(5), weightKg: 12, history }).level, 'ok');
  // 다른 계열이 1시간 뒤에 있으면 경고
  assert.equal(checkDose({ ingredient: 'ibuprofen', mg: 100, at: at(9), weightKg: 12, history }).level, 'warn');
});

test('지난 시각 기록 — 뒤쪽 24시간 창의 횟수도 센다', () => {
  // 4 · 8 · 12 · 16 · 20시에 5번 — 0시에 하나 더 넣으면 0~20시 창이 6번
  const history = [4, 8, 12, 16, 20].map((h) => med('acetaminophen', 120, h));
  const r = checkDose({ ingredient: 'acetaminophen', mg: 120, at: at(0), weightKg: 12, history });
  assert.ok(r.messages.some((m) => m.text.includes('6번째')));
});

test('다음 복용 — 횟수가 남아도 하루 최대량을 다 쓰면 기다린다', () => {
  // 45kg 이부프로펜 하루 1200mg — 400mg × 3번이면 횟수는 3/4 지만 남은 양 0
  const history = [0, 6, 12].map((h) => med('ibuprofen', 400, h));
  const r = nextDose('NSAID', history, new Date(at(19)), 45);
  assert.equal(r.canNow, false);
  assert.equal(r.reason, '하루 최대량');
  assert.equal(r.at.toISOString(), at(24));
  assert.equal(nextDose('NSAID', history, new Date(at(19))).canNow, true, '체중을 모르면 횟수 · 간격만');
});

test('용량 표시 — mg 위 끝은 내림, 한 단위가 범위보다 크면 알린다', () => {
  const r = doseRange('acetaminophen', 12.37, 32);
  assert.deepEqual(r.mg, [124, 185]);
  const pill = doseRange('acetaminophen', 5, 1000);
  assert.equal(pill.unitTooBig, true);
  assert.ok(pill.amount[0] <= pill.amount[1]);
});

test('어른 1회 최대량에는 반올림 여유를 두지 않는다', () => {
  assert.equal(checkDose({ ingredient: 'ibuprofen', mg: 420, at: at(0), weightKg: 60, history: [] }).level, 'block');
  assert.equal(checkDose({ ingredient: 'ibuprofen', mg: 400, at: at(0), weightKg: 60, history: [] }).level, 'ok');
});

test('나이 — 3개월 미만 · 이부프로펜 6개월 미만', () => {
  assert.equal(checkDose({ ingredient: 'acetaminophen', mg: 50, weightKg: 5, months: 2 }).level, 'warn');
  assert.equal(checkDose({ ingredient: 'ibuprofen', mg: 40, weightKg: 7, months: 5 }).level, 'warn');
  assert.equal(checkDose({ ingredient: 'ibuprofen', mg: 50, weightKg: 8, months: 8 }).level, 'ok');
});

test('다음 복용 시각', () => {
  const history = [med('acetaminophen', 150, 0), med('ibuprofen', 100, 1)];
  const apap = nextDose('APAP', history, new Date(at(2)));
  assert.equal(apap.canNow, false);
  assert.equal(apap.at.toISOString(), at(4));
  const nsaid = nextDose('NSAID', history, new Date(at(2)));
  assert.equal(nsaid.at.toISOString(), at(7));
  assert.equal(nextDose('APAP', history, new Date(at(4))).canNow, true);
  assert.equal(nextDose('APAP', [], T0).canNow, true);
});

test('다음 복용 — 다른 계열을 막 먹였으면 2시간 뒤', () => {
  const history = [med('acetaminophen', 150, 0)];
  const r = nextDose('NSAID', history, new Date(at(0.5)));
  assert.equal(r.at.toISOString(), at(2));
});

test('다음 복용 — 하루 횟수를 다 쓰면 가장 오래된 것의 24시간 뒤', () => {
  const history = [0, 4, 8, 12, 16].map((h) => med('acetaminophen', 120, h));
  const r = nextDose('APAP', history, new Date(at(21)));
  assert.equal(r.canNow, false);
  assert.equal(r.at.toISOString(), at(24));
  assert.equal(r.countInDay, 5);
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

test('24시간 남은 양 — 자정이 아니라 직전 24시간', () => {
  const syrup = { ingredient: 'acetaminophen', conc: 32 };
  // 12kg 하루 900mg. 180mg 두 번 → 40% 사용, 540mg = 16.8mL 남음
  const history = [med('acetaminophen', 180, 0), med('acetaminophen', 180, 5)];
  const left = dailyLeft('APAP', history, new Date(at(6)), 12, syrup);
  assert.equal(Math.round(left.used * 100), 40);
  assert.equal(left.mg, 540);
  assert.equal(left.amount, 16.8);
  // 첫 약이 24시간 밖으로 나가면 다시 늘어난다
  assert.equal(dailyLeft('APAP', history, new Date(at(24.5)), 12, syrup).mg, 720);
  assert.equal(dailyLeft('APAP', history, new Date(at(6)), 0, syrup), null);
  assert.equal(dailyLeft('NSAID', history, new Date(at(6)), 12).used, 0);
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
  const pox = checkDose({ ingredient: 'ibuprofen', mg: 120, at: new Date(at(48)), weightKg: 13, history: [sym(['수두'], 0)] });
  assert.equal(pox.level, 'warn');
  assert.match(texts(pox), /수두/);
  const dry = checkDose({ ingredient: 'dexibuprofen', mg: 70, at: new Date(at(5)), weightKg: 13, history: [sym(['구토', '설사'], 1)] });
  assert.match(texts(dry), /구토 · 설사 기록/);
  const apap = checkDose({ ingredient: 'acetaminophen', mg: 160, at: new Date(at(5)), weightKg: 13, history: [sym(['수두', '구토'], 1)] });
  assert.doesNotMatch(texts(apap), /수두|구토/, '아세트아미노펜 계열에는 붙이지 않는다');
  const low = checkDose({ ingredient: 'acetaminophen', mg: 160, at: new Date(at(5)), weightKg: 13, history: [temp(37.6, 4)] });
  assert.equal(low.level, 'info');
  assert.match(texts(low), /37.6℃/);
});

test('체온 안내 — 처지면 해열제보다 진료', () => {
  assert.match(careTip(38.6), /처지거나 잘 깨지 않으면 해열제보다 진료가 먼저/);
  assert.doesNotMatch(careTip(38.6), /처지면 해열제를/);
});

test('이부프로펜 — 시럽 허가 나이별 용량표와 체중 계산 중 적은 쪽', () => {
  // 1~2세(24개월) 12kg: 체중 1회 60~120mg · 하루 480mg → 표 1회 100mg · 하루 400mg
  const r = doseRange('ibuprofen', 12, 20, 24);
  assert.deepEqual(r.mg, [60, 100]);
  assert.deepEqual(r.amount, [3, 5]);
  assert.equal(r.ageCapped, true);
  assert.equal(dailyMaxMg('ibuprofen', 12, 24), 400);
  // 생년월일을 모르면 체중만(예전과 같다)
  assert.deepEqual(doseRange('ibuprofen', 12, 20).mg, [60, 120]);
  assert.equal(dailyMaxMg('ibuprofen', 12), 480);
  // 11~14세 35kg: 체중 1회 175~350mg → 표 250mg, 하루 1200 → 1000
  assert.deepEqual(doseRange('ibuprofen', 35, 20, 150).mg, [175, 250]);
  assert.equal(dailyMaxMg('ibuprofen', 35, 150), 1000);
  // 3~6세 15kg: 체중 하루 500mg(30kg 미만 상한) < 표 600 — 적은 쪽
  assert.equal(dailyMaxMg('ibuprofen', 15, 60), 500);
  // 표 밖 — 돌 전(체중만), 만 15세부터(체중만)
  assert.equal(ageRow('ibuprofen', 8), null);
  assert.equal(ageRow('ibuprofen', 180), null);
  // 덱시부프로펜 · 아세트아미노펜에는 나이별 표를 쓰지 않는다
  assert.deepEqual(doseRange('dexibuprofen', 12, 12, 24).mg, doseRange('dexibuprofen', 12, 12).mg);
  // 1회 최대 확인도 나이를 본다
  const over = checkDose({ ingredient: 'ibuprofen', mg: 120, at: new Date(at(0)), weightKg: 12, months: 24 });
  assert.equal(over.level, 'block');
  assert.match(over.messages.map((m) => m.text).join(' '), /나이별 용량표/);
  // 하루 최대량(400mg)으로 다음 때를 센다 — 100mg 넷이면 다섯째는 막히고, 셋이면 하루 양 75%
  assert.equal(dailyLeft('NSAID', [med('ibuprofen', 100, 0), med('ibuprofen', 100, 6), med('ibuprofen', 100, 12)],
    new Date(at(13)), 12, null, 24).used, 0.75);
});

test('내 약마다 하루 횟수 — 좌약 「1일 2~3회」', () => {
  const sup = (h) => ({ ...med('acetaminophen', 125, h), medId: 'sup' });
  const history = [sup(0), sup(5), sup(10)];
  const fourth = checkDose({ ingredient: 'acetaminophen', mg: 125, at: new Date(at(15)), weightKg: 12, history,
    medId: 'sup', medMaxPerDay: 3 });
  assert.equal(fourth.level, 'block');
  assert.match(fourth.messages.map((m) => m.text).join(' '), /이 약은 하루 3번까지/);
  // 같은 계열의 다른 약(시럽)은 성분 하루 5번으로 센다
  const syrup = checkDose({ ingredient: 'acetaminophen', mg: 160, at: new Date(at(15)), weightKg: 12, history, medId: 'syr' });
  assert.notEqual(syrup.level, 'block');
  // 횟수를 적지 않은 약은 예전처럼
  assert.notEqual(checkDose({ ingredient: 'acetaminophen', mg: 125, at: new Date(at(15)), weightKg: 12, history, medId: 'sup' }).level, 'block');
});
