// 진료용 요약 — 병원에서 의사에게 보여 주거나 카카오톡으로 보낼 글. 최근 72시간.

import {
  DAY, GROUPS, HOUR, INGREDIENTS, URINE_TAG, ageLabel, ageMonths, feverEpisode, lastUrine, nextDose,
} from './dose.js';
import { clock, fmt1, fmtAmount } from './ui.js';

export function summary(child, entries, now = new Date(), hours = 72) {
  const from = now.getTime() - hours * HOUR;
  const recent = entries.filter((e) => new Date(e.at).getTime() >= from).sort((a, b) => (a.at < b.at ? -1 : 1));
  const temps = recent.filter((e) => e.type === 'temp');
  const meds = recent.filter((e) => e.type === 'med');
  // 「소변 봄」만 있는 기록은 증상 목록 대신 한 줄로 센다
  const peeOnly = (e) => e.type === 'symptom' && (e.tags || []).length === 1 && e.tags[0] === URINE_TAG && !e.memo;
  const pees = recent.filter((e) => e.type === 'symptom' && (e.tags || []).includes(URINE_TAG));
  const symptoms = recent.filter((e) => e.type === 'symptom' && !peeOnly(e));
  const lines = [];
  const age = ageLabel(ageMonths(child.birth, now));
  lines.push(`[${child.name}${age ? ` · ${age}` : ''}${child.weight ? ` · ${child.weight}kg` : ''}] 최근 ${hours}시간 기록`);

  if (child.seizure) lines.push('열성 경련 과거력 있음');
  if (child.note) lines.push(`참고: ${child.note}`);
  const ep = feverEpisode(entries, now);
  if (ep) lines.push(`열 시작: ${stamp(ep.start)} (${Math.max(1, Math.round(ep.hours))}시간째)`);
  if (temps.length) {
    const max = temps.reduce((m, e) => (Number(e.temp) > Number(m.temp) ? e : m));
    lines.push(`최고 체온: ${fmt1(max.temp)}℃ (${stamp(max.at)}) · 마지막: ${fmt1(temps[temps.length - 1].temp)}℃ (${stamp(temps[temps.length - 1].at)})`);
  } else {
    lines.push('체온 기록 없음');
  }
  if (pees.length) lines.push(`소변 ${pees.length}번 · 마지막 ${stamp(pees[pees.length - 1].at)}`);

  if (meds.length) {
    lines.push('', `해열제 ${meds.length}번`);
    for (const m of meds) {
      const ing = INGREDIENTS[m.ingredient];
      lines.push(`- ${stamp(m.at)} ${m.name || ing?.name} ${fmtAmount(m.amount)}${m.unit || 'mL'} (${ing?.name || ''} ${m.mg}mg)`);
    }
  }
  if (temps.length) {
    lines.push('', '체온');
    for (const t of temps) lines.push(`- ${stamp(t.at)} ${fmt1(t.temp)}℃${t.site ? ` (${t.site})` : ''}`);
  }
  if (symptoms.length) {
    lines.push('', '증상');
    for (const s of symptoms) lines.push(`- ${stamp(s.at)} ${(s.tags || []).join(', ')}${s.memo ? ` — ${s.memo}` : ''}`);
  }
  lines.push('', '열지기 앱 기록');
  return lines.join('\n');
}

/**
 * 해열제를 먹인 바로 뒤 가족에게 보낼 글 — 무엇을 얼마나 먹였고, 계열마다 다음에 먹일 수 있는 때.
 * 받는 사람이 나중에 읽을 수 있어 「몇 시 기준」을 함께 적는다.
 */
export function doseMessage(child, entry, history, now = new Date()) {
  const ing = INGREDIENTS[entry.ingredient];
  const lines = [`[${child.name}] ${stamp(entry.at)} ${entry.name || ing.name} ${fmtAmount(entry.amount)}${entry.unit || 'mL'} 먹였어요`
    + ` (${ing.name} ${entry.mg}mg)`];
  const temp = history.filter((e) => e.type === 'temp' && new Date(e.at) <= now).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  if (temp && now - new Date(temp.at) < 12 * HOUR) lines.push(`마지막 체온 ${fmt1(temp.temp)}℃ (${stamp(temp.at)})`);
  lines.push('', '다음에 먹일 수 있는 때');
  for (const g of Object.values(GROUPS)) {
    const n = nextDose(g.key, history, now, Number(child.weight) || 0);
    lines.push(`- ${g.name}: ${n.canNow ? '지금 가능' : `${stamp(n.at)}부터 (${n.reason})`}`);
  }
  const pee = lastUrine(history, now);
  if (pee && now - new Date(pee.at) < DAY) lines.push(`마지막 소변 ${stamp(pee.at)}`);
  lines.push('', `${stamp(now)} 기록 기준 · 열지기`);
  return lines.join('\n');
}

function stamp(at) {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()} ${clock(d)}`;
}
