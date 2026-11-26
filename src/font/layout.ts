/** Big-endian byte writer for OpenType tables. */
export class Writer {
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
    if (value > 0xffff) throw new Error('Offset does not fit in 16 bits');
    this.bytes[at] = (value >> 8) & 0xff;
    this.bytes[at + 1] = value & 0xff;
  }

  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** A coverage table (format 1): the sorted glyph ids it applies to. */
export function coverage(glyphIds: readonly number[]): Uint8Array {
  const sorted = [...new Set(glyphIds)].sort((a, b) => a - b);
  const out = new Writer();
  out.u16(1);
  out.u16(sorted.length);
  for (const id of sorted) out.u16(id);
  return out.done();
}

/** A class definition table (format 2), one range per glyph. Glyphs not listed are class 0. */
export function classDef(classes: ReadonlyMap<number, number>): Uint8Array {
  const entries = [...classes.entries()].filter(([, value]) => value > 0).sort((a, b) => a[0] - b[0]);
  const out = new Writer();
  out.u16(2);
  out.u16(entries.length);
  for (const [glyph, value] of entries) {
    out.u16(glyph);
    out.u16(glyph);
    out.u16(value);
  }
  return out.done();
}

export interface Lookup {
  type: number;
  subtables: Uint8Array[];
}

/**
 * A GSUB or GPOS table with one feature for the default and the Latin
 * script. `featureLookups` are the lookups the feature runs; others are only
 * called from those.
 */
export function layoutTable(feature: string, featureLookups: readonly number[], lookups: readonly Lookup[]): Uint8Array {
  const out = new Writer();
  out.u16(1);
  out.u16(0);
  const listsAt = out.length;
  out.u16(0);
  out.u16(0);
  out.u16(0);

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
  out.tag(feature);
  out.u16(8); // the feature table follows this 8 byte list
  out.u16(0); // no feature parameters
  out.u16(featureLookups.length);
  for (const index of featureLookups) out.u16(index);

  out.patch16(listsAt + 4, out.length);
  const lookupListStart = out.length;
  out.u16(lookups.length);
  const lookupOffsetsAt: number[] = [];
  for (let index = 0; index < lookups.length; index++) {
    lookupOffsetsAt.push(out.length);
    out.u16(0);
  }
  lookups.forEach((lookup, index) => {
    const lookupStart = out.length;
    out.patch16(lookupOffsetsAt[index] as number, lookupStart - lookupListStart);
    out.u16(lookup.type);
    out.u16(0); // no flags
    out.u16(lookup.subtables.length);
    const subtableOffsetsAt: number[] = [];
    for (let s = 0; s < lookup.subtables.length; s++) {
      subtableOffsetsAt.push(out.length);
      out.u16(0);
    }
    lookup.subtables.forEach((subtable, s) => {
      out.patch16(subtableOffsetsAt[s] as number, out.length - lookupStart);
      out.bytesOf(subtable);
    });
  });
  return out.done();
}
