// 체온 그래프 — SVG 를 직접 그린다(인터넷 없이). 열 구간 띠 · 체온 선 · 해열제 표시 · 지금 선.

import { HOUR, INGREDIENTS, feverLevel } from './dose.js';
import { clock, esc } from './ui.js';

const W = 340;
const H = 190;
const PAD = { l: 30, r: 10, t: 10, b: 34 };
const T_MIN = 35;
const T_MAX = 41;

const BANDS = [
  { from: 37.5, to: 38, tone: 'mild' },
  { from: 38, to: 39, tone: 'fever' },
  { from: 39, to: 40, tone: 'high' },
  { from: 40, to: 41, tone: 'severe' },
];

export function tempChart(entries, opts = {}) {
  return `${chartSvg(entries, opts)}${LEGEND}`;
}

const LEGEND = `<div class="legend"><span><i style="background:var(--apap)"></i>아세트아미노펜</span>
    <span><i style="background:var(--nsaid)"></i>이부프로펜 계열</span>
    <span><i style="background:var(--fever-soft);outline:1px solid var(--fever)"></i>38℃ 이상</span></div>`;

function chartSvg(entries, { hours = 24, now = new Date() } = {}) {
  const end = now.getTime() + hours * HOUR * 0.04;
  const start = now.getTime() - hours * HOUR;
  const x = (t) => PAD.l + ((t - start) / (end - start)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (Math.min(T_MAX, Math.max(T_MIN, v)) - T_MIN) / (T_MAX - T_MIN)) * (H - PAD.t - PAD.b);

  const temps = entries.filter((e) => e.type === 'temp' && new Date(e.at).getTime() >= start)
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  const meds = entries.filter((e) => e.type === 'med' && new Date(e.at).getTime() >= start);

  const bands = BANDS.map((b) => `<rect class="band" x="${PAD.l}" width="${W - PAD.l - PAD.r}" y="${y(b.to)}"
    height="${y(b.from) - y(b.to)}" fill="var(--${b.tone}-soft)"/>`).join('');

  const grid = [36, 37, 38, 39, 40].map((v) => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="axis" x="${PAD.l - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('');

  // 시간 눈금 — 24시간은 6시간마다, 3일 · 7일은 하루마다(자정)
  const ticks = [];
  const step = hours <= 24 ? 6 : 24;
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  if (step === 24) first.setHours(24, 0, 0, 0);
  else first.setHours(Math.ceil(first.getHours() / step) * step);
  for (let t = first.getTime(); t <= end; t += step * HOUR) {
    const d = new Date(t);
    const label = step === 24 ? `${d.getMonth() + 1}/${d.getDate()}` : (d.getHours() === 0 ? `${d.getMonth() + 1}/${d.getDate()}`
      : `${d.getHours()}시`);
    ticks.push(`<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${PAD.t}" y2="${H - PAD.b}" stroke-dasharray="2 4"/>
      <text class="axis" x="${x(t)}" y="${H - PAD.b + 13}" text-anchor="middle">${label}</text>`);
  }

  const pts = temps.map((e) => [x(new Date(e.at).getTime()), y(Number(e.temp)), e]);
  const line = pts.length > 1 ? `<polyline class="line" points="${pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}"/>` : '';
  const dots = pts.map(([a, b, e]) => {
    const lv = feverLevel(e.temp);
    return `<circle class="pt" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${hours <= 24 ? 5 : 4}" fill="var(--${lv.tone})">
      <title>${esc(clock(e.at))} ${Number(e.temp).toFixed(1)}℃</title></circle>`;
  }).join('');

  const medY = H - PAD.b + 22;
  const medMarks = meds.map((e) => {
    const ing = INGREDIENTS[e.ingredient];
    const color = ing && ing.group === 'NSAID' ? 'var(--nsaid)' : 'var(--apap)';
    const mx = x(new Date(e.at).getTime());
    return `<g><line class="medmark" x1="${mx}" x2="${mx}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="${color}" stroke-opacity=".35"/>
      <rect x="${mx - 5}" y="${medY - 5}" width="10" height="10" rx="3" fill="${color}">
      <title>${esc(clock(e.at))} ${esc(e.name || '')}</title></rect></g>`;
  }).join('');

  const nowX = x(now.getTime());
  const empty = !temps.length && !meds.length
    ? `<text class="axis" x="${(PAD.l + W - PAD.r) / 2}" y="${(PAD.t + H - PAD.b) / 2}" text-anchor="middle" font-size="12">이 기간의 기록이 없어요</text>`
    : '';

  const summary = temps.length
    ? `최근 ${hours}시간 체온 ${temps.length}번, 가장 높은 ${Math.max(...temps.map((e) => Number(e.temp))).toFixed(1)}도, 해열제 ${meds.length}번`
    : `최근 ${hours}시간 기록 없음`;

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}">
    ${bands}${grid}${ticks.join('')}
    <line class="nowline" x1="${nowX}" x2="${nowX}" y1="${PAD.t}" y2="${H - PAD.b}"/>
    ${medMarks}${line}${dots}${empty}
  </svg>`;
}

// 그림으로 내보낼 때 — 화면 CSS 가 닿지 않으니 그래프 모양(app.css 의 .chart 규칙)을 SVG 안에 함께 넣는다
const CHART_STYLE = `.band{opacity:.55}.grid{stroke:var(--line);stroke-width:1}
  .axis{fill:var(--text-3);font-size:10px;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}
  .line{fill:none;stroke:var(--text);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
  .pt{stroke:var(--surface);stroke-width:2}.nowline{stroke:var(--brand);stroke-width:1.5;stroke-dasharray:3 3}.medmark{stroke-width:2}
  .t{fill:var(--text);font-size:13px;font-weight:700;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}
  .s{fill:var(--text-2);font-size:10px;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}`;

/**
 * 진료 때 보여 줄 그래프 그림(PNG). 늘 밝은 색으로 — 화면 토큰(app.css)을 밝은 테마에서 읽어 바꿔 넣는다.
 * 브라우저에서만 부른다.
 */
export async function chartImage(entries, { hours = 72, now = new Date(), title = '' } = {}) {
  const rootEl = document.documentElement;
  const before = rootEl.getAttribute('data-theme');
  rootEl.setAttribute('data-theme', 'light');
  const css = getComputedStyle(rootEl);
  const color = (name) => css.getPropertyValue(`--${name}`).trim() || '#888';
  const paint = (text) => text.replace(/var\(--([a-z0-9-]+)\)/g, (m, name) => color(name));
  const style = paint(CHART_STYLE);
  const chart = paint(chartSvg(entries, { hours, now })).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const bg = color('surface');
  const legend = [['apap', '아세트아미노펜'], ['nsaid', '이부프로펜 계열']]
    .map(([k, label], i) => `<rect x="${12 + i * 110}" y="268" width="10" height="10" rx="3" fill="${color(k)}"/>
      <text class="s" x="${26 + i * 110}" y="277">${esc(label)}</text>`).join('');
  if (before === null) rootEl.removeAttribute('data-theme'); else rootEl.setAttribute('data-theme', before);

  const w = 340;
  const h = 290;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <style>${style}</style><rect width="${w}" height="${h}" fill="${bg}"/>
    <text class="t" x="12" y="24">${esc(title)}</text>
    <text class="s" x="12" y="42">${esc(stamp(now.getTime() - hours * HOUR))} ~ ${esc(stamp(now))} · 최근 ${hours}시간 · 열지기</text>
    <g transform="translate(0 56)">${chart}</g>${legend}</svg>`;

  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('그림을 만들지 못했어요.'))), 'image/png'));
}

function stamp(at) {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()} ${clock(d)}`;
}
