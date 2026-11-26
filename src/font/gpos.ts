import { classDef, coverage, layoutTable, Writer } from './layout';

/**
 * A GPOS table with a single 'kern' feature holding one class based pair
 * adjustment (PairPos format 2). Every character is a class, so all versions
 * of a letter share its spacing. `values[a][b]` is the change of the advance
 * of class a + 1 before class b + 1. Null when nothing is kerned.
 */
export function buildGposTable(
  classes: ReadonlyMap<number, number>,
  values: readonly (readonly number[])[],
): Uint8Array | null {
  const count = values.length;
  if (count === 0 || !values.some((row) => row.some((value) => value !== 0))) return null;

  const out = new Writer();
  out.u16(2); // posFormat
  const coverageAt = out.length;
  out.u16(0);
  out.u16(0x0004); // advance of the first glyph
  out.u16(0); // nothing on the second glyph
  const classDefAt = out.length;
  out.u16(0);
  out.u16(0);
  out.u16(count + 1);
  out.u16(count + 1);
  // Class 0 holds every glyph not listed, its row and column stay zero.
  for (let first = 0; first <= count; first++) {
    for (let second = 0; second <= count; second++) {
      out.i16(first === 0 || second === 0 ? 0 : (values[first - 1]?.[second - 1] ?? 0));
    }
  }
  out.patch16(coverageAt, out.length);
  out.bytesOf(coverage([...classes.entries()].filter(([, value]) => value > 0).map(([glyph]) => glyph)));
  const classTable = out.length;
  out.patch16(classDefAt, classTable);
  out.patch16(classDefAt + 2, classTable);
  out.bytesOf(classDef(classes));
  return layoutTable('kern', [0], [{ type: 2, subtables: [out.done()] }]);
}
