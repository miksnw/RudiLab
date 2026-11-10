/**
 * Набор компонентов интерфейса. Экраны собираются только из них — чтобы поменять вид
 * (отступы, кнопки, строки списка) достаточно править здесь и в style/components.css.
 */
import { h } from '../core/dom.js';
import { clamp } from '../core/time.js';

/* ---- каркас ---- */
export const Screen = (...kids) => h('div', { class: 'screen' }, kids);
export const Title = (...kids) => h('h1', null, kids);
export const Section = (text) => h('h2', { text });
export const Note = (text) => (text ? h('div', { class: 'note' }, text) : null);
export const ErrorBox = (text) => h('div', { class: 'err' }, text);
export const TopBar = ({ title, onBack, right }) =>
  h('div', { class: 'top' }, onBack ? h('button', { class: 'back', onclick: onBack }, '‹') : null, h('div', { class: 'name' }, title), right);

/* ---- кнопки ---- */
export const Pill = ({ text, on = false, onclick, cls = '' }) =>
  h('button', { class: 'pill' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), onclick }, text);
export const BigButton = ({ text, onclick, cls = '', style }) => h('button', { class: 'go' + (cls ? ' ' + cls : ''), style, onclick }, text);
/** Чип-переключатель: точка слева горит, когда включено. */
export const Chip = ({ text, on = false, onclick }) => h('button', { class: 'ch' + (on ? ' on' : ''), onclick }, text);
export const ActionRow = (...kids) => h('div', { class: 'data-row' }, kids);
export const Tabs = (items, active, onPick) =>
  h('div', { class: 'tabs' }, items.map(({ id, name }) => h('button', { class: 'tab' + (active === id ? ' on' : ''), onclick: () => onPick(id) }, name)));

/* ---- списки ---- */
export const List = (rows, style) => h('div', { class: 'list', style }, rows);
export const Empty = (text) => List(h('div', { class: 'empty' }, text));
/** Строка списка: заголовок, подпись, бейдж справа, шеврон. */
export function Row({ title, prefix, sub, badge, chevron = false, selected = false, dim = false, onclick }) {
  return h('button', { class: 'item' + (selected ? ' sel' : ''), style: dim ? 'opacity:.45' : null, onclick },
    h('div', { class: 'grow' }, h('div', { class: 't' }, prefix, title), sub ? h('div', { class: 's' }, sub) : null),
    badge ? h('span', { class: 'badge' }, badge) : null,
    chevron ? h('span', { class: 'chev' }, '›') : null);
}

/* ---- статистика ---- */
export const Stat = (value, label) => h('div', { class: 'stat' }, h('b', null, value), h('span', null, label));
export const Stats = (...stats) => h('div', { class: 'cards' }, stats);

/* ---- блок настроек ---- */
export const Options = (...rows) => h('div', { class: 'opts' }, rows);
export const OptionRow = (label, sub, control) =>
  h('div', { class: 'opt' }, h('div', null, h('div', null, label), sub ? h('div', { class: 'sub' }, sub) : null), control);

/** Переключатель, хранит состояние через get/set. */
export function Switch({ label, sub, get, set }) {
  const el = h('div', { class: 'sw' + (get() ? ' on' : '') });
  el.addEventListener('click', () => { set(!get()); el.classList.toggle('on', get()); });
  return OptionRow(label, sub, el);
}

/** Числовое поле: правит obj[key], значение ограничено min..max. */
export function NumberField({ label, sub, obj, key, min, max, prefix, onChange }) {
  const input = h('input', { type: 'number', inputmode: 'numeric', value: obj[key], min, max });
  input.addEventListener('change', () => {
    obj[key] = clamp(parseInt(input.value, 10) || min, min, max);
    input.value = obj[key];
    if (onChange) onChange(obj[key]);
  });
  return h('div', { class: 'opt' },
    h('div', null, h('div', { class: 'sub' }, label), sub ? h('div', { class: 'sub' }, sub) : null),
    h('div', { class: 'num' }, prefix || null, input));
}
