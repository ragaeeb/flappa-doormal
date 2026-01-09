/**
 * Character class matching all Arabic diacritics (Tashkeel/Harakat).
 *
 * Includes the following diacritical marks:
 * - U+064B: ً (fathatan - double fatha)
 * - U+064C: ٌ (dammatan - double damma)
 * - U+064D: ٍ (kasratan - double kasra)
 * - U+064E: َ (fatha - short a)
 * - U+064F: ُ (damma - short u)
 * - U+0650: ِ (kasra - short i)
 * - U+0651: ّ (shadda - gemination)
 * - U+0652: ْ (sukun - no vowel)
 *
 * @internal
 */
const DIACRITICS_CLASS = '[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]';

/**
 * Groups of equivalent Arabic characters.
 *
 * Characters within the same group are considered equivalent for matching purposes.
 * This handles common variations in Arabic text where different characters are
 * used interchangeably or have the same underlying meaning.
 *
 * Equivalence groups:
 * - Alef variants: ا (bare), آ (with madda), أ (with hamza above), إ (with hamza below)
 * - Ta marbuta and Ha: ة ↔ ه (often interchangeable at word endings)
 * - Alef maqsura and Ya: ى ↔ ي (often interchangeable at word endings)
 *
 * @internal
 */
const EQUIV_GROUPS: string[][] = [
    ['\u0627', '\u0622', '\u0623', '\u0625'], // ا, آ, أ, إ
    ['\u0629', '\u0647'], // ة <-> ه
    ['\u0649', '\u064A'], // ى <-> ي
];

/**
 * Escapes a string for safe inclusion in a regular expression.
 *
 * Escapes all regex metacharacters: `.*+?^${}()|[\]\\`
 *
 * @param s - Any string to escape
 * @returns String with regex metacharacters escaped
 *
 * @example
 * escapeRegex('hello.world')   // → 'hello\\.world'
 * escapeRegex('[test]')        // → '\\[test\\]'
 * escapeRegex('a+b*c?')        // → 'a\\+b\\*c\\?'
 */
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getEquivClass = (ch: string) => {
    const group = EQUIV_GROUPS.find((g) => g.includes(ch));
    return group ? `[${group.map(escapeRegex).join('')}]` : escapeRegex(ch);
};

const normalizeArabicLight = (str: string) =>
    str
        .normalize('NFC')
        .replace(/[\u200C\u200D]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

export const makeDiacriticInsensitive = (text: string) => {
    const diacriticsMatcher = `${DIACRITICS_CLASS}*`;
    return Array.from(normalizeArabicLight(text))
        .map((ch) => getEquivClass(ch) + diacriticsMatcher)
        .join('');
};
