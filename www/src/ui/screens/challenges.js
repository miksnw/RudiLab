import { h } from '../../core/dom.js';
import { store } from '../../core/services.js';
import { CATS, PATS, byId } from '../../data/patterns.js';
import { PRESETS, challengeTitle } from '../../data/challenges.js';
import { S, go, openPattern } from '../state.js';
import { Screen, Title, Section, Note, TopBar, Tabs, List, Row, Pill, BigButton, Options, NumberField } from '../kit.js';
import { ImportScreen } from './import.js';

const closeSub = () => go({ chView: null, imp: null });

export function ChallengesScreen() {
  if (S.chView === 'custom') return CustomChallenge();
  if (S.chView === 'import') return ImportScreen();
  const { d } = store;

  const presets = PRESETS.map((c) => {
    const r = d.challenges[c.key];
    return Row({ title: c.title, sub: `+${c.step} BPM каждые ${c.every} повторов`, badge: r && r.done ? '✓ ' + r.date.slice(5) : null, chevron: true, onclick: () => openPattern(c.pid, c) });
  });

  const parts = d.parts.map((rec) => h('div', { class: 'item' },
    h('button', { class: 'grow', style: 'text-align:left', onclick: () => openPattern(rec.id) },
      h('div', { class: 't' }, rec.name), h('div', { class: 's' }, `${rec.bars.length} такт. · ${d.best[rec.id] ? 'рекорд ' + d.best[rec.id] + ' BPM' : 'ещё не играли'}`)),
    Pill({ text: '✕', onclick: () => {
      if (!confirm('Удалить партию «' + rec.name + '»?')) return;
      store.removePart(rec.id); delete byId[rec.id]; go();
    } })));

  return Screen(
    Title('Челленджи ', h('span', { class: 'beta' }, 'β')),
    Note('Темп растёт сам. Дойди до цели и сыграй фразу ещё раз на целевом темпе — челлендж засчитан.'),
    Section('Готовые'), List(presets),
    Section('Свой'),
    List([
      Row({ title: 'Выбрать рудимент или паттерн', sub: 'Свои темпы: старт, цель, шаг', chevron: true, onclick: () => go({ chView: 'custom' }) }),
      Row({ title: 'Партия из файла', sub: 'Guitar Pro (.gp) или MIDI, до 4 тактов', chevron: true, onclick: () => go({ chView: 'import', imp: null }) })]),
    parts.length ? [Section('Мои партии'), List(parts)] : null);
}

function CustomChallenge() {
  const P = S.cparams;
  const picks = PATS.filter((p) => p.cat === S.ccat).map((p) => Row({ title: p.name, badge: S.cpick === p.id ? '✓' : null, selected: S.cpick === p.id, onclick: () => go({ cpick: p.id }) }));
  const begin = () => {
    if (!S.cpick) { alert('Выбери паттерн'); return; }
    if (P.to <= P.from) { alert('Цель должна быть выше стартового темпа'); return; }
    const p = byId[S.cpick];
    openPattern(p.id, { key: null, pid: p.id, from: P.from, to: P.to, step: P.step, every: P.every, title: challengeTitle(p.name, P.from, P.to) });
  };
  return Screen(
    TopBar({ title: 'Свой челлендж', onBack: closeSub }),
    Tabs(CATS, S.ccat, (ccat) => go({ ccat })),
    List(picks, 'max-height:38vh;overflow-y:auto'),
    Options(
      NumberField({ label: 'Стартовый темп', obj: P, key: 'from', min: 30, max: 250 }),
      NumberField({ label: 'Цель, BPM', obj: P, key: 'to', min: 40, max: 260 }),
      NumberField({ label: 'Прибавлять BPM', obj: P, key: 'step', min: 1, max: 20 }),
      NumberField({ label: 'Каждые N повторов', obj: P, key: 'every', min: 1, max: 32 })),
    BigButton({ text: 'Начать челлендж', onclick: begin }));
}
