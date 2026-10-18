// 기록 저장 — 이 기기(브라우저)에만. 서버로 보내지 않는다.
//
// 한 덩어리 JSON 을 localStorage 에 둔다(기록이 수천 건이어도 수백 KB). 저장할 수 없는 환경(사생활 보호 창 ·
// 꽉 찬 저장 공간)이면 화면에 알리고 메모리로만 돈다. 백업은 JSON 파일로 내보내고 다시 가져온다(바꾸기 · 합치기).
//
// 합치기 — 다른 휴대폰 · 옛 주소의 기록을 지금 기록에 더한다. 같은 기록(id)은 나중에 고친 쪽, 지운 기록은
// `removed`(지운 기록 id → 지운 때)로 기억해 합칠 때 되살아나지 않게 한다.

import { INGREDIENTS, URINE_TAG, WATER_TAG } from './dose.js';

const KEY = 'yeoljigi.v1';
export const SCHEMA = 1;

export const CHILD_COLORS = ['#ff7a59', '#4f8cff', '#2bb673', '#b46cff', '#f5a524', '#ef5da8'];

export const DEFAULT_MEDS = [
  { id: 'm-apap', name: '아세트아미노펜 시럽', ingredient: 'acetaminophen', conc: 32, unit: 'mL' },
  { id: 'm-ibu', name: '이부프로펜 시럽', ingredient: 'ibuprofen', conc: 20, unit: 'mL' },
  { id: 'm-dexi', name: '덱시부프로펜 시럽', ingredient: 'dexibuprofen', conc: 12, unit: 'mL' },
];

// 귀 · 겨드랑이를 먼저 — 0~5세는 입 · 항문으로 늘 재지 않는다, 이마 띠는 믿기 어렵다(NICE NG143 1.1)
export const SITES = ['귀', '겨드랑이', '이마', '입', '항문'];

export const SYMPTOMS = [
  '기침', '콧물', '코막힘', '목 아픔', '구토', '설사', '배 아픔', '발진', '오한', '두통', '귀 아픔', '잘 안 먹음',
  '잘 못 잠', '보챔', '수두', '경련', '숨쉬기 힘듦', '축 처짐', '소변 줄어듦', '누르면 안 없어지는 발진',
];

// 아이 상태 — 체온과 함께 한 번 눌러 남긴다. 해열제는 체온이 아니라 아이가 힘들어하는 정도로 정한다
// (FeverApp 등록 연구: Möhler 2022 IJERPH — 상태가 좋으면 해열제를 덜 먹였다)
export const WELLBEING = ['많이 힘들어함', '힘들어함', '보통', '괜찮음', '잘 놂'];
export const wellbeingLabel = (v) => WELLBEING[Number(v) - 1] || '';

// 그 밖의 일 — 소변(홈에서 한 번 누르기와 같은 표), 열의 까닭을 짐작하는 일(예방접종 뒤 1~2일은 열이 날 수 있다)
export const EVENTS = [URINE_TAG, WATER_TAG, '예방접종 맞음', '병원 다녀옴', '어린이집 · 유치원 쉼'];

// 글자 크기 — 밤에 한 손으로 볼 때(css 의 --fs)
export const TEXT_SIZES = { md: '보통', lg: '크게', xl: '아주 크게' };
// 지운 기록 표시는 이만큼만 남긴다(오래된 것부터 버림)
const REMOVED_MAX = 3000;

function blank() {
  return { schema: SCHEMA, children: [], meds: DEFAULT_MEDS.map((m) => ({ ...m })), entries: [], removed: {},
    settings: { activeChildId: null, theme: 'system', notify: false, site: '귀', text: 'md' } };
}

export const uid = (prefix = 'e') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

let state = blank();
let persistent = true;
const listeners = new Set();

// 쿠키 · 사이트 데이터를 막은 브라우저는 localStorage 를 읽기만 해도 예외가 난다 — 꼭 try 안에서 부른다
const local = () => globalThis.localStorage;

/** 저장된 기록을 읽는다. 깨졌으면 지우지 않고 옆에 남겨 두고 새로 시작한다. */
export function load(storage) {
  try {
    storage = storage ?? local();
    const raw = storage.getItem(KEY);
    state = raw ? normalize(JSON.parse(raw)) : blank();
  } catch (err) {
    persistent = false;
    try {
      const raw = storage && storage.getItem(KEY);
      if (raw) storage.setItem(`${KEY}.broken-${Date.now()}`, raw);
      persistent = true;
    } catch { /* 저장소를 아예 못 쓴다 */ }
    state = blank();
  }
  return state;
}

const str = (v, max = 200) => (v === null || v === undefined ? '' : String(v)).slice(0, max);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const okTime = (v) => typeof v === 'string' && !Number.isNaN(new Date(v).getTime());
const COLOR = /^#[0-9a-f]{3,8}$/i;

function cleanChild(c, i) {
  if (!c || typeof c !== 'object' || !c.id || !str(c.name).trim()) return null;
  const weight = num(c.weight);
  return {
    ...c, id: str(c.id, 60), name: str(c.name, 20).trim(),
    birth: /^\d{4}-\d{2}-\d{2}$/.test(str(c.birth)) ? str(c.birth) : '',
    weight: weight !== null && weight >= 2 && weight <= 80 ? weight : null,
    color: COLOR.test(str(c.color)) ? c.color : CHILD_COLORS[i % CHILD_COLORS.length],
    seizure: Boolean(c.seizure), note: str(c.note, 100),
  };
}

function cleanMed(m) {
  if (!m || typeof m !== 'object' || !m.id || !INGREDIENTS[m.ingredient]) return null;
  const conc = num(m.conc);
  if (!(conc > 0)) return null;
  const max = num(m.maxPerDay);
  return { ...m, id: str(m.id, 60), name: str(m.name, 30) || INGREDIENTS[m.ingredient].name, conc,
    unit: m.unit === '개' ? '개' : 'mL', maxPerDay: Number.isInteger(max) && max >= 1 && max <= 6 ? max : null,
    combo: Boolean(m.combo), minAgeMonths: Number.isInteger(num(m.minAgeMonths)) && num(m.minAgeMonths) > 0 ? num(m.minAgeMonths) : null };
}

/** 기록 하나 — 화면이 그리다 멈추지 않게 칸마다 본다. 고칠 수 없으면 버린다. */
function cleanEntry(e) {
  if (!e || typeof e !== 'object' || !e.id || !e.childId || !okTime(e.at)) return null;
  const base = { ...e, id: str(e.id, 60), childId: str(e.childId, 60), at: new Date(e.at).toISOString(),
    memo: str(e.memo, 500) };
  if (e.type === 'temp') {
    const t = num(e.temp);
    const wb = num(e.wellbeing);
    return t !== null && t >= 30 && t <= 45
      ? { ...base, temp: t, site: str(e.site, 10), wellbeing: Number.isInteger(wb) && wb >= 1 && wb <= 5 ? wb : null } : null;
  }
  if (e.type === 'med') {
    const amount = num(e.amount);
    const mg = num(e.mg);
    if (!INGREDIENTS[e.ingredient] || !(amount > 0) || !(mg >= 0)) return null;
    return { ...base, amount, mg, conc: num(e.conc), unit: e.unit === '개' ? '개' : 'mL', name: str(e.name, 30),
      combo: Boolean(e.combo) };
  }
  if (e.type === 'symptom') {
    return { ...base, tags: Array.isArray(e.tags) ? e.tags.map((t) => str(t, 30)).filter(Boolean) : [] };
  }
  return null;
}

/** 지운 기록 표시 — id → 지운 때. 깨진 것은 버리고 최근 것만 남긴다. */
function cleanRemoved(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const pairs = Object.entries(v).filter(([id, at]) => id && okTime(at)).map(([id, at]) => [str(id, 60), new Date(at).toISOString()]);
  pairs.sort((a, b) => (a[1] < b[1] ? 1 : -1));
  return Object.fromEntries(pairs.slice(0, REMOVED_MAX));
}

/** 가져온 · 저장된 자료를 지금 꼴로 맞춘다. 깨진 칸이 있는 기록은 버린다(화면이 멈추지 않게). */
export function normalize(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('자료 꼴이 아닙니다.');
  const base = blank();
  const children = (Array.isArray(data.children) ? data.children : []).map(cleanChild).filter(Boolean);
  const ids = new Set(children.map((c) => c.id));
  const out = {
    ...base,
    schema: SCHEMA,
    children,
    meds: Array.isArray(data.meds) && data.meds.length ? data.meds.map(cleanMed).filter(Boolean) : base.meds,
    entries: (Array.isArray(data.entries) ? data.entries : []).map(cleanEntry).filter((e) => e && ids.has(e.childId)),
    removed: cleanRemoved(data.removed),
    settings: { ...base.settings, ...(data.settings && typeof data.settings === 'object' ? data.settings : {}) },
  };
  if (!['system', 'light', 'dark'].includes(out.settings.theme)) out.settings.theme = 'system';
  out.settings.notify = Boolean(out.settings.notify);
  if (!TEXT_SIZES[out.settings.text]) out.settings.text = 'md';
  if (!out.children.some((c) => c.id === out.settings.activeChildId)) {
    out.settings.activeChildId = out.children[0] ? out.children[0].id : null;
  }
  return out;
}

function save(storage) {
  try {
    (storage ?? local()).setItem(KEY, JSON.stringify(state));
    persistent = true;
  } catch {
    persistent = false;
  }
  listeners.forEach((fn) => fn(state));
}

export const get = () => state;
export const isPersistent = () => persistent;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function activeChild() {
  return state.children.find((c) => c.id === state.settings.activeChildId) || null;
}

export function entriesOf(childId) {
  return state.entries.filter((e) => e.childId === childId).sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function setActive(childId) {
  state.settings.activeChildId = childId;
  save();
}

export function saveChild(child) {
  const i = state.children.findIndex((c) => c.id === child.id);
  if (i >= 0) state.children[i] = { ...state.children[i], ...child };
  else {
    state.children.push({ color: CHILD_COLORS[state.children.length % CHILD_COLORS.length], ...child,
      id: child.id || uid('c') });
    state.settings.activeChildId = state.children[state.children.length - 1].id;
  }
  save();
  return state.children.find((c) => c.id === (child.id || state.settings.activeChildId));
}

export function removeChild(childId) {
  state.children = state.children.filter((c) => c.id !== childId);
  const at = new Date().toISOString();
  state.entries.forEach((e) => { if (e.childId === childId) state.removed[e.id] = at; });
  state.entries = state.entries.filter((e) => e.childId !== childId);
  if (state.settings.activeChildId === childId) state.settings.activeChildId = state.children[0]?.id || null;
  save();
}

export function saveEntry(entry) {
  const i = state.entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) state.entries[i] = { ...state.entries[i], ...entry, updatedAt: new Date().toISOString() };
  else state.entries.push({ ...entry, id: entry.id || uid(), createdAt: new Date().toISOString() });
  save();
}

export function removeEntry(id) {
  const gone = state.entries.find((e) => e.id === id);
  state.entries = state.entries.filter((e) => e.id !== id);
  if (gone) state.removed[id] = new Date().toISOString();
  save();
  return gone;
}

export function restoreEntry(entry) {
  if (entry && !state.entries.some((e) => e.id === entry.id)) {
    state.entries.push(entry);
    delete state.removed[entry.id];
    save();
  }
}

export function saveMed(med) {
  const i = state.meds.findIndex((m) => m.id === med.id);
  if (i >= 0) state.meds[i] = { ...state.meds[i], ...med };
  else state.meds.push({ ...med, id: med.id || uid('m') });
  save();
}

export function removeMed(id) {
  state.meds = state.meds.filter((m) => m.id !== id);
  save();
}

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

export function exportJson() {
  return JSON.stringify({ app: 'yeoljigi', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

/** 열지기 백업 · 기록 링크인지 보고 읽는다. 아이가 없으면 받지 않는다. */
export function readBackup(raw) {
  // 아무 JSON 이나 불러와 지금 기록을 지우지 않게 — 열지기 백업이고 아이가 있어야 쓴다
  if (!raw || raw.app !== 'yeoljigi' || !Array.isArray(raw.children)) throw new Error('열지기 백업 파일이 아닙니다.');
  const data = normalize(raw);
  if (!data.children.length) throw new Error('백업에 아이가 없습니다.');
  return data;
}

/** 백업 파일로 바꾼다 — 지금 기록을 지우고 파일의 것으로. */
export function importJson(text) {
  const data = readBackup(JSON.parse(text));
  data.settings = { ...data.settings, text: state.settings.text };   // 글자 크기는 이 휴대폰의 것
  state = data;
  save();
  return { children: data.children.length, entries: data.entries.length };
}

// 같은 기록을 두 휴대폰에서 따로 남겼는지 — 같은 아이 · 같은 때(분) · 같은 값
const sameKey = (e) => [e.childId, e.type, e.at.slice(0, 16), e.temp ?? '', e.ingredient ?? '', e.amount ?? '',
  (e.tags || []).join(',')].join('|');
const editedAt = (e) => e.updatedAt || e.createdAt || '';
const sameMed = (a, b) => a.ingredient === b.ingredient && a.conc === b.conc && a.unit === b.unit && a.name === b.name;

/**
 * 다른 기록을 지금 기록에 합친다 — 아무것도 지우지 않고 더한다(다른 휴대폰에서 지운 기록만 빠진다).
 * 아이는 id, 없으면 같은 이름(생년월일이 다르지 않을 때)으로 맞춘다. 설정은 이 휴대폰의 것 그대로.
 */
export function mergeData(raw) {
  const data = readBackup(raw);
  const r = { children: 0, entries: 0, updated: 0, removed: 0, kids: [] };
  const kid = new Map();
  for (const c of data.children) {
    const mine = state.children.find((x) => x.id === c.id)
      || state.children.find((x) => x.name === c.name && (!x.birth || !c.birth || x.birth === c.birth));
    if (mine) {
      kid.set(c.id, mine.id);
      // 이 휴대폰에 없던 칸만 채운다(생년월일 · 몸무게)
      if (!mine.birth && c.birth) mine.birth = c.birth;
      if (!mine.weight && c.weight) mine.weight = c.weight;
    } else {
      state.children.push({ ...c });
      kid.set(c.id, c.id);
      r.children += 1;
    }
  }
  r.kids = [...new Set(kid.values())];
  const med = new Map();
  // 약이 없는 자료면 normalize 가 기본 약을 채운다 — 여기서 지운 기본 약이 되살아나지 않게 보낸 약만 본다
  for (const m of Array.isArray(raw.meds) && raw.meds.length ? data.meds : []) {
    const mine = state.meds.find((x) => x.id === m.id) || state.meds.find((x) => sameMed(x, m));
    if (mine) med.set(m.id, mine.id);
    else { state.meds.push({ ...m }); med.set(m.id, m.id); }
  }
  for (const [id, at] of Object.entries(data.removed)) {
    if (!state.removed[id] || state.removed[id] < at) state.removed[id] = at;
  }
  const byId = new Map(state.entries.map((e) => [e.id, e]));
  const keys = new Set(state.entries.map(sameKey));
  for (const e of data.entries) {
    const next = { ...e, childId: kid.get(e.childId) };
    if (next.medId && med.has(next.medId)) next.medId = med.get(next.medId);
    if (state.removed[next.id]) continue;
    const mine = byId.get(next.id);
    if (mine) {
      if (editedAt(next) > editedAt(mine)) { Object.assign(mine, next); r.updated += 1; }
      continue;
    }
    if (keys.has(sameKey(next))) continue;
    state.entries.push(next);
    byId.set(next.id, next);
    keys.add(sameKey(next));
    r.entries += 1;
  }
  const before = state.entries.length;
  state.entries = state.entries.filter((e) => !state.removed[e.id]);
  r.removed = before - state.entries.length;
  state.removed = cleanRemoved(state.removed);
  if (!activeChild()) state.settings.activeChildId = state.children[0]?.id || null;
  save();
  return r;
}

export const mergeJson = (text) => mergeData(JSON.parse(text));

/**
 * 가족에게 보낼 기록 — 한 아이의 최근 기록과 그 기록이 쓴 약, 그 사이 지운 기록 표시. 링크에 담는다(js/share.js).
 * 설정 · 다른 아이는 넣지 않는다.
 */
export function sharePack(childId, hours = 72, now = new Date()) {
  const child = state.children.find((c) => c.id === childId);
  if (!child) return null;
  const from = new Date(now.getTime() - hours * 3600_000).toISOString();
  const entries = state.entries.filter((e) => e.childId === childId && e.at >= from);
  const medIds = new Set(entries.map((e) => e.medId).filter(Boolean));
  const removed = Object.fromEntries(Object.entries(state.removed).filter(([, at]) => at >= from));
  return { app: 'yeoljigi', kind: 'share', sentAt: now.toISOString(), hours, schema: SCHEMA, children: [child],
    meds: state.meds.filter((m) => medIds.has(m.id)), entries, removed };
}

export function resetAll() {
  state = blank();
  save();
}

// 시험용 — 저장소 없이 상태를 바꿔 끼운다
export function _setState(next) { state = normalize(next); }
