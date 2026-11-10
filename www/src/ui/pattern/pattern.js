/** Экран тренировки паттерна: вид (плитки/ноты), темп, старт/стоп, настройки, история. */
import { h } from '../../core/dom.js';
import { clamp, clock, duration } from '../../core/time.js';
import { store } from '../../core/services.js';
import { engine } from '../../audio/engine.js';
import { renderStaff } from '../../notation/staff.js';
import { Session, BPM_MIN, BPM_MAX } from '../session.js';
import { closePattern, onCleanup } from '../state.js';
import { TopBar, Note, Options, OptionRow } from '../kit.js';
import { SettingsChips } from './chips.js';
import { renderTiles } from './tiles.js';

const LEGEND_IMP = [['H', 'хет'], ['S', 'малый'], ['K', 'бочка'], ['T1', 'том 1'], ['T2', 'том 2'], ['T3', 'том 3'], ['C', 'крэш'], ['RD', 'райд']];
const LEGEND_KIT = [['R', 'правая'], ['L', 'левая'], ['S', 'малый'], ['K', 'бочка'], ['H', 'хет'], ['X', 'крэш']];

const legend = (items) => h('div', { class: 'legend' }, items.map(([l, t]) => (t ? h('span', { class: 'c-' + l }, (l === 'RD' ? 'R' : l) + ' ' + t) : h('span', null, l))));
const legendFor = (p) => legend(p.cat === 'imp' ? LEGEND_IMP : p.cat === 'kit' ? LEGEND_KIT : [['R', 'правая'], ['L', 'левая'], ...(p.hasSoft ? [['рамка = акцент']] : [])]);

export function PatternScreen(p, challenge) {
  const { d } = store, settings = d.settings;
  const isImport = p.cat === 'imp';
  let view = isImport && settings.view === 'staff' ? 'staff' : 'tiles';
  let picture = null; // { el, setCur }

  /* ---- нотная часть / плитки ---- */
  const stage = h('div');
  const drawStage = () => {
    picture = view === 'staff' ? renderStaff(p) : renderTiles(p);
    stage.replaceChildren(picture.el);
  };
  const viewBar = isImport ? h('div', { class: 'data-row', style: 'margin:0 0 10px' }, [['tiles', 'Плитки'], ['staff', 'Ноты']].map(([id, label]) =>
    h('button', { class: 'pill vbtn' + (view === id ? ' on' : ''), onclick: (e) => {
      view = settings.view = id; store.save(); drawStage();
      e.target.parentNode.querySelectorAll('.vbtn').forEach((b) => b.classList.toggle('on', b === e.target));
    } }, label))) : null;

  /* ---- темп ---- */
  const bpmNum = h('div', { class: 'bpmnum' });
  const slider = h('input', { type: 'range', min: BPM_MIN, max: BPM_MAX });
  const goalBar = challenge ? h('div', { class: 'goal' }, h('i')) : null;
  const goalText = challenge ? h('div', { class: 'sub', style: 'margin-top:6px' }) : null;
  const timer = h('div', { class: 'timer' }, 'Время: 0:00');
  const banner = h('div', { class: 'done', style: 'display:none' }, '✓ Челлендж пройден!');
  const start = h('button', { class: 'go' }, '▶ Старт');
  const info = h('div');
  let timerId = 0;

  const showBpm = (bpm) => {
    bpmNum.replaceChildren(String(bpm), h('small', null, 'BPM'));
    slider.value = bpm;
    if (challenge) {
      goalBar.firstChild.style.width = clamp((bpm - challenge.from) / Math.max(1, challenge.to - challenge.from) * 100, 0, 100) + '%';
      goalText.textContent = `Цель: ${challenge.to} BPM · старт ${challenge.from} · +${challenge.step} каждые ${challenge.every} повтор.`;
    }
  };

  const session = new Session({
    store, engine, pattern: p, challenge,
    handlers: {
      step: (i) => picture.setCur(i),
      bpm: showBpm,
      complete: () => { banner.style.display = 'block'; },
      end: ({ sec, saved, maxBpm }) => {
        picture.setCur(null);
        clearInterval(timerId);
        start.textContent = '▶ Старт'; start.classList.remove('stop');
        timer.textContent = saved ? `Сохранено: ${clock(sec)} · макс. ${maxBpm} BPM` : 'Меньше 10 секунд — не записано';
        drawInfo();
      },
    },
  });

  const nudge = (n) => h('button', { class: 'adj', onclick: () => session.setBpm(session.bpm + n) }, (n > 0 ? '+' : '−') + Math.abs(n));
  slider.addEventListener('input', () => session.setBpm(+slider.value));

  start.addEventListener('click', () => {
    if (session.running) { session.end(); return; }
    banner.style.display = 'none';
    session.begin();
    start.textContent = '■ Стоп'; start.classList.add('stop');
    timerId = setInterval(() => { timer.textContent = 'Время: ' + clock(session.elapsedSec); }, 500);
  });

  // уходим с экрана или сворачиваем приложение — останавливаем и записываем
  const onHide = () => { if (document.hidden) session.end(); };
  document.addEventListener('visibilitychange', onHide);
  onCleanup(() => { session.end(); clearInterval(timerId); document.removeEventListener('visibilitychange', onHide); });

  /* ---- рекорды и история ---- */
  function drawInfo() {
    const hist = d.hist[p.id] || [];
    info.replaceChildren(Options(
      OptionRow('Рекорд BPM', d.last[p.id] ? 'Последняя практика: ' + d.last[p.id] : 'Пока нет записей',
        h('b', { class: 'badge', style: 'color:var(--amber);font-size:22px' }, d.best[p.id] ? String(d.best[p.id]) : '—')),
      hist.length ? h('div', { class: 'opt', style: 'display:block' }, h('div', { class: 'sub' }, 'Последние сессии (дата · BPM · время)'),
        h('div', { class: 'hist' }, hist.slice(-8).reverse().map((x) => h('span', null, `${x.d.slice(5)} · ${x.bpm} · ${duration(x.sec)}`)))) : null));
  }

  /* ---- план ---- */
  const planBtn = h('button', { class: 'pill' });
  const paintPlan = () => { const on = store.inPlan(p.id); planBtn.className = 'pill' + (on ? ' on' : ''); planBtn.textContent = on ? '★ В плане' : '☆ В план'; };
  planBtn.addEventListener('click', () => { store.togglePlan(p.id); paintPlan(); });

  /* ---- настройки: лента чипов под темпом ---- */
  const chips = SettingsChips({ settings, auto: session.auto, challenge, engine, store });
  onCleanup(() => chips.cleanup && chips.cleanup());

  drawStage(); showBpm(session.bpm); drawInfo(); paintPlan();
  // сверху прокручивается всё содержимое, панель темпа закреплена внизу
  return h('div', { class: 'screen practice' },
    h('div', { class: 'scroll' },
      TopBar({ title: p.name, onBack: closePattern, right: planBtn }),
      challenge ? Note(challenge.title) : Note(p.note),
      viewBar, stage, legendFor(p), info),
    h('div', { class: 'dock' },
      h('div', { class: 'bpmrow' }, nudge(-5), nudge(-1), bpmNum, nudge(1), nudge(5)),
      slider, goalBar, goalText, chips, start, banner, timer));
}
