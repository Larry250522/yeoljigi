// 화면 도우미 — 글자 이스케이프 · 시간 표시 · 아래 창 · 토스트 · 아이콘.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ── 시간 ────────────────────────────────────
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function clock(at) {
  const d = new Date(at);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`;
}

export function dayLabel(at, now = new Date()) {
  const d = new Date(at);
  const key = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  if (key(d) === key(now)) return `오늘 · ${base}`;
  if (key(d) === key(y)) return `어제 · ${base}`;
  return base;
}

export function ago(at, now = new Date()) {
  const mins = Math.round((new Date(now) - new Date(at)) / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}시간${mins % 60 && h < 6 ? ` ${mins % 60}분` : ''} 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 그 뒤로 지난 시간 — 내림(실제보다 길게 말하지 않게). 이틀이 넘으면 날로. */
export function elapsed(at, now = new Date()) {
  const mins = Math.max(0, Math.floor((new Date(now) - new Date(at)) / 60000));
  if (mins < 60) return `${mins}분`;
  const h = Math.floor(mins / 60);
  if (h >= 48) return `${Math.floor(h / 24)}일`;
  return `${h}시간${mins % 60 ? ` ${mins % 60}분` : ''}`;
}

/** <input type="datetime-local"> 값 ↔ Date */
export function toLocalInput(at) {
  const d = new Date(at);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v) => (v ? new Date(v) : new Date());

export const fmt1 = (n) => (Math.round(Number(n) * 10) / 10).toFixed(1);
export const fmtAmount = (n) => {
  const r = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

// ── 아이콘(선 아이콘 — currentColor) ─────────
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  calc: '<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  therm: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v6.5"/>',
  pill: '<path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z"/><path d="m8.5 8.5 7 7"/>',
  syrup: '<path d="M9 2h6v3H9z"/><path d="M8 5h8l1 3v11a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V8z"/><path d="M7 12h10"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v13"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  cup: '<path d="M5 4h14l-1.6 15.2a2 2 0 0 1-2 1.8H8.6a2 2 0 0 1-2-1.8z"/><path d="M5.6 9.5h12.8"/>',
  drop: '<path d="M12 2.7s-6.5 6.9-6.5 11.6a6.5 6.5 0 0 0 13 0C18.5 9.6 12 2.7 12 2.7z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
};

export function icon(name, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ── 아래에서 올라오는 창 ───────────────────────
let openSheet = null;

export function sheet({ title, body, footer = '', onOpen, label, onClose }) {
  closeSheet(true);
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const el = document.createElement('section');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label || title);
  el.innerHTML = `<div class="grab" aria-hidden="true"></div>
    <header><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="닫기">${icon('close')}</button></header>
    <div class="sheet-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}`;
  document.body.append(scrim, el);
  const back = document.activeElement;
  requestAnimationFrame(() => { scrim.classList.add('open'); el.classList.add('open'); });
  scrim.addEventListener('click', () => closeSheet());
  el.querySelector('[data-close]').addEventListener('click', () => closeSheet());
  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  openSheet = { scrim, el, back, onKey, onClose };
  if (onOpen) onOpen(el);
  setTimeout(() => (el.querySelector('[autofocus]') || el.querySelector('[data-close]')).focus({ preventScroll: true }), 60);
  return el;
}

export function closeSheet(now = false) {
  if (!openSheet) return;
  const { scrim, el, back, onKey, onClose } = openSheet;
  openSheet = null;
  if (onClose) onClose();
  document.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
  const remove = () => { scrim.remove(); el.remove(); };
  if (now) remove();
  else {
    scrim.classList.remove('open');
    el.classList.remove('open');
    setTimeout(remove, 260);
  }
  if (back && back.focus) back.focus({ preventScroll: true });
}

// ── 토스트 ──────────────────────────────────
let toastTimer = null;
export function toast(text, action) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').addEventListener('click', () => { action.run(); el.remove(); });
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), action ? 5000 : 2600);
}

/** 글을 공유 시트로 보낸다. 공유 시트가 없으면(카카오톡 안 브라우저 · PC) 복사해 둔다. */
export async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('복사했어요. 카카오톡 대화방에 붙여 넣으세요.'); } catch {
    toast('보내지 못했어요. 진료용 요약에서 복사해 주세요.');
  }
}

/** 파일을 공유 시트로, 안 되면 내려받기로. */
export async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('그림을 저장했어요.');
}

export function confirmSheet({ title, text, ok = '확인', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const el = sheet({
      onClose: () => { if (!done) { done = true; resolve(false); } },
      title,
      body: `<p class="muted" style="margin:0">${esc(text)}</p>`,
      footer: `<button class="btn" data-no>취소</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button>`,
    });
    const finish = (v) => { if (!done) { done = true; resolve(v); closeSheet(); } };
    el.querySelector('[data-no]').addEventListener('click', () => finish(false));
    el.querySelector('[data-yes]').addEventListener('click', () => finish(true));
  });
}

/** 고르는 창 — 단추 여럿 가운데 하나. 닫으면 null. choices: [{ key, label, kind: 'primary' | 'danger' | '' }] */
export function choiceSheet({ title, text, choices }) {
  return new Promise((resolve) => {
    let done = false;
    const el = sheet({
      onClose: () => { if (!done) { done = true; resolve(null); } },
      title,
      body: `<p class="muted" style="margin:0">${esc(text)}</p>`,
      footer: choices.map((c) => `<button class="btn ${c.kind || ''}" data-choice="${esc(c.key)}">${esc(c.label)}</button>`).join(''),
    });
    el.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => {
      if (!done) { done = true; resolve(b.dataset.choice); closeSheet(); }
    }));
  });
}
