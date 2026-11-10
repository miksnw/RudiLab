/** Вход импорта: определяет формат по содержимому и возвращает «источник» (см. model.js). */
import { unzipFile } from './zip.js';
import { parseGpif } from './gpif.js';
import { parseMidi } from './midi.js';

export { buildPart, MAX_BARS } from './quantize.js';

const UNSUPPORTED = 'Форматы .gp3/.gp4/.gp5/.gpx пока не поддерживаются. Сохрани партию как .gp (Guitar Pro 7/8) или экспортируй в MIDI.';

export async function openFile(file) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength));
  const magic = String.fromCharCode(...head.subarray(0, 4));

  let source;
  if (magic === 'MThd') source = parseMidi(buffer);
  else if (magic.startsWith('PK')) {
    const xml = await unzipFile(buffer, 'Content/score.gpif');
    source = parseGpif(new TextDecoder().decode(xml));
  } else if (/FICH|BCF/.test(String.fromCharCode(...head).replace(/[^\x20-\x7e]/g, ''))) throw new Error(UNSUPPORTED);
  else throw new Error('Неизвестный формат файла');

  if (!source.name) source.name = file.name.replace(/\.[^.]+$/, '');
  return source;
}
