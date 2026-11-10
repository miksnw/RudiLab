import { h } from '../../core/dom.js';
import { dayKey, duration } from '../../core/time.js';
import { pickForPlan } from '../../core/stats.js';
import { store } from '../../core/services.js';
import { CATS, PATS, byId } from '../../data/patterns.js';
import { go, openPattern } from '../state.js';
import { Screen, Title, Section, Stats, Stat, List, Empty, Pill, ActionRow } from '../kit.js';

export function TodayScreen() {
  const { d } = store, today = dayKey();
  const plan = d.plan.filter((id) => byId[id]);
  const doneToday = (id) => d.last[id] === today;
  const catName = (p) => (CATS.find((c) => c.id === p.cat) || {}).name;

  const rows = plan.map((id) => {
    const p = byId[id];
    return h('div', { class: 'item' },
      h('button', { class: 'grow', style: 'text-align:left', onclick: () => openPattern(id) },
        h('div', { class: 't' }, (doneToday(id) ? '✓ ' : '○ ') + p.name),
        h('div', { class: 's' }, catName(p) + (d.best[id] ? ' · рекорд ' + d.best[id] : ''))),
      Pill({ text: '✕', onclick: () => { store.removeFromPlan(id); go(); } }));
  });

  return Screen(
    Title('Сегодня'),
    Stats(Stat(`${plan.filter(doneToday).length}/${plan.length}`, 'сделано'), Stat(duration(store.secOnDay(today)), 'играли'), Stat(today.slice(5), 'дата')),
    Section('План'),
    plan.length ? List(rows) : Empty('План пуст. Добавь паттерны кнопкой «☆ В план» или подбери набор.'),
    ActionRow(
      Pill({ text: '🎲 Подобрать 5 (давно не играли)', onclick: () => { store.setPlan([...d.plan, ...pickForPlan(PATS, d.plan, d.last)]); go(); } }),
      plan.length ? Pill({ text: 'Очистить', onclick: () => { store.setPlan([]); go(); } }) : null));
}
