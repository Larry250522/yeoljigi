// 열지기 — 화면 넷(홈 · 기록 · 용량 · 설정)과 처음 쓰는 사람 맞이.

import {
  GROUPS, INGREDIENTS, URINE_TAG, WATER_TAG, ageLabel, ageMonths, ageNotice, alertsFor, careTip,
  feverEpisode, feverLevel, groupLog, lastTagged, tempTrend,
} from './dose.js';
import { chartImage, tempChart } from './chart.js';
import * as notify from './notify.js';
import { summary } from './report.js';
import {
  childSheet, editEntry, medPresetSheet, medSheet, symptomSheet, tempSheet,
} from './sheets.js';
import * as share from './share.js';
import * as store from './store.js';
import {
  $, $$, ago, choiceSheet, clock, closeSheet, confirmSheet, dayLabel, elapsed, esc, fmt1, fmtAmount, icon, shareFile, shareText, sheet,
  toast,
} from './ui.js';
import * as env from './env.js';

const VIEWS = { home: '홈', log: '기록', calc: '약 안내', settings: '설정' };
const REPO_URL = 'https://github.com/yeoljigi/yeoljigi.github.io';
const SPONSOR_URL = 'https://github.com/sponsors/larrykim-dev';
// 식약처 「의료기기와 개인용 건강관리(웰니스)제품 판단기준」 Ⅴ.3 이 권하는 문구 그대로
const NOT_DEVICE = '본 제품은 의료기기가 아니므로 질병 유무를 판단할 수 없으며, 질병 유무 판단을 위해서는 의사의 검진이 필요합니다.';
let view = 'home';
let range = 24;
const calcState = { medId: null };

const root = $('#app');

// ── 뼈대 ───────────────────────────────────
function shell(inner, title, actions = '') {
  return `<header class="top"><h1>${esc(title)}</h1><span class="spacer"></span>${actions}</header>
    <main class="main view-enter" id="main" tabindex="-1">${inner}</main>
    <div class="tabs"><nav aria-label="화면">
      ${tab('home', 'home')}${tab('log', 'list')}${tab('calc', 'pill')}${tab('settings', 'gear')}
    </nav></div>`;
}
const tab = (key, ic) => `<button type="button" data-view="${key}" ${view === key ? 'aria-current="page"' : ''}>${icon(ic)}<span>${VIEWS[key]}</span></button>`;

function kidsBar(active) {
  const kids = store.get().children;
  if (!kids.length) return '';
  return `<div class="kids" role="group" aria-label="아이 고르기">
    ${kids.map((c) => `<button type="button" class="kid" data-kid="${esc(c.id)}" aria-pressed="${c.id === active?.id}">
      <span class="dot" style="background:${esc(c.color)}">${esc(c.name.slice(0, 1))}</span>${esc(c.name)}</button>`).join('')}
    <button type="button" class="kid add" data-add-kid>${icon('plus', 18)} 아이</button></div>`;
}

function banners() {
  const out = [];
  if (env.inKakao()) {
    out.push(`<div class="banner warn">${icon('external')}<div style="flex:1"><b>카카오톡 안에서 열었어요</b>
      기록이 사라지지 않게 기본 브라우저로 열어 홈 화면에 추가하세요.</div>
      <button class="btn sm primary" data-open-external>열기</button></div>`);
  } else if (!store.isPersistent()) {
    out.push(`<div class="banner warn">${icon('alert')}<div><b>기록을 저장하지 못하고 있어요</b>
      사생활 보호(시크릿) 창이거나 저장 공간이 꽉 찼어요. 창을 닫으면 기록이 사라집니다.</div></div>`);
  } else if (env.canInstall()) {
    out.push(`<div class="banner">${icon('download')}<div style="flex:1"><b>홈 화면에 추가</b>앱처럼 바로 열고, 기록도 오래 남아요.</div>
      <button class="btn sm primary" data-install>추가</button></div>`);
  } else if (env.iosNotInstalled()) {
    out.push(`<div class="banner">${icon('share')}<div><b>홈 화면에 추가하세요</b>
      Safari 아래 공유 버튼 → 「홈 화면에 추가」. 그래야 기록이 오래 남고 알림도 받을 수 있어요.</div></div>`);
  }
  return out.join('');
}

// ── 홈 ─────────────────────────────────────
function homeView() {
  const child = store.activeChild();
  if (!child) return welcome();
  const history = store.entriesOf(child.id);
  const now = new Date();
  const lastTemp = history.find((e) => e.type === 'temp');
  const alerts = alertsFor(child, history, now);
  const ep = feverEpisode(history, now);
  const months = ageMonths(child.birth, now);

  const alertHtml = alerts.map((a) => `<div class="alert ${a.level}" role="alert">${icon('alert')}
      <div><strong>${esc(a.title)}</strong>${esc(a.body)}
      ${a.level === 'urgent' || a.call ? `<br><a class="call" href="tel:119">${icon('phone', 16)}&nbsp;119 전화</a>` : ''}</div></div>`).join('');

  let nowCard;
  if (lastTemp) {
    const lv = feverLevel(lastTemp.temp);
    const trend = tempTrend(history, now);
    // 해열제를 먹인 뒤 떨어지는지 · 오르는지 — 앞 체온과 견준 값, 그리고 24시간 최고(마지막 것과 다를 때)
    const change = trend && trend.prev ? `${ago(trend.prev.at, now)} ${fmt1(trend.prev.temp)}℃보다 ${
      Math.abs(trend.diff) < 0.05 ? '그대로' : `${trend.diff > 0 ? '▲' : '▼'} ${fmt1(Math.abs(trend.diff))}℃`}` : '';
    const peak = trend && trend.max && trend.max !== lastTemp ? `24시간 최고 ${fmt1(trend.max.temp)}℃` : '';
    nowCard = `<div class="now">
        <div class="temp num tone-${lv.tone}">${fmt1(lastTemp.temp)}<small>℃</small></div>
        <div class="meta"><span class="badge bg-${lv.tone}">${esc(lv.label)}</span>
          <div class="muted small" style="margin-top:6px">${esc(ago(lastTemp.at, now))} · ${esc(clock(lastTemp.at))}${lastTemp.site ? ` · ${esc(lastTemp.site)}` : ''}</div>
          ${lastTemp.wellbeing ? `<div class="small" style="margin-top:2px">${esc(store.wellbeingLabel(lastTemp.wellbeing))}</div>` : ''}
        </div></div>
      ${change || peak ? `<p class="small" style="margin:10px 0 0;color:var(--text-2)">${esc(change)}${change && peak
        ? '<span class="faint"> · </span>' : ''}${peak ? `<span class="faint">${esc(peak)}</span>` : ''}</p>` : ''}
      ${ep ? `<p class="small muted" style="margin:12px 0 0">이번 열은 ${esc(dayLabel(ep.start, now).replace(/^.* · /, ''))} ${esc(clock(ep.start))}부터 —
        <b>${Math.max(1, Math.round(ep.hours))}시간째</b></p>` : ''}
      <p class="tip">${esc(careTip(lastTemp.temp))}</p>
      <div class="helplinks"><button class="link" data-help-er>병원에 가야 할 때 ${icon('chev', 14)}</button>
        <button class="link" data-help-fever>열, 겁내지 않아도 돼요 ${icon('chev', 14)}</button></div>`;
  } else {
    nowCard = `<div class="empty-now">${thermArt()}<div><b>아직 체온 기록이 없어요</b>
      <div class="muted small">아래 「체온」을 눌러 처음 잰 체온을 남겨 주세요.</div></div></div>`;
  }

  // 계열마다 마지막 기록과 지난 시간 — 설명서 간격 · 하루 횟수를 옆에 적고, 먹여도 되는지는 판정하지 않는다
  const doseCards = Object.values(GROUPS).map((g) => {
    const l = groupLog(g.key, history, now);
    const color = g.key === 'NSAID' ? 'var(--nsaid)' : 'var(--apap)';
    const state = l.last ? `${elapsed(l.last.at, now)} 전` : '기록 없음';
    const what = l.last ? `마지막 ${clock(l.last.at)} · ${l.last.name || INGREDIENTS[l.last.ingredient].name} ${fmtAmount(l.last.amount)}${
      l.last.unit || 'mL'}` : '먹인 약을 기록하면 여기 보여요';
    return `<div class="dose" style="--c:${color}"><div class="name">${esc(g.name)}</div>
      <div class="state num">${esc(state)}</div>
      <div class="sub">${esc(what)}</div>
      ${l.last ? `<div class="sub">24시간 ${l.countInDay}번 기록</div>` : ''}
      <div class="sub label">간격 안내 ${l.intervalH}시간 이상 · 하루 ${l.maxPerDay}번까지</div></div>`;
  }).join('');

  const notice = months !== null && months < 3
    ? `<p class="small" style="margin:10px 0 0;color:var(--high)">${esc(ageNotice('acetaminophen', months))}</p>` : '';

  const pee = lastTagged(history, URINE_TAG, now);
  const drink = lastTagged(history, WATER_TAG, now);
  const recent = history.slice(0, 5);
  const inner = `${banners()}${kidsBar(child)}${alertHtml}
    <section class="card" aria-label="지금 체온"><h2>${esc(child.name)} 지금<span class="spacer"></span>
      <span class="faint small">${esc(ageLabel(months))}${child.weight ? ` · ${esc(child.weight)}kg` : ''}</span></h2>${nowCard}</section>
    <div class="quick">
      <button type="button" data-new="temp"><span class="ico bg-fever">${icon('therm')}</span>체온</button>
      <button type="button" data-new="med"><span class="ico" style="background:var(--brand-soft);color:var(--brand)">${icon('syrup')}</span>해열제</button>
      <button type="button" data-new="symptom"><span class="ico bg-info">${icon('note')}</span>증상</button>
      <button type="button" data-pee><span class="ico bg-mild">${icon('drop')}</span>소변${pee
        ? `<small class="faint">${esc(ago(pee.at, now))}</small>` : ''}</button>
      <button type="button" data-water><span class="ico bg-ok">${icon('cup')}</span>물${drink
        ? `<small class="faint">${esc(ago(drink.at, now))}</small>` : ''}</button>
    </div>
    <section class="card" aria-label="해열제 기록"><h2>해열제 기록<span class="spacer"></span>
      <button class="link" data-help-dose>간격 안내</button></h2>
      <div class="doses">${doseCards}</div>${notice}
      <p class="small muted" style="margin:10px 0 0">다음 약은 포장 설명서의 간격 · 양을 확인하고 먹여 주세요.</p></section>
    <section class="card" aria-label="최근 24시간 그래프"><h2>최근 24시간<span class="spacer"></span>
      <button class="link" data-go="log">전체 기록 ${icon('chev', 14)}</button></h2>${tempChart(history, { hours: 24, now })}</section>
    ${recent.length ? `<div class="section-title">최근 기록</div><div class="rows">${recent.map((e) => rowHtml(e, true)).join('')}</div>` : ''}
    <p class="small faint" style="text-align:center;margin:18px 8px 0">이 앱은 기록을 돕는 도구예요. 약은 포장 설명서와
      의사 · 약사의 지시를 먼저 따르세요.</p>`;
  return shell(inner, '열지기', `<button class="icon-btn" data-share aria-label="진료용 요약 보내기">${icon('share')}</button>`);
}

function welcome() {
  const inner = `${banners()}<div class="hello">${heroArt()}
      <h2>아이 열, 같이 지켜요</h2>
      <p>체온 · 해열제 · 증상을 한 번에 남기고<br>언제 무엇을 먹였는지 가족과 함께 봐요.</p>
      <button class="btn primary block" data-add-kid>아이 더하기</button>
      <p class="small faint" style="margin-top:14px">기록은 이 휴대폰에만 저장돼요. 가입하지 않아도 됩니다.</p>
    </div>`;
  return shell(inner, '열지기');
}

function rowHtml(e, withDay = false) {
  let ico;
  let what;
  let sub = '';
  if (e.type === 'temp') {
    const lv = feverLevel(e.temp);
    ico = `<span class="ico bg-${lv.tone}">${icon('therm')}</span>`;
    what = `<b class="num tone-${lv.tone}">${fmt1(e.temp)}℃</b> <span class="muted small">${esc(lv.label)}</span>`;
    sub = [e.site, store.wellbeingLabel(e.wellbeing), e.memo].filter(Boolean).join(' · ');
  } else if (e.type === 'med') {
    const ing = INGREDIENTS[e.ingredient];
    const nsaid = ing?.group === 'NSAID';
    ico = `<span class="ico" style="background:${nsaid ? 'var(--info-soft)' : 'var(--brand-soft)'};color:${nsaid ? 'var(--nsaid)' : 'var(--apap)'}">${icon('syrup')}</span>`;
    what = `<b>${esc(e.name || ing?.name || '해열제')}</b> <span class="num">${esc(fmtAmount(e.amount))}${esc(e.unit || 'mL')}</span>`;
    sub = [`${ing?.name || ''} ${e.mg}mg`, e.memo].filter(Boolean).join(' · ');
  } else {
    // 홈에서 한 번 눌러 남긴 소변 · 물은 그 단추의 그림으로
    const tags = e.tags || [];
    const one = tags.length === 1 && tags[0] === URINE_TAG ? ['mild', 'drop'] : tags.length === 1 && tags[0] === WATER_TAG ? ['ok', 'cup'] : null;
    ico = one ? `<span class="ico bg-${one[0]}">${icon(one[1])}</span>` : `<span class="ico bg-info">${icon('note')}</span>`;
    what = `<b>${esc((e.tags || []).join(', ') || '메모')}</b>`;
    sub = e.memo || '';
  }
  const when = withDay && dayLabel(e.at).startsWith('오늘') ? clock(e.at)
    : withDay ? `${new Date(e.at).getMonth() + 1}/${new Date(e.at).getDate()} ${clock(e.at).replace(/^(오전|오후) /, '')}` : clock(e.at);
  return `<button type="button" class="row" data-entry="${esc(e.id)}"><span class="when num">${esc(when)}</span>${ico}
    <span class="what">${what}${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</span><span class="chev">${icon('chev', 18)}</span></button>`;
}

// ── 기록 ───────────────────────────────────
function logView() {
  const child = store.activeChild();
  if (!child) return welcome();
  const history = store.entriesOf(child.id);
  const groups = [];
  for (const e of history) {
    const label = dayLabel(e.at);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  const inner = `${kidsBar(child)}
    <section class="card"><h2>체온 그래프<span class="spacer"></span>
      <span class="seg" role="group" aria-label="기간">${[24, 72, 168].map((h) => `<button type="button" data-range="${h}"
        aria-pressed="${range === h}">${h === 24 ? '24시간' : h === 72 ? '3일' : '7일'}</button>`).join('')}</span></h2>
      ${tempChart(history, { hours: range, now: new Date() })}</section>
    ${groups.length ? groups.map((g) => `<div class="day">${esc(g.label)}</div>
      <div class="rows">${g.items.map((e) => rowHtml(e)).join('')}</div>`).join('')
    : `<div class="card" style="text-align:center"><p class="muted" style="margin:6px 0 14px">아직 기록이 없어요.</p>
        <button class="btn primary" data-new="temp">체온 기록하기</button></div>`}`;
  return shell(inner, `${child.name} 기록`, `<button class="icon-btn" data-share aria-label="진료용 요약 보내기">${icon('share')}</button>`);
}

// ── 약 안내(포장 설명서 내용) ─────────────────
// 설명서의 용법을 옮겨 보여 줄 뿐, 아이 체중 · 나이로 양을 셈하지 않는다(dose.js 머리말).
const yearsLabel = (r) => `${r.fromM / 12}~${r.toM / 12 - 1}세`;

function labelOutput(med, months) {
  if (!med) return '<p class="muted" style="text-align:center;margin:8px 0">설정 → 내 약에서 약을 더해 주세요.</p>';
  const ing = INGREDIENTS[med.ingredient];
  const unitText = med.unit === 'mL' ? `1mL에 ${med.conc}mg${med.conc * 5 === Math.round(med.conc * 5) ? ` (5mL에 ${med.conc * 5}mg)` : ''}`
    : `1개에 ${med.conc}mg`;
  if (med.combo) {
    return `<div class="check info">${esc(med.name)}은(는) 종합감기약이에요. 양은 <b>포장의 나이별 표</b>대로 먹이세요.
      해열제로 기록해 두면 든 ${esc(ing.name)}을 홈의 해열제 기록에 함께 보여요.</div>
      <dl class="kv"><dt>함량</dt><dd>${esc(ing.name)} ${esc(unitText)}</dd></dl>`;
  }
  const notice = ageNotice(med.ingredient, months);
  // 나이별 표는 mg 그대로, 이 약의 함량으로 바꾼 mL 을 곁에(제품 함량만 쓰는 단위 바꿈)
  const mL = (mg) => fmtAmount(Math.round((mg / med.conc) * 10) / 10);
  const inUnit = (r) => (med.unit === 'mL' ? `<br><span class="faint">이 약 ${mL(r.singleMin)}~${mL(r.single)}mL</span>` : '');
  const table = ing.ageTable ? `<table class="label-table"><thead><tr><th>나이</th><th>1회</th><th>하루 최대</th></tr></thead><tbody>
      ${ing.ageTable.map((r) => `<tr><td>${yearsLabel(r)}</td><td class="num">${r.singleMin}~${r.single}mg${inUnit(r)}</td>
        <td class="num">${r.day}mg</td></tr>`).join('')}</tbody></table>
      <p class="small muted" style="margin:6px 0 0">표에 없는 나이(돌 전 등)는 의사 · 약사와 상의하세요.</p>` : '';
  return `${notice ? `<div class="check warn">${esc(notice)}</div>` : ''}
    <dl class="kv"><dt>함량</dt><dd>${esc(ing.name)} ${esc(unitText)}</dd>
      <dt>1회</dt><dd>${esc(ing.label.single)}</dd>
      <dt>간격</dt><dd>${esc(ing.label.interval)}</dd>
      <dt>하루</dt><dd>${esc(ing.label.day)}${med.maxPerDay && med.maxPerDay < ing.maxPerDay
        ? ` · 이 약은 하루 ${med.maxPerDay}번까지(내 약 설정)` : ''}</dd>
      <dt>먹이는 나이</dt><dd>보통 생후 ${ing.minAgeMonths}개월부터</dd></dl>${table}`;
}

function calcView() {
  const child = store.activeChild();
  const meds = store.get().meds;
  const med = meds.find((m) => m.id === calcState.medId) || meds[0];
  const out = labelOutput(med, child ? ageMonths(child.birth) : null);
  const inner = `<section class="card"><h2>포장 설명서 내용</h2>
      <div class="field"><span>약</span><div class="medpick" role="group" aria-label="약">
        ${meds.map((m) => {
          const ing = INGREDIENTS[m.ingredient];
          return `<button type="button" data-calc-med="${esc(m.id)}" aria-pressed="${m.id === med?.id}">
          <span class="sw" style="background:${ing.group === 'NSAID' ? 'var(--nsaid)' : 'var(--apap)'}"></span>
          <span><b>${esc(m.name)}</b><small>${esc(ing.name)} · ${m.unit === 'mL' ? `${esc(m.conc)}mg/mL` : `1개 ${esc(m.conc)}mg`}</small></span></button>`;
        }).join('')}</div></div>
      <div aria-live="polite">${out}</div>
      <p class="small muted" style="margin:12px 0 0">국내 허가 사항의 일반적인 내용이에요. 아이에게 먹일 양은 <b>손에 든 약의 포장 설명서</b>
        (나이 · 체중별 표)와 의사 · 약사의 지시를 따르세요. 이 앱은 양을 계산하지 않아요.</p></section>
    <section class="card prose" aria-label="주의"><h2>꼭 확인하세요</h2>
      <ul><li><b>포장의 함량</b>이 위 약의 함량과 같은지 보세요. 같은 성분도 제품마다 다를 수 있어요(설정 → 내 약에서 고침).</li>
        <li><b>이름이 같아도 성분이 다른 약</b>이 있어요(예: 챔프시럽은 아세트아미노펜, 챔프이부펜시럽은 이부프로펜). 포장의 <b>성분명</b>을 보세요.</li>
        <li><b>종합감기약</b>(챔프콜드펜 · 콜대원키즈콜드에스 등)에도 아세트아미노펜이 들어 있어요. 같이 먹였다면 설정 → 내 약에서
          그 약을 골라 더하고 해열제로 기록하세요 — 홈의 해열제 기록에 함께 보여요.</li>
        <li>현탁액(시럽)은 먹이기 전에 잘 흔드세요.</li>
        <li>시럽은 계량컵보다 <b>눈금 있는 먹이는 주사기</b>로 재세요 — 잘못 재는 일이 훨씬 적어요.</li>
        <li>두 계열을 한꺼번에 먹이지 마세요. 번갈아 먹이기는 아이가 계속 힘들어할 때만, 의사 · 약사와 상의해서.</li>
        <li>먹인 약은 꼭 「해열제」로 기록해 두세요 — 다른 보호자도 언제 무엇을 먹였는지 알 수 있어요.</li></ul>
      <p class="faint small">${esc(NOT_DEVICE)}</p></section>`;
  return shell(inner, '약 안내');
}

// ── 설정 ───────────────────────────────────
function settingsView() {
  const s = store.get();
  const perm = notify.permission();
  const inner = `<div class="section-title">아이</div><div class="list">
      ${s.children.map((c) => `<button type="button" class="item" data-edit-kid="${esc(c.id)}">
        <span class="kid" style="border:0;padding:0;height:auto;background:none"><span class="dot" style="background:${esc(c.color)}">${esc(c.name.slice(0, 1))}</span></span>
        <span class="grow"><b>${esc(c.name)}</b><small>${esc([ageLabel(ageMonths(c.birth)), c.weight ? `${c.weight}kg` : '몸무게 없음'].filter(Boolean).join(' · '))}</small></span>
        ${icon('chev', 18)}</button>`).join('')}
      <button type="button" class="item" data-add-kid>${icon('plus', 20)}<span class="grow">아이 더하기</span></button></div>

    <div class="section-title">내 약</div><div class="list">
      ${s.meds.map((m) => `<button type="button" class="item" data-edit-med="${esc(m.id)}">
        <span class="grow"><b>${esc(m.name)}</b><small>${esc(INGREDIENTS[m.ingredient].name)} · ${m.unit === 'mL' ? `${esc(m.conc)}mg/mL` : `1개 ${esc(m.conc)}mg`}</small></span>
        ${icon('chev', 18)}</button>`).join('')}
      <button type="button" class="item" data-add-med>${icon('plus', 20)}<span class="grow">약 더하기</span></button></div>

    <div class="section-title">알림</div><div class="list">
      <label class="item"><span class="grow"><b>해열제 1시간 뒤 체온 다시 재기</b>
        <small>${perm === 'unsupported' ? '이 브라우저는 알림을 지원하지 않아요. 홈 화면에 추가하면 될 수 있어요.'
          : perm === 'denied' ? '알림이 막혀 있어요. 브라우저 · 휴대폰 설정에서 허용해 주세요.'
          : '앱이 열려 있거나 뒤에 남아 있을 때 울려요. 완전히 닫으면 울리지 않아요.'}</small></span>
        <input type="checkbox" class="switch" data-notify ${s.settings.notify && perm === 'granted' ? 'checked' : ''}
          ${perm === 'unsupported' || perm === 'denied' ? 'disabled' : ''} aria-label="알림 켜기"></label></div>

    <div class="section-title">화면</div><div class="list">
      <div class="item"><span class="grow"><b>테마</b></span><span class="seg" role="group" aria-label="테마">
        ${[['system', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([k, l]) => `<button type="button" data-theme-set="${k}"
          aria-pressed="${s.settings.theme === k}">${l}</button>`).join('')}</span></div>
      <div class="item"><span class="grow"><b>글자 크기</b></span><span class="seg" role="group" aria-label="글자 크기">
        ${Object.entries(store.TEXT_SIZES).map(([k, l]) => `<button type="button" data-text-set="${k}"
          aria-pressed="${s.settings.text === k}">${l}</button>`).join('')}</span></div></div>

    <div class="section-title">가족과 나누기</div><div class="list">
      <button type="button" class="item" data-send-link>${icon('share', 20)}<span class="grow"><b>기록 링크 보내기</b>
        <small>가족 휴대폰의 열지기에 최근 기록을 합쳐요</small></span>${icon('chev', 18)}</button>
      <button type="button" class="item" data-paste-link>${icon('copy', 20)}<span class="grow"><b>받은 기록 링크 붙여 넣기</b>
        <small>홈 화면 앱(아이폰)에서 링크가 브라우저로 열릴 때</small></span>${icon('chev', 18)}</button></div>

    <div class="section-title">기록 보관</div><div class="list">
      <button type="button" class="item" data-export>${icon('download', 20)}<span class="grow"><b>백업 파일 저장</b>
        <small>휴대폰을 바꾸거나 다른 브라우저로 옮길 때</small></span></button>
      <label class="item" style="cursor:pointer">${icon('upload', 20)}<span class="grow"><b>백업 파일 불러오기</b>
        <small>지금 기록에 합치거나, 파일의 것으로 바꿔요</small></span>
        <input type="file" accept="application/json,.json" data-import class="sr"></label>
      <button type="button" class="item" data-reset style="color:var(--high)">${icon('trash', 20)}<span class="grow"><b>모든 기록 지우기</b></span></button></div>

    <div class="section-title">도움말</div><div class="list">
      <button type="button" class="item" data-help-er>${icon('alert', 20)}<span class="grow"><b>바로 병원에 가야 할 때</b></span>${icon('chev', 18)}</button>
      <button type="button" class="item" data-help-dose>${icon('info', 20)}<span class="grow"><b>해열제 간격 · 교차 복용</b></span>${icon('chev', 18)}</button>
      <button type="button" class="item" data-help-fever>${icon('therm', 20)}<span class="grow"><b>열, 겁내지 않아도 돼요</b></span>${icon('chev', 18)}</button>
      <button type="button" class="item" data-help-about>${icon('info', 20)}<span class="grow"><b>이 앱에 대해</b>
        <small>판 ${esc(env.VERSION)}</small></span>${icon('chev', 18)}</button>
      <a class="item" href="${SPONSOR_URL}" target="_blank" rel="noopener">${icon('heart', 20)}<span class="grow"><b>만든 사람 응원하기</b>
        <small>무료 · 광고 없이 이어 가게 — GitHub Sponsors</small></span>${icon('external', 18)}</a></div>`;
  return shell(inner, '설정');
}

// ── 도움말 창 ───────────────────────────────
function helpEr() {
  sheet({ title: '바로 병원에 가야 할 때', body: `<div class="prose">
    <h3>바로 응급실 · 119</h3><ul>
      <li>생후 3개월 미만 아기가 38℃ 이상</li><li>경련(열성 경련 포함) · 의식이 흐리거나 깨워도 잘 안 깸</li>
      <li>숨쉬기 힘들어함 · 숨 쉴 때 끙끙거림 · 입술이 파래짐</li>
      <li>피부가 창백하거나 얼룩덜룩함 · 약하게 또는 날카롭게 그치지 않고 울음</li>
      <li>누르면 없어지지 않는 붉은 · 보라 반점</li><li>숫구멍(대천문)이 튀어나옴 · 목이 뻣뻣함 · 심한 두통 · 계속 토함</li>
      <li>소변이 크게 줄거나(6~8시간 없음) 입이 바짝 마름 · 울어도 눈물이 없음</li></ul>
    <h3>진료를 받아 보세요</h3><ul>
      <li>두 돌 전 아이는 열이 24시간, 그 뒤로는 3일(72시간) 넘게 이어짐 — <b>5일</b>이 넘으면 꼭</li>
      <li>생후 3~6개월 아기가 39℃ 이상 · 생후 3~6개월 아기의 열</li>
      <li>40℃ 이상이거나 해열제를 먹여도 잘 안 떨어짐 · 노는 것이 눈에 띄게 줄어듦</li>
      <li>열이 내렸다가 다시 오름 · 귀 아픔 · 소변 볼 때 아파함</li></ul>
    <h3>알아 두세요</h3><ul>
      <li>해열제는 열성 경련을 미리 막지 못해요. 경련이 5분 넘게 이어지거나 처음이면 119.</li>
      <li>미지근한 물로 몸을 닦는 것은 권하지 않아요. 너무 껴입히지도 벗기지도 마세요.</li>
      <li>생후 4주 미만은 겨드랑이에 전자체온계, 그 뒤로는 귀나 겨드랑이로 재세요. 이마 띠 체온계는 믿기 어려워요.</li></ul>
    <p>밤 · 휴일에 아이가 아플 때는 가까운 <b>달빛어린이병원</b>(야간 · 휴일 소아 진료)을
      <a href="https://www.e-gen.or.kr/moonlight/main.do" target="_blank" rel="noopener">응급의료포털에서 찾아보세요</a>.
      응급 · 의료 상담은 <a href="tel:119">119</a>, 문 연 병원 · 약국은 <a href="tel:129">129</a>(보건복지상담센터).
      가벼운 증상이면 응급실보다 동네 병 · 의원이나 달빛어린이병원이 먼저예요.</p>
    <p class="faint small">일반적인 안내입니다(영국 NICE 「5세 미만 발열」 지침 · 미국소아과학회 안내를 바탕으로).
      아이 상태가 걱정되면 이 목록과 상관없이 진료를 받으세요.</p></div>` });
}

function helpDose() {
  sheet({ title: '해열제 간격 · 교차 복용', body: `<div class="prose">
    <h3>계열이 둘이에요</h3><ul>
      <li><b style="color:var(--apap)">아세트아미노펜 계열</b> — 4~6시간 간격, 24시간에 5번까지</li>
      <li><b style="color:var(--nsaid)">이부프로펜 계열</b>(이부프로펜 · 덱시부프로펜) — 6~8시간 간격, 24시간에 4번까지.
        이부프로펜과 덱시부프로펜은 같은 계열이라 번갈아 먹이면 안 돼요.</li></ul>
    <h3>해열제는 언제</h3>
    <p>열을 몇 도까지 내리려는 것이 아니라 <b>아이가 힘들어할 때</b> 편하게 해 주려고 먹여요. 잘 자는 아이를 해열제 때문에 깨우지
      않아도 돼요. 두 계열을 <b>한꺼번에 먹이지 마세요</b>.</p>
    <h3>교차 복용(번갈아 먹이기)</h3>
    <p>한 계열을 먹였는데도 아이가 <b>계속 힘들어하고</b>, 같은 약을 다시 먹일 때가 아직 안 됐을 때만 생각해 보는 방법이에요.
      앞 약과 <b>2시간 이상</b> 띄우고, 각 계열의 간격 · 하루 횟수는 따로 지켜야 해요. 헷갈려서 더 먹이기 쉬우니 꼭 기록하고,
      의사 · 약사와 상의해 정하세요.</p>
    <h3>이부프로펜 계열 전에</h3>
    <p>수두일 때, 또는 구토 · 설사로 물을 잘 못 먹고 소변이 줄었을 때는 이부프로펜 계열 전에 의사 · 약사와 상의하세요.</p>
    <h3>재는 도구</h3>
    <p>시럽은 계량컵보다 <b>눈금 있는 먹이는 주사기(스포이트)</b>로 재야 덜 틀려요. 「작은술」이 아니라 mL 로 재세요.</p>
    <h3>이 앱이 보여 주는 것</h3>
    <p>홈의 「해열제 기록」은 계열마다 마지막으로 먹인 때, 그 뒤로 지난 시간, 24시간 횟수를 보여 줘요. 먹여도 되는지 · 얼마나
      먹일지는 앱이 정하지 않아요 — 설명서의 간격 · 양과 견주어 보고, 헷갈리면 의사 · 약사에게 물어보세요. 기록하지 않은 약은
      보이지 않아요.</p>
    <p class="faint small">숫자는 국내 어린이 해열제 포장 설명서의 일반 범위예요. 안내는 NICE 지침 · 미국소아과학회 보고서(2011) ·
      코크란 검토(2013) · 식약처 안내(2025)를 바탕으로 했어요. 좌약은 하루 횟수가 시럽보다 적은 경우가 많아 설정 → 내 약에
      「하루 최대 횟수」를 넣어 두세요. 제품 설명서와 의사 · 약사의 지시가 먼저입니다.</p></div>` });
}

// 열 공포를 줄이는 짧은 글 — 부모가 가장 많이 찾는 것은 경고 신호와 「열이란」(Gwiasda 2026 Digit Health),
// 짧은 안내만으로 열에 대한 생각이 바뀐다(Gwiasda 2022 GMS J Med Educ)
function helpFever() {
  sheet({ title: '열, 겁내지 않아도 돼요', body: `<div class="prose">
    <h3>열은 몸이 싸우는 반응이에요</h3>
    <p>열은 병균과 싸우려고 몸이 스스로 올리는 것이에요. 열 자체로 뇌가 상하지는 않아요(42℃ 아래).</p>
    <h3>목표는 정상 체온이 아니라 편안함</h3>
    <p>해열제는 아이가 힘들어할 때 편하게 해 주려고 먹여요. 먹여도 1~1.5℃ 정도 내려가는 것이 보통이고, 안 내린다고 바로 또 먹이지
      마세요. 잘 자는 아이를 해열제 때문에 깨우지 않아도 돼요.</p>
    <h3>해열제로 경련을 막지는 못해요</h3>
    <p>열성 경련은 무섭지만 대개 몇 분 안에 멎어요. 해열제를 미리 먹여도 막지 못한다고 알려져 있어요.
      5분 넘게 이어지거나 처음이면 119.</p>
    <h3>밤에 더 높게 나와요</h3>
    <p>열은 저녁 · 밤에 더 높고 아침에 낮게 나오는 일이 흔해요. 아침에 내렸다고 다 나은 것은 아닐 수 있어요.</p>
    <h3>숫자보다 아이를 보세요</h3>
    <p>잘 먹고 마시는지, 놀다가도 웃는지, 소변을 보는지가 체온 숫자보다 중요해요. 처지거나 잘 깨지 않으면 진료가 먼저예요.</p>
    <p class="faint small">NICE 「5세 미만 발열」(2019) · 미국소아과학회 안내 · 열 공포 체계적 검토(Clericetti 2019) ·
      FeverApp 연구(Beerenbrock 2026)를 바탕으로 한 일반 안내예요.</p></div>` });
}

function helpAbout() {
  sheet({ title: '열지기', body: `<div class="prose">
    <p>아이가 열이 날 때 체온 · 해열제 · 증상을 남기는 기록장이에요. 먹인 약과 시간을 가족과 나누고, 약의 포장 설명서 내용을
      함께 보여 줘요. 먹일 양이나 시각을 계산하지는 않아요.</p>
    <h3>기록은 어디에?</h3>
    <p>이 휴대폰의 브라우저에만 저장돼요. 어디로도 보내지 않아요. 그래서 브라우저 기록을 지우거나 휴대폰을 바꾸면 사라질 수 있어요 —
      가끔 설정 → <b>백업 파일 저장</b>을 해 두세요.</p>
    <h3>가족과 같이 보려면</h3>
    <p>설정 → <b>기록 링크 보내기</b>로 최근 3일 기록을 링크에 담아 카카오톡 등으로 보내요. 받은 사람이 열고 「합치기」를 누르면
      그 휴대폰 기록에 더해져요. 서로 보내면 두 휴대폰이 같아져요. 링크는 서버를 거치지 않지만 보낸 대화방에는 남아요 — 가족에게만
      보내세요.</p>
    <h3>의료 정보가 아니에요</h3>
    <p>이 앱은 진단이나 처방을 하지 않아요. 용량 · 간격은 포장 설명서의 일반적인 내용이며, 손에 든 약의 설명서와 의사 · 약사의
      지시가 먼저입니다.</p>
    <p>${esc(NOT_DEVICE)}</p>
    <h3>누가 만들었나요?</h3>
    <p>개인이 만든 무료 앱이에요. 광고 · 가입이 없고, 코드는 <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>에
      공개돼 있어요(MIT). 제약사 · 약국의 후원은 받지 않아요. 도움이 됐다면 <a href="${SPONSOR_URL}" target="_blank" rel="noopener">응원</a>해 주세요.</p>
    <p class="faint small">판 ${esc(env.VERSION)}</p></div>` });
}

// ── 진료용 요약 ─────────────────────────────
async function shareSummary() {
  const child = store.activeChild();
  if (!child) return;
  const text = summary(child, store.entriesOf(child.id));
  const el = sheet({
    title: '진료용 요약',
    body: `<p class="muted small" style="margin:0 0 10px">최근 72시간 기록이에요. 병원에서 보여 주거나 가족에게 보내세요.</p>
      <textarea class="input" readonly style="height:260px;font-size:calc(14px * var(--fs))" aria-label="요약">${esc(text)}</textarea>
      <button class="link" data-send-link style="margin-top:10px">${icon('share', 16)} 가족 휴대폰과 기록 합치기 — 기록 링크 보내기</button>`,
    footer: `<button class="btn" data-copy>${icon('copy', 20)} 복사</button>
      <button class="btn" data-png>${icon('image', 20)} 그래프</button>
      ${navigator.share ? `<button class="btn primary" data-send>${icon('share', 20)} 보내기</button>` : ''}`,
  });
  // 그래프 그림 — 의사에게 휴대폰 화면 대신 보여 주거나 가족에게 보낼 때
  $('[data-png]', el).addEventListener('click', async () => {
    try {
      const blob = await chartImage(store.entriesOf(child.id), { hours: 72, title: `${child.name} 체온 · 해열제` });
      const d = new Date();
      await shareFile(new File([blob], `열지기-${child.name}-${d.getMonth() + 1}월${d.getDate()}일.png`, { type: 'image/png' }));
    } catch (err) {
      console.error(err);
      toast('그림을 만들지 못했어요.');
    }
  });
  $('[data-copy]', el).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); toast('복사했어요.'); } catch {
      $('textarea', el).select(); toast('글을 길게 눌러 복사하세요.');
    }
  });
  const send = $('[data-send]', el);
  if (send) send.addEventListener('click', async () => { try { await navigator.share({ text }); } catch { /* 취소 */ } });
}

// ── 그림 ───────────────────────────────────
function heroArt() {
  return `<svg width="148" height="120" viewBox="0 0 148 120" aria-hidden="true">
    <circle cx="74" cy="62" r="54" fill="var(--brand-soft)"/>
    <path d="M44 86c0-17 13-30 30-30s30 13 30 30" fill="var(--surface)" stroke="var(--brand)" stroke-width="3"/>
    <circle cx="74" cy="44" r="18" fill="var(--surface)" stroke="var(--brand)" stroke-width="3"/>
    <path d="M67 46h.01M81 46h.01" stroke="var(--text)" stroke-width="4" stroke-linecap="round"/>
    <path d="M69 52c3 2 7 2 10 0" fill="none" stroke="var(--text)" stroke-width="2" stroke-linecap="round"/>
    <rect x="104" y="20" width="12" height="40" rx="6" fill="var(--surface)" stroke="var(--fever)" stroke-width="3"/>
    <circle cx="110" cy="64" r="9" fill="var(--fever)"/><rect x="108" y="36" width="4" height="26" rx="2" fill="var(--fever)"/>
    <path d="M26 30l4 4m0-4-4 4M122 92l3 3m0-3-3 3" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function thermArt() {
  return `<svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="var(--surface-2)"/>
    <rect x="23" y="10" width="10" height="26" rx="5" fill="none" stroke="var(--text-3)" stroke-width="2.5"/>
    <circle cx="28" cy="40" r="6.5" fill="var(--fever)"/><rect x="26.5" y="24" width="3" height="14" rx="1.5" fill="var(--fever)"/></svg>`;
}

// ── 그리기 · 이벤트 ─────────────────────────
function render() {
  let html;
  try {
    html = { home: homeView, log: logView, calc: calcView, settings: settingsView }[view]();
  } catch (err) {
    // 기록 하나가 깨져도 앱이 빈 화면으로 멈추지 않게 — 백업을 받고 다시 시작할 길을 둔다
    console.error(err);
    html = shell(`<div class="card"><h2>${icon('alert', 18)} 화면을 그리지 못했어요</h2>
      <p class="muted small" style="margin:0 0 14px">저장된 기록 가운데 읽을 수 없는 것이 있어요. 먼저 백업 파일을 저장해 두고,
        다른 화면으로 가 보거나 모든 기록을 지우고 다시 시작하세요.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-export>${icon('download', 18)} 백업 파일 저장</button>
        <button class="btn sm danger" data-reset>모든 기록 지우기</button></div></div>`, '열지기');
  }
  const y = window.scrollY;
  root.innerHTML = html;
  window.scrollTo(0, y);
  document.title = view === 'home' ? '열지기' : `${VIEWS[view]} · 열지기`;
}

function go(next) {
  view = next;
  render();
  window.scrollTo(0, 0);
  $('#main')?.focus({ preventScroll: true });
}

function applyTheme() {
  const { theme, text } = store.get().settings;
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  if (text === 'md') document.documentElement.removeAttribute('data-text');
  else document.documentElement.setAttribute('data-text', text);
}

function withChild(fn) {
  const child = store.activeChild();
  if (!child) { childSheet(null, { first: true }); return; }
  fn(child);
}

root.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, [data-entry]');
  if (!t) return;
  const d = t.dataset;
  if (d.view) go(d.view);
  else if (d.go) go(d.go);
  else if (d.kid) { store.setActive(d.kid); }
  else if ('addKid' in d) childSheet(null, { first: !store.get().children.length });
  else if ('editKid' in d) childSheet(d.editKid ? store.get().children.find((c) => c.id === d.editKid) : store.activeChild());
  else if ('pee' in d) {
    withChild((child) => {
      // 밤에 한 번 눌러 바로 — 잘못 눌렀으면 되돌리기
      const id = store.uid();
      store.saveEntry({ id, childId: child.id, type: 'symptom', tags: [URINE_TAG], memo: '', at: new Date().toISOString() });
      toast('소변 기록했어요.', { label: '되돌리기', run: () => store.removeEntry(id) });
    });
  } else if ('water' in d) {
    withChild((child) => {
      const id = store.uid();
      store.saveEntry({ id, childId: child.id, type: 'symptom', tags: [WATER_TAG], memo: '', at: new Date().toISOString() });
      toast('물 마신 것을 기록했어요.', { label: '되돌리기', run: () => store.removeEntry(id) });
    });
  } else if (d.new) {
    withChild((child) => {
      if (d.new === 'temp') tempSheet(child);
      else if (d.new === 'med') {
        if (!store.get().meds.length) { toast('설정 → 내 약에서 약을 먼저 더해 주세요.'); return; }
        medSheet(child);
      } else symptomSheet(child);
    });
  } else if (d.entry) {
    const child = store.activeChild();
    const entry = store.get().entries.find((e) => e.id === d.entry);
    if (child && entry) editEntry(child, entry);
  } else if (d.range) { range = Number(d.range); render(); }
  else if ('share' in d) shareSummary();
  else if ('helpDose' in d) helpDose();
  else if ('helpEr' in d) helpEr();
  else if ('helpAbout' in d) helpAbout();
  else if ('helpFever' in d) helpFever();
  else if (d.calcMed) { calcState.medId = d.calcMed; render(); }
  else if (d.editMed) medPresetSheet(store.get().meds.find((m) => m.id === d.editMed));
  else if ('addMed' in d) medPresetSheet();
  else if (d.themeSet) { store.setSetting('theme', d.themeSet); applyTheme(); }
  else if (d.textSet) { store.setSetting('text', d.textSet); applyTheme(); }
  else if ('sendLink' in d) sendLinkSheet();
  else if ('pasteLink' in d) pasteLinkSheet();
  else if ('export' in d) exportBackup();
  else if ('reset' in d) {
    const ok = await confirmSheet({ title: '모든 기록 지우기', danger: true, ok: '모두 지우기',
      text: '아이 · 기록 · 내 약이 모두 지워지고 되돌릴 수 없어요. 먼저 백업 파일을 저장해 두세요.' });
    if (ok) { store.resetAll(); toast('모두 지웠어요.'); go('home'); }
  } else if ('openExternal' in d) env.openExternal();
  else if ('install' in d) { await env.install(); render(); }
});

root.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.matches('[data-notify]')) {
    if (t.checked) {
      const p = await notify.ask();
      if (p !== 'granted') { t.checked = false; toast('알림이 허용되지 않았어요.'); store.setSetting('notify', false); return; }
      store.setSetting('notify', true);
      toast('알림을 켰어요.');
    } else store.setSetting('notify', false);
  } else if (t.matches('[data-import]')) {
    const file = t.files[0];
    if (!file) return;
    // 옛 주소에서 받은 백업을 새 주소에서 이미 쓰던 기록에 불러오는 일이 많다 — 합치기가 먼저
    const how = store.get().children.length ? await choiceSheet({ title: '백업 불러오기',
      text: `「${file.name}」의 기록을 어떻게 할까요? 합치면 지금 기록은 그대로 두고 없던 기록만 더해요. 바꾸면 지금 기록은 사라져요.`,
      choices: [{ key: 'replace', label: '바꾸기', kind: 'danger' }, { key: 'merge', label: '합치기', kind: 'primary' }] }) : 'replace';
    t.value = '';                           // 같은 파일을 다시 골라도 change 가 오게
    if (!how) return;
    try {
      const text = await file.text();
      if (how === 'merge') toast(mergedText(store.mergeJson(text)));
      else {
        const r = store.importJson(text);
        applyTheme();
        toast(`아이 ${r.children}명 · 기록 ${r.entries}건을 불러왔어요.`);
      }
    } catch {
      toast('열지기 백업 파일이 아니거나 깨졌어요.');
    }
  }
});

function mergedText(r) {
  const parts = [`기록 ${r.entries}건을 더했어요`];
  if (r.children) parts.push(`아이 ${r.children}명`);
  if (r.updated) parts.push(`고친 기록 ${r.updated}건`);
  if (r.removed) parts.push(`지운 기록 ${r.removed}건 뺌`);
  return r.entries || r.updated || r.removed || r.children ? `${parts.join(' · ')}.` : '새로 더할 기록이 없어요. 이미 같아요.';
}

// ── 가족과 나누기(기록 링크, js/share.js) ─────────
const appUrl = () => `${location.origin}${location.pathname}`;

function sendLinkSheet() {
  const child = store.activeChild();
  if (!child) { childSheet(null, { first: true }); return; }
  const el = sheet({ title: '기록 링크 보내기', body: `<div class="prose">
      <p><b>${esc(child.name)}</b>의 최근 3일 기록(체온 · 해열제 · 증상)을 링크에 담아요. 가족이 링크를 열고 「합치기」를 누르면
        그 휴대폰의 열지기에 더해져요 — 그쪽 기록은 지우지 않아요.</p>
      <ul><li>서로 한 번씩 보내면 두 휴대폰의 기록이 같아져요.</li>
        <li>링크는 서버를 거치지 않지만, 보낸 대화방에는 남아요. <b>가족에게만</b> 보내세요.</li>
        <li>약을 먹였다면 기록하고 바로 보내 주세요 — 다른 보호자가 또 먹이지 않게.</li></ul></div>`,
    footer: `<button class="btn primary" data-go-send>${icon('share', 20)} 링크 보내기</button>` });
  $('[data-go-send]', el).addEventListener('click', async () => {
    let link;
    let hours;
    // 메신저에 붙이기 좋은 길이로 — 기록이 많으면 기간을 줄인다
    for (hours of [72, 24, 12]) {
      link = await share.linkFor(store.sharePack(child.id, hours), appUrl());
      if (link.length <= share.MAX_LINK) break;
    }
    closeSheet();
    await shareText(`[${child.name}] 열지기 기록 ${hours === 72 ? '3일' : `${hours}시간`}치예요. 열고 「합치기」를 눌러 주세요.\n${link}`);
  });
}

function pasteLinkSheet() {
  const el = sheet({ title: '받은 기록 링크 붙여 넣기', body: `<p class="muted small" style="margin:0 0 10px">카카오톡 등에서 받은 글을
      통째로 복사해 붙여 넣으세요. 아이폰의 홈 화면 앱은 브라우저와 기록이 따로라, 링크를 누르면 브라우저 쪽에 합쳐져요.</p>
      <textarea class="input" name="link" style="height:140px" aria-label="받은 글" placeholder="https://yeoljigi.github.io/#share=…"></textarea>`,
    footer: `<button class="btn primary" data-go-paste>읽기</button>` });
  $('[data-go-paste]', el).addEventListener('click', () => {
    const m = /#share=([A-Za-z0-9_-]+)/.exec($('[name=link]', el).value);
    if (!m) { toast('기록 링크를 찾지 못했어요. 글을 통째로 붙여 넣어 주세요.'); return; }
    closeSheet(true);
    receiveShare(m[1]);
  });
}

/** 받은 기록 링크 — 무엇이 들었는지 보이고 합칠지 묻는다. */
async function receiveShare(code) {
  let raw;
  let data;
  try {
    raw = await share.decode(code);
    data = store.readBackup(raw);
  } catch {
    toast('기록 링크를 읽지 못했어요. 링크가 잘렸을 수 있어요.');
    return;
  }
  const kid = data.children[0];
  const n = (type) => data.entries.filter((e) => e.type === type).length;
  const sent = raw.sentAt ? `${dayLabel(raw.sentAt).replace(/ · .*/, '')} ${clock(raw.sentAt)}에 보낸 ` : '';
  const ios = env.iosNotInstalled() ? ' 홈 화면의 열지기에 합치려면 이 글을 닫고, 링크를 복사해 열지기 → 설정 → 「받은 기록 링크 붙여 넣기」로 넣으세요.' : '';
  const ok = await confirmSheet({ title: '가족이 보낸 기록', ok: '합치기',
    text: `${sent}${kid.name}의 기록이에요 — 체온 ${n('temp')} · 해열제 ${n('med')} · 증상 ${n('symptom')}건. 이 휴대폰 기록에 더해요. 지금 기록은 지우지 않아요.${ios}` });
  if (!ok) return;
  try {
    const r = store.mergeData(raw);
    if (r.kids[0]) store.setActive(r.kids[0]);
    toast(mergedText(r));
    go('home');
  } catch {
    toast('기록을 합치지 못했어요.');
  }
}

function exportBackup() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `열지기-백업-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('백업 파일을 저장했어요.');
}

// ── 시작 ───────────────────────────────────
store.load();
applyTheme();
store.subscribe(() => { render(); notify.reschedule(); });
env.init(render);
render();
notify.reschedule();
// 가족이 보낸 기록 링크로 열었으면 — 카카오톡 안 브라우저에서는 받지 않는다(기본 브라우저로 넘긴 뒤 거기서 받는다).
// 이미 열린 창에서 링크를 누르면 다시 읽지 않고 # 만 바뀐다 — hashchange 도 본다.
function checkShareLink() {
  const shared = share.fromHash(location.hash);
  if (!shared || env.inKakao()) return;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  receiveShare(shared);
}
checkShareLink();
window.addEventListener('hashchange', checkShareLink);
setInterval(() => { if (view === 'home' && !document.querySelector('.sheet')) render(); }, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); notify.reschedule(); } });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
try { navigator.storage?.persist?.(); } catch { /* 저장 공간 오래 두기 요청 — 안 돼도 된다 */ }
