import { h } from '../../core/dom.js';
import { dayKey, duration, pad } from '../../core/time.js';
import { weekSeconds, streak, dayLevel, monthShape } from '../../core/stats.js';
import { store } from '../../core/services.js';
import { byId } from '../../data/patterns.js';
import { S, go, openPattern } from '../state.js';
import { Screen, Title, Section, Stats, Stat, List, Empty, Row, Pill, ActionRow } from '../kit.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function Calendar(now) {
  const y = S.month.getFullYear(), m = S.month.getMonth();
  const { lead, days } = monthShape(y, m);
  const cells = Array.from({ length: lead }, () => h('div', { class: 'day blank' }));
  for (let n = 1; n <= days; n++) {
    const key = `${y}-${pad(m + 1)}-${pad(n)}`, sec = store.secOnDay(key);
    cells.push(h('button', { class: `day l${dayLevel(sec)}` + (key === dayKey(now) ? ' today' : '') + (key === S.sel ? ' sel' : ''), onclick: () => go({ sel: key }) },
      String(n), sec ? h('i', null, Math.max(1, Math.round(sec / 60)) + 'м') : null));
  }
  const title = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' }).format(new Date(y, m, 1));
  return h('div', { class: 'cal' },
    h('div', { class: 'calhead' },
      h('button', { onclick: () => go({ month: new Date(y, m - 1, 1) }) }, '‹'), h('span', null, title),
      h('button', { onclick: () => go({ month: new Date(y, m + 1, 1) }) }, '›')),
    h('div', { class: 'calgrid' }, WEEKDAYS.map((x) => h('div', { class: 'dow' }, x)), cells));
}

function exportData() {
  const text = store.exportJSON();
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => alert('Данные скопированы в буфер обмена'), () => prompt('Скопируйте данные:', text));
  else prompt('Скопируйте данные:', text);
}

function importData() {
  const text = prompt('Вставьте ранее скопированные данные:');
  if (!text) return;
  try { store.importJSON(text); go(); alert('Готово'); } catch { alert('Не удалось прочитать данные'); }
}

export function RecordsScreen() {
  const { d } = store, now = new Date();
  const sessions = (d.days[S.sel] || { sessions: [] }).sessions;
  const bests = Object.entries(d.best).filter(([id]) => byId[id]).sort((a, b) => b[1] - a[1]).slice(0, 20);

  return Screen(
    Title('Записи'),
    Stats(Stat(duration(store.secOnDay(dayKey(now))), 'сегодня'), Stat(duration(weekSeconds(store.secOnDay, now)), '7 дней'), Stat(streak(store.secOnDay, now) + ' дн.', 'серия')),
    Section('Календарь практики'), Calendar(now),
    Section('День ' + S.sel.slice(5)),
    sessions.length
      ? List(sessions.slice().reverse().map((s) => Row({ title: (byId[s.id] || { name: s.id }).name, sub: `${s.t} · ${duration(s.sec)} · ${s.bpm} BPM` })))
      : Empty('В этот день практики не было.'),
    Section('Рекорды BPM'),
    bests.length
      ? List(bests.map(([id, v]) => Row({ title: byId[id].name, sub: 'Последняя: ' + (d.last[id] || '—'), badge: '♩ ' + v, onclick: () => openPattern(id) })))
      : Empty('Рекорды появятся после первых тренировок (от 10 секунд).'),
    Section('Данные'),
    ActionRow(Pill({ text: 'Экспорт', onclick: exportData }), Pill({ text: 'Импорт', onclick: importData })));
}
