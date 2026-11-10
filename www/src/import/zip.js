/** Чтение одного файла из zip (нужно для .gp). Сжатие deflate — через DecompressionStream. */
const SIG_EOCD = 0x06054b50, SIG_CENTRAL = 0x02014b50;

export async function unzipFile(buffer, wantedName) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 70000); i--) {
    if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Не удалось прочитать архив .gp');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let k = 0; k < count && view.getUint32(p, true) === SIG_CENTRAL; k++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== wantedName) continue;

    const dataStart = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + size);
    if (method === 0) return data;
    if (method !== 8) throw new Error('Неизвестный способ сжатия в архиве');
    if (typeof DecompressionStream === 'undefined') throw new Error('Этот браузер не умеет распаковывать архив');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error(`В архиве нет ${wantedName}`);
}
