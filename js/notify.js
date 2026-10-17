// 알림 — 해열제를 먹이고 1시간 뒤 체온 다시 재기.
//
// 「다음 해열제를 먹일 수 있는 시각」 알림은 0.7.0 에서 뺐다 — 투약 주기를 정해 주는 일이라(dose.js 머리말).
// 웹은 앱을 닫아 두면 정해진 시각에 알림을 띄우는 방법이 없다(예약 알림 API 가 표준이 아니다). 그래서 화면이 열려 있거나
// 뒤에 남아 있는 동안만 울린다고 화면에 그대로 적는다.

import { HOUR } from './dose.js';
import * as store from './store.js';
import { toast } from './ui.js';

const timers = new Map();
const RECHECK_MIN = 60;          // 해열제를 먹이고 체온을 다시 재 볼 때

export const supported = () => 'Notification' in globalThis;
export const permission = () => (supported() ? Notification.permission : 'unsupported');

export async function ask() {
  if (!supported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function fire(title, body, tag) {
  toast(`${title} — ${body}`);
  if (permission() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: true });
    else new Notification(title, { body, tag });
  } catch { /* 알림을 못 띄워도 화면 토스트는 떴다 */ }
}

function plan(at, key, title, body) {
  const wait = new Date(at).getTime() - Date.now();
  if (wait <= 0 || wait > 30 * HOUR) return;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); fire(title, body, key); }, wait));
}

/** 지금 기록으로 다시 잡는다 — 기록을 더하거나 지울 때마다 부른다. */
export function reschedule() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  const { settings, children } = store.get();
  if (!settings.notify) return;
  for (const child of children) {
    const history = store.entriesOf(child.id);
    const lastMed = history.find((e) => e.type === 'med');
    if (lastMed) {
      const recheck = new Date(new Date(lastMed.at).getTime() + RECHECK_MIN * 60000);
      const measuredAfter = history.some((e) => e.type === 'temp' && e.at > lastMed.at);
      if (!measuredAfter) plan(recheck, `recheck-${child.id}`, `${child.name} 체온 재기`, '해열제를 먹인 지 1시간 — 체온을 다시 재 보세요.');
    }
  }
}
