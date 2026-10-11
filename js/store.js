// 기록 저장 — 이 기기(브라우저)에만. 서버로 보내지 않는다.
//
// 한 덩어리 JSON 을 localStorage 에 둔다(기록이 수천 건이어도 수백 KB). 저장할 수 없는 환경(사생활 보호 창 ·
// 꽉 찬 저장 공간)이면 화면에 알리고 메모리로만 돈다. 백업은 JSON 파일로 내보내고 다시 가져온다.

import { INGREDIENTS } from './dose.js';

const KEY = 'yeoljigi.v1';
export const SCHEMA = 1;

export const CHILD_COLORS = ['#ff7a59', '#4f8cff', '#2bb673', '#b46cff', '#f5a524', '#ef5da8'];

export const DEFAULT_MEDS = [
  { id: 'm-apap', name: '아세트아미노펜 시럽', ingredient: 'acetaminophen', conc: 32, unit: 'mL' },
  { id: 'm-ibu', name: '이부프로펜 시럽', ingredient: 'ibuprofen', conc: 20, unit: 'mL' },
  { id: 'm-dexi', name: '덱시부프로펜 시럽', ingredient: 'dexibuprofen', conc: 12, unit: 'mL' },
];

export const SITES = ['귀', '이마', '겨드랑이', '입', '항문'];

export const SYMPTOMS = [
  '기침', '콧물', '코막힘', '목 아픔', '구토', '설사', '배 아픔', '발진', '오한', '두통', '귀 아픔', '잘 안 먹음',
  '잘 못 잠', '보챔', '경련', '숨쉬기 힘듦', '축 처짐', '소변 줄어듦', '누르면 안 없어지는 발진',
];

// 열의 까닭을 짐작하는 데 쓰는 일 — 예방접종 뒤 1~2일은 열이 날 수 있다(접종열)
export const EVENTS = ['예방접종 맞음', '병원 다녀옴', '어린이집 · 유치원 쉼'];

function blank() {
  return { schema: SCHEMA, children: [], meds: DEFAULT_MEDS.map((m) => ({ ...m })), entries: [],
    settings: { activeChildId: null, theme: 'system', notify: false, site: '귀' } };
}

export const uid = (prefix = 'e') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

let state = blank();
let persistent = true;
const listeners = new Set();

/** 저장된 기록을 읽는다. 깨졌으면 지우지 않고 옆에 남겨 두고 새로 시작한다. */
export function load(storage = globalThis.localStorage) {
  try {
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
  return { ...m, id: str(m.id, 60), name: str(m.name, 30) || INGREDIENTS[m.ingredient].name, conc,
    unit: m.unit === '개' ? '개' : 'mL' };
}

/** 기록 하나 — 화면이 그리다 멈추지 않게 칸마다 본다. 고칠 수 없으면 버린다. */
function cleanEntry(e) {
  if (!e || typeof e !== 'object' || !e.id || !e.childId || !okTime(e.at)) return null;
  const base = { ...e, id: str(e.id, 60), childId: str(e.childId, 60), at: new Date(e.at).toISOString(),
    memo: str(e.memo, 500) };
  if (e.type === 'temp') {
    const t = num(e.temp);
    return t !== null && t >= 30 && t <= 45 ? { ...base, temp: t, site: str(e.site, 10) } : null;
  }
  if (e.type === 'med') {
    const amount = num(e.amount);
    const mg = num(e.mg);
    if (!INGREDIENTS[e.ingredient] || !(amount > 0) || !(mg >= 0)) return null;
    return { ...base, amount, mg, conc: num(e.conc), unit: e.unit === '개' ? '개' : 'mL', name: str(e.name, 30) };
  }
  if (e.type === 'symptom') {
    return { ...base, tags: Array.isArray(e.tags) ? e.tags.map((t) => str(t, 30)).filter(Boolean) : [] };
  }
  return null;
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
    settings: { ...base.settings, ...(data.settings && typeof data.settings === 'object' ? data.settings : {}) },
  };
  if (!['system', 'light', 'dark'].includes(out.settings.theme)) out.settings.theme = 'system';
  out.settings.notify = Boolean(out.settings.notify);
  if (!out.children.some((c) => c.id === out.settings.activeChildId)) {
    out.settings.activeChildId = out.children[0] ? out.children[0].id : null;
  }
  return out;
}

function save(storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
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
  state.entries = state.entries.filter((e) => e.childId !== childId);
  if (state.settings.activeChildId === childId) state.settings.activeChildId = state.children[0]?.id || null;
  save();
}

export function saveEntry(entry) {
  const i = state.entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) state.entries[i] = { ...state.entries[i], ...entry };
  else state.entries.push({ ...entry, id: entry.id || uid(), createdAt: new Date().toISOString() });
  save();
}

export function removeEntry(id) {
  const gone = state.entries.find((e) => e.id === id);
  state.entries = state.entries.filter((e) => e.id !== id);
  save();
  return gone;
}

export function restoreEntry(entry) {
  if (entry && !state.entries.some((e) => e.id === entry.id)) {
    state.entries.push(entry);
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

/** 백업 파일로 바꾼다 — 지금 기록을 지우고 파일의 것으로. */
export function importJson(text) {
  const raw = JSON.parse(text);
  // 아무 JSON 이나 불러와 지금 기록을 지우지 않게 — 열지기 백업이고 아이가 있어야 바꾼다
  if (!raw || raw.app !== 'yeoljigi' || !Array.isArray(raw.children)) throw new Error('열지기 백업 파일이 아닙니다.');
  const data = normalize(raw);
  if (!data.children.length) throw new Error('백업에 아이가 없습니다.');
  state = data;
  save();
  return { children: data.children.length, entries: data.entries.length };
}

export function resetAll() {
  state = blank();
  save();
}

// 시험용 — 저장소 없이 상태를 바꿔 끼운다
export function _setState(next) { state = normalize(next); }
