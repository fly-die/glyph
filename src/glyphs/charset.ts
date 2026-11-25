export interface CharGroup {
  title: string;
  chars: readonly string[];
}

export const CHAR_GROUPS: readonly CharGroup[] = [
  { title: 'Uppercase', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
  { title: 'Lowercase', chars: [...'abcdefghijklmnopqrstuvwxyz'] },
  { title: 'Numerals', chars: [...'0123456789'] },
  { title: 'Punctuation', chars: [...'.,!?\'"-()&@'] },
];

export const CHARSET: readonly string[] = CHAR_GROUPS.flatMap((group) => group.chars);

const DIGIT_NAMES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** Standard PostScript glyph names for characters that are not letters or digits. */
const PUNCTUATION_NAMES: Readonly<Record<string, string>> = {
  '.': 'period',
  ',': 'comma',
  '!': 'exclam',
  '?': 'question',
  "'": 'quotesingle',
  '"': 'quotedbl',
  '-': 'hyphen',
  '(': 'parenleft',
  ')': 'parenright',
  '&': 'ampersand',
  '@': 'at',
};

/**
 * Typographic variants that should show the drawn glyph. Mac and iOS apps
 * turn straight quotes into curly ones as you type, so without these the font
 * would show empty boxes in place of quotes.
 */
const EXTRA_CODE_POINTS: Readonly<Record<string, readonly number[]>> = {
  "'": [0x2018, 0x2019],
  '"': [0x201c, 0x201d],
  '-': [0x2010],
};

export function glyphName(char: string): string {
  if (/^[A-Za-z]$/.test(char)) return char;
  if (/^[0-9]$/.test(char)) return DIGIT_NAMES[Number(char)] ?? char;
  const name = PUNCTUATION_NAMES[char];
  if (!name) throw new Error(`No glyph name for ${JSON.stringify(char)}`);
  return name;
}

/** Every code point the glyph for `char` is mapped to, the plain one first. */
export function codePoints(char: string): number[] {
  return [char.codePointAt(0) ?? 0, ...(EXTRA_CODE_POINTS[char] ?? [])];
}

const CELL_BY_CODE_POINT = new Map<number, string>(
  CHARSET.flatMap((char) => codePoints(char).map((code): [number, string] => [code, char])),
);

/** The cell whose drawing a typed character shows, or null when no cell covers it. */
export function cellFor(char: string): string | null {
  return CELL_BY_CODE_POINT.get(char.codePointAt(0) ?? -1) ?? null;
}
