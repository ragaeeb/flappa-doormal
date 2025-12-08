/**
 * Fuzzy matching utilities for Arabic text.
 *
 * Provides diacritic-insensitive and character-equivalence matching for Arabic text.
 * This allows matching text regardless of:
 * - Diacritical marks (harakat/tashkeel): فَتْحَة، ضَمَّة، كَسْرَة، سُكُون، شَدَّة، تَنْوين
 * - Character equivalences: ا↔آ↔أ↔إ, ة↔ه, ى↔ي
 *
 * @module fuzzy
 *
 * @example
 * // Make a pattern diacritic-insensitive
 * const pattern = makeDiacriticInsensitive('حدثنا');
 * new RegExp(pattern, 'u').test('حَدَّثَنَا') // → true
 */

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
export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Returns a regex character class for all equivalents of a given character.
 *
 * If the character belongs to one of the predefined equivalence groups
 * (e.g., ا/آ/أ/إ), the returned class will match any member of that group.
 * Otherwise, the original character is simply escaped for safe regex inclusion.
 *
 * @param ch - A single character to expand into its equivalence class
 * @returns A RegExp-safe string representing the character and its equivalents
 *
 * @example
 * getEquivClass('ا') // → '[اآأإ]' (matches any alef variant)
 * getEquivClass('ب') // → 'ب' (no equivalents, just escaped)
 * getEquivClass('.') // → '\\.' (regex metachar escaped)
 *
 * @internal
 */
const getEquivClass = (ch: string): string => {
    for (const group of EQUIV_GROUPS) {
        if (group.includes(ch)) {
            // join the group's members into a character class
            return `[${group.map((c) => escapeRegex(c)).join('')}]`;
        }
    }
    // not in equivalence groups -> return escaped character
    return escapeRegex(ch);
};

/**
 * Performs light normalization on Arabic text for consistent matching.
 *
 * Normalization steps:
 * 1. NFC normalization (canonical decomposition then composition)
 * 2. Remove Zero-Width Joiner (U+200D) and Zero-Width Non-Joiner (U+200C)
 * 3. Collapse multiple whitespace characters to single space
 * 4. Trim leading and trailing whitespace
 *
 * This normalization preserves diacritics and letter forms while removing
 * invisible characters that could interfere with matching.
 *
 * @param str - Arabic text to normalize
 * @returns Normalized string
 *
 * @example
 * normalizeArabicLight('حَدَّثَنَا')           // → 'حَدَّثَنَا' (diacritics preserved)
 * normalizeArabicLight('بسم  الله')          // → 'بسم الله' (spaces collapsed)
 * normalizeArabicLight('  text  ')          // → 'text' (trimmed)
 *
 * @internal
 */
const normalizeArabicLight = (str: string) => {
    return str
        .normalize('NFC')
        .replace(/[\u200C\u200D]/g, '') // remove ZWJ/ZWNJ
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Creates a diacritic-insensitive regex pattern for Arabic text matching.
 *
 * Transforms input text into a regex pattern that matches the text regardless
 * of diacritical marks (harakat) and character variations. Each character in
 * the input is:
 * 1. Expanded to its equivalence class (if applicable)
 * 2. Followed by an optional diacritics matcher
 *
 * This allows matching:
 * - `حدثنا` with `حَدَّثَنَا` (with full diacritics)
 * - `الإيمان` with `الايمان` (alef variants)
 * - `صلاة` with `صلاه` (ta marbuta ↔ ha)
 *
 * @param text - Input Arabic text to make diacritic-insensitive
 * @returns Regex pattern string that matches the text with or without diacritics
 *
 * @example
 * const pattern = makeDiacriticInsensitive('حدثنا');
 * // Each char gets equivalence class + optional diacritics
 * // Result matches: حدثنا, حَدَّثَنَا, حَدَثَنَا, etc.
 *
 * @example
 * const pattern = makeDiacriticInsensitive('باب');
 * new RegExp(pattern, 'u').test('بَابٌ')  // → true
 * new RegExp(pattern, 'u').test('باب')   // → true
 *
 * @example
 * // Using with split rules
 * {
 *   lineStartsWith: ['باب'],
 *   split: 'at',
 *   fuzzy: true  // Applies makeDiacriticInsensitive internally
 * }
 */
export const makeDiacriticInsensitive = (text: string) => {
    const diacriticsMatcher = `${DIACRITICS_CLASS}*`;
    const norm = normalizeArabicLight(text);
    // Use Array.from to iterate grapheme-safe over the string (works fine for Arabic letters)
    return Array.from(norm)
        .map((ch) => getEquivClass(ch) + diacriticsMatcher)
        .join('');
};
