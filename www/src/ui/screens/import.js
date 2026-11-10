/** Мастер импорта партии из .gp / MIDI: файл → дорожка → такты → упражнение. */
import { h } from '../../core/dom.js';
import { store } from '../../core/services.js';
import { registerPart } from '../../data/patterns.js';
import { openFile, buildPart, MAX_BARS } from '../../import/index.js';
import { S, go, openPattern } from '../state.js';
import { Screen, Section, Note, ErrorBox, TopBar, List, Row, BigButton, Options, NumberField } from '../kit.js';

const close = () => go({ chView: null, imp: null });

export function ImportScreen() {
  const I = S.imp;
  const picker = h('input', { type: 'file', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const src = await openFile(file);
      S.imp = { src, file: file.name, track: Math.max(0, src.tracks.findIndex((t) => t.isDrum)), from: 1, count: MAX_BARS, err: null };
    } catch (err) { S.imp = { src: null, file: file.name, err: err.message || String(err) }; }
    go();
  } });
  const pickBtn = BigButton({ text: I && I.file ? 'Выбрать другой файл' : 'Выбрать файл', style: 'margin-top:0', onclick: () => picker.click() });
  const head = TopBar({ title: 'Партия из файла', onBack: close });

  if (!I || !I.src) {
    return Screen(head,
      Note('Поддерживаются Guitar Pro 7/8 (.gp) и MIDI (.mid). Файлы .gp3/.gp4/.gp5/.gpx пока нет: сохрани партию из Guitar Pro или TuxGuitar как .gp или экспортируй в MIDI.'),
      I && I.err ? ErrorBox(I.err) : null, pickBtn, picker);
  }

  const { src } = I, total = src.tracks[I.track] ? src.tracks[I.track].barCount : 0;
  const tracks = src.tracks.map((tr, k) => Row({
    title: (tr.isDrum ? '🥁 ' : '') + tr.name, sub: tr.isDrum ? tr.barCount + ' тактов' : 'не ударная',
    badge: I.track === k ? '✓' : null, selected: I.track === k, dim: !tr.isDrum,
    onclick: () => { if (!tr.isDrum) { alert('Это не ударная дорожка'); return; } I.track = k; go(); },
  }));

  const make = () => {
    try {
      const b = buildPart(src, I.track, I.from - 1, I.count);
      const last = Math.min(total, I.from - 1 + Math.min(MAX_BARS, I.count));
      const rec = {
        id: 'imp:' + Date.now(), name: `${src.name} · ${src.tracks[I.track].name} · т.${I.from}–${last}`,
        note: `Из файла «${I.file}». Темп оригинала ${b.fullBpm} BPM, стартовый — ${b.bpm}.`,
        div: b.div, bpm: b.bpm, parsed: b.parsed, bars: b.bars,
      };
      store.addPart(rec); registerPart(rec);
      go({ chView: null, imp: null }); openPattern(rec.id);
    } catch (err) { alert(err.message || String(err)); }
  };

  return Screen(head,
    Note(`Файл: ${I.file}. Темп в файле: ${src.bpm} BPM.`),
    Section('Дорожка'), List(tracks),
    Section(`Такты (максимум ${MAX_BARS})`),
    Options(NumberField({ label: 'С такта', sub: 'всего ' + total, obj: I, key: 'from', min: 1, max: Math.max(1, total) }), NumberField({ label: 'Сколько тактов', obj: I, key: 'count', min: 1, max: MAX_BARS })),
    BigButton({ text: 'Сделать упражнение', onclick: make }), pickBtn, picker);
}
