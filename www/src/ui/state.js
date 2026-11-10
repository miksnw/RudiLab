/**
 * Состояние интерфейса и навигация. go({...}) меняет состояние и перерисовывает приложение.
 * Экраны регистрируют освобождение ресурсов через onCleanup() — оно выполнится перед следующей отрисовкой.
 */
import { dayKey } from '../core/time.js';

export const S = {
  tab: 'practice',        // practice | today | challenges | records
  cat: 'rud',             // категория в списке практики
  pat: null,              // id открытого паттерна (полный экран)
  challenge: null,        // активный челлендж для открытого паттерна
  chView: null,           // null | 'custom' | 'import'
  ccat: 'rud', cpick: null, cparams: { from: 70, to: 110, step: 5, every: 4 }, // свой челлендж
  imp: null,              // состояние мастера импорта
  month: new Date(), sel: dayKey(), // календарь записей
};

let renderer = () => {};
const cleanups = [];

export const setRenderer = (fn) => { renderer = fn; };
export const go = (patch = {}) => { Object.assign(S, patch); renderer(); };
export const openPattern = (id, challenge = null) => go({ pat: id, challenge });
export const closePattern = () => go({ pat: null, challenge: null });

export const onCleanup = (fn) => { cleanups.push(fn); };
export const runCleanups = () => { while (cleanups.length) cleanups.pop()(); };
