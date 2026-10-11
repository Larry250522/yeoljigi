// 열지기 — 화면 넷(홈 · 기록 · 용량 · 설정)과 처음 쓰는 사람 맞이.

import {
  GROUPS, HOUR, INGREDIENTS, URINE_TAG, ageLabel, ageMonths, ageNotice, alertsFor, careTip, dailyLeft, dailyMaxMg, doseRange,
  feverEpisode, feverLevel, lastUrine, nextDose, tempTrend,
} from './dose.js';
import { chartImage, tempChart } from './chart.js';
import * as notify from './notify.js';
import { summary } from './report.js';
import {
  childSheet, editEntry, medPresetSheet, medSheet, symptomSheet, tempSheet,
} from './sheets.js';
import * as store from './store.js';
import {
  $, $$, ago, clock, confirmSheet, dayLabel, esc, fmt1, fmtAmount, icon, shareFile, sheet, toast, until,
} from './ui.js';
import * as env from './env.js';

const VIEWS = { home: '홈', log: '기록', calc: '용량', settings: '설정' };
let view = 'home';
let range = 24;
let calcState = { medId: null, weight: null };

const root = $('#app');

// ── 뼈대 ───────────────────────────────────
function shell(inner, title, actions = '') {
  return `<header class="top"><h1>${esc(title)}</h1><span class="spacer"></span>${actions}</header>
    <main class="main view-enter" id="main" tabindex="-1">${inner}</main>
    <div class="tabs"><nav aria-label="화면">
      ${tab('home', 'home')}${tab('log', 'list')}${tab('calc', 'calc')}${tab('settings', 'gear')}
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
      ${a.level === 'urgent' ? `<br><a class="call" href="tel:119">${icon('phone', 16)}&nbsp;119 전화</a>` : ''}</div></div>`).join('');

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
        </div></div>
      ${change || peak ? `<p class="small" style="margin:10px 0 0;color:var(--text-2)">${esc(change)}${change && peak
        ? '<span class="faint"> · </span>' : ''}${peak ? `<span class="faint">${esc(peak)}</span>` : ''}</p>` : ''}
      ${ep ? `<p class="small muted" style="margin:12px 0 0">이번 열은 ${esc(dayLabel(ep.start, now).replace(/^.* · /, ''))} ${esc(clock(ep.start))}부터 —
        <b>${Math.max(1, Math.round(ep.hours))}시간째</b></p>` : ''}
      <p class="tip">${esc(careTip(lastTemp.temp))}</p>`;
  } else {
    nowCard = `<div class="empty-now">${thermArt()}<div><b>아직 체온 기록이 없어요</b>
      <div class="muted small">아래 「체온」을 눌러 처음 잰 체온을 남겨 주세요.</div></div></div>`;
  }

  const doseCards = Object.values(GROUPS).map((g) => {
    const n = nextDose(g.key, history, now, Number(child.weight) || 0);
    const color = g.key === 'NSAID' ? 'var(--nsaid)' : 'var(--apap)';
    // 남은 양은 그 계열에서 마지막에 먹인 약(없으면 내 약 중 그 계열 첫 번째)의 단위로
    const lastMed = n.last && store.get().meds.find((m) => m.id === n.last.medId);
    const med = lastMed || (n.last && n.last.conc ? n.last : null)
      || store.get().meds.find((m) => INGREDIENTS[m.ingredient].group === g.key);
    const left = dailyLeft(g.key, history, now, Number(child.weight) || 0, med);
    let state;
    let when;
    if (n.canNow) {
      state = n.last ? '지금 가능' : '먹인 적 없음';
      when = n.last ? `마지막 ${clock(n.last.at)}` : '지금 먹일 수 있어요';
    } else {
      state = `${until(n.at, now)} 뒤`;
      when = `${clock(n.at)}부터`;
    }
    const count = [n.canNow ? '' : n.reason, n.last ? `24시간 ${n.countInDay}/${n.maxPerDay}번` : ''].filter(Boolean).join(' · ');
    const usedPct = left ? Math.round(left.used * 100) : 0;
    const leftText = left && left.amount !== undefined
      ? `남은 양 ${fmtAmount(left.amount)}${med.unit || 'mL'}` : (child.weight ? '' : '몸무게를 넣으면 남은 양도 셉니다');
    return `<div class="dose" style="--c:${color}"><div class="name">${esc(g.name)}</div>
      <div class="state num ${n.canNow && n.last ? 'tone-ok' : ''}">${esc(state)}</div>
      <div class="sub">${esc(when)}</div>${count ? `<div class="sub">${esc(count)}</div>` : ''}
      ${left ? `<div class="bar" role="img" aria-label="24시간 하루 최대량의 ${usedPct}% 먹임"><i style="width:${usedPct}%"></i></div>
        <div class="sub" style="margin-top:6px">${leftText ? `<b style="color:var(--text-2)">${esc(leftText)}</b> · ` : ''}하루 양 ${usedPct}%</div>`
        : `<div class="sub" style="margin-top:6px">${esc(leftText)}</div>`}</div>`;
  }).join('');

  const notice = months !== null && months < 3
    ? `<p class="small" style="margin:10px 0 0;color:var(--high)">${esc(ageNotice('acetaminophen', months))}</p>` : '';

  const pee = lastUrine(history, now);
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
    </div>
    <section class="card" aria-label="다음 해열제"><h2>다음 해열제<span class="spacer"></span>
      <button class="link" data-help-dose>간격 안내</button></h2>
      <div class="doses">${doseCards}</div>${notice}
      ${!child.weight ? `<p class="small muted" style="margin:10px 0 0">몸무게를 넣으면 먹일 양도 계산해 드려요.
        <button class="link btn sm ghost" data-edit-kid style="height:28px">몸무게 넣기</button></p>` : ''}</section>
    <section class="card" aria-label="최근 24시간 그래프"><h2>최근 24시간<span class="spacer"></span>
      <button class="link" data-go="log">전체 기록 ${icon('chev', 14)}</button></h2>${tempChart(history, { hours: 24, now })}</section>
    ${recent.length ? `<div class="section-title">최근 기록</div><div class="rows">${recent.map((e) => rowHtml(e, true)).join('')}</div>` : ''}
    <p class="small faint" style="text-align:center;margin:18px 8px 0">이 앱은 기록과 계산을 돕는 도구예요. 약은 포장 설명서와
      의사 · 약사의 지시를 먼저 따르세요.</p>`;
  return shell(inner, '열지기', `<button class="icon-btn" data-share aria-label="진료용 요약 보내기">${icon('share')}</button>`);
}

function welcome() {
  const inner = `${banners()}<div class="hello">${heroArt()}
      <h2>아이 열, 같이 지켜요</h2>
      <p>체온 · 해열제 · 증상을 한 번에 남기고<br>다음 해열제를 언제, 얼마나 먹일지 알려 드려요.</p>
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
    sub = [e.site, e.memo].filter(Boolean).join(' · ');
  } else if (e.type === 'med') {
    const ing = INGREDIENTS[e.ingredient];
    const nsaid = ing?.group === 'NSAID';
    ico = `<span class="ico" style="background:${nsaid ? 'var(--info-soft)' : 'var(--brand-soft)'};color:${nsaid ? 'var(--nsaid)' : 'var(--apap)'}">${icon('syrup')}</span>`;
    what = `<b>${esc(e.name || ing?.name || '해열제')}</b> <span class="num">${esc(fmtAmount(e.amount))}${esc(e.unit || 'mL')}</span>`;
    sub = [`${ing?.name || ''} ${e.mg}mg`, e.memo].filter(Boolean).join(' · ');
  } else {
    ico = `<span class="ico bg-info">${icon('note')}</span>`;
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

// ── 용량 계산 ───────────────────────────────
function calcOutput(med, weight, months) {
  if (!med || !(Number(weight) > 0)) return '<p class="muted" style="text-align:center;margin:8px 0">몸무게를 넣어 주세요.</p>';
  const ing = INGREDIENTS[med.ingredient];
  const r = doseRange(med.ingredient, Number(weight), med.conc);
  if (!r) return '<p class="muted" style="text-align:center;margin:8px 0">몸무게를 확인해 주세요.</p>';
  if (r.unitTooBig) {
    return `<div class="check warn">이 약은 체중 ${esc(weight)}kg 아이에게 한 ${esc(med.unit)}가 너무 커요(1회 ${r.mg[0]}~${r.mg[1]}mg).
      시럽이나 함량이 낮은 약을 쓰고, 의사 · 약사와 상의하세요.</div>`;
  }
  const notice = ageNotice(med.ingredient, months);
  return `<div class="calc-out"><div class="muted small">${esc(med.name)} · 1회</div>
      <div class="big num">${fmtAmount(r.amount[0])}~${fmtAmount(r.amount[1])}<small>${esc(med.unit)}</small></div>
      <div class="muted small">${ing.name} ${r.mg[0]}~${r.mg[1]}mg${r.capped ? ' · 어른 1회 최대량까지' : ''}</div></div>
    ${notice ? `<div class="check warn">${esc(notice)}</div>` : ''}
    <dl class="kv"><dt>1회 양</dt><dd>체중 1kg 에 ${ing.mgPerKg[0]}~${ing.mgPerKg[1]}mg</dd>
      <dt>간격</dt><dd>같은 계열 ${ing.minIntervalH}시간 이상 · 다른 계열과 2시간 이상</dd>
      <dt>하루</dt><dd>24시간에 ${ing.maxPerDay}번까지 · 최대 ${Math.round(dailyMaxMg(med.ingredient, Number(weight)))}mg</dd>
      <dt>먹이는 나이</dt><dd>보통 생후 ${ing.minAgeMonths}개월부터</dd></dl>`;
}

function calcContext() {
  const child = store.activeChild();
  const meds = store.get().meds;
  return {
    meds,
    med: meds.find((m) => m.id === calcState.medId) || meds[0],
    weight: calcState.weight ?? child?.weight ?? '',
    months: child ? ageMonths(child.birth) : null,
  };
}

function calcView() {
  const { meds, med, weight, months } = calcContext();
  const out = calcOutput(med, weight, months);
  const inner = `<section class="card"><h2>해열제 용량 계산</h2>
      <div class="field"><span>약</span><div class="medpick" role="group" aria-label="약">
        ${meds.map((m) => {
          const ing = INGREDIENTS[m.ingredient];
          return `<button type="button" data-calc-med="${esc(m.id)}" aria-pressed="${m.id === med?.id}">
          <span class="sw" style="background:${ing.group === 'NSAID' ? 'var(--nsaid)' : 'var(--apap)'}"></span>
          <span><b>${esc(m.name)}</b><small>${esc(ing.name)} · ${m.unit === 'mL' ? `${esc(m.conc)}mg/mL` : `1개 ${esc(m.conc)}mg`}</small></span></button>`;
        }).join('')}</div></div>
      <label class="field"><span>몸무게 (kg)</span><input class="input num" type="number" inputmode="decimal" step="0.1" min="2" max="80"
        data-calc-weight value="${esc(weight)}" placeholder="예: 12.5"></label>
      <div data-calc-out aria-live="polite">${out}</div></section>
    <section class="card prose" aria-label="주의"><h2>꼭 확인하세요</h2>
      <ul><li><b>포장의 함량</b>이 위 약의 함량과 같은지 보세요. 같은 성분도 제품마다 다를 수 있어요(설정 → 내 약에서 고침).</li>
        <li>포장 설명서의 <b>나이 · 체중별 용량표</b>와 의사 · 약사의 지시가 이 계산보다 먼저입니다.</li>
        <li>아세트아미노펜 계열과 이부프로펜 계열(이부프로펜 · 덱시부프로펜)을 번갈아 먹일 때는 의사 · 약사와 상의하세요.</li>
        <li>먹인 약은 꼭 「해열제」로 기록해 두세요 — 다음 먹일 때와 하루 최대량을 셉니다.</li></ul></section>`;
  return shell(inner, '용량');
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
      <label class="item"><span class="grow"><b>다음 해열제 · 체온 다시 재기</b>
        <small>${perm === 'unsupported' ? '이 브라우저는 알림을 지원하지 않아요. 홈 화면에 추가하면 될 수 있어요.'
          : perm === 'denied' ? '알림이 막혀 있어요. 브라우저 · 휴대폰 설정에서 허용해 주세요.'
          : '앱이 열려 있거나 뒤에 남아 있을 때 울려요. 완전히 닫으면 울리지 않아요.'}</small></span>
        <input type="checkbox" class="switch" data-notify ${s.settings.notify && perm === 'granted' ? 'checked' : ''}
          ${perm === 'unsupported' || perm === 'denied' ? 'disabled' : ''} aria-label="알림 켜기"></label></div>

    <div class="section-title">화면</div><div class="list">
      <div class="item"><span class="grow"><b>테마</b></span><span class="seg" role="group" aria-label="테마">
        ${[['system', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([k, l]) => `<button type="button" data-theme-set="${k}"
          aria-pressed="${s.settings.theme === k}">${l}</button>`).join('')}</span></div></div>

    <div class="section-title">기록 보관</div><div class="list">
      <button type="button" class="item" data-export>${icon('download', 20)}<span class="grow"><b>백업 파일 저장</b>
        <small>휴대폰을 바꾸거나 다른 브라우저로 옮길 때</small></span></button>
      <label class="item" style="cursor:pointer">${icon('upload', 20)}<span class="grow"><b>백업 파일 불러오기</b>
        <small>지금 기록을 파일의 것으로 바꿔요</small></span>
        <input type="file" accept="application/json,.json" data-import class="sr"></label>
      <button type="button" class="item" data-reset style="color:var(--high)">${icon('trash', 20)}<span class="grow"><b>모든 기록 지우기</b></span></button></div>

    <div class="section-title">도움말</div><div class="list">
      <button type="button" class="item" data-help-er>${icon('alert', 20)}<span class="grow"><b>바로 병원에 가야 할 때</b></span>${icon('chev', 18)}</button>
      <button type="button" class="item" data-help-dose>${icon('info', 20)}<span class="grow"><b>해열제 간격 · 교차 복용</b></span>${icon('chev', 18)}</button>
      <button type="button" class="item" data-help-about>${icon('info', 20)}<span class="grow"><b>이 앱에 대해</b>
        <small>판 ${esc(env.VERSION)}</small></span>${icon('chev', 18)}</button></div>`;
  return shell(inner, '설정');
}

// ── 도움말 창 ───────────────────────────────
function helpEr() {
  sheet({ title: '바로 병원에 가야 할 때', body: `<div class="prose">
    <h3>바로 응급실 · 119</h3><ul>
      <li>생후 3개월 미만 아기가 38℃ 이상</li><li>경련(열성 경련 포함) · 의식이 흐리거나 깨워도 잘 안 깸</li>
      <li>숨쉬기 힘들어함 · 입술이 파래짐</li><li>누르면 없어지지 않는 붉은 · 보라 반점</li>
      <li>소변이 크게 줄거나(6~8시간 없음) 입이 바짝 마름 · 울어도 눈물이 없음</li><li>목이 뻣뻣함 · 심한 두통 · 계속 토함</li></ul>
    <h3>진료를 받아 보세요</h3><ul>
      <li>열이 3일(72시간) 넘게 이어짐</li><li>40℃ 이상이거나 해열제를 먹여도 잘 안 떨어짐</li>
      <li>생후 3~6개월 아기의 열</li><li>열이 내렸다가 다시 오름 · 귀 아픔 · 소변 볼 때 아파함</li></ul>
    <p>밤 · 휴일에 아이가 아플 때는 가까운 <b>달빛어린이병원</b>(야간 · 휴일 소아 진료)을 찾아보세요.
      상담: <a href="tel:119">119</a>(응급) · <a href="tel:1339">1339</a>(질병관리청 콜센터).</p>
    <p class="faint small">일반적인 안내입니다. 아이 상태가 걱정되면 이 목록과 상관없이 진료를 받으세요.</p></div>` });
}

function helpDose() {
  sheet({ title: '해열제 간격 · 교차 복용', body: `<div class="prose">
    <h3>계열이 둘이에요</h3><ul>
      <li><b style="color:var(--apap)">아세트아미노펜 계열</b> — 4~6시간 간격, 24시간에 5번까지</li>
      <li><b style="color:var(--nsaid)">이부프로펜 계열</b>(이부프로펜 · 덱시부프로펜) — 6~8시간 간격, 24시간에 4번까지.
        이부프로펜과 덱시부프로펜은 같은 계열이라 번갈아 먹이면 안 돼요.</li></ul>
    <h3>교차 복용</h3>
    <p>한 계열을 먹였는데 열이 안 떨어질 때 다른 계열을 먹이는 것. 앞 약과 <b>2시간 이상</b> 띄우고, 각 계열의 간격 · 하루 횟수는
      따로 지켜야 해요. 교차 복용은 의사 · 약사와 상의해 정하세요.</p>
    <h3>이 앱이 세는 것</h3>
    <p>홈의 「다음 해열제」는 기록한 약으로 계열마다 언제부터 먹일 수 있는지 셉니다(같은 계열 간격 · 다른 계열 2시간 ·
      24시간 횟수). 기록하지 않은 약은 셀 수 없어요.</p>
    <p class="faint small">숫자는 국내 어린이 해열제 포장 설명서의 일반 범위예요. 제품 설명서와 의사 · 약사의 지시가 먼저입니다.</p></div>` });
}

function helpAbout() {
  sheet({ title: '열지기', body: `<div class="prose">
    <p>아이가 열이 날 때 체온 · 해열제 · 증상을 남기고, 다음 해열제를 언제 얼마나 먹일지 계산해 주는 앱이에요.</p>
    <h3>기록은 어디에?</h3>
    <p>이 휴대폰의 브라우저에만 저장돼요. 어디로도 보내지 않아요. 그래서 브라우저 기록을 지우거나 휴대폰을 바꾸면 사라질 수 있어요 —
      가끔 설정 → <b>백업 파일 저장</b>을 해 두세요.</p>
    <h3>의료 정보가 아니에요</h3>
    <p>이 앱은 진단이나 처방을 하지 않아요. 용량 · 간격은 일반적인 범위의 계산이며, 약 포장 설명서와 의사 · 약사의 지시가 먼저입니다.</p>
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
      <textarea class="input" readonly style="height:260px;font-size:14px" aria-label="요약">${esc(text)}</textarea>`,
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
  const t = store.get().settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
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
  else if (d.calcMed) { calcState.medId = d.calcMed; render(); }
  else if (d.editMed) medPresetSheet(store.get().meds.find((m) => m.id === d.editMed));
  else if ('addMed' in d) medPresetSheet();
  else if (d.themeSet) { store.setSetting('theme', d.themeSet); applyTheme(); }
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
    const ok = await confirmSheet({ title: '백업 불러오기', ok: '바꾸기', danger: true,
      text: `「${file.name}」의 기록으로 지금 기록을 바꿔요. 지금 기록은 사라져요.` });
    if (!ok) { t.value = ''; return; }
    try {
      const r = store.importJson(await file.text());
      applyTheme();
      toast(`아이 ${r.children}명 · 기록 ${r.entries}건을 불러왔어요.`);
    } catch {
      t.value = '';                         // 같은 파일을 다시 골라도 change 가 오게
      toast('열지기 백업 파일이 아니거나 깨졌어요.');
    }
  }
});

root.addEventListener('input', (ev) => {
  if (ev.target.matches('[data-calc-weight]')) {
    calcState.weight = ev.target.value;
    const { med, weight, months } = calcContext();
    $('[data-calc-out]').innerHTML = calcOutput(med, weight, months);
  }
});

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
setInterval(() => { if (view === 'home' && !document.querySelector('.sheet')) render(); }, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); notify.reschedule(); } });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
try { navigator.storage?.persist?.(); } catch { /* 저장 공간 오래 두기 요청 — 안 돼도 된다 */ }

export { HOUR };
