/**
 * Планировщик шагов метронома. Чистая логика: не знает ни про AudioContext, ни про DOM —
 * время берёт из переданных часов now(), поэтому его можно гонять в тестах с «ручными» часами.
 *
 * Идея «lookahead»: таймер (грубый, с дрожанием) периодически вызывает tick(), а tick() заранее
 * выдаёт все шаги, которые попадают в окно now()+lookahead, с ТОЧНЫМ временем звука.
 * Дрожание таймера не влияет на ритм, пока оно меньше lookahead.
 */
export const LOOKAHEAD_SEC = 0.18;

export class Scheduler {
  /**
   * @param {{ now: () => number, lookahead?: number }} opts
   */
  constructor({ now, lookahead = LOOKAHEAD_SEC }) {
    this.now = now;
    this.lookahead = lookahead;
    this.loop = true;
    this.onCycle = null;   // (номер завершённого прохода) => void; может менять bpm/loop
    this.reset({ len: 1, div: 1 }, 60, 0);
  }

  /** Начать с шага 0 в момент startAt. pattern: { len, div }. */
  start(pattern, bpm, startAt) { this.reset(pattern, bpm, startAt); }

  reset(pattern, bpm, startAt) {
    this.len = pattern.len;
    this.div = pattern.div;
    this.bpm = bpm;
    this.next = startAt;   // время звучания следующего шага
    this.idx = 0;
    this.cycles = 0;
    this.finishing = false; // true: последний шаг выдан, новых не будет
  }

  get stepSec() { return 60 / this.bpm / this.div; }

  /** Выдать все шаги внутри окна. Возвращает [{ i, t }]. */
  tick() {
    const out = [];
    if (this.finishing) return out;
    const horizon = this.now() + this.lookahead;
    while (this.next < horizon) {
      out.push({ i: this.idx, t: this.next });
      this.next += this.stepSec; // длительность считаем по темпу ДО возможной смены в onCycle
      if (++this.idx >= this.len) {
        this.idx = 0;
        this.cycles++;
        if (this.onCycle) this.onCycle(this.cycles);
        if (!this.loop) { this.finishing = true; break; }
      }
    }
    return out;
  }
}
