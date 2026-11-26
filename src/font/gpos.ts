import type { KernPair } from './kerning';

/** Big-endian byte writer for OpenType tables. */
class Writer {
  private readonly bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  u16(value: number): void {
    this.bytes.push((value >> 8) & 0xff, value & 0xff);
  }

  i16(value: number): void {
    this.u16(value < 0 ? value + 0x10000 : value);
  }

  tag(value: string): void {
    for (let index = 0; index < 4; index++) this.bytes.push(value.charCodeAt(index));
  }

  bytesOf(other: Uint8Array): void {
    for (const byte of other) this.bytes.push(byte);
  }

  /** Overwrites a 16-bit value written earlier, for offsets known only later. */
  patch16(at: number, value: number): void {
    this.bytes[at] = (value >> 8) & 0xff;
    this.bytes[at + 1] = value & 0xff;
  }

  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const VALUE_FORMAT_X_ADVANCE = 0x0004;

/** One PairPos format 1 subtable: per first glyph, the second glyphs and the advance change. */
function pairPosSubtable(pairs: readonly KernPair[], glyphIds: ReadonlyMap<string, number>): Uint8Array {
  const byFirst = new Map<number, { second: number; value: number }[]>();
  for (const pair of pairs) {
    const first = glyphIds.get(pair.left);
    const second = glyphIds.get(pair.right);
    if (first === undefined || second === undefined) continue;
    const list = byFirst.get(first) ?? [];
    list.push({ second, value: pair.value });
    byFirst.set(first, list);
  }
  const firsts = [...byFirst.keys()].sort((a, b) => a - b);

  const out = new Writer();
  out.u16(1); // posFormat
  const coverageAt = out.length;
  out.u16(0); // coverage offset, patched below
  out.u16(VALUE_FORMAT_X_ADVANCE);
  out.u16(0); // nothing on the second glyph
  out.u16(firsts.length);
  const pairSetAt = out.length;
  for (let index = 0; index < firsts.length; index++) out.u16(0);

  out.patch16(coverageAt, out.length);
  out.u16(1); // coverage format: a sorted glyph list
  out.u16(firsts.length);
  for (const first of firsts) out.u16(first);

  firsts.forEach((first, index) => {
    out.patch16(pairSetAt + index * 2, out.length);
    const records = (byFirst.get(first) ?? []).sort((a, b) => a.second - b.second);
    out.u16(records.length);
    for (const { second, value } of records) {
      out.u16(second);
      out.i16(value);
    }
  });
  return out.done();
}

/**
 * A GPOS table with a single 'kern' feature for the default and the Latin
 * script, holding the pairs as one pair adjustment lookup. Null when there is
 * nothing to kern.
 */
export function buildGposTable(pairs: readonly KernPair[], glyphIds: ReadonlyMap<string, number>): Uint8Array | null {
  if (!pairs.some((pair) => glyphIds.has(pair.left) && glyphIds.has(pair.right))) return null;
  const subtable = pairPosSubtable(pairs, glyphIds);

  const out = new Writer();
  out.u16(1);
  out.u16(0);
  const listsAt = out.length;
  out.u16(0); // script list
  out.u16(0); // feature list
  out.u16(0); // lookup list

  // Script list: DFLT and latn share one language system that turns on feature 0.
  out.patch16(listsAt, out.length);
  const scriptListStart = out.length;
  const scripts = ['DFLT', 'latn'];
  out.u16(scripts.length);
  const scriptOffsetsAt: number[] = [];
  for (const script of scripts) {
    out.tag(script);
    scriptOffsetsAt.push(out.length);
    out.u16(0);
  }
  for (const at of scriptOffsetsAt) {
    out.patch16(at, out.length - scriptListStart);
    out.u16(4); // default language system follows this 4 byte header
    out.u16(0); // no other language systems
    out.u16(0); // lookupOrder, reserved
    out.u16(0xffff); // no required feature
    out.u16(1);
    out.u16(0);
  }

  out.patch16(listsAt + 2, out.length);
  out.u16(1);
  out.tag('kern');
  out.u16(8); // the feature table follows this 8 byte list
  out.u16(0); // no feature parameters
  out.u16(1);
  out.u16(0);

  out.patch16(listsAt + 4, out.length);
  out.u16(1);
  out.u16(4); // the lookup follows this 4 byte list
  out.u16(2); // pair adjustment
  out.u16(0); // no flags
  out.u16(1);
  out.u16(8); // the subtable follows this 8 byte lookup header
  out.bytesOf(subtable);
  return out.done();
}
