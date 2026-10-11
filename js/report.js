// 진료용 요약 — 병원에서 의사에게 보여 주거나 카카오톡으로 보낼 글. 최근 72시간.

import { HOUR, INGREDIENTS, ageLabel, ageMonths, feverEpisode } from './dose.js';
import { clock, fmt1, fmtAmount } from './ui.js';

export function summary(child, entries, now = new Date(), hours = 72) {
  const from = now.getTime() - hours * HOUR;
  const recent = entries.filter((e) => new Date(e.at).getTime() >= from).sort((a, b) => (a.at < b.at ? -1 : 1));
  const temps = recent.filter((e) => e.type === 'temp');
  const meds = recent.filter((e) => e.type === 'med');
  const symptoms = recent.filter((e) => e.type === 'symptom');
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

function stamp(at) {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()} ${clock(d)}`;
}
