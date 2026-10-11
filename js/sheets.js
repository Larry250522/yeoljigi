// 기록 창 — 체온 · 해열제 · 증상 · 아이 · 내 약. 아래에서 올라오는 창 하나에 한 가지를 넣는다.

import {
  INGREDIENTS, ageMonths, ageNotice, checkDose, doseRange, feverLevel,
} from './dose.js';
import * as store from './store.js';
import {
  $, $$, closeSheet, confirmSheet, esc, fmt1, fmtAmount, fromLocalInput, icon, sheet, toLocalInput, toast,
} from './ui.js';

const URGENT = new Set(['경련', '숨쉬기 힘듦', '축 처짐', '소변 줄어듦', '누르면 안 없어지는 발진']);

/** 친 체온 → 숫자. 「38.5」 · 「38,5」 · 「385」 모두 38.5. 34~42 밖이면 null. */
export function parseTemp(text) {
  const raw = String(text).trim().replace(',', '.');
  if (!/^\d{2,3}(\.\d?)?$/.test(raw)) return null;
  let v = Number(raw);
  if (!raw.includes('.') && raw.length === 3) v /= 10;
  v = Math.round(v * 10) / 10;
  return v >= 34 && v <= 42 ? v : null;
}

function whenField(at) {
  return `<div class="field"><span>언제</span>
    <div class="whenpick">
      <div class="chips" role="group" aria-label="빠른 시간">
        <button type="button" class="chip" data-ago="0" aria-pressed="false">지금</button>
        <button type="button" class="chip" data-ago="10" aria-pressed="false">10분 전</button>
        <button type="button" class="chip" data-ago="30" aria-pressed="false">30분 전</button>
      </div>
      <input class="input" type="datetime-local" name="at" value="${toLocalInput(at)}" max="${toLocalInput(new Date())}"
        aria-label="날짜와 시간">
    </div></div>`;
}

function wireWhen(el, onChange) {
  const input = $('[name=at]', el);
  const mark = () => {
    const diff = Math.round((Date.now() - fromLocalInput(input.value).getTime()) / 60000);
    $$('[data-ago]', el).forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(diff - Number(b.dataset.ago)) <= 1)));
  };
  $$('[data-ago]', el).forEach((b) => b.addEventListener('click', () => {
    input.value = toLocalInput(new Date(Date.now() - Number(b.dataset.ago) * 60000));
    mark();
    if (onChange) onChange();
  }));
  input.addEventListener('change', () => { mark(); if (onChange) onChange(); });
  mark();
}

/** 고른 시각. 앞으로의 시각(5분 넘게)은 기록하지 않는다 — 계산에서 빠져 「먹인 적 없음」으로 보이게 된다. */
function readWhen(el) {
  const at = fromLocalInput($('[name=at]', el).value);
  if (Number.isNaN(at.getTime())) { toast('시각을 확인해 주세요.'); return null; }
  if (at.getTime() > Date.now() + 5 * 60000) { toast('아직 오지 않은 시각이에요. 시각을 확인해 주세요.'); return null; }
  return at;
}

/** 저장 단추를 두 번 눌러 같은 기록이 둘 생기지 않게 — 한 번만 부른다. */
function once(fn) {
  let done = false;
  return (...args) => { if (done) return; const r = fn(...args); if (r !== false) done = true; };
}

const deleteBtn = (entry) => (entry ? `<button class="btn danger" data-del aria-label="이 기록 지우기">${icon('trash', 20)}</button>` : '');

function wireDelete(el, entry) {
  const btn = $('[data-del]', el);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const gone = store.removeEntry(entry.id);
    closeSheet();
    toast('기록을 지웠어요.', { label: '되돌리기', run: () => store.restoreEntry(gone) });
  });
}

// ── 체온 ───────────────────────────────────
export function tempSheet(child, entry = null) {
  const last = store.entriesOf(child.id).find((e) => e.type === 'temp');
  let value = entry ? Number(entry.temp) : (last ? Number(last.temp) : 37.0);
  const site = entry ? entry.site : store.get().settings.site;
  const el = sheet({
    title: entry ? '체온 고치기' : `${child.name} 체온`,
    body: `<div class="dial">
        <div class="value num"><input class="dial-input num" data-v type="text" inputmode="decimal" enterkeyhint="done"
          value="${fmt1(value)}" aria-label="체온(℃) — 눌러서 바로 칠 수 있어요" autocomplete="off"><small>℃</small></div>
        <div data-level style="margin-top:6px"></div>
        <div class="row-ctl">
          <button type="button" class="step" data-step="-0.1" aria-label="0.1도 내리기">−</button>
          <button type="button" class="step" data-step="0.1" aria-label="0.1도 올리기">+</button>
        </div>
        <input class="range" type="range" min="34" max="42" step="0.1" value="${value}" aria-label="체온">
        <div class="scale" aria-hidden="true"><span>34</span><span>36</span><span>38</span><span>40</span><span>42</span></div>
      </div>
      <div class="field" style="margin-top:14px"><span>잰 곳</span>
        <div class="chips" role="group" aria-label="잰 곳">${store.SITES.map((s) => `<button type="button" class="chip" data-site="${esc(s)}"
          aria-pressed="${s === site}">${esc(s)}</button>`).join('')}</div></div>
      ${whenField(entry ? entry.at : new Date())}
      <label class="field"><span>메모 (선택)</span><input class="input" name="memo" maxlength="200" value="${esc(entry?.memo || '')}"
        placeholder="예: 자다 깨서 잼"></label>`,
    footer: `${deleteBtn(entry)}<button class="btn primary" data-save>저장</button>`,
  });
  const range = $('.range', el);
  const typed = $('[data-v]', el);
  const show = (fromTyping = false) => {
    if (!fromTyping) typed.value = fmt1(value);
    range.value = value;
    const lv = feverLevel(value);
    $('[data-level]', el).innerHTML = `<span class="badge bg-${lv.tone}">${esc(lv.label)}</span>`;
  };
  $$('[data-step]', el).forEach((b) => b.addEventListener('click', () => {
    value = Math.min(42, Math.max(34, Math.round((value + Number(b.dataset.step)) * 10) / 10));
    show();
  }));
  range.addEventListener('input', () => { value = Number(range.value); show(); });
  // 숫자를 바로 친다 — 누르면 전체가 골라져 지울 필요가 없다. 「385」 처럼 점 없이 쳐도 38.5 로 본다.
  typed.addEventListener('focus', () => typed.select());
  typed.addEventListener('input', () => {
    const v = parseTemp(typed.value);
    if (v !== null) { value = v; show(true); }
  });
  typed.addEventListener('blur', () => show());
  typed.addEventListener('keydown', (e) => { if (e.key === 'Enter') typed.blur(); });
  $$('[data-site]', el).forEach((b) => b.addEventListener('click', () => {
    $$('[data-site]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  wireWhen(el);
  wireDelete(el, entry);
  show();
  $('[data-save]', el).addEventListener('click', once(() => {
    const when = readWhen(el);
    if (!when) return false;
    const chosen = $('[data-site][aria-pressed="true"]', el)?.dataset.site || '';
    store.saveEntry({ ...(entry || {}), childId: child.id, type: 'temp', temp: value, site: chosen,
      at: when.toISOString(), memo: $('[name=memo]', el).value.trim() });
    if (chosen) store.setSetting('site', chosen);
    closeSheet();
    toast(`${fmt1(value)}℃ 기록했어요.`);
  }));
}

// ── 해열제 ─────────────────────────────────
export function medSheet(child, entry = null, onSaved) {
  const meds = store.get().meds;
  const lastMed = store.entriesOf(child.id).find((e) => e.type === 'med');
  // 고칠 때는 그때 먹인 약 그대로(내 약의 함량 · 성분을 나중에 바꿨어도 옛 기록은 바뀌지 않게). 다른 약을 고르면 그 약으로.
  let med = entry ? snapshotMed(entry) : meds.find((m) => m.id === lastMed?.medId) || meds[0];
  let amount = entry ? Number(entry.amount) : null;
  const months = ageMonths(child.birth);

  const el = sheet({
    title: entry ? '해열제 기록 고치기' : `${child.name} 해열제`,
    body: `<div class="field"><span>어떤 약</span><div class="medpick" role="group" aria-label="약">
        ${meds.map((m) => medButton(m)).join('')}</div>
        <div class="hint">약은 설정 → 내 약에서 더하거나 함량을 고칩니다. <b>포장에 적힌 함량</b>과 같은지 확인하세요.</div></div>
      <div data-check aria-live="polite" style="margin:-4px 0 14px"></div>
      <div class="field"><span>먹인 양</span>
        <div class="dial" style="padding:0">
          <div class="value num" style="font-size:52px"><input class="dial-input num" data-v type="text" inputmode="decimal"
            enterkeyhint="done" aria-label="먹인 양 — 눌러서 바로 칠 수 있어요" autocomplete="off"><small data-unit></small></div>
          <div class="muted small" data-mg></div>
          <div class="row-ctl">
            <button type="button" class="step" data-step="-1" aria-label="양 줄이기">−</button>
            <button type="button" class="step" data-step="1" aria-label="양 늘리기">+</button>
          </div>
        </div>
        <div class="check info" data-range style="text-align:center"></div>
      </div>
      ${whenField(entry ? entry.at : new Date())}
      <label class="field"><span>메모 (선택)</span><input class="input" name="memo" maxlength="200"
        value="${esc(entry?.memo || '')}" placeholder="예: 반쯤 토함"></label>`,
    footer: `${deleteBtn(entry)}<button class="btn primary" data-save>저장</button>`,
  });

  const stepOf = () => (med.unit === 'mL' ? 0.5 : 0.5);
  const recommend = () => {
    const r = doseRange(med.ingredient, child.weight, med.conc);
    if (!r) return med.unit === 'mL' ? 5 : 1;
    // 범위 안의 가운데쯤, 0.5 단위로 내림 — 범위 아래로는 내려가지 않게
    const mid = Math.floor(((r.amount[0] + r.amount[1]) / 2) * 2) / 2;
    return Math.max(r.amount[0], Math.min(mid, r.amount[1]));
  };
  const previous = () => {
    const prev = store.entriesOf(child.id).find((e) => e.type === 'med' && e.medId === med.id && e.id !== entry?.id);
    return prev ? Number(prev.amount) : null;
  };
  if (amount === null) amount = previous() ?? recommend();

  const render = (fromTyping = false) => {
    $$('[data-med]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.med === med.id)));
    if (!fromTyping) $('[data-v]', el).value = fmtAmount(amount);
    $('[data-unit]', el).textContent = med.unit;
    const mg = Math.round(amount * med.conc);
    $('[data-mg]', el).textContent = `${INGREDIENTS[med.ingredient].name} ${mg}mg (${med.unit === 'mL' ? `${med.conc}mg/mL` : `1개 ${med.conc}mg`})`;
    const r = doseRange(med.ingredient, child.weight, med.conc);
    $('[data-range]', el).innerHTML = r && r.unitTooBig
      ? `이 약은 체중 ${esc(child.weight)}kg 아이에게 한 ${esc(med.unit)}가 너무 커요. 시럽이나 함량이 낮은 약을 쓰고, 의사 · 약사와 상의하세요.`
      : r
      ? `체중 ${esc(child.weight)}kg 권장 <b class="num">${fmtAmount(r.amount[0])}~${fmtAmount(r.amount[1])}${esc(med.unit)}</b>
         <span class="faint">(${r.mg[0]}~${r.mg[1]}mg)</span>
         <button type="button" class="btn sm ghost" data-fill style="height:30px">권장량 넣기</button>`
      : '체중을 넣으면 권장량을 알려 드려요. <span class="faint">(설정 → 아이)</span>';
    const fill = $('[data-fill]', el);
    if (fill) fill.addEventListener('click', () => { amount = recommend(); render(); });

    const at = fromLocalInput($('[name=at]', el).value);
    const history = store.entriesOf(child.id).filter((e) => e.id !== entry?.id);
    const res = checkDose({ ingredient: med.ingredient, mg, at, weightKg: Number(child.weight) || 0, history, months });
    $('[data-check]', el).innerHTML = res.messages.length
      ? `<div class="check ${res.level}">${res.messages.map((m) => `<p>${esc(m.text)}</p>`).join('')}</div>`
      : '<div class="check ok">간격 · 양 모두 괜찮아요.</div>';
    const save = $('[data-save]', el);
    save.textContent = res.level === 'block' ? '그래도 기록' : '저장';
    save.className = `btn ${res.level === 'block' ? 'danger' : 'primary'}`;
  };

  $$('[data-med]', el).forEach((b) => b.addEventListener('click', () => {
    med = meds.find((m) => m.id === b.dataset.med);
    amount = previous() ?? recommend();
    render();
  }));
  $$('[data-step]', el).forEach((b) => b.addEventListener('click', () => {
    amount = Math.max(0, Math.round((amount + Number(b.dataset.step) * stepOf()) * 10) / 10);
    render();
  }));
  const typedAmount = $('[data-v]', el);
  typedAmount.addEventListener('focus', () => typedAmount.select());
  typedAmount.addEventListener('input', () => {
    const v = Number(typedAmount.value.replace(',', '.'));
    if (Number.isFinite(v) && v >= 0 && v <= 100) { amount = Math.round(v * 10) / 10; render(true); }
  });
  typedAmount.addEventListener('blur', () => render());
  typedAmount.addEventListener('keydown', (e) => { if (e.key === 'Enter') typedAmount.blur(); });
  wireWhen(el, () => render());
  wireDelete(el, entry);
  render();

  $('[data-save]', el).addEventListener('click', once(() => {
    if (!(amount > 0)) { toast('먹인 양을 넣어 주세요.'); return false; }
    const when = readWhen(el);
    if (!when) return false;
    const saved = {
      ...(entry || {}), childId: child.id, type: 'med', medId: med.id, name: med.name, ingredient: med.ingredient,
      conc: med.conc, unit: med.unit, amount, mg: Math.round(amount * med.conc),
      at: when.toISOString(), memo: $('[name=memo]', el).value.trim(),
    };
    store.saveEntry(saved);
    closeSheet();
    toast(`${med.name} ${fmtAmount(amount)}${med.unit} 기록했어요.`);
    if (onSaved) onSaved(saved);
  }));
}

function snapshotMed(entry) {
  return { id: entry.medId || 'gone', name: entry.name || '약', ingredient: entry.ingredient, conc: entry.conc, unit: entry.unit || 'mL' };
}

function medButton(m) {
  const ing = INGREDIENTS[m.ingredient];
  const color = ing.group === 'NSAID' ? 'var(--nsaid)' : 'var(--apap)';
  return `<button type="button" data-med="${esc(m.id)}" aria-pressed="false">
    <span class="sw" style="background:${color}"></span>
    <span><b>${esc(m.name)}</b><small>${esc(ing.name)} · ${m.unit === 'mL' ? `${esc(m.conc)}mg/mL` : `1개 ${esc(m.conc)}mg`}</small></span>
  </button>`;
}

// ── 증상 ───────────────────────────────────
export function symptomSheet(child, entry = null) {
  const on = new Set(entry?.tags || []);
  const el = sheet({
    title: entry ? '증상 고치기' : `${child.name} 증상`,
    body: `<div class="field"><span>있는 것 모두</span>
        <div class="chips" role="group" aria-label="증상">${store.SYMPTOMS.map((s) => `<button type="button"
          class="chip ${URGENT.has(s) ? 'urgent' : ''}" data-tag="${esc(s)}" aria-pressed="${on.has(s)}">${esc(s)}</button>`).join('')}</div>
        <div class="hint"><span style="color:var(--high);font-weight:700">빨간 테두리</span>는 바로 병원에 가야 할 수 있는 증상이에요.</div></div>
      <div class="field"><span>그 밖의 일</span>
        <div class="chips" role="group" aria-label="그 밖의 일">${store.EVENTS.map((s) => `<button type="button" class="chip"
          data-tag="${esc(s)}" aria-pressed="${on.has(s)}">${esc(s)}</button>`).join('')}</div>
        <div class="hint">예방접종 뒤 하루 이틀은 열이 날 수 있어요. 진료 때 함께 알려 주세요.</div></div>
      ${whenField(entry ? entry.at : new Date())}
      <label class="field"><span>메모</span><textarea class="input" name="memo" maxlength="500"
        placeholder="예: 물 200mL 마심, 기저귀 3번">${esc(entry?.memo || '')}</textarea></label>`,
    footer: `${deleteBtn(entry)}<button class="btn primary" data-save>저장</button>`,
  });
  $$('[data-tag]', el).forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.tag;
    if (on.has(t)) on.delete(t); else on.add(t);
    b.setAttribute('aria-pressed', String(on.has(t)));
  }));
  wireWhen(el);
  wireDelete(el, entry);
  $('[data-save]', el).addEventListener('click', once(() => {
    const memo = $('[name=memo]', el).value.trim();
    if (!on.size && !memo) { toast('증상을 고르거나 메모를 적어 주세요.'); return false; }
    const when = readWhen(el);
    if (!when) return false;
    store.saveEntry({ ...(entry || {}), childId: child.id, type: 'symptom', tags: [...on], memo, at: when.toISOString() });
    closeSheet();
    toast('증상을 기록했어요.');
  }));
}

export function editEntry(child, entry) {
  if (entry.type === 'temp') tempSheet(child, entry);
  else if (entry.type === 'med') medSheet(child, entry);
  else symptomSheet(child, entry);
}

// ── 아이 ───────────────────────────────────
export function childSheet(child = null, { first = false } = {}) {
  const el = sheet({
    title: child ? `${child.name} 정보` : '아이 더하기',
    body: `<label class="field"><span>이름 · 애칭</span><input class="input" name="name" maxlength="20" required
        value="${esc(child?.name || '')}" placeholder="예: 하율" ${child ? '' : 'autofocus'}></label>
      <label class="field"><span>생년월일</span><input class="input" type="date" name="birth" value="${esc(child?.birth || '')}"
        max="${toLocalInput(new Date()).slice(0, 10)}">
        <div class="hint">나이에 따라 먹이면 안 되는 약 · 바로 병원에 가야 할 때를 알려 드려요.</div></label>
      <label class="field"><span>몸무게 (kg)</span><input class="input num" type="number" name="weight" inputmode="decimal" step="0.1"
        min="2" max="80" value="${esc(child?.weight ?? '')}" placeholder="예: 12.5">
        <div class="hint">해열제 양은 몸무게로 정합니다. 아플 때마다 최근 몸무게로 고쳐 주세요.${child?.weightAt
          ? ` (마지막으로 고친 날 ${esc(child.weightAt.slice(0, 10))})` : ''}</div></label>
      <label class="list" style="box-shadow:none;border:1px solid var(--line)"><span class="item">
        <span class="grow"><b>열성 경련을 한 적 있어요</b><small>진료용 요약에 함께 적어요.</small></span>
        <input type="checkbox" class="switch" name="seizure" ${child?.seizure ? 'checked' : ''}></span></label>
      <label class="field"><span>알레르기 · 복용 중인 약 (선택)</span><input class="input" name="note" maxlength="100"
        value="${esc(child?.note || '')}" placeholder="예: 아목시실린 알레르기"></label>`,
    footer: `${child && !first ? `<button class="btn danger" data-del aria-label="이 아이 지우기">${icon('trash', 20)}</button>` : ''}
      <button class="btn primary" data-save>${child ? '저장' : '더하기'}</button>`,
  });
  $('[data-save]', el).addEventListener('click', () => {
    const name = $('[name=name]', el).value.trim();
    const birth = $('[name=birth]', el).value;
    const weightRaw = $('[name=weight]', el).value;
    const weight = weightRaw === '' ? null : Number(weightRaw);
    if (!name) { toast('이름을 넣어 주세요.'); $('[name=name]', el).focus(); return; }
    if (weight !== null && !(weight >= 2 && weight <= 80)) { toast('몸무게는 2~80kg 사이로 넣어 주세요.'); return; }
    const changedWeight = weight !== (child?.weight ?? null);
    store.saveChild({ ...(child || {}), name, birth, weight, seizure: $('[name=seizure]', el).checked,
      note: $('[name=note]', el).value.trim(),
      weightAt: changedWeight ? new Date().toISOString() : child?.weightAt || null });
    closeSheet();
    toast(child ? '저장했어요.' : `${name}을(를) 더했어요.`);
  });
  const del = $('[data-del]', el);
  if (del) {
    del.addEventListener('click', async () => {
      const n = store.entriesOf(child.id).length;
      const ok = await confirmSheet({ title: `${child.name} 지우기`, danger: true, ok: '지우기',
        text: `${child.name}의 기록 ${n}건도 함께 지워지고 되돌릴 수 없어요. 먼저 설정 → 백업 파일 저장을 해 두세요.` });
      if (ok) { store.removeChild(child.id); toast('지웠어요.'); }
    });
  }
}

// ── 내 약 ──────────────────────────────────
export function medPresetSheet(med = null) {
  const el = sheet({
    title: med ? '약 고치기' : '약 더하기',
    body: `<label class="field"><span>이름</span><input class="input" name="name" maxlength="30" value="${esc(med?.name || '')}"
        placeholder="예: 집에 있는 해열제 시럽" ${med ? '' : 'autofocus'}></label>
      <label class="field"><span>성분</span><select class="input" name="ingredient">
        ${Object.values(INGREDIENTS).map((i) => `<option value="${i.id}" ${med?.ingredient === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}
      </select></label>
      <div class="field"><span>단위</span><div class="chips" role="group" aria-label="단위">
        <button type="button" class="chip" data-unit="mL" aria-pressed="${(med?.unit || 'mL') === 'mL'}">시럽 (mL)</button>
        <button type="button" class="chip" data-unit="개" aria-pressed="${med?.unit === '개'}">좌약 · 알약 (개)</button></div></div>
      <label class="field"><span data-conc-label>함량</span><input class="input num" type="number" name="conc" inputmode="decimal" step="0.1"
        min="0.1" value="${esc(med?.conc ?? 32)}">
        <div class="hint">포장 · 설명서에 적힌 대로. 시럽은 「1mL 에 몇 mg」(예: 160mg/5mL → 32), 좌약 · 알약은 「1개에 몇 mg」.</div></label>`,
    footer: `${med ? `<button class="btn danger" data-del aria-label="이 약 지우기">${icon('trash', 20)}</button>` : ''}
      <button class="btn primary" data-save>저장</button>`,
  });
  let unit = med?.unit || 'mL';
  const label = () => { $('[data-conc-label]', el).textContent = unit === 'mL' ? '함량 (mg/mL)' : '함량 (1개에 mg)'; };
  $$('[data-unit]', el).forEach((b) => b.addEventListener('click', () => {
    unit = b.dataset.unit;
    $$('[data-unit]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    label();
  }));
  $('[name=ingredient]', el).addEventListener('change', (e) => {
    if (!med && unit === 'mL') $('[name=conc]', el).value = INGREDIENTS[e.target.value].defaultConc;
  });
  label();
  $('[data-save]', el).addEventListener('click', () => {
    const name = $('[name=name]', el).value.trim();
    const conc = Number($('[name=conc]', el).value);
    if (!name) { toast('이름을 넣어 주세요.'); return; }
    if (!(conc > 0 && conc <= 1000)) { toast('함량을 확인해 주세요.'); return; }
    store.saveMed({ ...(med || {}), name, ingredient: $('[name=ingredient]', el).value, conc, unit });
    closeSheet();
    toast('저장했어요.');
  });
  const del = $('[data-del]', el);
  if (del) del.addEventListener('click', () => { store.removeMed(med.id); closeSheet(); toast('지웠어요. 지난 기록은 그대로 있어요.'); });
}

export { ageNotice };
