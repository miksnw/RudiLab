/** Готовые челленджи: паттерн + диапазон темпа. Паттерны ищутся по имени. */
import { PATS } from './patterns.js';

// key — стабильный ключ прогресса (не менять, иначе потеряются отметки «пройдено»)
const preset = (key, pattern, from, to, step = 5, every = 4) => ({ key: `ch:${key}`, pattern, from, to, step, every });

const DEFINITIONS = [
  preset('single-stroke', 'Single Stroke Roll', 80, 140),
  preset('double-stroke', 'Double Stroke Open Roll', 70, 120),
  preset('paradiddle', 'Single Paradiddle', 70, 120),
  preset('double-para', 'Double Paradiddle', 60, 100),
  preset('triple-stroke', 'Triple Stroke Roll', 60, 100),
  preset('five-stroke', 'Five Stroke Roll', 60, 100),
  preset('flam-accent', 'Flam Accent', 60, 100),
  preset('accents-332', 'Группировка 3-3-2-3-3-2', 70, 110),
  preset('rlk', 'RLK (триоли)', 60, 100),
  preset('rlrk', 'RLRK', 70, 110),
  preset('rock8', 'Рок-бит 8-е', 80, 130),
  preset('double-bass', 'Двойная бочка 16-е', 60, 100),
];

export const challengeTitle = (name, from, to) => `${name}: ${from} → ${to} BPM`;

export const PRESETS = DEFINITIONS.flatMap((def) => {
  const p = PATS.find((x) => x.name === def.pattern);
  if (!p) return [];
  return [{ ...def, pid: p.id, title: challengeTitle(p.name, def.from, def.to) }];
});

