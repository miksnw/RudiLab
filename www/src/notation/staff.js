/*
 * Стандартная барабанная нотация (SVG): пятилинейный стан, один такт на строку.
 * Верхний голос (штили вверх): крэш, райд, хет, томы, малый. Нижний голос (штили вниз): бочка.
 * Паузы пока не рисуются (в тактах без ноты просто пусто).
 */
const NS = 'http://www.w3.org/2000/svg';
const POS = { C: -2, RD: 0, H: -1, T1: 1, T2: 2, S: 3, T3: 5, K: 7 }; // в полу-интервалах от верхней линии
const XHEAD = { C: 1, RD: 1, H: 1 };
const el = (n, a, t) => { const e = document.createElementNS(NS, n); for (const k in a || {}) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e; };

export function renderStaff(p) {
  const W = 360, SP = 7, ROW = 118, TOP = 52, RIGHT = 10, XS = 44;
  const rows = p.bars.length;
  const svg = el('svg', { viewBox: `0 0 ${W} ${rows * ROW + 6}`, class: 'staff', role: 'img' });
  const cy = (pos, top) => top + pos * SP / 2;
  const geo = []; // на каждый такт: функция x(i) и ширина шага
  const rowOfStep = [];
  let lastSig = '';

  p.bars.forEach((bar, bi) => {
    const top = bi * ROW + TOP;
    const xe = W - RIGHT, stepW = (xe - XS - 8) / bar.len;
    const X = (i) => XS + 6 + (i + 0.5) * stepW;
    geo.push({ X, stepW, top, bi, bar });
    for (let i = 0; i < bar.len; i++) rowOfStep[bar.start + i] = { bi, i };

    const g = el('g');
    for (let l = 0; l < 5; l++) g.append(el('line', { x1: 6, x2: xe, y1: top + l * SP, y2: top + l * SP, stroke: 'currentColor', 'stroke-width': 1, opacity: 0.7 }));
    g.append(el('rect', { x: 12, y: top, width: 3, height: 4 * SP, fill: 'currentColor' }), el('rect', { x: 19, y: top, width: 3, height: 4 * SP, fill: 'currentColor' }));
    const sig = bar.num + '/' + bar.den;
    if (sig !== lastSig) {
      g.append(el('text', { x: 33, y: top + 2 * SP - 2, 'font-size': 15, 'font-weight': 800, 'text-anchor': 'middle', fill: 'currentColor' }, bar.num),
        el('text', { x: 33, y: top + 4 * SP - 1, 'font-size': 15, 'font-weight': 800, 'text-anchor': 'middle', fill: 'currentColor' }, bar.den));
      lastSig = sig;
    }
    g.append(el('text', { x: 6, y: top - 36, 'font-size': 10, fill: 'currentColor', opacity: 0.55 }, 'такт ' + (bi + 1)));
    g.append(el('line', { x1: xe, x2: xe, y1: top, y2: top + 4 * SP, stroke: 'currentColor', 'stroke-width': bi === rows - 1 ? 2.5 : 1 }));
    svg.append(g);

    // события по шагам
    const up = [], down = [];
    for (let i = 0; i < bar.len; i++) {
      const hits = p.parsed[bar.start + i];
      if (!hits.length) continue;
      const x = X(i);
      const upHits = hits.filter((h) => h.limb !== 'K'), kick = hits.find((h) => h.limb === 'K');
      for (const h of hits) {
        const y = cy(POS[h.limb], top);
        if (POS[h.limb] <= -2) g.append(el('line', { x1: x - 7, x2: x + 7, y1: y, y2: y, stroke: 'currentColor', 'stroke-width': 1 }));
        if (XHEAD[h.limb]) {
          g.append(el('path', { d: `M${x - 3.6} ${y - 3.6}L${x + 3.6} ${y + 3.6}M${x + 3.6} ${y - 3.6}L${x - 3.6} ${y + 3.6}`, stroke: 'currentColor', 'stroke-width': 1.6, fill: 'none' }));
          if (h.limb === 'C') g.append(el('circle', { cx: x, cy: y, r: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.8 }));
        } else {
          g.append(el('ellipse', { cx: x, cy: y, rx: 4.3, ry: 3.1, fill: 'currentColor', transform: `rotate(-20 ${x} ${y})` }));
        }
        if (h.limb === 'H' && h.open) g.append(el('circle', { cx: x, cy: y - 9, r: 2.4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }));
        if (h.v < 0.5) { g.append(el('text', { x: x - 9, y: y + 3.5, 'font-size': 10, fill: 'currentColor' }, '('), el('text', { x: x + 5.5, y: y + 3.5, 'font-size': 10, fill: 'currentColor' }, ')')); }
      }
      if (upHits.length) {
        const ys = upHits.map((h) => cy(POS[h.limb], top));
        up.push({ i, x: x + 4.2, base: Math.max(...ys), tip: Math.min(...ys) - 26, acc: upHits.some((h) => h.v >= 1) });
      }
      if (kick) down.push({ i, x: x - 4.2, base: cy(POS.K, top), tip: cy(POS.K, top) + 26, acc: kick.v >= 1 });
    }

    const voice = (list, dir) => {
      // группы по долям: соседние ноты в одной доле, пока расстояние ≤ 1/2 доли
      const groups = [];
      let cur = [];
      list.forEach((n, k) => {
        const prev = cur[cur.length - 1];
        const sameBeat = prev && Math.floor(prev.i / p.div) === Math.floor(n.i / p.div);
        const ok = prev && sameBeat && (n.i - prev.i) / p.div <= 0.5 + 1e-6;
        if (!ok) { if (cur.length) groups.push(cur); cur = []; }
        cur.push(n);
      });
      if (cur.length) groups.push(cur);
      for (const gr of groups) {
        const stem = (n, tipY) => g.append(el('line', { x1: n.x, x2: n.x, y1: n.base, y2: tipY, stroke: 'currentColor', 'stroke-width': 1.2 }));
        if (gr.length === 1) {
          const n = gr[0];
          const next = list[list.indexOf(n) + 1];
          const beatEnd = (Math.floor(n.i / p.div) + 1) * p.div;
          const d = ((next && next.i < beatEnd ? next.i : beatEnd) - n.i) / p.div;
          stem(n, n.tip);
          const flags = d <= 0.25 + 1e-6 ? 2 : d <= 0.5 + 1e-6 ? 1 : 0;
          for (let f = 0; f < flags; f++) {
            const y0 = n.tip + (dir > 0 ? f * 5 : -f * 5);
            g.append(el('path', { d: `M${n.x} ${y0} q 7 ${dir > 0 ? 5 : -5} 4 ${dir > 0 ? 13 : -13}`, stroke: 'currentColor', 'stroke-width': 1.6, fill: 'none' }));
          }
          if (n.acc) g.append(el('text', { x: n.x - 4, y: n.tip + (dir > 0 ? -3 : 11), 'font-size': 9, 'font-weight': 700, fill: 'currentColor' }, '>'));
          continue;
        }
        const tipY = dir > 0 ? Math.min(...gr.map((n) => n.tip)) : Math.max(...gr.map((n) => n.tip));
        gr.forEach((n) => { stem(n, tipY); if (n.acc) g.append(el('text', { x: n.x - 4, y: tipY + (dir > 0 ? -5 : 13), 'font-size': 9, 'font-weight': 700, fill: 'currentColor' }, '>')); });
        const beam = (a, b, off) => {
          const y1 = tipY + (dir > 0 ? off : -off);
          g.append(el('polygon', { points: `${a.x},${y1} ${b.x},${y1} ${b.x},${y1 + (dir > 0 ? 3 : -3)} ${a.x},${y1 + (dir > 0 ? 3 : -3)}`, fill: 'currentColor' }));
        };
        for (let k = 0; k < gr.length - 1; k++) {
          const gap = (gr[k + 1].i - gr[k].i) / p.div;
          beam(gr[k], gr[k + 1], 0);
          if (gap <= 0.25 + 1e-6 || (p.div % 3 === 0 && gap * 3 <= 0.5 + 1e-6 && gap < 1 / 3 - 1e-6)) beam(gr[k], gr[k + 1], 5);
        }
        // триоль
        if (p.div % 3 === 0 && gr.some((n, k) => k && Math.abs((n.i - gr[k - 1].i) / p.div - 1 / 3) < 1e-6)) {
          g.append(el('text', { x: (gr[0].x + gr[gr.length - 1].x) / 2, y: tipY + (dir > 0 ? -6 : 16), 'font-size': 10, 'font-style': 'italic', 'text-anchor': 'middle', fill: 'currentColor' }, '3'));
        }
      }
    };
    voice(up, 1);
    voice(down, -1);
  });

  const ph = el('rect', { x: 0, y: 0, width: 0, height: 0, fill: '#ffb020', opacity: 0.28, rx: 4 });
  svg.append(ph);
  return {
    el: svg,
    setCur(i) {
      if (i == null || !rowOfStep[i]) { ph.setAttribute('width', 0); return; }
      const { bi, i: li } = rowOfStep[i];
      const G = geo[bi];
      ph.setAttribute('x', G.X(li) - G.stepW / 2);
      ph.setAttribute('y', G.top - 34);
      ph.setAttribute('width', G.stepW);
      ph.setAttribute('height', 4 * SP + 34 + 36);
    },
  };
}

