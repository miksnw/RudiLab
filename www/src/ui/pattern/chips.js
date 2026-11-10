/**
 * Лента чипов настроек метронома (вариант D дизайна): Клик · Звук · Цикл · Auto.
 * Нажатие по чипу включает/выключает; чип Auto открывает всплывашку с параметрами.
 * В челлендже остаются только «Метроном» и «Звук» — темп и цикл задаёт сам челлендж.
 */
import { h } from '../../core/dom.js';
import { clamp } from '../../core/time.js';
import { Chip } from '../kit.js';

function Stepper({ label, obj, key, min, max, prefix = '', onChange }) {
  const val = h('b', null, prefix + obj[key]);
  const set = (d) => { obj[key] = clamp(obj[key] + d, min, max); val.textContent = prefix + obj[key]; onChange(); };
  return h('div', { class: 'f' }, label,
    h('div', { class: 'st' }, h('button', { 'aria-label': 'Меньше', onclick: () => set(-1) }, '−'), val, h('button', { 'aria-label': 'Больше', onclick: () => set(1) }, '+')));
}

export function SettingsChips({ settings, auto, challenge, engine, store }) {
  const save = () => store.save();
  const wrap = h('div', { class: 'chipwrap' });
  const row = h('div', { class: 'chips' });
  let popup = null;

  const toggle = (key, apply) => (on) => { settings[key] = on; save(); apply(on); };
  const simple = (text, get, set) => {
    const chip = Chip({ text, on: get(), onclick: () => { const v = !get(); set(v); chip.classList.toggle('on', v); } });
    return chip;
  };
  row.append(
    simple('Клик', () => settings.click, toggle('click', (v) => { engine.click = v; })),
    simple('Звук', () => settings.sound, toggle('sound', (v) => { engine.sound = v; })));

  if (!challenge) {
    row.append(simple('Цикл', () => settings.loop !== false, toggle('loop', (v) => engine.setLoop(v))));
    const label = () => `Auto +${auto.step}/${auto.every} ›`;
    const chip = Chip({ text: label(), on: auto.on, onclick: (e) => { e.stopPropagation(); popup ? closePopup() : openPopup(); } });
    const refresh = () => { chip.textContent = label(); chip.classList.toggle('on', auto.on); };
    const closePopup = () => { if (popup) { popup.remove(); popup = null; chip.classList.remove('open'); document.removeEventListener('click', outside); } };
    const outside = (e) => { if (popup && !popup.contains(e.target)) closePopup(); };
    const openPopup = () => {
      const sw = h('div', { class: 'sw' + (auto.on ? ' on' : '') });
      sw.addEventListener('click', () => { auto.on = !auto.on; sw.classList.toggle('on', auto.on); save(); refresh(); });
      popup = h('div', { class: 'pop' },
        h('div', { class: 'ph' }, h('b', null, 'Auto BPM'), sw),
        h('div', { class: 'sub' }, 'Темп растёт сам, пока ты играешь'),
        h('div', { class: 'fs' },
          Stepper({ label: 'Прибавлять BPM', obj: auto, key: 'step', min: 1, max: 20, prefix: '+', onChange: () => { save(); refresh(); } }),
          Stepper({ label: 'Каждые N повторов', obj: auto, key: 'every', min: 1, max: 32, onChange: () => { save(); refresh(); } }),
          Stepper({ label: 'До максимума', obj: auto, key: 'max', min: 40, max: 260, onChange: save })));
      wrap.append(popup); chip.classList.add('open');
      setTimeout(() => document.addEventListener('click', outside)); // после текущего клика
    };
    row.append(chip);
    wrap.cleanup = closePopup;
  }
  wrap.append(row);
  return wrap;
}
