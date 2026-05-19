export function createStoredZip(files) {
  const encoder = new TextEncoder();
  const normalized = Object.entries(files).map(([name, content]) => ({
    nameBytes: encoder.encode(name),
    dataBytes: content instanceof Uint8Array ? content : encoder.encode(content),
  }));

  const localSize = normalized.reduce((sum, file) => sum + 30 + file.nameBytes.length + file.dataBytes.length, 0);
  const centralSize = normalized.reduce((sum, file) => sum + 46 + file.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const localOffsets = [];
  let offset = 0;

  for (const file of normalized) {
    localOffsets.push(offset);
    writeLocalHeader(view, offset, file.nameBytes, file.dataBytes);
    out.set(file.nameBytes, offset + 30);
    out.set(file.dataBytes, offset + 30 + file.nameBytes.length);
    offset += 30 + file.nameBytes.length + file.dataBytes.length;
  }

  const centralOffset = offset;
  normalized.forEach((file, index) => {
    writeCentralHeader(view, offset, file.nameBytes, file.dataBytes, localOffsets[index]);
    out.set(file.nameBytes, offset + 46);
    offset += 46 + file.nameBytes.length;
  });

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, normalized.length, true);
  view.setUint16(offset + 10, normalized.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralOffset, true);

  return out;
}

function writeLocalHeader(view, offset, nameBytes, dataBytes) {
  view.setUint32(offset, 0x04034b50, true);
  view.setUint16(offset + 4, 20, true);
  view.setUint16(offset + 26, nameBytes.length, true);
  view.setUint32(offset + 18, dataBytes.length, true);
  view.setUint32(offset + 22, dataBytes.length, true);
}

function writeCentralHeader(view, offset, nameBytes, dataBytes, localOffset) {
  view.setUint32(offset, 0x02014b50, true);
  view.setUint16(offset + 4, 20, true);
  view.setUint16(offset + 6, 20, true);
  view.setUint32(offset + 20, dataBytes.length, true);
  view.setUint32(offset + 24, dataBytes.length, true);
  view.setUint16(offset + 28, nameBytes.length, true);
  view.setUint32(offset + 42, localOffset, true);
}
