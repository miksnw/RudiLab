import { h } from '../../core/dom.js';
import { store } from '../../core/services.js';
import { CATS, PATS } from '../../data/patterns.js';
import { S, go, openPattern } from '../state.js';
import { Screen, Title, Tabs, List, Row } from '../kit.js';

export function PracticeScreen() {
  const { d } = store;
  const rows = PATS.filter((p) => p.cat === S.cat).map((p) => Row({
    title: p.name,
    prefix: d.plan.includes(p.id) ? h('span', { class: 'star' }, '★ ') : null,
    sub: d.last[p.id] ? 'Последняя практика: ' + d.last[p.id] : 'Ещё не занимались',
    badge: d.best[p.id] ? '♩ ' + d.best[p.id] : null,
    chevron: true,
    onclick: () => openPattern(p.id),
  }));
  return Screen(Title('Rudiment Lab'), Tabs(CATS, S.cat, (cat) => go({ cat })), List(rows));
}
