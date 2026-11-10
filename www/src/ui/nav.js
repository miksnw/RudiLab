import { h } from '../core/dom.js';
import { S, go } from './state.js';

export const TABS = [['practice', 'Практика'], ['today', 'Сегодня'], ['challenges', 'Челленджи'], ['records', 'Записи']];

export const Nav = () => h('div', { class: 'nav' }, TABS.map(([id, label]) =>
  h('button', { class: S.tab === id ? 'on' : '', onclick: () => go({ tab: id }) }, label)));
