// 체온 구간 · 해열제 기록 모아 보기 · 포장 설명서 내용 — 화면과 떨어진 순수 함수(시험: tests/dose.test.mjs).
//
// 아이마다 먹일 양 · 다음 먹일 시각을 계산하지 않는다(0.7.0). 식약처 디지털의료기기 분류 가이드라인(2025-11)이
// 「의약품 권장 용량 및 투입주기 등의 결정 보조」를 의료기기 목적으로 적고 있어, 기록(먹인 때 · 횟수)과 포장 설명서
// 내용(일반 범위)을 나란히 보여 주는 데서 멈춘다. 먹여도 되는지는 보호자가 설명서 · 의사 · 약사와 정한다.
// 체중 · 나이로 셈하던 판(0.6.1)은 git 09bbd73 에 있다. 이 파일의 값을 바꾸면 시험도 함께 고친다.

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

// 계열 — 같은 계열끼리는 복용 간격 · 하루 최대량을 함께 센다(이부프로펜과 덱시부프로펜은 같은 계열).
export const GROUPS = {
  APAP: { key: 'APAP', name: '아세트아미노펜 계열', short: '아세트아미노펜' },
  NSAID: { key: 'NSAID', name: '이부프로펜 계열', short: '이부프로펜' },
};

// 다른 계열을 번갈아 먹일 때(교차 복용) 앞 약과 최소 간격
export const CROSS_MIN_HOURS = 2;

// label: 포장 설명서(허가 사항)의 용법을 화면에 그대로 옮길 말 — 아이 체중 · 나이를 넣어 셈하지 않는다.
// minIntervalH · maxPerDay 는 기록과 견줄 때(「같은 계열 기록이 ○시간 전에 있어요 · 간격 안내 ○시간 이상」) 쓴다.
export const INGREDIENTS = {
  acetaminophen: {
    id: 'acetaminophen', name: '아세트아미노펜', group: 'APAP',
    minIntervalH: 4, maxPerDay: 5, minAgeMonths: 4, defaultConc: 32,
    // 어린이타이레놀현탁액 등 허가: 「1회 10~15mg/kg」 · 「4-6시간 마다」 · 「1일 5회(75mg/kg)를 초과하지 않는다」
    label: { single: '체중 1kg에 10~15mg', day: '하루 5번까지 · 하루 합계 체중 1kg에 75mg 넘지 않게', interval: '4~6시간마다' },
  },
  ibuprofen: {
    id: 'ibuprofen', name: '이부프로펜', group: 'NSAID',
    minIntervalH: 6, maxPerDay: 4, minAgeMonths: 6, defaultConc: 20,
    // 지금 허가된 시럽(어린이부루펜 nedrug 198601920 · 챔프이부펜 · 콜대원키즈이부펜 · 키즈앤펜)은 mg/kg 대신 나이별 표.
    // 간격은 식약처 2025-12 안내 「6~8시간」
    label: { single: '포장의 나이별 표', day: '하루 4번까지 · 나이별 하루 최대량', interval: '6~8시간(식약처 안내)' },
    ageTable: [
      { fromM: 12, toM: 36, singleMin: 50, single: 100, day: 400 },     // 1~2세
      { fromM: 36, toM: 84, singleMin: 100, single: 150, day: 600 },    // 3~6세
      { fromM: 84, toM: 132, singleMin: 150, single: 200, day: 800 },   // 7~10세
      { fromM: 132, toM: 180, singleMin: 200, single: 250, day: 1000 }, // 11~14세
    ],
  },
  dexibuprofen: {
    id: 'dexibuprofen', name: '덱시부프로펜', group: 'NSAID',
    minIntervalH: 6, maxPerDay: 4, minAgeMonths: 6, defaultConc: 12,
    // 맥시부펜시럽 허가: 1회 5~7mg/kg, 1일 최대 4회(28mg/kg) · 체중 30kg 이하 소아는 1일 최대 25mL(300mg, 한미 제품 안내).
    // 허가 간격은 4~6시간이지만 같은 계열이라 식약처 2025-12 안내 「6~8시간」을 함께 적는다
    label: { single: '체중 1kg에 5~7mg', day: '하루 4번까지 · 하루 합계 체중 1kg에 28mg, 체중 30kg 이하는 300mg 넘지 않게',
      interval: '6~8시간(식약처 안내)' },
  },
};

// 국내 어린이 해열제 제품 — 내 약을 더할 때 골라 함량을 잘못 넣지 않게. 성분 · 함량 · 용법은 허가 원문에서 확인한 것만
// (2026-10-11, 의약품안전나라 nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=… — 괄호 안 번호, 허가 「정상」인 것).
// 같은 이름에 다른 성분(챔프 · 챔프이부펜 · 챔프콜드펜, 콜대원키즈펜 · 콜대원키즈이부펜 · 콜대원키즈콜드에스)이 있어 성분을 함께 보인다.
// 어린이타이레놀현탁액 health.kr drug_cd=2022020400007 · 세토펜(199800888) 「100mL 중 아세트아미노펜 3200 밀리그램」 ·
// 챔프(201206715) · 콜대원키즈펜(201702784) · 써스펜키즈(202501821) 같은 32mg/mL · 어린이용타이레놀정80mg(199303109) ·
// 복합써스펜좌약(199102142) 「1좌제 중 아세트아미노펜 125 밀리그램 … 1일 2 ～ 3회」 — 아세트아미노펜 좌약은 이것 하나뿐 ·
// 이부프로펜 20mg/mL: 어린이부루펜(198601920) · 챔프이부펜(201604402) · 콜대원키즈이부펜(198901310) · 키즈앤펜(201500197) ·
// 덱시부프로펜 「100mL 중 1.2 그램」: 맥시부펜(200608160) · 애니펜(201000953) ·
// 종합감기약(아세트아미노펜만 센다, 만 2세부터): 챔프콜드펜(202303142) 「1포(5 밀리리터) 중 아세트아미노펜 70 밀리그램」
// 「1일 3회, 식후 30분 및 필요 시 취침시에 … 복용간격을 4시간」 · 챔프콜드펜하이(202401275) 「1포(10 밀리리터) 중 … 150 밀리그램」 ·
// 콜대원키즈콜드에스(202501659) 「1포(10 밀리리터) 중 … 150 밀리그램」 「1일 3회 식후 30분」. 콜대원키즈콜드시럽은 허가 만료(2025-11-10)라 뺐다.
export const PRODUCTS = [
  { id: 'tylenol-susp', name: '어린이타이레놀현탁액', ingredient: 'acetaminophen', conc: 32, unit: 'mL' },
  { id: 'champ', name: '챔프시럽', ingredient: 'acetaminophen', conc: 32, unit: 'mL', note: '챔프이부펜시럽과 성분이 달라요' },
  { id: 'coldaewon-pen', name: '콜대원키즈펜시럽', ingredient: 'acetaminophen', conc: 32, unit: 'mL',
    note: '콜대원키즈이부펜 · 콜대원키즈콜드(감기약)와 성분이 달라요' },
  { id: 'setopen', name: '세토펜현탁액', ingredient: 'acetaminophen', conc: 32, unit: 'mL' },
  { id: 'suspen-kids', name: '써스펜키즈시럽', ingredient: 'acetaminophen', conc: 32, unit: 'mL', note: '복합써스펜좌약과 다른 시럽이에요' },
  { id: 'tylenol-80', name: '어린이용타이레놀정 80mg', ingredient: 'acetaminophen', conc: 80, unit: '개' },
  { id: 'suspen-supp', name: '복합써스펜좌약 125mg', ingredient: 'acetaminophen', conc: 125, unit: '개', maxPerDay: 3 },
  { id: 'brufen', name: '어린이부루펜시럽', ingredient: 'ibuprofen', conc: 20, unit: 'mL' },
  { id: 'champ-ibu', name: '챔프이부펜시럽', ingredient: 'ibuprofen', conc: 20, unit: 'mL', note: '챔프시럽과 성분이 달라요' },
  { id: 'coldaewon-ibu', name: '콜대원키즈이부펜시럽', ingredient: 'ibuprofen', conc: 20, unit: 'mL', note: '콜대원키즈펜과 성분이 달라요' },
  { id: 'kidsnpen', name: '키즈앤펜시럽', ingredient: 'ibuprofen', conc: 20, unit: 'mL' },
  { id: 'maxibupen', name: '맥시부펜시럽', ingredient: 'dexibuprofen', conc: 12, unit: 'mL', note: '이부프로펜 계열이에요' },
  { id: 'anypen', name: '애니펜시럽', ingredient: 'dexibuprofen', conc: 12, unit: 'mL', note: '이부프로펜 계열이에요' },
  { id: 'champ-cold', name: '챔프콜드펜시럽', ingredient: 'acetaminophen', conc: 14, unit: 'mL', combo: true, maxPerDay: 4,
    minAgeMonths: 24, note: '종합감기약 · 1포 5mL' },
  { id: 'champ-cold-hi', name: '챔프콜드펜하이시럽', ingredient: 'acetaminophen', conc: 15, unit: 'mL', combo: true, maxPerDay: 4,
    minAgeMonths: 24, note: '종합감기약 · 1포 10mL' },
  { id: 'coldaewon-cold-s', name: '콜대원키즈콜드에스시럽', ingredient: 'acetaminophen', conc: 15, unit: 'mL', combo: true, maxPerDay: 3,
    minAgeMonths: 24, note: '종합감기약 · 1포 10mL' },
];

// 체온 구간 — 귀 · 겨드랑이 등 재는 곳마다 조금씩 다르지만, 집에서 보기 쉬운 한 가지 눈금을 쓴다.
export const LEVELS = [
  { key: 'low', min: -Infinity, label: '낮음', tone: 'info' },
  { key: 'normal', min: 35.5, label: '정상', tone: 'ok' },
  { key: 'mild', min: 37.5, label: '미열', tone: 'mild' },
  { key: 'fever', min: 38.0, label: '열', tone: 'fever' },
  { key: 'high', min: 39.0, label: '고열', tone: 'high' },
  { key: 'severe', min: 40.0, label: '매우 높음', tone: 'severe' },
];

export const FEVER_AT = 38.0;

export function feverLevel(temp) {
  const t = Number(temp);
  if (!Number.isFinite(t)) return null;
  let found = LEVELS[0];
  for (const level of LEVELS) if (t >= level.min - 1e-9) found = level;
  return found;
}

const ms = (at) => (at instanceof Date ? at.getTime() : new Date(at).getTime());
const round1 = (n) => Math.round(n * 10) / 10;

/** 태어난 날부터 지금까지 만 개월 수. 모르면 null. */
export function ageMonths(birth, now = new Date()) {
  if (!birth) return null;
  // 「2024-05-02」 는 그 나라 시각의 날짜로(UTC 로 읽으면 미국 같은 곳에서 하루 일찍 센다)
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth));
  const b = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const n = now instanceof Date ? now : new Date(now);
  let m = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) m -= 1;
  return Math.max(0, m);
}

export function ageLabel(months) {
  if (months === null || months === undefined) return '';
  if (months < 24) return `${months}개월`;
  return `${Math.floor(months / 12)}세${months % 12 ? ` ${months % 12}개월` : ''}`;
}

export function ageNotice(ingredientId, months) {
  const ing = INGREDIENTS[ingredientId];
  if (!ing || months === null || months === undefined) return '';
  if (months < 3) return '생후 3개월 미만은 해열제보다 진료가 먼저입니다. 열이 나면 바로 병원에 가세요.';
  if (months < ing.minAgeMonths) {
    return `${ing.name}은(는) 보통 생후 ${ing.minAgeMonths}개월부터 먹입니다. 그 전에는 의사와 상의하세요.`;
  }
  return '';
}

function medsOf(history, before = null) {
  const until = before === null ? Infinity : ms(before);
  return history
    .filter((e) => e.type === 'med' && INGREDIENTS[e.ingredient] && Number.isFinite(ms(e.at)) && ms(e.at) <= until)
    .sort((a, b) => ms(a.at) - ms(b.at));
}

/** 지금 체온에 맞춘 한 줄 안내 — 처방이 아니라 집에서 살필 것. */
export function careTip(temp) {
  const lv = feverLevel(temp);
  if (!lv) return '';
  switch (lv.key) {
    case 'low': return '체온이 낮게 나왔어요. 몸을 따뜻하게 하고 다시 재 보세요.';
    case 'normal': return '열이 없어요. 잘 먹고 노는지 아이 상태를 함께 살펴 주세요.';
    // 너무 껴입히지도 벗기지도 않는다 · 미지근한 물로 닦지 않는다(NICE NG143 1.6.2~1.6.3)
    case 'mild': return '너무 껴입히지도 벗기지도 말고 물을 자주 먹이세요. 1~2시간 뒤 다시 재 보세요.';
    // 해열제는 열을 내리려고가 아니라 아이가 힘들어할 때(NICE 1.6.4 · AAP 2011). 처짐 · 잘 안 깸은 진료가 먼저(NICE 1.2.5~1.2.6)
    default: return '물을 자주 먹이세요. 아이가 힘들어하거나 보채면 해열제를 먹일 수 있어요. 처지거나 잘 깨지 않으면 '
      + '해열제보다 진료가 먼저예요. 해열제를 먹였다면 1시간쯤 뒤 다시 재 보세요. 숫자보다 아이의 상태가 더 중요해요.';
  }
}

/**
 * 이 약을 이 시각으로 기록할 때 함께 볼 것 — 기록(앞뒤 같은 계열 · 24시간 횟수)과 설명서 내용을 나란히 적을 뿐,
 * 먹여도 되는지 판정하지 않고 저장도 막지 않는다(이미 먹인 약이 빠지면 기록이 틀린다).
 * level: ok | info | warn. messages: 화면에 그대로 보일 말.
 */
export function checkDose({
  ingredient, at = new Date(), history = [], months = null, medId = null, medMaxPerDay = null, medMinAgeMonths = null,
}) {
  const ing = INGREDIENTS[ingredient];
  const out = { level: 'ok', messages: [] };
  const raise = (level, text) => {
    const order = ['ok', 'info', 'warn'];
    if (order.indexOf(level) > order.indexOf(out.level)) out.level = level;
    out.messages.push({ level, text });
  };
  if (!ing) return out;
  const when = ms(at);

  const age = ageNotice(ingredient, months);
  if (age) raise('warn', age);
  // 제품마다 먹이는 나이가 다르다(종합감기약은 만 2세부터)
  if (medMinAgeMonths && months !== null && months !== undefined && months < medMinAgeMonths) {
    const from = medMinAgeMonths >= 24 ? `만 ${Math.floor(medMinAgeMonths / 12)}세` : `생후 ${medMinAgeMonths}개월`;
    raise('warn', `이 약은 포장에 ${from}부터라고 적혀 있어요. 먹이기 전에 의사 · 약사와 상의하세요.`);
  }

  // 38℃ 아래에서 먹이는 일이 흔하다(열나요 사용자 자료: Park 2021 JMIR mHealth) — 한 줄만
  const lastTemp = history.filter((e) => e.type === 'temp' && ms(e.at) <= when && ms(e.at) > when - 2 * HOUR)
    .sort((a, b) => ms(b.at) - ms(a.at))[0];
  if (lastTemp && Number(lastTemp.temp) < FEVER_AT) {
    raise('info', `마지막 체온이 ${Number(lastTemp.temp).toFixed(1)}℃예요. 열 때문이라면 아이가 힘들어할 때만 먹여도 돼요.`);
  }

  if (ing.group === 'NSAID') {
    const tagsWithin = (hours) => new Set(history.filter((e) => e.type === 'symptom' && ms(e.at) <= when
      && ms(e.at) > when - hours * HOUR).flatMap((e) => e.tags || []));
    if (tagsWithin(7 * 24).has(CHICKENPOX_TAG)) {
      raise('warn', '수두일 때는 이부프로펜 계열을 피하도록 권해요. 먹이기 전에 의사 · 약사와 상의하세요.');
    }
    const dry = DEHYDRATION_TAGS.filter((t) => tagsWithin(24).has(t));
    if (dry.length) {
      raise('info', `${dry.join(' · ')} 기록이 있어요. 물을 잘 못 먹거나 소변이 줄었다면 이부프로펜 계열은 의사 · 약사와 먼저 상의하세요.`);
    }
  }

  // 앞뒤를 모두 본다 — 나중에 지난 시각으로 넣는 기록(새벽에 먹인 것을 아침에)도 있다
  const meds = medsOf(history);
  const same = meds.filter((e) => INGREDIENTS[e.ingredient].group === ing.group);
  const other = meds.filter((e) => INGREDIENTS[e.ingredient].group !== ing.group);
  const before = same.filter((e) => ms(e.at) <= when);
  const after = same.filter((e) => ms(e.at) > when);
  const prev = before[before.length - 1];
  const next = after[0];

  if (prev) {
    const gapH = (when - ms(prev.at)) / HOUR;
    const need = INGREDIENTS[prev.ingredient].minIntervalH;
    if (gapH < need) raise('warn', `같은 계열 약 기록이 ${fmtGap(gapH)} 전에 있어요. 간격 안내는 ${need}시간 이상이에요.`);
  }
  if (next) {
    const gapH = (ms(next.at) - when) / HOUR;
    if (gapH < ing.minIntervalH) {
      raise('warn', `이 시각 ${fmtGap(gapH)} 뒤에 같은 계열 약 기록이 있어요. 간격 안내는 ${ing.minIntervalH}시간 이상이에요.`);
    }
  }
  const near = other.map((e) => ({ e, gapH: (when - ms(e.at)) / HOUR }))
    .filter((x) => Math.abs(x.gapH) < CROSS_MIN_HOURS)
    .sort((x, y) => Math.abs(x.gapH) - Math.abs(y.gapH))[0];
  if (near) {
    const where = near.gapH >= 0 ? `${fmtGap(near.gapH)} 전에` : `${fmtGap(-near.gapH)} 뒤에`;
    raise('warn', `다른 계열 약 기록이 ${where} 있어요. 번갈아 먹이기는 의사 · 약사와 상의하세요.`);
  }

  // 24시간 창 — 이 기록이 들어가는 모든 창(끝이 이 시각부터 24시간 뒤까지) 가운데 가장 많은 것
  const mine = { ingredient, at: new Date(when).toISOString(), medId };
  const all = [...same, mine].sort((x, y) => ms(x.at) - ms(y.at));
  const ends = [when, ...after.map((e) => ms(e.at)).filter((t) => t < when + DAY)];
  let worstCount = 0;
  let worstMedCount = 0;
  for (const end of ends) {
    const inWin = all.filter((e) => ms(e.at) > end - DAY && ms(e.at) <= end);
    worstCount = Math.max(worstCount, inWin.length);
    if (medId) worstMedCount = Math.max(worstMedCount, inWin.filter((e) => e.medId === medId).length);
  }
  if (worstCount > ing.maxPerDay) {
    raise('warn', `24시간 안 같은 계열 ${worstCount}번째 기록이에요. 설명서는 하루 ${ing.maxPerDay}번까지예요.`);
  } else if (medMaxPerDay > 0 && worstMedCount > medMaxPerDay) {
    // 제품마다 하루 횟수가 더 적을 수 있다(복합써스펜좌약 「1일 2~3회」) — 내 약에 적어 둔 횟수
    raise('warn', `24시간 안 이 약 ${worstMedCount}번째 기록이에요. 내 약 설정은 하루 ${medMaxPerDay}번까지예요.`);
  }
  return out;
}

/**
 * 계열마다 기록 모아 보기 — 마지막으로 먹인 기록 · 지난 시간 · 직전 24시간 횟수(자정에 다시 세지 않는다),
 * 그리고 견줘 볼 간격 안내 · 하루 횟수. 다음에 먹일 시각은 내지 않는다.
 */
export function groupLog(group, history, now = new Date()) {
  const nowMs = ms(now);
  const same = medsOf(history, now).filter((e) => INGREDIENTS[e.ingredient].group === group);
  const last = same[same.length - 1] || null;
  const ing = last ? INGREDIENTS[last.ingredient] : Object.values(INGREDIENTS).find((i) => i.group === group);
  return {
    group, last,
    sinceH: last ? (nowMs - ms(last.at)) / HOUR : null,
    countInDay: same.filter((e) => ms(e.at) > nowMs - DAY).length,
    intervalH: ing.minIntervalH, maxPerDay: ing.maxPerDay,
  };
}

function fmtGap(hours) {
  const mins = Math.max(0, Math.round(hours * 60));
  if (mins < 60) return `${mins}분`;
  return `${Math.floor(mins / 60)}시간${mins % 60 ? ` ${mins % 60}분` : ''}`;
}

// 병원에 가야 할 신호로 보는 증상
export const URGENT_SYMPTOMS = ['경련', '숨쉬기 힘듦', '축 처짐', '소변 줄어듦', '누르면 안 없어지는 발진'];

// 이부프로펜 계열을 먹이기 전에 한 번 더 — 수두(NICE CKS: 수두에는 NSAID 를 피한다),
// 탈수(구토 · 설사 · 소변 줄어듦 — 탈수한 아이의 NSAID 급성 신손상: Misurac 2013 J Pediatr, Balestracci 2015 Pediatr Nephrol)
export const CHICKENPOX_TAG = '수두';
export const DEHYDRATION_TAGS = ['구토', '설사', '소변 줄어듦'];

// 열이 이어지는 시간 — 두 돌 전 24시간 · 그 뒤 72시간이면 진료(AAP HealthyChildren 「When to Call the Pediatrician」),
// 5일이면 꼭 진료(가와사키병 등 — NICE NG143 1.2.14 · 1.7.3)
export const FEVER_CALL_H = { under2: 24, over2: 72 };
export const FEVER_LONG_H = 120;

// 소변(기저귀 포함) — 홈에서 한 번 눌러 남긴다. 열이 나는 동안 이만큼 기록이 비면 짚어 준다(도움말 「6~8시간 없음」과 맞춘다).
export const URINE_TAG = '소변 봄';
export const URINE_GAP_H = 8;

// 물 · 우유 등을 마심 — 홈에서 한 번 눌러 남긴다. 양은 재지 않는다(메모에 적을 수 있다). 진료 때 「얼마나 마셨나」를 함께 보이려고.
export const WATER_TAG = '물 마심';
// 홈에서 한 번 눌러 남기는 표 — 이것만 있는 기록은 진료용 요약에서 증상 목록 대신 한 줄로 센다
export const ONE_TAP_TAGS = [URINE_TAG, WATER_TAG];

/** 그 표가 붙은 마지막 기록(지금까지). 없으면 null. */
export function lastTagged(history, tag, now = new Date()) {
  const nowMs = ms(now);
  return history.filter((e) => e.type === 'symptom' && (e.tags || []).includes(tag) && ms(e.at) <= nowMs)
    .sort((a, b) => ms(b.at) - ms(a.at))[0] || null;
}

/** 마지막 소변 기록(지금까지). 없으면 null. */
export const lastUrine = (history, now = new Date()) => lastTagged(history, URINE_TAG, now);

/**
 * 마지막 체온이 바로 앞 체온보다 얼마나 바뀌었나 · 24시간 최고.
 * 앞 체온이 24시간 넘게 지난 것이면 견주지 않는다(다른 열일 수 있다).
 */
export function tempTrend(history, now = new Date()) {
  const nowMs = ms(now);
  const temps = history.filter((e) => e.type === 'temp' && Number.isFinite(Number(e.temp)) && ms(e.at) <= nowMs)
    .sort((a, b) => ms(b.at) - ms(a.at));
  if (!temps.length) return null;
  const [last, prev] = temps;
  const day = temps.filter((e) => ms(e.at) > nowMs - DAY);
  const max = day.reduce((m, e) => (m && Number(m.temp) >= Number(e.temp) ? m : e), null);
  const near = prev && ms(last.at) - ms(prev.at) <= DAY;
  return { last, max, prev: near ? prev : null, diff: near ? round1(Number(last.temp) - Number(prev.temp)) : null };
}

/** 이번 열이 시작된 때 — 열(38℃ 이상)과 열 사이가 24시간 넘게 비면 새로 센다. */
export function feverEpisode(history, now = new Date()) {
  const temps = history.filter((e) => e.type === 'temp' && Number.isFinite(Number(e.temp)) && ms(e.at) <= ms(now))
    .sort((a, b) => ms(a.at) - ms(b.at));
  let start = null;
  let lastFever = null;
  for (const e of temps) {
    if (Number(e.temp) < FEVER_AT) continue;
    if (start === null || ms(e.at) - lastFever > DAY) start = ms(e.at);
    lastFever = ms(e.at);
  }
  if (start === null || ms(now) - lastFever > DAY) return null;
  return { start: new Date(start), lastFever: new Date(lastFever), hours: (lastFever - start) / HOUR };
}

/** 지금 짚어 줄 것 — urgent(바로 병원) · warn(진료 권장). */
export function alertsFor(child, history, now = new Date()) {
  const out = [];
  const nowMs = ms(now);
  const months = ageMonths(child && child.birth, now);
  const recent = history.filter((e) => ms(e.at) > nowMs - DAY && ms(e.at) <= nowMs);
  const temps = recent.filter((e) => e.type === 'temp').sort((a, b) => ms(b.at) - ms(a.at));
  const maxTemp = temps.reduce((m, e) => Math.max(m, Number(e.temp) || 0), 0);

  if (months !== null && months < 3 && maxTemp >= FEVER_AT) {
    out.push({ level: 'urgent', title: '생후 3개월 미만의 열', body: '해열제를 먹이기 전에 바로 병원(응급실)에 가세요.' });
  }
  // 생후 3~6개월 · 39℃ 이상은 진료(NICE NG143 1.2.13 amber)
  if (months !== null && months >= 3 && months < 6 && maxTemp >= 39) {
    out.push({ level: 'warn', title: '생후 3~6개월 · 39℃ 이상', body: '오늘 안에 진료를 받으세요.' });
  }
  const tags = new Set(recent.filter((e) => e.type === 'symptom').flatMap((e) => e.tags || []));
  const urgentTags = URGENT_SYMPTOMS.filter((t) => tags.has(t));
  if (urgentTags.length) {
    out.push({ level: 'urgent', title: `${urgentTags.join(' · ')}`, body: '바로 병원에 가거나 119 에 전화하세요.' });
  }
  if (temps[0] && Number(temps[0].temp) >= 40) {
    out.push({ level: 'warn', title: '40℃ 이상', body: '해열제를 먹인 뒤에도 떨어지지 않거나 아이가 처지면 진료를 받으세요.' });
  }
  const ep = feverEpisode(history, now);
  // 나이를 모르면 72시간(생년월일은 넣지 않아도 된다)
  const callH = months !== null && months < 24 ? FEVER_CALL_H.under2 : FEVER_CALL_H.over2;
  if (ep && ep.hours >= FEVER_LONG_H) {
    out.push({ level: 'warn', title: '열이 5일 넘게 이어짐', body: '꼭 진료를 받아 원인(가와사키병 등)을 확인하세요.' });
  } else if (ep && ep.hours >= callH) {
    out.push(callH === FEVER_CALL_H.under2
      ? { level: 'warn', title: '열이 하루 넘게 이어짐', body: '두 돌 전 아이는 열이 24시간 넘게 이어지면 진료를 받아 보세요.' }
      : { level: 'warn', title: '열이 3일 넘게 이어짐', body: '열이 72시간 넘게 이어지면 진료를 받아 원인을 확인하세요.' });
  }
  // 열성 경련을 한 아이 — 해열제로 미리 막을 수는 없다(NICE 1.6.1 · Cochrane Offringa 2021)
  if (ep && child && child.seizure) {
    out.push({ level: 'info', call: true, title: '열성 경련을 한 적 있는 아이',
      body: '해열제로 경련을 미리 막을 수는 없어요. 경련이 5분 넘게 이어지거나, 처음 보는 모습이면 119 에 전화하세요.' });
  }
  const pee = lastUrine(history, now);
  const peeGapH = pee ? (nowMs - ms(pee.at)) / HOUR : 0;
  // 소변을 기록해 온 아이가 열이 나는 동안만 — 기록을 그만둔 지 오래면(24시간) 짚지 않는다
  if (pee && ep && peeGapH >= URINE_GAP_H && peeGapH < 24) {
    out.push({ level: 'warn', title: `소변 기록이 ${Math.floor(peeGapH)}시간째 없음`,
      body: '소변을 봤다면 「소변」을 눌러 남겨 주세요. 정말 8시간 넘게 보지 않았거나 입이 마르고 울어도 눈물이 없으면 바로 진료를 받으세요.' });
  }
  if (temps[0] && Number(temps[0].temp) < 35.5) {
    out.push({ level: 'warn', title: '체온이 낮음', body: '다시 재 보고, 그래도 35.5℃ 아래면 진료를 받으세요.' });
  }
  return out;
}
