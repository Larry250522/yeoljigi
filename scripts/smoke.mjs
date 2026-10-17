// 연기 시험 — 진짜 Chrome(headless)으로 화면 넷 · 기록 창 · 도움말 창을 모두 열어 보고, 스크립트 오류가 하나라도 나면 실패.
// 의존성 없음: Node 의 http 서버 + 내장 WebSocket 으로 Chrome DevTools Protocol 을 직접 부른다.
//   npm run smoke            (CHROME=크롬 실행 파일 경로 로 바꿀 수 있다)

import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const CHROME = process.env.CHROME || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const profile = await mkdtemp(join(tmpdir(), 'yeoljigi-smoke-'));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws;
const errors = [];
const pending = new Map();
let seq = 0;
const send = (method, params = {}) => new Promise((resolve) => {
  pending.set(++seq, resolve);
  ws.send(JSON.stringify({ id: seq, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) errors.push(`${expression.slice(0, 60)} → ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result?.value;
};
const open = async (path = '') => {
  const r = await send('Page.navigate', { url: base + path });
  if (r.errorText) errors.push(`열기 실패 ${base + path}: ${r.errorText}`);
  await wait(900);
};
const click = async (selector, label = selector) => {
  const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.click(); return Boolean(el); })()`);
  if (!ok) errors.push(`없음: ${label}`);
  await wait(350);
};

let failed = false;
try {
  let target;
  for (let i = 0; i < 40 && !target; i += 1) {
    await wait(250);
    target = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null);
  }
  if (!target) throw new Error(`Chrome 을 띄우지 못했어요 (${CHROME})`);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    } else if (pending.has(m.id)) {
      pending.get(m.id)(m.result ?? m);
      pending.delete(m.id);
    }
  });
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  // 처음 — 빈 상태
  await open();
  if (!(await evaluate(`Boolean(document.querySelector('[data-add-kid]'))`))) errors.push('처음 화면에 「아이 더하기」가 없음');

  // 기록이 있는 아이 하나
  await evaluate(`(async () => { const s = await import('./js/store.js');
    s.saveChild({ name: '시험', birth: '2023-03-02', weight: 13 });
    const kid = s.get().children[0]; const m = s.get().meds[0];
    const h = (x) => new Date(Date.now() - x * 3600e3).toISOString();
    s.saveEntry({ childId: kid.id, type: 'temp', temp: 39.1, site: '귀', at: h(3) });
    s.saveEntry({ childId: kid.id, type: 'med', medId: m.id, name: m.name, ingredient: m.ingredient, conc: m.conc, unit: m.unit,
      amount: 5, mg: 5 * m.conc, at: h(2.5) });
    s.saveEntry({ childId: kid.id, type: 'symptom', tags: ['기침'], memo: '', at: h(1) }); })()`);

  for (const view of ['home', 'log', 'calc', 'settings']) {
    await open();
    await click(`[data-view=${view}]`, `탭 ${view}`);
  }
  const sheets = [
    ['', '[data-new=temp]'], ['', '[data-new=med]'], ['', '[data-new=symptom]'], ['', '[data-pee]'], ['', '[data-entry]'],
    ['', '[data-help-er]'], ['', '[data-help-dose]'], ['', '[data-help-fever]'],
    ['settings', '[data-help-about]'], ['settings', '[data-add-med]'], ['settings', '[data-edit-med]'], ['settings', '[data-add-kid]'],
  ];
  for (const [view, selector] of sheets) {
    await open();
    if (view) await click(`[data-view=${view}]`);
    await click(selector);
  }
  await open();
  await click('[data-view=calc]');
  for (let i = 0; i < 3; i += 1) await click(`[data-calc-med]:nth-of-type(${i + 1})`, `약 안내 ${i + 1}번째 약`);
} catch (err) {
  errors.push(String(err && err.message || err));
} finally {
  failed = errors.length > 0;
  try { ws?.close(); } catch { /* 이미 닫힘 */ }
  chrome.kill();
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

if (failed) {
  console.error(`연기 시험 실패 — ${errors.length}건\n${errors.map((e) => `- ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('연기 시험 통과 — 화면 넷 · 기록 창 · 도움말 창에서 스크립트 오류 없음');
process.exit(0);
