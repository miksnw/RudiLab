/**
 * Синтез ударных на Web Audio. createVoices(ctx, destination) работает и с живым AudioContext,
 * и с OfflineAudioContext (для замеров тайминга и тестов).
 */
const noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

const TOM_PITCH = { T1: 230, T2: 170, T3: 120 };
const DEFAULT_VOLUME = { accent: 1, normal: 0.55 };

export function createVoices(ctx, destination) {
  const noise = noiseBuffer(ctx);

  /** Всплеск шума через фильтр: основа хета, малого, тарелок. */
  function noiseHit(t, { dur, freq, type, q = 1, gain }) {
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), amp = ctx.createGain();
    src.buffer = noise;
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(amp); amp.connect(destination);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Тон с падением высоты: бочка, томы, щелчок метронома. */
  function toneHit(t, { f0, f1, dur, gain, type = 'sine' }) {
    const osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(amp); amp.connect(destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  const snare = (t, v) => {
    noiseHit(t, { dur: 0.15, freq: 2400, type: 'bandpass', q: 0.7, gain: 0.8 * v });
    toneHit(t, { f0: 240, f1: 170, dur: 0.09, gain: 0.5 * v, type: 'triangle' });
  };
  const kick = (t, v) => {
    toneHit(t, { f0: 150, f1: 42, dur: 0.18, gain: v });
    noiseHit(t, { dur: 0.012, freq: 900, type: 'lowpass', gain: 0.3 * v });
  };
  const hat = (t, v) => noiseHit(t, { dur: 0.06, freq: 7500, type: 'highpass', gain: 0.45 * v });
  const openHat = (t, v) => noiseHit(t, { dur: 0.3, freq: 7000, type: 'highpass', gain: 0.4 * v });
  const crash = (t, v) => noiseHit(t, { dur: 1.2, freq: 4500, type: 'highpass', gain: 0.5 * v });
  const ride = (t, v) => {
    noiseHit(t, { dur: 0.55, freq: 6500, type: 'highpass', gain: 0.28 * v });
    toneHit(t, { f0: 3400, f1: 3300, dur: 0.3, gain: 0.07 * v, type: 'triangle' });
  };
  const tom = (pitch) => (t, v) => {
    toneHit(t, { f0: pitch, f1: pitch * 0.6, dur: 0.28, gain: 0.9 * v });
    noiseHit(t, { dur: 0.04, freq: 1500, type: 'bandpass', gain: 0.25 * v });
  };

  // инструмент -> голос
  const VOICE = {
    S: snare, R: snare, L: snare, K: kick, H: hat, X: crash, C: crash, RD: ride,
    T1: tom(TOM_PITCH.T1), T2: tom(TOM_PITCH.T2), T3: tom(TOM_PITCH.T3),
  };
  const SNARE_LIKE = new Set(['S', 'R', 'L']);

  /** hit: { limb, v?, acc?, open?, mod?: 'f'|'d', buzz? }, t — время звука в секундах. */
  function play(hit, t) {
    const v = hit.v !== undefined ? hit.v : (hit.acc ? DEFAULT_VOLUME.accent : DEFAULT_VOLUME.normal);
    if (SNARE_LIKE.has(hit.limb)) {
      if (hit.mod === 'f') snare(t - 0.04, 0.3);                                  // флэм: тихий форшлаг
      if (hit.mod === 'd') { snare(t - 0.08, 0.3); snare(t - 0.04, 0.3); }        // драг: два форшлага
      if (hit.buzz) for (let i = 0; i < 6; i++) snare(t + i * 0.022, v * (1 - i * 0.12));
      else snare(t, v);
    } else if (hit.limb === 'H' && hit.open) openHat(t, v);
    else if (VOICE[hit.limb]) VOICE[hit.limb](t, v);
  }

  /** Щелчок метронома; accent — первая доля фразы. */
  function click(t, accent) {
    toneHit(t, { f0: accent ? 1700 : 1100, f1: accent ? 1600 : 1000, dur: 0.045, gain: 0.3 });
  }

  return { play, click };
}
