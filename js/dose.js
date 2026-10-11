// 체온 구간 · 해열제 용량 · 다음 복용 시각 — 화면과 떨어진 순수 계산(시험: tests/dose.test.mjs).
//
// 숫자는 국내 어린이 해열제 허가 사항(포장 설명서)의 일반적인 범위다. 제품마다 함량 · 연령 · 체중 표가 다를 수 있어
// 화면은 늘 「포장 설명서와 의사 · 약사의 지시가 먼저」라고 말한다. 이 파일의 값을 바꾸면 시험도 함께 고친다.

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

// 계열 — 같은 계열끼리는 복용 간격 · 하루 최대량을 함께 센다(이부프로펜과 덱시부프로펜은 같은 계열).
export const GROUPS = {
  APAP: { key: 'APAP', name: '아세트아미노펜 계열', short: '아세트아미노펜' },
  NSAID: { key: 'NSAID', name: '이부프로펜 계열', short: '이부프로펜' },
};

// 다른 계열을 번갈아 먹일 때(교차 복용) 앞 약과 최소 간격
export const CROSS_MIN_HOURS = 2;

export const INGREDIENTS = {
  acetaminophen: {
    id: 'acetaminophen', name: '아세트아미노펜', group: 'APAP',
    mgPerKg: [10, 15], minIntervalH: 4, maxPerDay: 5, maxMgPerKgDay: 75, maxSingleMg: 1000, maxMgDay: 4000,
    minAgeMonths: 4, defaultConc: 32,
  },
  ibuprofen: {
    id: 'ibuprofen', name: '이부프로펜', group: 'NSAID',
    mgPerKg: [5, 10], minIntervalH: 6, maxPerDay: 4, maxMgPerKgDay: 40, maxSingleMg: 400, maxMgDay: 1200,
    // 30kg 미만 소아 하루 500mg — 시럽 허가 원문 「체중이 30kg미만인 어린이는 1일량이 500mg(25ml)을 초과해서는 안되며」
    // (라미돈시럽 · 챔프이부펜 · 콜대원키즈이부펜, 2026-10 대조. 어린이부루펜시럽 원문에는 이 문장이 없다 — 더 보수적인 쪽으로 둔다)
    childDayCap: { underKg: 30, mg: 500 },
    minAgeMonths: 6, defaultConc: 20,
  },
  dexibuprofen: {
    id: 'dexibuprofen', name: '덱시부프로펜', group: 'NSAID',
    mgPerKg: [5, 7], minIntervalH: 6, maxPerDay: 4, maxMgPerKgDay: 28, maxSingleMg: 300, maxMgDay: 1200,
    // 맥시부펜 시럽 허가: 1회 5~7mg/kg, 1일 최대 4회(28mg/kg) · 체중 30kg 이하 소아는 1일 최대 25mL(덱시부프로펜 300mg)
    childDayCap: { underKg: 30, mg: 300, inclusive: true },
    minAgeMonths: 6, defaultConc: 12,
  },
};

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
const floor1 = (n) => Math.floor(n * 10 + 1e-9) / 10;
const ceil1 = (n) => Math.ceil(n * 10 - 1e-9) / 10;

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

/**
 * 1회 용량 범위. conc 는 한 단위(mL 또는 1개)의 mg.
 * 아래 끝은 올리고 위 끝은 내린다(위 끝을 넘지 않게). 1회 최대량(어른 용량)을 넘지 않는다.
 */
export function doseRange(ingredientId, weightKg, conc) {
  const ing = INGREDIENTS[ingredientId];
  const w = Number(weightKg);
  const c = Number(conc);
  if (!ing || !(w > 0) || !(c > 0)) return null;
  const hiMg = Math.min(ing.mgPerKg[1] * w, ing.maxSingleMg);
  const loMg = Math.min(ing.mgPerKg[0] * w, hiMg);
  const hi = floor1(hiMg / c);
  // 한 단위가 범위보다 크면(가벼운 아이에 큰 알약) 아래 끝이 위 끝을 넘는다 — 위 끝으로 맞추고 알린다
  const lo = Math.min(ceil1(loMg / c), hi);
  return {
    mg: [Math.ceil(loMg), Math.floor(hiMg)],
    amount: [lo, hi],
    capped: ing.mgPerKg[1] * w > ing.maxSingleMg,
    unitTooBig: hi <= 0 || ceil1(loMg / c) > hi,
  };
}

/** 하루(24시간) 최대 mg — 체중 기준, 어른 하루 최대량을 넘지 않게. */
export function dailyMaxMg(ingredientId, weightKg) {
  const ing = INGREDIENTS[ingredientId];
  if (!ing || !(weightKg > 0)) return null;
  let cap = ing.maxMgDay;
  const child = ing.childDayCap;
  if (child && (child.inclusive ? weightKg <= child.underKg : weightKg < child.underKg)) cap = Math.min(cap, child.mg);
  return Math.min(ing.maxMgPerKgDay * weightKg, cap);
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

const shareOf = (e, weightKg) => (Number(e.mg) || 0) / (dailyMaxMg(e.ingredient, weightKg) || Infinity);

/** 24시간 안 같은 계열의 하루 최대량 대비 비율 합(이부프로펜 · 덱시부프로펜을 함께 세려고 비율로 더한다). */
function dailyShare(group, meds, at, weightKg) {
  const from = ms(at) - DAY;
  return meds
    .filter((e) => INGREDIENTS[e.ingredient].group === group && ms(e.at) > from)
    .reduce((sum, e) => sum + shareOf(e, weightKg), 0);
}

/**
 * 24시간 동안 이 계열을 하루 최대량의 몇 % 먹였고, 이 약으로 얼마나 더 먹일 수 있나(직전 24시간 — 자정에 다시 세지 않는다).
 * med: { ingredient, conc } — 남은 양을 그 약의 단위(mL · 개)로 바꿀 때. 체중을 모르면 null.
 */
export function dailyLeft(group, history, now, weightKg, med) {
  if (!(weightKg > 0)) return null;
  const used = dailyShare(group, medsOf(history, now), now, weightKg);
  const left = Math.max(0, 1 - used);
  const out = { used: Math.min(1, used), left };
  if (med && INGREDIENTS[med.ingredient] && INGREDIENTS[med.ingredient].group === group && med.conc > 0) {
    out.mg = Math.floor(left * dailyMaxMg(med.ingredient, weightKg));
    out.amount = floor1(out.mg / med.conc);
  }
  return out;
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
 * 이 약을 이 시각에 먹여도 되는지.
 * level: ok | info | warn | block. messages: 화면에 그대로 보일 말.
 */
export function checkDose({ ingredient, mg, at = new Date(), weightKg, history = [], months = null }) {
  const ing = INGREDIENTS[ingredient];
  const out = { level: 'ok', messages: [] };
  const raise = (level, text) => {
    const order = ['ok', 'info', 'warn', 'block'];
    if (order.indexOf(level) > order.indexOf(out.level)) out.level = level;
    out.messages.push({ level, text });
  };
  if (!ing) return out;
  const when = ms(at);
  const dose = Number(mg) || 0;

  const age = ageNotice(ingredient, months);
  if (age) raise('warn', age);

  // 38℃ 아래에서 먹이는 일이 흔하다(열나요 사용자 자료: Park 2021 JMIR mHealth) — 막지 않고 한 줄만
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

  if (weightKg > 0 && dose > 0) {
    const range = doseRange(ingredient, weightKg, 1);
    // 5% 는 mL 반올림 여유 — 어른 1회 최대량에는 여유를 두지 않는다
    const limit = Math.min(range.mg[1] * 1.05, ing.maxSingleMg);
    if (dose > limit) raise('block', `1회 최대 ${range.mg[1]}mg(체중 ${weightKg}kg 기준)을 넘습니다.`);
    else if (dose < range.mg[0] * 0.8) raise('info', `권장량(${range.mg[0]}~${range.mg[1]}mg)보다 적습니다.`);
  } else if (!(weightKg > 0)) {
    raise('info', '체중을 넣으면 용량을 확인해 드려요.');
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
    if (gapH < need) raise('block', `같은 계열 약을 ${fmtGap(gapH)} 전에 먹였습니다. ${need}시간 간격을 지켜 주세요.`);
  }
  if (next) {
    const gapH = (ms(next.at) - when) / HOUR;
    if (gapH < ing.minIntervalH) {
      raise('block', `이 시각 ${fmtGap(gapH)} 뒤에 같은 계열 약 기록이 있습니다. ${ing.minIntervalH}시간 간격이 안 됩니다.`);
    }
  }
  const near = other.map((e) => ({ e, gapH: (when - ms(e.at)) / HOUR }))
    .filter((x) => Math.abs(x.gapH) < CROSS_MIN_HOURS)
    .sort((x, y) => Math.abs(x.gapH) - Math.abs(y.gapH))[0];
  if (near) {
    const where = near.gapH >= 0 ? `${fmtGap(near.gapH)} 전에` : `${fmtGap(-near.gapH)} 뒤에`;
    raise('warn', `다른 계열 약을 ${where} 먹였습니다. 번갈아 먹일 때도 ${CROSS_MIN_HOURS}시간은 띄우세요.`);
  }

  // 24시간 창 — 이 약이 들어가는 모든 창(끝이 이 시각부터 24시간 뒤까지) 가운데 가장 많은 것
  const mine = { ingredient, mg: dose, at: new Date(when).toISOString() };
  const all = [...same, mine].sort((x, y) => ms(x.at) - ms(y.at));
  const ends = [when, ...after.map((e) => ms(e.at)).filter((t) => t < when + DAY)];
  let worstCount = 0;
  let worstShare = 0;
  for (const end of ends) {
    const inWin = all.filter((e) => ms(e.at) > end - DAY && ms(e.at) <= end);
    worstCount = Math.max(worstCount, inWin.length);
    if (weightKg > 0) worstShare = Math.max(worstShare, inWin.reduce((sum, e) => sum + shareOf(e, weightKg), 0));
  }
  if (worstCount > ing.maxPerDay) raise('block', `24시간 안 ${worstCount}번째입니다. 하루 ${ing.maxPerDay}번까지입니다.`);
  if (weightKg > 0 && dose > 0 && worstShare > 1.0001) raise('block', '24시간 동안 먹인 양이 하루 최대량을 넘습니다.');
  return out;
}

/**
 * 계열마다 다음에 먹일 수 있는 때.
 * { group, last, canNow, at(Date|null), reason, countInDay, maxPerDay }
 * weightKg 를 주면 하루 최대량도 본다 — 남은 양이 가장 적은 1회 양보다 적으면, 오래된 약이 24시간 밖으로 나가는 때까지.
 */
export function nextDose(group, history, now = new Date(), weightKg = 0) {
  const meds = medsOf(history, now);
  const same = meds.filter((e) => INGREDIENTS[e.ingredient].group === group);
  const other = meds.filter((e) => INGREDIENTS[e.ingredient].group !== group);
  const last = same[same.length - 1] || null;
  const nowMs = ms(now);
  const result = { group, last, canNow: true, at: null, reason: '', countInDay: 0, maxPerDay: 0 };
  const candidates = [];

  if (last) {
    const ing = INGREDIENTS[last.ingredient];
    candidates.push({ at: ms(last.at) + ing.minIntervalH * HOUR, reason: `${ing.minIntervalH}시간 간격` });
    const recent = same.filter((e) => ms(e.at) > nowMs - DAY);
    result.countInDay = recent.length;
    result.maxPerDay = ing.maxPerDay;
    if (recent.length >= ing.maxPerDay) {
      candidates.push({ at: ms(recent[recent.length - ing.maxPerDay].at) + DAY, reason: `하루 ${ing.maxPerDay}번` });
    }
    if (weightKg > 0 && recent.length) {
      const need = shareOf({ ingredient: ing.id, mg: Math.min(ing.mgPerKg[0] * weightKg, ing.maxSingleMg) }, weightKg);
      let used = recent.reduce((sum, e) => sum + shareOf(e, weightKg), 0);
      if (1 - used < need - 1e-9) {
        for (const e of recent) {              // 오래된 것부터 창 밖으로
          used -= shareOf(e, weightKg);
          if (1 - used >= need - 1e-9) {
            candidates.push({ at: ms(e.at) + DAY, reason: '하루 최대량' });
            break;
          }
        }
      }
    }
  }
  const lastOther = other[other.length - 1];
  if (lastOther) candidates.push({ at: ms(lastOther.at) + CROSS_MIN_HOURS * HOUR, reason: '다른 계열과 2시간' });

  const latest = candidates.filter((c) => c.at > nowMs).sort((a, b) => b.at - a.at)[0];
  if (latest) {
    result.canNow = false;
    result.at = new Date(latest.at);
    result.reason = latest.reason;
  }
  return result;
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

/** 마지막 소변 기록(지금까지). 없으면 null. */
export function lastUrine(history, now = new Date()) {
  const nowMs = ms(now);
  return history.filter((e) => e.type === 'symptom' && (e.tags || []).includes(URINE_TAG) && ms(e.at) <= nowMs)
    .sort((a, b) => ms(b.at) - ms(a.at))[0] || null;
}

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
