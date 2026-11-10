/**
 * Guitar Pro 7/8 (.gp): внутри zip лежит Content/score.gpif — XML.
 * Разбор идёт по прямым потомкам элементов (быстрее, чем querySelectorAll на каждую ноту).
 */
import { TPQ, VELOCITY, makeEvent } from './model.js';

const NOTE_LEN = { Long: 16, DoubleWhole: 8, Whole: 4, Half: 2, Quarter: 1, Eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625, '128th': 0.03125 };
const ACCENT_BITS = 4 | 8; // в GPIF: 1 стаккато, 4 акцент, 8 сильный акцент

const kid = (el, name) => { if (el) for (const c of el.children) if (c.tagName === name) return c; return null; };
const text = (el, name) => { const k = kid(el, name); return k ? k.textContent.trim() : null; };
const idList = (s) => (s ? s.split(/\s+/).filter(Boolean) : []);
const indexById = (parent) => {
  const map = new Map();
  if (parent) for (const c of parent.children) map.set(c.getAttribute('id'), c);
  return map;
};
/** Значение свойства <Property name="X"><Child>…</Child></Property> */
function property(owner, name) {
  const props = kid(owner, 'Properties');
  if (props) for (const p of props.children) if (p.getAttribute('name') === name) return p.firstElementChild ? p.firstElementChild.textContent.trim() : null;
  return null;
}

export function parseGpif(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Файл повреждён (XML)');
  const root = doc.documentElement;

  const notes = indexById(kid(root, 'Notes')), beats = indexById(kid(root, 'Beats')),
    rhythms = indexById(kid(root, 'Rhythms')), voices = indexById(kid(root, 'Voices')), bars = indexById(kid(root, 'Bars')),
    trackEls = indexById(kid(root, 'Tracks'));
  const masterTrack = kid(root, 'MasterTrack');
  const order = idList(text(masterTrack, 'Tracks'));
  const masterBars = Array.from(kid(root, 'MasterBars').children);

  let bpm = 100;
  const automations = kid(masterTrack, 'Automations');
  if (automations) {
    const tempo = Array.from(automations.children).find((a) => text(a, 'Type') === 'Tempo');
    if (tempo) bpm = Math.round(parseFloat((text(tempo, 'Value') || '100').split(/\s+/)[0])) || 100;
  }

  const tracks = order.map((id) => {
    const el = trackEls.get(id);
    const set = kid(el, 'InstrumentSet');
    const articulations = []; // [элемент] -> [MIDI-номера]
    const elements = kid(set, 'Elements');
    if (elements) for (const element of elements.children) {
      const list = [];
      const arts = kid(element, 'Articulations');
      if (arts) for (const a of arts.children) list.push(parseInt(text(a, 'OutputMidiNumber'), 10));
      articulations.push(list);
    }
    const instrumentRef = kid(el, 'Instrument') ? kid(el, 'Instrument').getAttribute('ref') || '' : '';
    return {
      name: text(el, 'Name') || `Дорожка ${id}`,
      isDrum: /drum/i.test(text(set, 'Type') || '') || /drum/i.test(instrumentRef),
      barCount: masterBars.length,
      articulations,
    };
  });

  /** Какой барабан сыгран нотой: Midi-свойство -> Element/Variation -> индекс артикуляции. */
  function noteMidi(note, articulations) {
    const midi = parseInt(property(note, 'Midi'), 10);
    if (Number.isFinite(midi)) return midi;
    const element = property(note, 'Element');
    if (element !== null) {
      const list = articulations[parseInt(element, 10)] || [];
      const m = list[parseInt(property(note, 'Variation') || '0', 10)];
      return Number.isFinite(m) ? m : list[0];
    }
    const index = text(note, 'InstrumentArticulation');
    return index !== null ? articulations.flat()[parseInt(index, 10)] : undefined;
  }

  const rhythmCache = new Map(); // id ритма -> длительность в четвертях
  function rhythmLength(id) {
    if (rhythmCache.has(id)) return rhythmCache.get(id);
    const r = rhythms.get(id);
    let len = r ? (NOTE_LEN[text(r, 'NoteValue')] || 1) : 1;
    if (r) {
      const dot = kid(r, 'AugmentationDot');
      if (dot) len *= 2 - Math.pow(0.5, parseInt(dot.getAttribute('count') || '1', 10));
      const tuplet = kid(r, 'PrimaryTuplet');
      if (tuplet) len = (len * parseInt(tuplet.getAttribute('den'), 10)) / parseInt(tuplet.getAttribute('num'), 10);
    }
    rhythmCache.set(id, len);
    return len;
  }

  function noteVolume(note) {
    if (kid(note, 'AntiAccent')) return VELOCITY.ghost;
    return (parseInt(text(note, 'Accent') || '0', 10) & ACCENT_BITS) ? VELOCITY.accent : VELOCITY.normal;
  }

  function readBar(masterBar, trackIndex, articulations) {
    const [num, den] = (text(masterBar, 'Time') || '4/4').split('/').map((x) => parseInt(x, 10));
    const events = [];
    const bar = bars.get(idList(text(masterBar, 'Bars'))[trackIndex]);
    for (const voiceId of idList(text(bar, 'Voices'))) {
      const voice = voices.get(voiceId); // «-1» — голоса нет
      if (!voice) continue;
      let ticks = 0;
      for (const beatId of idList(text(voice, 'Beats'))) {
        const beat = beats.get(beatId);
        if (!beat) continue;
        const rhythmRef = kid(beat, 'Rhythm');
        for (const noteId of idList(text(beat, 'Notes'))) {
          const note = notes.get(noteId);
          if (!note) continue;
          const midi = noteMidi(note, articulations);
          const ev = midi === undefined ? null : makeEvent(Math.round(ticks), midi, noteVolume(note));
          if (ev) events.push(ev);
        }
        ticks += rhythmLength(rhythmRef && rhythmRef.getAttribute('ref')) * TPQ;
      }
    }
    return { num, den, len: Math.round((TPQ * 4 * num) / den), events };
  }

  return {
    name: text(kid(root, 'Score'), 'Title') || '',
    bpm,
    tracks: tracks.map(({ name, isDrum, barCount }) => ({ name, isDrum, barCount })),
    bars(trackIndex, from = 0, count = Infinity) {
      return masterBars.slice(from, from + count).map((mb) => readBar(mb, trackIndex, tracks[trackIndex].articulations));
    },
  };
}
