(() => {
  'use strict';
  const { CATS, list: PATS } = window.PATTERNS;
  const byId = Object.fromEntries(PATS.map((p) => [p.id, p]));

  /* ================= helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'text') e.textContent = v;
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function dur(sec) {
    sec = Math.round(sec);
    if (sec < 60) return sec + ' с';
    if (sec < 3600) return Math.round(sec / 60) + ' мин';
    return Math.floor(sec / 3600) + ' ч ' + pad(Math.round((sec % 3600) / 60)) + ' м';
  }
  const clock = (sec) => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;

  /* ================= storage ================= */
  const store = {
    key: 'rudimentlab.v1',
    d: null,
    load() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(this.key)); } catch (e) { /* ignore */ }
      this.d = Object.assign({ plan: [], best: {}, hist: {}, days: {}, last: {}, lastBpm: {}, settings: {}, parts: [], challenges: {} }, raw || {});
      const s = this.d.settings;
      if (s.click === undefined) s.click = true;
      if (s.sound === undefined) s.sound = true;
      if (s.loop === undefined) s.loop = true;
      (this.d.parts || []).forEach(registerPart);
      s.auto = Object.assign({ on: false, step: 5, every: 4, max: 200 }, s.auto || {});
    },
    save() { try { localStorage.setItem(this.key, JSON.stringify(this.d)); } catch (e) { /* ignore */ } },
    recordSession(id, sec, bpm, maxBpm) {
      const d = this.d, day = dkey();
      const rec = (d.days[day] = d.days[day] || { sec: 0, sessions: [] });
      rec.sec += sec;
      const n = new Date();
      rec.sessions.push({ id, sec: Math.round(sec), bpm, max: maxBpm, t: `${pad(n.getHours())}:${pad(n.getMinutes())}` });
      d.last[id] = day;
      d.best[id] = Math.max(d.best[id] || 0, maxBpm);
      (d.hist[id] = d.hist[id] || []).push({ d: day, bpm: maxBpm, sec: Math.round(sec) });
      if (d.hist[id].length > 40) d.hist[id].shift();
      d.lastBpm[id] = bpm;
      this.save();
    },
  };

  /* ================= pattern parsing ================= */
  const RE = /^([fd]?)([RLSKHXrlskhx])(~?)$/;
  function parseTok(tok) {
    if (tok === '-' || tok === '.') return [];
    return tok.split('+').map((p) => {
      const m = RE.exec(p);
      if (!m) return null;
      const ch = m[2];
      return { mod: m[1], ch, limb: ch.toUpperCase(), acc: ch === ch.toUpperCase(), buzz: !!m[3] };
    }).filter(Boolean);
  }
  for (const p of PATS) {
    p.parsed = p.steps.map(parseTok);
    p.hasSoft = p.parsed.some((hs) => hs.some((x) => 'RLS'.includes(x.limb) && !x.acc));
  }

  /* ================= audio engine ================= */
  const Engine = {
    ctx: null, master: null, noise: null,
    playing: false, bpm: 80, pat: null, idx: 0, next: 0, timer: null, queue: [], cycles: 0,
    click: true, sound: true, onStep: null, onCycle: null, onDone: null, raf: 0, loop: true, finishing: false,

    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noise = buf;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    noiseHit(t, { dur, freq, type, q = 1, gain }) {
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    },
    toneHit(t, { f0, f1, dur, gain, type = 'sine' }) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
    snare(t, v) {
      this.noiseHit(t, { dur: 0.15, freq: 2400, type: 'bandpass', q: 0.7, gain: 0.8 * v });
      this.toneHit(t, { f0: 240, f1: 170, dur: 0.09, gain: 0.5 * v, type: 'triangle' });
    },
    kick(t, v) {
      this.toneHit(t, { f0: 150, f1: 42, dur: 0.18, gain: 1.0 * v });
      this.noiseHit(t, { dur: 0.012, freq: 900, type: 'lowpass', gain: 0.3 * v });
    },
    hat(t, v) { this.noiseHit(t, { dur: 0.06, freq: 7500, type: 'highpass', gain: 0.45 * v }); },
    crash(t, v) { this.noiseHit(t, { dur: 1.2, freq: 4500, type: 'highpass', gain: 0.5 * v }); },
    tom(t, v, f) {
      this.toneHit(t, { f0: f, f1: f * 0.6, dur: 0.28, gain: 0.9 * v });
      this.noiseHit(t, { dur: 0.04, freq: 1500, type: 'bandpass', gain: 0.25 * v });
    },
    ride(t, v) {
      this.noiseHit(t, { dur: 0.55, freq: 6500, type: 'highpass', gain: 0.28 * v });
      this.toneHit(t, { f0: 3400, f1: 3300, dur: 0.3, gain: 0.07 * v, type: 'triangle' });
    },
    openHat(t, v) { this.noiseHit(t, { dur: 0.3, freq: 7000, type: 'highpass', gain: 0.4 * v }); },
    clickSound(t, accent) {
      this.toneHit(t, { f0: accent ? 1700 : 1100, f1: accent ? 1600 : 1000, dur: 0.045, gain: 0.3 });
    },
    hit(x, t) {
      const v = x.v !== undefined ? x.v : (x.acc ? 1 : 0.55);
      const l = x.limb;
      if (l === 'R' || l === 'L' || l === 'S') {
        if (x.mod === 'f') this.snare(t - 0.04, 0.3);
        if (x.mod === 'd') { this.snare(t - 0.08, 0.3); this.snare(t - 0.04, 0.3); }
        if (x.buzz) for (let i = 0; i < 6; i++) this.snare(t + i * 0.022, v * (1 - i * 0.12));
        else this.snare(t, v);
      } else if (l === 'K') this.kick(t, v);
      else if (l === 'H') (x.open ? this.openHat(t, v) : this.hat(t, v));
      else if (l === 'X' || l === 'C') this.crash(t, v);
      else if (l === 'RD') this.ride(t, v);
      else if (l === 'T1') this.tom(t, v, 230);
      else if (l === 'T2') this.tom(t, v, 170);
      else if (l === 'T3') this.tom(t, v, 120);
    },

    start(pat, bpm) {
      this.ensure();
      this.pat = pat; this.bpm = bpm; this.idx = 0; this.cycles = 0; this.queue = []; this.finishing = false;
      this.next = this.ctx.currentTime + 0.15;
      this.playing = true;
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
      const loop = () => {
        if (!this.playing) return;
        const now = this.ctx.currentTime;
        let last = -1;
        while (this.queue.length && this.queue[0].t <= now) last = this.queue.shift().i;
        if (last >= 0 && this.onStep) this.onStep(last);
        if (this.finishing && !this.queue.length) { this.onDone && this.onDone(); return; }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    },
    stop() {
      this.playing = false;
      clearInterval(this.timer);
      cancelAnimationFrame(this.raf);
      this.queue = [];
    },
    tick() {
      const p = this.pat;
      if (this.finishing) return;
      while (this.next < this.ctx.currentTime + 0.15) {
        const i = this.idx, t = this.next;
        if (this.sound) for (const x of p.parsed[i]) this.hit(x, t);
        if (this.click && i % p.div === 0) this.clickSound(t, i === 0);
        this.queue.push({ t, i });
        this.next += 60 / this.bpm / p.div;
        this.idx++;
        if (this.idx >= p.steps.length) {
          this.idx = 0; this.cycles++;
          this.onCycle && this.onCycle(this.cycles);
          if (!this.loop) { this.finishing = true; return; }
        }
      }
    },
  };

  /* ================= импортированные партии ================= */
  function registerPart(rec) {
    const p = {
      id: rec.id, cat: 'imp', name: rec.name, note: rec.note || '', div: rec.div, bpm: rec.bpm,
      parsed: rec.parsed, steps: rec.parsed.map((hs) => (hs.length ? 'x' : '-')), bars: rec.bars,
      perRow: rec.div === 4 ? 8 : rec.div, ar: 1.7, hasSoft: false, custom: true,
    };
    byId[p.id] = p;
    return p;
  }

  /* ================= state / router ================= */
  const S = { tab: 'practice', cat: 'rud', pat: null, ch: null, chView: null, ccat: 'rud', cpick: null, cparams: { from: 70, to: 110, step: 5, every: 4 }, imp: null, month: new Date(), sel: dkey() };
  store.load();

  function render() {
    const app = $('#app');
    app.innerHTML = '';
    if (S.pat) { app.append(PatternScreen(byId[S.pat], S.ch)); return; }
    app.append(S.tab === 'practice' ? PracticeScreen() : S.tab === 'today' ? TodayScreen() : S.tab === 'challenges' ? ChallengesScreen() : RecordsScreen(), Nav());
  }
  function Nav() {
    const b = (id, label) => h('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; render(); } }, label);
    return h('div', { class: 'nav' }, b('practice', 'Практика'), b('today', 'Сегодня'), b('challenges', 'Челленджи'), b('records', 'Записи'));
  }
  function open(id, ch) { S.pat = id; S.ch = ch || null; render(); }

  /* ================= practice list ================= */
  function PracticeScreen() {
    const d = store.d;
    const tabs = h('div', { class: 'tabs' }, CATS.map((c) =>
      h('button', { class: 'tab' + (S.cat === c.id ? ' on' : ''), onclick: () => { S.cat = c.id; render(); } }, c.name)));
    const items = PATS.filter((p) => p.cat === S.cat).map((p) => {
      const last = d.last[p.id];
      return h('button', { class: 'item', onclick: () => open(p.id) },
        h('div', { class: 'grow' },
          h('div', { class: 't' }, d.plan.includes(p.id) ? h('span', { class: 'star' }, '★ ') : null, p.name),
          h('div', { class: 's' }, last ? 'Последняя практика: ' + last : 'Ещё не занимались')),
        d.best[p.id] ? h('span', { class: 'badge' }, '♩ ' + d.best[p.id]) : null,
        h('span', { class: 'chev' }, '›'));
    });
    return h('div', { class: 'screen' }, h('h1', { text: 'Rudiment Lab' }), tabs, h('div', { class: 'list' }, items));
  }

  /* ================= pattern screen ================= */
  const ORDER = { C: 0, X: 0, RD: 1, H: 2, T1: 3, R: 4, L: 4, S: 4, T2: 5, T3: 6, K: 9 }; // сверху вниз
  const LEGEND_IMP = [['H', 'хет'], ['S', 'малый'], ['K', 'бочка'], ['T1', 'том 1'], ['T2', 'том 2'], ['T3', 'том 3'], ['C', 'крэш'], ['RD', 'райд']];

  function PatternScreen(p, ch) {
    const d = store.d, st = d.settings;
    const auto = ch ? { on: true, step: ch.step, every: ch.every, max: ch.to } : st.auto;
    let bpm = ch ? ch.from : (d.lastBpm[p.id] || p.bpm);
    let maxBpm = bpm, startedAt = 0, ticker = 0, pendingShow = false;
    const isImp = p.cat === 'imp';
    let view = isImp && st.view === 'staff' ? 'staff' : 'tiles';
    const PR = p.perRow || 4, AR = p.ar || 1.15;

    /* ---- вид 1: плитки ---- */
    const stepEls = [];
    let staff = null;
    const tileClass = (x) => 'c-' + x.limb + (x.v !== undefined ? (x.v >= 1 ? ' acc' : x.v < 0.5 ? ' soft' : '')
      : (p.hasSoft && 'RLS'.includes(x.limb) ? (x.acc ? ' acc' : ' soft') : ''));
    // какие шаги показывать и как разбить на строки
    function layoutRows() {
      const rows = [];
      if (!isImp) {
        for (let r = 0; r * PR < p.steps.length; r++) rows.push(Array.from({ length: Math.min(PR, p.steps.length - r * PR) }, (_, k) => r * PR + k));
        return rows;
      }
      // импорт: в каждой доле — только нужная сетка (16-е, триоли, ...), такт начинается с новой строки
      const barStarts = new Set(p.bars.map((x) => x.start));
      let row = [];
      for (let s0 = 0; s0 < p.steps.length; s0 += p.div) {
        const s1 = Math.min(p.steps.length, s0 + p.div);
        let L = p.div;
        for (const cand of [2, 4, 3, 8, 6, 12, 24]) {
          if (p.div % cand) continue;
          const stp = p.div / cand;
          let ok = true;
          for (let i = s0; i < s1; i++) if (p.parsed[i].length && (i - s0) % stp) { ok = false; break; }
          if (ok) { L = cand; break; }
        }
        const stp = p.div / L, idxs = [];
        for (let i = s0; i < s1; i += stp) idxs.push(i);
        if (row.length && (row.length + idxs.length > PR || barStarts.has(s0))) { rows.push(row); row = []; }
        row.push(...idxs);
      }
      if (row.length) rows.push(row);
      return rows;
    }
    function buildTiles() {
      stepEls.length = 0;
      const grid = h('div', { class: 'grid' });
      for (const idxs of layoutRows()) {
        const line = h('div', { class: 'line', style: `--cols:${PR};--ar:${AR}` });
        for (const i of idxs) {
          const hits = p.parsed[i].slice().sort((x, y) => ORDER[x.limb] - ORDER[y.limb]);
          const b1 = i % p.div === 0 ? ' b1' : '';
          const el = h('div', { class: 'step' });
          const stack = h('div', { class: 'stack' });
          el.append(stack);
          if (!hits.length) stack.append(h('div', { class: 'tile rest' + b1 }, h('span', null, '·')));
          for (const x of hits) {
            stack.append(h('div', { class: 'tile' + b1 }, h('span', { class: tileClass(x) },
              x.mod ? h('sup', null, x.mod) : null, x.limb === 'RD' ? 'R' : x.limb, x.buzz ? '~' : '')));
          }
          stepEls[i] = el;
          line.append(el);
        }
        for (let k = idxs.length; k < PR; k++) line.append(h('div', { class: 'step ghost' }));
        grid.append(line);
      }
      // скрытые шаги подсвечиваем ближайшей колонкой слева
      for (let i = 0; i < p.steps.length; i++) if (!stepEls[i]) stepEls[i] = stepEls[i - 1];
      return grid;
    }
    const stage = h('div');
    function renderStage() {
      stage.innerHTML = '';
      staff = null;
      if (view === 'staff') { staff = Staff.render(p); stage.append(staff.el); } else stage.append(buildTiles());
      curEl = null;
    }
    let curEl = null;
    const setCur = (i) => {
      if (staff) { staff.setCur(i); return; }
      if (curEl) curEl.classList.remove('cur');
      curEl = i == null ? null : stepEls[i];
      if (curEl) curEl.classList.add('cur');
    };
    const viewBar = isImp ? h('div', { class: 'data-row', style: 'margin:0 0 10px' }, [['tiles', 'Плитки'], ['staff', 'Ноты']].map(([id, label]) =>
      h('button', { class: 'pill vbtn' + (view === id ? ' on' : ''), onclick: (e) => {
        view = id; st.view = id; store.save(); renderStage();
        e.target.parentNode.querySelectorAll('.vbtn').forEach((b) => b.classList.toggle('on', b === e.target));
      } }, label))) : null;

    /* ---- темп ---- */
    const bpmNum = h('div', { class: 'bpmnum' });
    const slider = h('input', { type: 'range', min: 30, max: 260, value: bpm });
    const goalBar = ch ? h('div', { class: 'goal' }, h('i')) : null;
    const goalTxt = ch ? h('div', { class: 'sub', style: 'margin-top:6px' }) : null;
    const showBpm = () => {
      bpmNum.innerHTML = ''; bpmNum.append(String(bpm), h('small', null, 'BPM')); slider.value = bpm;
      if (ch) {
        goalBar.firstChild.style.width = clamp((bpm - ch.from) / Math.max(1, ch.to - ch.from) * 100, 0, 100) + '%';
        goalTxt.textContent = `Цель: ${ch.to} BPM · старт ${ch.from} · +${ch.step} каждые ${ch.every} повтор.`;
      }
    };
    const setBpm = (v) => {
      bpm = clamp(Math.round(v), 30, 260);
      if (Engine.playing) { Engine.bpm = bpm; maxBpm = Math.max(maxBpm, bpm); }
      showBpm();
    };
    slider.addEventListener('input', () => setBpm(+slider.value));
    const adj = (n) => h('button', { class: 'adj', onclick: () => setBpm(bpm + n) }, (n > 0 ? '+' : '−') + Math.abs(n));

    const timer = h('div', { class: 'timer' }, 'Время: 0:00');
    const banner = h('div', { class: 'done', style: 'display:none' }, '✓ Челлендж пройден!');
    const info = h('div');
    const refreshInfo = () => {
      info.innerHTML = '';
      const hist = d.hist[p.id] || [];
      info.append(h('div', { class: 'opts' },
        h('div', { class: 'opt' }, h('div', null, h('div', null, 'Рекорд BPM'), h('div', { class: 'sub' }, d.last[p.id] ? 'Последняя практика: ' + d.last[p.id] : 'Пока нет записей')),
          h('b', { class: 'badge', style: 'color:var(--amber);font-size:22px' }, d.best[p.id] ? String(d.best[p.id]) : '—')),
        hist.length ? h('div', { class: 'opt', style: 'display:block' }, h('div', { class: 'sub' }, 'Последние сессии (дата · BPM · время)'),
          h('div', { class: 'hist' }, hist.slice(-8).reverse().map((x) => h('span', null, `${x.d.slice(5)} · ${x.bpm} · ${dur(x.sec)}`)))) : null));
    };

    /* ---- запуск ---- */
    const go = h('button', { class: 'go' }, '▶ Старт');
    function complete() {
      banner.style.display = 'block';
      if (ch.key) {
        const prev = d.challenges[ch.key] || {};
        d.challenges[ch.key] = { done: true, best: Math.max(prev.best || 0, bpm), date: dkey() };
        store.save();
      }
    }
    function begin() {
      Engine.click = st.click; Engine.sound = st.sound;
      Engine.loop = ch ? true : st.loop !== false;
      pendingShow = false; banner.style.display = 'none';
      Engine.onStep = (i) => {
        setCur(i);
        if (i === 0 && pendingShow) { pendingShow = false; showBpm(); }
      };
      Engine.onCycle = (n) => {
        if (ch && bpm >= ch.to) { complete(); Engine.loop = false; return; }
        if (auto.on && n % Math.max(1, auto.every) === 0 && bpm < auto.max) {
          bpm = Math.min(auto.max, bpm + auto.step);
          Engine.bpm = bpm; maxBpm = Math.max(maxBpm, bpm);
          pendingShow = true; // число обновится, когда зазвучит первый удар фразы
        }
      };
      Engine.onDone = () => end();
      maxBpm = bpm;
      Engine.start(p, bpm);
      startedAt = performance.now();
      go.textContent = '■ Стоп'; go.classList.add('stop');
      ticker = setInterval(() => { timer.textContent = 'Время: ' + clock((performance.now() - startedAt) / 1000); }, 250);
    }
    function end() {
      if (!Engine.playing) return;
      Engine.stop(); setCur(null);
      clearInterval(ticker);
      const sec = (performance.now() - startedAt) / 1000;
      go.textContent = '▶ Старт'; go.classList.remove('stop');
      if (pendingShow) { pendingShow = false; showBpm(); }
      if (sec >= 10) store.recordSession(p.id, sec, bpm, maxBpm);
      else d.lastBpm[p.id] = bpm, store.save();
      timer.textContent = sec >= 10 ? `Сохранено: ${clock(sec)} · макс. ${maxBpm} BPM` : 'Меньше 10 секунд — не записано';
      refreshInfo();
    }
    go.addEventListener('click', () => (Engine.playing ? end() : begin()));
    const onHide = () => { if (document.hidden) end(); };
    window.__leavePattern = () => { end(); document.removeEventListener('visibilitychange', onHide); window.__leavePattern = null; };
    document.addEventListener('visibilitychange', onHide);

    const sw = (label, sub, get, set) => {
      const el = h('div', { class: 'sw' + (get() ? ' on' : '') });
      el.addEventListener('click', () => { set(!get()); el.classList.toggle('on', get()); store.save(); });
      return h('div', { class: 'opt' }, h('div', null, h('div', null, label), sub ? h('div', { class: 'sub' }, sub) : null), el);
    };
    const numIn = (obj, key, min, max) => {
      const i = h('input', { type: 'number', inputmode: 'numeric', value: obj[key], min, max });
      i.addEventListener('change', () => { obj[key] = clamp(parseInt(i.value, 10) || min, min, max); i.value = obj[key]; store.save(); });
      return i;
    };
    const inPlan = () => d.plan.includes(p.id);
    const planBtn = h('button', { class: 'pill' + (inPlan() ? ' on' : '') }, inPlan() ? '★ В плане' : '☆ В план');
    planBtn.addEventListener('click', () => {
      if (inPlan()) d.plan = d.plan.filter((x) => x !== p.id); else d.plan.push(p.id);
      store.save();
      planBtn.className = 'pill' + (inPlan() ? ' on' : '');
      planBtn.textContent = inPlan() ? '★ В плане' : '☆ В план';
    });

    renderStage(); showBpm(); refreshInfo();
    const legend = isImp ? h('div', { class: 'legend' }, LEGEND_IMP.map(([l, t]) => h('span', { class: 'c-' + l }, (l === 'RD' ? 'R' : l) + ' ' + t))) :
      p.cat === 'kit' ? h('div', { class: 'legend' },
        h('span', { class: 'c-R' }, 'R правая'), h('span', { class: 'c-L' }, 'L левая'), h('span', { class: 'c-S' }, 'S малый'),
        h('span', { class: 'c-K' }, 'K бочка'), h('span', { class: 'c-H' }, 'H хет'), h('span', { class: 'c-X' }, 'X крэш')) :
        h('div', { class: 'legend' }, h('span', { class: 'c-R' }, 'R правая'), h('span', { class: 'c-L' }, 'L левая'), p.hasSoft ? h('span', null, 'рамка = акцент') : null);

    return h('div', { class: 'screen' },
      h('div', { class: 'top' },
        h('button', { class: 'back', onclick: () => { window.__leavePattern && window.__leavePattern(); S.pat = null; S.ch = null; render(); } }, '‹'),
        h('div', { class: 'name' }, p.name), planBtn),
      ch ? h('div', { class: 'note' }, ch.title) : null,
      p.note && !ch ? h('div', { class: 'note' }, p.note) : null,
      viewBar, stage, legend,
      h('div', { class: 'bpmbox' },
        h('div', { class: 'bpmrow' }, adj(-5), adj(-1), bpmNum, adj(1), adj(5)),
        slider, goalBar, goalTxt, go, banner, timer),
      h('div', { class: 'opts' },
        sw('Метроном', 'Клик на каждую долю', () => st.click, (v) => { st.click = v; Engine.click = v; }),
        sw('Звук ударов', 'Малый, бочка, хет, тома, тарелки', () => st.sound, (v) => { st.sound = v; Engine.sound = v; }),
        ch ? null : sw('Зацикливание', 'Выключено — сыграть один раз', () => st.loop !== false, (v) => { st.loop = v; Engine.loop = v; }),
        ch ? null : sw('Auto BPM', 'Темп растёт сам', () => auto.on, (v) => { auto.on = v; }),
        ch ? null : h('div', { class: 'opt' }, h('div', { class: 'sub' }, 'Прибавлять BPM'), h('div', { class: 'num' }, '+', numIn(auto, 'step', 1, 20))),
        ch ? null : h('div', { class: 'opt' }, h('div', { class: 'sub' }, 'Каждые N повторов'), h('div', { class: 'num' }, numIn(auto, 'every', 1, 32))),
        ch ? null : h('div', { class: 'opt' }, h('div', { class: 'sub' }, 'До максимума'), h('div', { class: 'num' }, numIn(auto, 'max', 40, 260)))),
      info);
  }

  /* ================= challenges ================= */
  const PRESETS = [
    { key: 'ch:single-stroke', pat: 'Single Stroke Roll', from: 80, to: 140, step: 5, every: 4 },
    { key: 'ch:double-stroke', pat: 'Double Stroke Open Roll', from: 70, to: 120, step: 5, every: 4 },
    { key: 'ch:paradiddle', pat: 'Single Paradiddle', from: 70, to: 120, step: 5, every: 4 },
    { key: 'ch:double-para', pat: 'Double Paradiddle', from: 60, to: 100, step: 5, every: 4 },
    { key: 'ch:triple-stroke', pat: 'Triple Stroke Roll', from: 60, to: 100, step: 5, every: 4 },
    { key: 'ch:five-stroke', pat: 'Five Stroke Roll', from: 60, to: 100, step: 5, every: 4 },
    { key: 'ch:flam-accent', pat: 'Flam Accent', from: 60, to: 100, step: 5, every: 4 },
    { key: 'ch:accents-332', pat: 'Группировка 3-3-2-3-3-2', from: 70, to: 110, step: 5, every: 4 },
    { key: 'ch:rlk', pat: 'RLK (триоли)', from: 60, to: 100, step: 5, every: 4 },
    { key: 'ch:rlrk', pat: 'RLRK', from: 70, to: 110, step: 5, every: 4 },
    { key: 'ch:rock8', pat: 'Рок-бит 8-е', from: 80, to: 130, step: 5, every: 4 },
    { key: 'ch:double-bass', pat: 'Двойная бочка 16-е', from: 60, to: 100, step: 5, every: 4 },
  ].map((c) => {
    const p = PATS.find((x) => x.name === c.pat);
    return p ? Object.assign(c, { pid: p.id, title: `${p.name}: ${c.from} → ${c.to} BPM` }) : null;
  }).filter(Boolean);

  function ChallengesScreen() {
    const d = store.d;
    if (S.chView === 'custom') return CustomChallenge();
    if (S.chView === 'import') return ImportScreen();

    const rows = PRESETS.map((c) => {
      const r = d.challenges[c.key];
      return h('button', { class: 'item', onclick: () => open(c.pid, c) },
        h('div', { class: 'grow' }, h('div', { class: 't' }, c.title), h('div', { class: 's' }, `+${c.step} BPM каждые ${c.every} повторов`)),
        r && r.done ? h('span', { class: 'badge' }, '✓ ' + r.date.slice(5)) : null,
        h('span', { class: 'chev' }, '›'));
    });
    const parts = (d.parts || []).map((rec) => h('div', { class: 'item' },
      h('button', { class: 'grow', style: 'text-align:left', onclick: () => open(rec.id) },
        h('div', { class: 't' }, rec.name), h('div', { class: 's' }, `${rec.bars.length} такт. · ${d.best[rec.id] ? 'рекорд ' + d.best[rec.id] + ' BPM' : 'ещё не играли'}`)),
      h('button', { class: 'pill', onclick: () => {
        if (!confirm('Удалить партию «' + rec.name + '»?')) return;
        d.parts = d.parts.filter((x) => x.id !== rec.id); d.plan = d.plan.filter((x) => x !== rec.id); delete byId[rec.id];
        store.save(); render();
      } }, '✕')));

    return h('div', { class: 'screen' },
      h('h1', null, 'Челленджи ', h('span', { class: 'beta' }, 'β')),
      h('div', { class: 'note' }, 'Темп растёт сам. Дойди до цели и сыграй фразу ещё раз на целевом темпе — челлендж засчитан.'),
      h('h2', { text: 'Готовые' }), h('div', { class: 'list' }, rows),
      h('h2', { text: 'Свой' }),
      h('div', { class: 'list' },
        h('button', { class: 'item', onclick: () => { S.chView = 'custom'; render(); } },
          h('div', { class: 'grow' }, h('div', { class: 't' }, 'Выбрать рудимент или паттерн'), h('div', { class: 's' }, 'Свои темпы: старт, цель, шаг')), h('span', { class: 'chev' }, '›')),
        h('button', { class: 'item', onclick: () => { S.chView = 'import'; S.imp = null; render(); } },
          h('div', { class: 'grow' }, h('div', { class: 't' }, 'Партия из файла'), h('div', { class: 's' }, 'Guitar Pro (.gp) или MIDI, до 4 тактов')), h('span', { class: 'chev' }, '›'))),
      parts.length ? [h('h2', { text: 'Мои партии' }), h('div', { class: 'list' }, parts)] : null);
  }

  function CustomChallenge() {
    const P = S.cparams;
    const back = h('button', { class: 'back', onclick: () => { S.chView = null; render(); } }, '‹');
    const tabs = h('div', { class: 'tabs' }, CATS.map((c) =>
      h('button', { class: 'tab' + (S.ccat === c.id ? ' on' : ''), onclick: () => { S.ccat = c.id; render(); } }, c.name)));
    const list = h('div', { class: 'list', style: 'max-height:38vh;overflow-y:auto' }, PATS.filter((p) => p.cat === S.ccat).map((p) =>
      h('button', { class: 'item' + (S.cpick === p.id ? ' sel' : ''), onclick: () => { S.cpick = p.id; render(); } },
        h('div', { class: 'grow' }, h('div', { class: 't' }, p.name)), S.cpick === p.id ? h('span', { class: 'badge' }, '✓') : null)));
    const num = (key, label, min, max) => {
      const i = h('input', { type: 'number', inputmode: 'numeric', value: P[key], min, max });
      i.addEventListener('change', () => { P[key] = clamp(parseInt(i.value, 10) || min, min, max); i.value = P[key]; });
      return h('div', { class: 'opt' }, h('div', { class: 'sub' }, label), h('div', { class: 'num' }, i));
    };
    const start = h('button', { class: 'go', onclick: () => {
      if (!S.cpick) { alert('Выбери паттерн'); return; }
      if (P.to <= P.from) { alert('Цель должна быть выше стартового темпа'); return; }
      const p = byId[S.cpick];
      open(p.id, { key: null, pid: p.id, from: P.from, to: P.to, step: P.step, every: P.every, title: `${p.name}: ${P.from} → ${P.to} BPM` });
    } }, 'Начать челлендж');
    return h('div', { class: 'screen' },
      h('div', { class: 'top' }, back, h('div', { class: 'name' }, 'Свой челлендж')),
      tabs, list,
      h('div', { class: 'opts' }, num('from', 'Стартовый темп', 30, 250), num('to', 'Цель, BPM', 40, 260), num('step', 'Прибавлять BPM', 1, 20), num('every', 'Каждые N повторов', 1, 32)),
      start);
  }

  function ImportScreen() {
    const back = h('button', { class: 'back', onclick: () => { S.chView = null; S.imp = null; render(); } }, '‹');
    const I = S.imp;
    const head = h('div', { class: 'top' }, back, h('div', { class: 'name' }, 'Партия из файла'));
    const picker = h('input', { type: 'file', id: 'impfile', onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const src = await Importer.open(f);
        const firstDrum = Math.max(0, src.tracks.findIndex((t) => t.isDrum));
        S.imp = { src, file: f.name, track: firstDrum, from: 1, count: 4, err: null };
      } catch (err) { S.imp = { src: null, file: f.name, err: err.message || String(err) }; }
      render();
    } });
    const pickBtn = h('button', { class: 'go', style: 'margin-top:0', onclick: () => picker.click() }, I && I.file ? 'Выбрать другой файл' : 'Выбрать файл');
    if (!I || !I.src) {
      return h('div', { class: 'screen' }, head,
        h('div', { class: 'note' }, 'Поддерживаются Guitar Pro 7/8 (.gp) и MIDI (.mid). Файлы .gp3/.gp4/.gp5/.gpx пока нет: сохрани партию из Guitar Pro или TuxGuitar как .gp или экспортируй в MIDI.'),
        I && I.err ? h('div', { class: 'err' }, I.err) : null, pickBtn, picker);
    }
    const t = I.src.tracks[I.track];
    const trackRows = I.src.tracks.map((tr, k) => h('button', { class: 'item' + (I.track === k ? ' sel' : ''), style: tr.isDrum ? '' : 'opacity:.45', onclick: () => {
      if (!tr.isDrum) { alert('Это не ударная дорожка'); return; }
      I.track = k; render();
    } }, h('div', { class: 'grow' }, h('div', { class: 't' }, (tr.isDrum ? '🥁 ' : '') + tr.name), h('div', { class: 's' }, tr.isDrum ? tr.barCount + ' тактов' : 'не ударная')), I.track === k ? h('span', { class: 'badge' }, '✓') : null));
    const total = t ? t.barCount : 0;
    const num = (key, label, min, max, hint) => {
      const i = h('input', { type: 'number', inputmode: 'numeric', value: I[key], min, max });
      i.addEventListener('change', () => { I[key] = clamp(parseInt(i.value, 10) || min, min, max); i.value = I[key]; });
      return h('div', { class: 'opt' }, h('div', null, h('div', { class: 'sub' }, label), hint ? h('div', { class: 'sub' }, hint) : null), h('div', { class: 'num' }, i));
    };
    const doImport = () => {
      try {
        const b = Importer.buildPart(I.src, I.track, I.from - 1, I.count);
        const last = Math.min(total, I.from - 1 + Math.min(4, I.count));
        const rec = {
          id: 'imp:' + Date.now(), name: `${I.src.name} · ${I.src.tracks[I.track].name} · т.${I.from}–${last}`,
          note: `Из файла «${I.file}». Темп оригинала ${b.fullBpm} BPM, стартовый — ${b.bpm}.`,
          div: b.div, bpm: b.bpm, parsed: b.parsed, bars: b.bars,
        };
        store.d.parts.push(rec); store.save();
        registerPart(rec);
        S.chView = null; S.imp = null;
        open(rec.id);
      } catch (err) { alert(err.message || String(err)); }
    };
    return h('div', { class: 'screen' }, head,
      h('div', { class: 'note' }, `Файл: ${I.file}. Темп в файле: ${I.src.bpm} BPM.`),
      h('h2', { text: 'Дорожка' }), h('div', { class: 'list' }, trackRows),
      h('h2', { text: 'Такты (максимум 4)' }),
      h('div', { class: 'opts' }, num('from', 'С такта', 1, Math.max(1, total), 'всего ' + total), num('count', 'Сколько тактов', 1, 4)),
      h('button', { class: 'go', onclick: doImport }, 'Сделать упражнение'), pickBtn, picker);
  }

  /* ================= today ================= */
  function TodayScreen() {
    const d = store.d, today = dkey();
    const doneToday = (id) => d.last[id] === today;
    const secToday = (d.days[today] && d.days[today].sec) || 0;
    const plan = d.plan.filter((id) => byId[id]);
    const done = plan.filter(doneToday).length;

    const rows = plan.map((id) => {
      const p = byId[id];
      return h('div', { class: 'item' },
        h('button', { class: 'grow', style: 'text-align:left', onclick: () => open(id) },
          h('div', { class: 't' }, (doneToday(id) ? '✓ ' : '○ ') + p.name),
          h('div', { class: 's' }, (CATS.find((c) => c.id === p.cat) || {}).name + (d.best[id] ? ' · рекорд ' + d.best[id] : ''))),
        h('button', { class: 'pill', onclick: () => { d.plan = d.plan.filter((x) => x !== id); store.save(); render(); } }, '✕'));
    });

    const pick = () => {
      const pool = PATS.filter((p) => !d.plan.includes(p.id))
        .sort((a, b) => (d.last[a.id] || '').localeCompare(d.last[b.id] || ''))
        .slice(0, 14);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      pool.slice(0, 5).forEach((p) => d.plan.push(p.id));
      store.save(); render();
    };

    return h('div', { class: 'screen' },
      h('h1', { text: 'Сегодня' }),
      h('div', { class: 'cards' },
        h('div', { class: 'stat' }, h('b', null, `${done}/${plan.length}`), h('span', null, 'сделано')),
        h('div', { class: 'stat' }, h('b', null, dur(secToday)), h('span', null, 'играли')),
        h('div', { class: 'stat' }, h('b', null, today.slice(5)), h('span', null, 'дата'))),
      h('h2', { text: 'План' }),
      plan.length ? h('div', { class: 'list' }, rows) : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'План пуст. Добавь паттерны кнопкой «☆ В план» или подбери набор.')),
      h('div', { class: 'data-row' },
        h('button', { class: 'pill', onclick: pick }, '🎲 Подобрать 5 (давно не играли)'),
        plan.length ? h('button', { class: 'pill', onclick: () => { d.plan = []; store.save(); render(); } }, 'Очистить') : null));
  }

  /* ================= records ================= */
  function RecordsScreen() {
    const d = store.d, now = new Date();
    const secOf = (k) => (d.days[k] && d.days[k].sec) || 0;
    let week = 0;
    for (let i = 0; i < 7; i++) week += secOf(dkey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
    let streak = 0, i = secOf(dkey(now)) > 0 ? 0 : 1;
    while (secOf(dkey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))) > 0) { streak++; i++; }

    const y = S.month.getFullYear(), m = S.month.getMonth();
    const first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let k = 0; k < lead; k++) cells.push(h('div', { class: 'day blank' }));
    for (let n = 1; n <= days; n++) {
      const key = `${y}-${pad(m + 1)}-${pad(n)}`, s = secOf(key);
      const lvl = s === 0 ? 0 : s < 300 ? 1 : s < 900 ? 2 : s < 1800 ? 3 : 4;
      cells.push(h('button', { class: `day l${lvl}` + (key === dkey(now) ? ' today' : '') + (key === S.sel ? ' sel' : ''), onclick: () => { S.sel = key; render(); } },
        String(n), s ? h('i', null, Math.max(1, Math.round(s / 60)) + 'м') : null));
    }
    const month = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' }).format(first);
    const cal = h('div', { class: 'cal' },
      h('div', { class: 'calhead' },
        h('button', { onclick: () => { S.month = new Date(y, m - 1, 1); render(); } }, '‹'),
        h('span', null, month),
        h('button', { onclick: () => { S.month = new Date(y, m + 1, 1); render(); } }, '›')),
      h('div', { class: 'calgrid' }, ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((x) => h('div', { class: 'dow' }, x)), cells));

    const rec = d.days[S.sel];
    const dayList = rec && rec.sessions.length
      ? h('div', { class: 'list' }, rec.sessions.slice().reverse().map((s) =>
        h('div', { class: 'item' }, h('div', { class: 'grow' },
          h('div', { class: 't' }, (byId[s.id] || { name: s.id }).name),
          h('div', { class: 's' }, `${s.t} · ${dur(s.sec)} · ${s.bpm} BPM`)))))
      : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'В этот день практики не было.'));

    const bests = Object.entries(d.best).filter(([id]) => byId[id]).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const bestList = bests.length
      ? h('div', { class: 'list' }, bests.map(([id, v]) => h('button', { class: 'item', onclick: () => open(id) },
        h('div', { class: 'grow' }, h('div', { class: 't' }, byId[id].name), h('div', { class: 's' }, 'Последняя: ' + (d.last[id] || '—'))),
        h('span', { class: 'badge' }, '♩ ' + v))))
      : h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Рекорды появятся после первых тренировок (от 10 секунд).'));

    const exp = () => {
      const txt = JSON.stringify(d);
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => alert('Данные скопированы в буфер обмена'), () => prompt('Скопируйте данные:', txt));
      else prompt('Скопируйте данные:', txt);
    };
    const imp = () => {
      const txt = prompt('Вставьте ранее скопированные данные:');
      if (!txt) return;
      try { store.d = Object.assign({}, store.d, JSON.parse(txt)); store.save(); store.load(); render(); alert('Готово'); }
      catch (e) { alert('Не удалось прочитать данные'); }
    };

    return h('div', { class: 'screen' },
      h('h1', { text: 'Записи' }),
      h('div', { class: 'cards' },
        h('div', { class: 'stat' }, h('b', null, dur(secOf(dkey(now)))), h('span', null, 'сегодня')),
        h('div', { class: 'stat' }, h('b', null, dur(week)), h('span', null, '7 дней')),
        h('div', { class: 'stat' }, h('b', null, streak + ' дн.'), h('span', null, 'серия'))),
      h('h2', { text: 'Календарь практики' }), cal,
      h('h2', { text: 'День ' + S.sel.slice(5) }), dayList,
      h('h2', { text: 'Рекорды BPM' }), bestList,
      h('h2', { text: 'Данные' }),
      h('div', { class: 'data-row' }, h('button', { class: 'pill', onclick: exp }, 'Экспорт'), h('button', { class: 'pill', onclick: imp }, 'Импорт')));
  }

  /* ================= boot ================= */
  render();
  window.__app = { Engine, store, S, render, PATS };
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'localhost') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
