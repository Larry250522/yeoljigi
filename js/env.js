// 어디서 열렸나 — 카카오톡 안 브라우저 · 홈 화면 설치 여부 · 설치 단추.
//
// 카카오톡으로 받은 링크는 카카오톡 안 브라우저로 열린다. 거기서는 홈 화면에 추가할 수 없고, 저장한 기록이
// 기본 브라우저와 따로 놀아 「어제 적은 게 없다」가 된다. 그래서 첫 화면에서 기본 브라우저로 넘긴다.

export const VERSION = '0.2.0';

const ua = () => (globalThis.navigator?.userAgent || '');

export const inKakao = () => /KAKAOTALK/i.test(ua());
export const isIOS = () => /iPhone|iPad|iPod/i.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1);
export const isStandalone = () => globalThis.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const iosNotInstalled = () => isIOS() && !isStandalone() && !inKakao();

let deferred = null;

export function init(onChange) {
  globalThis.addEventListener?.('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    onChange();
  });
  globalThis.addEventListener?.('appinstalled', () => { deferred = null; onChange(); });
  if (!inKakao()) return;
  try {
    // 처음 한 번은 바로 기본 브라우저로 넘겨 본다. 안 되면 화면의 띠에서 다시 누른다(사람이 누를 때가 더 잘 된다).
    if (sessionStorage.getItem('yeoljigi.kakao-tried')) return;
    sessionStorage.setItem('yeoljigi.kakao-tried', '1');
  } catch {
    return;                                   // 저장소를 못 쓰면 자동으로 넘기지 않는다(매번 튕기지 않게)
  }
  openExternal();
}

export const canInstall = () => Boolean(deferred) && !isStandalone();

export async function install() {
  if (!deferred) return false;
  deferred.prompt();
  const choice = await deferred.userChoice.catch(() => null);
  deferred = null;
  return choice?.outcome === 'accepted';
}

export function openExternal() {
  const url = location.href.split('#')[0];
  location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}
