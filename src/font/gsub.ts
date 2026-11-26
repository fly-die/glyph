import { coverage, layoutTable, Writer, type Lookup } from './layout';

/** Glyph ids of one character: the main glyph and its extra versions in order. */
export interface VariantSet {
  main: number;
  alternates: number[];
}

/** Single substitution (format 2): each covered glyph becomes the matching replacement. */
function singleSubstitution(pairs: readonly [number, number][]): Uint8Array {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const out = new Writer();
  out.u16(2);
  const coverageAt = out.length;
  out.u16(0);
  out.u16(sorted.length);
  for (const [, to] of sorted) out.u16(to);
  out.patch16(coverageAt, out.length);
  out.bytesOf(coverage(sorted.map(([from]) => from)));
  return out.done();
}

/**
 * Chained context (format 3): when the glyph before is one of `before` and
 * the current glyph one of `current`, run `lookup` on it. Without a lookup
 * the rule only matches, which keeps later rules from changing the glyph.
 */
function chainRule(before: readonly number[], current: readonly number[], lookup: number | null): Uint8Array {
  const out = new Writer();
  out.u16(3);
  out.u16(1); // one glyph of backtrack
  const backtrackAt = out.length;
  out.u16(0);
  out.u16(1); // one input glyph
  const inputAt = out.length;
  out.u16(0);
  out.u16(0); // no lookahead
  out.u16(lookup === null ? 0 : 1);
  if (lookup !== null) {
    out.u16(0); // on the input glyph
    out.u16(lookup);
  }
  out.patch16(backtrackAt, out.length);
  out.bytesOf(coverage(before));
  out.patch16(inputAt, out.length);
  out.bytesOf(coverage(current));
  return out.done();
}

/**
 * A GSUB table with a 'calt' feature that rotates through the versions of a
 * character. A letter that follows itself takes its next version, so double
 * letters never look stamped. Elsewhere the glyph before decides which
 * version is used, so the same word looks the same everywhere while different
 * words vary. Null when no character has more than one version.
 */
export function buildGsubTable(sets: readonly VariantSet[], glyphCount: number): Uint8Array | null {
  const varied = sets.filter((set) => set.alternates.length > 0);
  if (varied.length === 0) return null;
  const withFirst = varied.map((set): [number, number] => [set.main, set.alternates[0] as number]);
  const withSecond = varied
    .filter((set) => set.alternates.length > 1)
    .map((set): [number, number] => [set.main, set.alternates[1] as number]);

  const TO_FIRST = 0;
  const TO_SECOND = 1;
  const rules: Uint8Array[] = [];
  for (const set of varied) {
    const [first, second] = set.alternates;
    rules.push(chainRule([set.main], [set.main], TO_FIRST));
    rules.push(chainRule([first as number], [set.main], second === undefined ? null : TO_SECOND));
    if (second !== undefined) rules.push(chainRule([second], [set.main], null));
  }
  const all = Array.from({ length: glyphCount }, (_, id) => id);
  rules.push(
    chainRule(
      all.filter((id) => id % 3 === 1),
      withFirst.map(([main]) => main),
      TO_FIRST,
    ),
  );
  if (withSecond.length > 0) {
    rules.push(
      chainRule(
        all.filter((id) => id % 3 === 2),
        withSecond.map(([main]) => main),
        TO_SECOND,
      ),
    );
  }

  const lookups: Lookup[] = [
    { type: 1, subtables: [singleSubstitution(withFirst)] },
    { type: 1, subtables: [singleSubstitution(withSecond.length > 0 ? withSecond : withFirst)] },
    { type: 6, subtables: rules },
  ];
  return layoutTable('calt', [2], lookups);
}
