/** Чистые расчёты статистики практики (без DOM и хранилища — на вход функция secOnDay). */
import { dayKey } from './time.js';

const daysAgo = (now, n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);

/** Секунд практики за последние 7 дней, включая сегодня. */
export function weekSeconds(secOnDay, now = new Date()) {
  let total = 0;
  for (let i = 0; i < 7; i++) total += secOnDay(dayKey(daysAgo(now, i)));
  return total;
}

/** Дней подряд с практикой; если сегодня ещё не играли, серия считается от вчера. */
export function streak(secOnDay, now = new Date()) {
  let n = 0, i = secOnDay(dayKey(now)) > 0 ? 0 : 1;
  while (secOnDay(dayKey(daysAgo(now, i))) > 0) { n++; i++; }
  return n;
}

/** Уровень «яркости» дня в календаре 0..4 по секундам практики. */
export function dayLevel(sec) {
  return sec === 0 ? 0 : sec < 300 ? 1 : sec < 900 ? 2 : sec < 1800 ? 3 : 4;
}

/** Календарь месяца с понедельника: { lead: пустых клеток до 1-го числа, days: число дней }. */
export function monthShape(year, month) {
  return { lead: (new Date(year, month, 1).getDay() + 6) % 7, days: new Date(year, month + 1, 0).getDate() };
}

/**
 * «Подобрать 5»: из паттернов вне плана берём 14 давно не игранных и случайно выбираем count.
 * rnd — источник случайности (для тестов).
 */
export function pickForPlan(patterns, plan, lastPlayed, count = 5, rnd = Math.random) {
  const pool = patterns
    .filter((p) => !plan.includes(p.id))
    .sort((a, b) => (lastPlayed[a.id] || '').localeCompare(lastPlayed[b.id] || ''))
    .slice(0, 14);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map((p) => p.id);
}
