/**
 * Adds tables to a finished OpenType file. opentype.js writes the outlines,
 * names and metrics, but no positioning, so kerning is added afterwards. The
 * table directory, checksums and the head checksum adjustment are rebuilt.
 */
export function addTables(font: ArrayBuffer, extra: Readonly<Record<string, Uint8Array>>): ArrayBuffer {
  const view = new DataView(font);
  const flavor = view.getUint32(0);
  const count = view.getUint16(4);
  const tables = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(...new Uint8Array(font, record, 4));
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    tables.set(tag, new Uint8Array(font.slice(offset, offset + length)));
  }
  for (const [tag, data] of Object.entries(extra)) tables.set(tag, data);

  const tags = [...tables.keys()].sort();
  const headerLength = 12 + tags.length * 16;
  let size = headerLength;
  for (const tag of tags) size += align(tables.get(tag)?.length ?? 0);

  const out = new ArrayBuffer(size);
  const bytes = new Uint8Array(out);
  const outView = new DataView(out);
  const power = 2 ** Math.floor(Math.log2(tags.length));
  outView.setUint32(0, flavor);
  outView.setUint16(4, tags.length);
  outView.setUint16(6, power * 16);
  outView.setUint16(8, Math.log2(power));
  outView.setUint16(10, tags.length * 16 - power * 16);

  let offset = headerLength;
  let headOffset = -1;
  tags.forEach((tag, index) => {
    const data = tables.get(tag) ?? new Uint8Array();
    bytes.set(data, offset);
    if (tag === 'head') {
      headOffset = offset;
      outView.setUint32(offset + 8, 0); // checkSumAdjustment is computed over a zero
    }
    const record = 12 + index * 16;
    for (let char = 0; char < 4; char++) bytes[record + char] = tag.charCodeAt(char);
    outView.setUint32(record + 4, checksum(outView, offset, data.length));
    outView.setUint32(record + 8, offset);
    outView.setUint32(record + 12, data.length);
    offset += align(data.length);
  });
  if (headOffset >= 0) {
    outView.setUint32(headOffset + 8, (0xb1b0afba - checksum(outView, 0, size)) >>> 0);
  }
  return out;
}

function align(length: number): number {
  return (length + 3) & ~3;
}

function checksum(view: DataView, offset: number, length: number): number {
  let sum = 0;
  for (let at = offset; at < offset + align(length); at += 4) sum = (sum + view.getUint32(at)) >>> 0;
  return sum;
}
