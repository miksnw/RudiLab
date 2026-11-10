/**
 * Хранилище данных пользователя (localStorage) — настройки, рекорды, дни практики, партии.
 * Принимает storage снаружи, поэтому тестируется без браузера.
 */
import { dayKey, hhmm } from './time.js';

const KEY = 'rudimentlab.v1';
const MIN_SESSION_SEC = 10; // короче — не записываем в историю
const HIST_LIMIT = 40;

const defaults = () => ({
  plan: [],        // id паттернов «на сегодня»
  best: {},        // id -> максимальный BPM
  hist: {},        // id -> [{ d, bpm, sec }]
  days: {},        // 'YYYY-MM-DD' -> { sec, sessions: [{ id, sec, bpm, max, t }] }
  last: {},        // id -> дата последней практики
  lastBpm: {},     // id -> темп, на котором закончили
  parts: [],       // импортированные партии
  challenges: {},  // key -> { done, best, date }
  settings: {
    click: true, sound: true, loop: true, view: 'tiles',
    visualOffsetMs: 0, // ручная подстройка подсветки относительно звука
    auto: { on: false, step: 5, every: 4, max: 200 },
  },
});

export function createStore(storage = globalThis.localStorage, key = KEY) {
  const data = defaults();
  const mergeSettings = (settings) => {
    const base = defaults().settings; // свежие значения по умолчанию, не затронутые загруженными данными
    return { ...base, ...settings, auto: { ...base.auto, ...(settings || {}).auto } };
  };
  try {
    const raw = JSON.parse(storage.getItem(key));
    if (raw && typeof raw === 'object') {
      Object.assign(data, raw);
      data.settings = mergeSettings(raw.settings);
    }
  } catch { /* первый запуск или битые данные — начинаем с нуля */ }

  const save = () => { try { storage.setItem(key, JSON.stringify(data)); } catch { /* приватный режим и т.п. */ } };

  return {
    d: data,
    save,

    /** Записать тренировку; короче MIN_SESSION_SEC только запоминает темп. */
    recordSession(id, sec, bpm, maxBpm, now = new Date()) {
      if (sec < MIN_SESSION_SEC) { data.lastBpm[id] = bpm; save(); return false; }
      const day = dayKey(now);
      const rec = (data.days[day] ||= { sec: 0, sessions: [] });
      rec.sec += sec;
      rec.sessions.push({ id, sec: Math.round(sec), bpm, max: maxBpm, t: hhmm(now) });
      data.last[id] = day;
      data.best[id] = Math.max(data.best[id] || 0, maxBpm);
      const hist = (data.hist[id] ||= []);
      hist.push({ d: day, bpm: maxBpm, sec: Math.round(sec) });
      if (hist.length > HIST_LIMIT) hist.shift();
      data.lastBpm[id] = bpm;
      save();
      return true;
    },

    secOnDay: (day) => (data.days[day] && data.days[day].sec) || 0,

    inPlan: (id) => data.plan.includes(id),
    togglePlan(id) {
      data.plan = data.plan.includes(id) ? data.plan.filter((x) => x !== id) : [...data.plan, id];
      save();
      return data.plan.includes(id);
    },
    removeFromPlan(id) { data.plan = data.plan.filter((x) => x !== id); save(); },
    setPlan(ids) { data.plan = ids; save(); },

    markChallenge(challengeKey, bpm, now = new Date()) {
      const prev = data.challenges[challengeKey] || {};
      data.challenges[challengeKey] = { done: true, best: Math.max(prev.best || 0, bpm), date: dayKey(now) };
      save();
    },

    addPart(rec) { data.parts.push(rec); save(); },
    removePart(id) {
      data.parts = data.parts.filter((p) => p.id !== id);
      data.plan = data.plan.filter((x) => x !== id);
      save();
    },

    exportJSON: () => JSON.stringify(data),
    /** Подмешивает данные из JSON; бросает ошибку при мусоре. */
    importJSON(text) {
      const raw = JSON.parse(text);
      if (!raw || typeof raw !== 'object') throw new Error('bad data');
      Object.assign(data, raw);
      data.settings = mergeSettings(data.settings);
      save();
    },
  };
}
