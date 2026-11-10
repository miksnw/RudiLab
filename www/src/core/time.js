/** Чистые функции форматирования времени и чисел (без DOM, их легко тестировать). */
export const pad = (n) => String(n).padStart(2, '0');
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Локальная дата как ключ 'YYYY-MM-DD'. */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 45 с, 12 мин, 1 ч 05 м */
export function duration(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec} с`;
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  return `${Math.floor(sec / 3600)} ч ${pad(Math.round((sec % 3600) / 60))} м`;
}

/** Секундомер: 2:05 */
export const clock = (sec) => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;
