/** Плитки: резиновая сетка, колонка = шаг, внутри плитки по ударам (хет сверху, бочка снизу). */
import { h } from '../../core/dom.js';
import { layoutRows, LIMB_ORDER, hitClass } from './layout.js';

/** @returns {{ el: HTMLElement, setCur(i: number|null): void }} */
export function renderTiles(p) {
  const perRow = p.perRow || 4;
  const columns = [];
  const grid = h('div', { class: 'grid' });

  for (const idxs of layoutRows(p)) {
    const line = h('div', { class: 'line', style: `--cols:${perRow};--ratio:${p.ratio || 1.15}` });
    for (const i of idxs) {
      const beat = i % p.div === 0 ? ' b1' : '';
      const hits = p.parsed[i].slice().sort((a, b) => LIMB_ORDER[a.limb] - LIMB_ORDER[b.limb]);
      const tiles = hits.length
        ? hits.map((x) => h('div', { class: 'tile' + beat }, h('span', { class: hitClass(p, x) }, x.mod ? h('sup', null, x.mod) : null, x.limb === 'RD' ? 'R' : x.limb, x.buzz ? '~' : '')))
        : [h('div', { class: 'tile rest' + beat }, h('span', null, '·'))];
      const col = h('div', { class: 'step' }, h('div', { class: 'stack', style: `--n:${tiles.length}` }, tiles));
      columns[i] = col;
      line.append(col);
    }
    for (let k = line.children.length; k < perRow; k++) line.append(h('div', { class: 'step ghost' }));
    grid.append(line);
  }
  // скрытые шаги подсвечивают ближайшую колонку слева
  for (let i = 0; i < p.steps.length; i++) columns[i] ||= columns[i - 1];

  let current = null;
  return {
    el: grid,
    setCur(i) {
      if (current) current.classList.remove('cur');
      current = i == null ? null : columns[i];
      if (current) current.classList.add('cur');
    },
  };
}
