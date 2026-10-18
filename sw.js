// 오프라인 — 앱 껍데기는 먼저 캐시에서, 새 판이 올라오면 다음에 열 때 바뀐다.
// 판을 올릴 때 CACHE 이름(js/env.js 의 VERSION 과 같게)을 바꾼다.

const CACHE = 'yeoljigi-0.8.1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/chart.js', 'js/dose.js', 'js/env.js', 'js/notify.js', 'js/report.js', 'js/share.js', 'js/sheets.js', 'js/store.js', 'js/ui.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' — 웹 서버의 HTTP 캐시에 남은 예전 판 파일이 새 캐시에 들어가지 않게
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const font = url.hostname === 'cdn.jsdelivr.net';
  if (url.origin !== location.origin && !font) return;
  // 화면(HTML)은 네트워크 먼저 — 새 판을 바로 받고, 안 되면 캐시
  if (request.mode === 'navigate') {
    const shell = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    e.respondWith(fetch(request).then((res) => {
      // 앱 첫 화면의 정상 응답만 껍데기로 둔다(다른 주소의 404 · 500 이 껍데기를 덮지 않게)
      if (res.ok && shell) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('index.html', copy));
      }
      return res;
    }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
    if (res.ok) {                         // 실패 · opaque 응답은 두지 않는다(폰트 CSS 는 crossorigin 으로 받는다)
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  })));
});

// 알림을 누르면 열려 있는 창으로, 없으면 새로 연다
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow('./');
  }));
});
