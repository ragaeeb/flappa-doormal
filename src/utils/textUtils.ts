/**
 * Normalizes line endings to Unix-style (`\n`).
 *
 * Converts Windows (`\r\n`) and old Mac (`\r`) line endings to Unix style
 * for consistent pattern matching across platforms.
 *
 * @param content - Raw content with potentially mixed line endings
 * @returns Content with all line endings normalized to `\n`
 */
// OPTIMIZATION: Fast-path when no \r present (common case for Unix/Mac content)
export const normalizeLineEndings = (content: string) => {
    return content.includes('\r') ? content.replace(/\r\n?/g, '\n') : content;
};

/**
 * Escapes regex metacharacters (parentheses and brackets) in template patterns,
 * but preserves content inside `{{...}}` token delimiters.
 *
 * This allows users to write intuitive patterns like `({{harf}}):` instead of
 * the verbose `\\({{harf}}\\):`. The escaping is applied BEFORE token expansion,
 * so tokens like `{{harf}}` which expand to `[أ-ي]` work correctly.
 *
 * @param pattern - Template pattern that may contain `()[]` and `{{tokens}}`
 * @returns Pattern with `()[]` escaped outside of `{{...}}` delimiters
 *
 * @example
 * escapeTemplateBrackets('({{harf}}): ')
 * // → '\\({{harf}}\\): '
 *
 * @example
 * escapeTemplateBrackets('[{{raqm}}] ')
 * // → '\\[{{raqm}}\\] '
 *
 * @example
 * escapeTemplateBrackets('{{harf}}')
 * // → '{{harf}}' (unchanged - no brackets outside tokens)
 */
export const escapeTemplateBrackets = (pattern: string) => {
    return pattern.replace(/(\{\{[^}]*\}\})|([()[\]])/g, (_match, token, bracket) => token || `\\${bracket}`);
};

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
const EQUIV_GROUPS = [
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

const normalizeArabicLight = (str: string) => {
    return str
        .normalize('NFC')
        .replace(/[\u200C\u200D]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

export const makeDiacriticInsensitive = (text: string) => {
    const diacriticsMatcher = `${DIACRITICS_CLASS}*`;
    return Array.from(normalizeArabicLight(text))
        .map((ch) => getEquivClass(ch) + diacriticsMatcher)
        .join('');
};

const isCombiningMarkOrSelector = (char: string | undefined) => {
    if (!char) {
        return false;
    }
    // \p{M} = Unicode combining mark category (includes Arabic harakat)
    // FE0E/FE0F = variation selectors
    return /\p{M}/u.test(char) || char === '\uFE0E' || char === '\uFE0F';
};

const isJoiner = (char: string | undefined) => char === '\u200C' || char === '\u200D';

/**
 * Ensures the position does not split a grapheme cluster (surrogate pairs,
 * combining marks, or zero-width joiners / variation selectors).
 *
 * This is only used as a last-resort fallback when we are forced to split
 * near a hard limit (e.g. maxContentLength with no safe whitespace/punctuation).
 */
export const adjustForUnicodeBoundary = (content: string, position: number) => {
    let adjusted = position;

    while (adjusted > 0) {
        // 1. Ensure we don't split a surrogate pair
        // (High surrogate at adjusted-1, Low surrogate at adjusted)
        const high = content.charCodeAt(adjusted - 1);
        const low = content.charCodeAt(adjusted);
        if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) {
            adjusted -= 1;
            continue;
        }

        const nextChar = content[adjusted];
        const prevChar = content[adjusted - 1];
        // 2. If we'd start the next segment with a combining mark / selector / joiner, back up.
        // For joiners, also avoid ending the previous segment with a joiner.
        // (Splitting AFTER combining marks / selectors is safe; splitting before them is not.)
        if (isCombiningMarkOrSelector(nextChar) || isJoiner(nextChar) || isJoiner(prevChar)) {
            adjusted -= 1;
            continue;
        }

        break;
    }
    return adjusted;
};
