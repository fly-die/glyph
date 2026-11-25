export interface CharGroup {
  title: string;
  chars: readonly string[];
}

export const CHAR_GROUPS: readonly CharGroup[] = [
  { title: 'Uppercase', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
  { title: 'Lowercase', chars: [...'abcdefghijklmnopqrstuvwxyz'] },
  { title: 'Numerals', chars: [...'0123456789'] },
];

export const CHARSET: readonly string[] = CHAR_GROUPS.flatMap((group) => group.chars);
