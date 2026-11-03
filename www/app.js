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
      this.d = Object.assign({ plan: [], best: {}, hist: {}, days: {}, last: {}, lastBpm: {}, settings: {} }, raw || {});
      const s = this.d.settings;
      if (s.click === undefined) s.click = true;
      if (s.sound === undefined) s.sound = true;
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
    click: true, sound: true, onStep: null, onCycle: null, raf: 0,

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
    clickSound(t, accent) {
      this.toneHit(t, { f0: accent ? 1700 : 1100, f1: accent ? 1600 : 1000, dur: 0.045, gain: 0.3 });
    },
    hit(x, t) {
      const v = x.acc ? 1 : 0.55;
      if ('RLS'.includes(x.limb)) {
        if (x.mod === 'f') this.snare(t - 0.04, 0.3);
        if (x.mod === 'd') { this.snare(t - 0.08, 0.3); this.snare(t - 0.04, 0.3); }
        if (x.buzz) for (let i = 0; i < 6; i++) this.snare(t + i * 0.022, v * (1 - i * 0.12));
        else this.snare(t, v);
      } else if (x.limb === 'K') this.kick(t, v);
      else if (x.limb === 'H') this.hat(t, v);
      else if (x.limb === 'X') this.crash(t, v);
    },

    start(pat, bpm) {
      this.ensure();
      this.pat = pat; this.bpm = bpm; this.idx = 0; this.cycles = 0; this.queue = [];
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
        }
      }
    },
  };

  /* ================= state / router ================= */
  const S = { tab: 'practice', cat: 'rud', pat: null, month: new Date(), sel: dkey() };
  store.load();

  function render() {
    const app = $('#app');
    app.innerHTML = '';
    if (S.pat) { app.append(PatternScreen(byId[S.pat])); return; }
    app.append(S.tab === 'practice' ? PracticeScreen() : S.tab === 'today' ? TodayScreen() : RecordsScreen(), Nav());
  }
  function Nav() {
    const b = (id, label) => h('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; render(); } }, label);
    return h('div', { class: 'nav' }, b('practice', 'Практика'), b('today', 'Сегодня'), b('records', 'Записи'));
  }
  function open(id) { S.pat = id; render(); }

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
  function PatternScreen(p) {
    const d = store.d, st = d.settings, auto = st.auto;
    let bpm = d.lastBpm[p.id] || p.bpm;
    let maxBpm = bpm, startedAt = 0, ticker = 0, pendingShow = false;

    const stepEls = [];
    const isKit = p.parsed.some((hs) => hs.some((x) => 'KHX'.includes(x.limb)));
    const nLanes = isKit ? 3 : 1;
    const laneOf = (limb) => (!isKit ? 0 : limb === 'H' || limb === 'X' ? 0 : limb === 'K' ? 2 : 1);
    const grid = h('div', { class: 'grid' });
    for (let r = 0; r * 4 < p.steps.length; r++) {
      const line = h('div', { class: 'line' });
      for (let k = 0; k < 4; k++) {
        const i = r * 4 + k;
        if (i >= p.steps.length) { line.append(h('div', { class: 'step ghost' })); continue; }
        const hits = p.parsed[i];
        const el = h('div', { class: 'step' + (isKit ? ' lanes' : '') + (i > 0 && i % p.div === 0 ? ' bs' : '') + (hits.length ? '' : ' rest') });
        const slots = Array.from({ length: nLanes }, () => h('div', { class: 'slot' }));
        for (const x of hits) {
          const cls = 'c-' + x.limb + (p.hasSoft && 'RLS'.includes(x.limb) ? (x.acc ? ' acc' : ' soft') : '');
          slots[laneOf(x.limb)].append(h('span', { class: cls }, x.mod ? h('sup', null, x.mod) : null, x.limb, x.buzz ? '~' : ''));
        }
        slots.forEach((sl) => el.append(sl));
        stepEls.push(el);
        line.append(el);
      }
      grid.append(line);
    }
    let curEl = null;
    const setCur = (i) => {
      if (curEl) curEl.classList.remove('cur');
      curEl = i == null ? null : stepEls[i];
      if (curEl) curEl.classList.add('cur');
    };

    const bpmNum = h('div', { class: 'bpmnum' });
    const slider = h('input', { type: 'range', min: 30, max: 260, value: bpm });
    const showBpm = () => { bpmNum.innerHTML = ''; bpmNum.append(String(bpm), h('small', null, 'BPM')); slider.value = bpm; };
    const setBpm = (v) => {
      bpm = clamp(Math.round(v), 30, 260);
      if (Engine.playing) { Engine.bpm = bpm; maxBpm = Math.max(maxBpm, bpm); }
      showBpm();
    };
    slider.addEventListener('input', () => setBpm(+slider.value));
    const adj = (n) => h('button', { class: 'adj', onclick: () => setBpm(bpm + n) }, (n > 0 ? '+' : '−') + Math.abs(n));

    const timer = h('div', { class: 'timer' }, 'Время: 0:00');
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

    const go = h('button', { class: 'go' }, '▶ Старт');
    function begin() {
      Engine.click = st.click; Engine.sound = st.sound;
      pendingShow = false;
      Engine.onStep = (i) => {
        setCur(i);
        if (i === 0 && pendingShow) { pendingShow = false; showBpm(); }
      };
      Engine.onCycle = (n) => {
        if (auto.on && n % Math.max(1, auto.every) === 0 && bpm < auto.max) {
          bpm = Math.min(auto.max, bpm + auto.step);
          Engine.bpm = bpm; maxBpm = Math.max(maxBpm, bpm);
          pendingShow = true; // число обновится, когда зазвучит первый удар фразы
        }
      };
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
      if (sec >= 10) store.recordSession(p.id, sec, bpm, maxBpm);
      else d.lastBpm[p.id] = bpm, store.save();
      timer.textContent = sec >= 10 ? `Сохранено: ${clock(sec)} · макс. ${maxBpm} BPM` : 'Меньше 10 секунд — не записано';
      refreshInfo();
    }
    go.addEventListener('click', () => (Engine.playing ? end() : begin()));
    window.__leavePattern = () => { end(); document.removeEventListener('visibilitychange', onHide); window.__leavePattern = null; };
    const onHide = () => { if (document.hidden) end(); };
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

    showBpm(); refreshInfo();
    const legend = p.cat === 'kit' ? h('div', { class: 'legend' },
      h('span', { class: 'c-R' }, 'R правая'), h('span', { class: 'c-L' }, 'L левая'), h('span', { class: 'c-S' }, 'S малый'),
      h('span', { class: 'c-K' }, 'K бочка'), h('span', { class: 'c-H' }, 'H хет'), h('span', { class: 'c-X' }, 'X крэш')) :
      h('div', { class: 'legend' }, h('span', { class: 'c-R' }, 'R правая'), h('span', { class: 'c-L' }, 'L левая'), p.hasSoft ? h('span', null, 'рамка = акцент') : null);

    return h('div', { class: 'screen' },
      h('div', { class: 'top' },
        h('button', { class: 'back', onclick: () => { window.__leavePattern && window.__leavePattern(); S.pat = null; render(); } }, '‹'),
        h('div', { class: 'name' }, p.name), planBtn),
      p.note ? h('div', { class: 'note' }, p.note) : null,
      grid, legend,
      h('div', { class: 'bpmbox' },
        h('div', { class: 'bpmrow' }, adj(-5), adj(-1), bpmNum, adj(1), adj(5)),
        slider, go, timer),
      h('div', { class: 'opts' },
        sw('Метроном', 'Клик на каждую долю', () => st.click, (v) => { st.click = v; Engine.click = v; }),
        sw('Звук ударов', 'Малый, бочка, хет, крэш', () => st.sound, (v) => { st.sound = v; Engine.sound = v; }),
        sw('Auto BPM', 'Темп растёт сам', () => auto.on, (v) => { auto.on = v; }),
        h('div', { class: 'opt' }, h('div', { class: 'sub' }, 'Прибавлять BPM'), h('div', { class: 'num' }, '+', numIn(auto, 'step', 1, 20))),
        h('div', { class: 'opt' }, h('div', { class: 'sub' }, 'Каждые N повторов'), h('div', { class: 'num' }, numIn(auto, 'every', 1, 32))),
        h('div', { class: 'opt' }, h('div', { class: 'sub' }, 'До максимума'), h('div', { class: 'num' }, numIn(auto, 'max', 40, 260)))),
      info);
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
