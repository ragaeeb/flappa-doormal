import type { SplitRule } from '@/types/rules.js';
import { makeDiacriticInsensitive, normalizeArabicForComparison } from '@/utils/textUtils.js';
import { ARABIC_LETTER_WITH_OPTIONAL_MARKS_PATTERN } from './tokens.js';

export type ArabicDictionaryEntryRuleOptions = {
    /**
     * Words that should never be treated as lemmas when followed by a colon.
     *
     * Matching is Arabic-normalized, diacritic-insensitive, and exact. Callers
     * should provide canonical forms only; vocalized variants do not need to be
     * listed separately.
     */
    stopWords: string[];

    /**
     * Allow balanced parenthesized headwords like `(عنبر):` or `(عنبر) :`.
     * @default false
     */
    allowParenthesized?: boolean;

    /**
     * Allow optional whitespace before the trailing colon.
     * @default false
     */
    allowWhitespaceBeforeColon?: boolean;

    /**
     * Allow comma-separated headword lists like `سبد، دبس:`.
     * @default false
     */
    allowCommaSeparated?: boolean;

    /**
     * Suppress page-start matches when the previous page's last Arabic word
     * is in this stoplist, unless that page ends with strong sentence punctuation.
     */
    pageStartPrevWordStoplist?: string[];

    /**
     * Suppress non-page-start matches when the immediately previous Arabic word
     * on the same page is in this stoplist.
     */
    samePagePrevWordStoplist?: string[];

    /**
     * Named capture key for the matched lemma.
     * @default 'lemma'
     */
    captureName?: string;

    /**
     * Minimum number of Arabic base letters in a lemma.
     * @default 2
     */
    minLetters?: number;

    /**
     * Maximum number of Arabic base letters in a lemma.
     * @default 10
     */
    maxLetters?: number;

    /**
     * Static metadata merged into matching segments.
     */
    meta?: Record<string, unknown>;
};

const uniqueNormalizedWords = (words: string[]) => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const word of words) {
        const normalized = normalizeArabicForComparison(word);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }

    return result;
};

const buildStopAlternation = (stopWords: string[]) => {
    const unique = uniqueNormalizedWords(stopWords);
    if (unique.length === 0) {
        return '';
    }
    return unique.map((word) => makeDiacriticInsensitive(word)).join('|');
};

const buildHeadwordBody = (unit: string, allowCommaSeparated: boolean) => {
    if (!allowCommaSeparated) {
        return unit;
    }
    return `${unit}(?:[،,]\\s*${unit})*`;
};

const buildBalancedMarker = ({
    allowParenthesized,
    allowWhitespaceBeforeColon,
    captureName,
    headwordBody,
}: {
    allowParenthesized: boolean;
    allowWhitespaceBeforeColon: boolean;
    captureName?: string;
    headwordBody: string;
}) => {
    const colon = allowWhitespaceBeforeColon ? '\\s*:' : ':';
    const withCapture = captureName ? `(?<${captureName}>${headwordBody})` : `(?:${headwordBody})`;

    if (!allowParenthesized) {
        return `${withCapture}${colon}`;
    }

    return `(?:\\(${withCapture}\\)|${withCapture})${colon}`;
};

/**
 * Creates a reusable split rule for Arabic dictionary entries.
 *
 * The generated rule:
 * - keeps the lemma marker in `segment.content`
 * - stores the lemma in `segment.meta[captureName]`
 * - matches root entries at true line/page starts
 * - matches mid-line subentries conservatively when they begin with `و`
 * - can optionally support parenthesized headwords like `(عنبر) :`
 * - can optionally support comma-separated headword lists like `سبد، دبس:`
 *
 * @example
 * createArabicDictionaryEntryRule({
 *   stopWords: ['وقيل', 'ويقال', 'قال'],
 *   pageStartPrevWordStoplist: ['قال', 'وقيل', 'ويقال'],
 * })
 *
 * @example
 * createArabicDictionaryEntryRule({
 *   allowParenthesized: true,
 *   allowWhitespaceBeforeColon: true,
 *   allowCommaSeparated: true,
 *   stopWords: ['الليث', 'العجاج'],
 * })
 */
export const createArabicDictionaryEntryRule = ({
    allowCommaSeparated = false,
    allowParenthesized = false,
    allowWhitespaceBeforeColon = false,
    captureName = 'lemma',
    maxLetters = 10,
    meta,
    minLetters = 2,
    pageStartPrevWordStoplist,
    samePagePrevWordStoplist,
    stopWords,
}: ArabicDictionaryEntryRuleOptions): SplitRule => {
    if (!Number.isInteger(minLetters) || minLetters < 1) {
        throw new Error(`createArabicDictionaryEntryRule: minLetters must be an integer >= 1, got ${minLetters}`);
    }
    if (!Number.isInteger(maxLetters) || maxLetters < minLetters) {
        throw new Error(
            `createArabicDictionaryEntryRule: maxLetters must be an integer >= minLetters, got ${maxLetters}`,
        );
    }
    if (!captureName.match(/^[A-Za-z_]\w*$/)) {
        throw new Error(`createArabicDictionaryEntryRule: invalid captureName "${captureName}"`);
    }

    const stem = `${ARABIC_LETTER_WITH_OPTIONAL_MARKS_PATTERN}(?:${ARABIC_LETTER_WITH_OPTIONAL_MARKS_PATTERN}){${minLetters - 1},${maxLetters - 1}}`;
    const lemmaUnit = `(?:و)?(?:ال)?${stem}`;
    const lemmaBody = buildHeadwordBody(lemmaUnit, allowCommaSeparated);
    const stopAlternation = buildStopAlternation(stopWords);
    const negativeLookahead = stopAlternation
        ? `(?!(?:${buildBalancedMarker({
              allowParenthesized,
              allowWhitespaceBeforeColon,
              headwordBody: stopAlternation,
          })}))`
        : '';
    const regex =
        `(?:(?<=^)|(?<=\\n)|(?<=\\s)(?=و(?:ال)?))` +
        negativeLookahead +
        buildBalancedMarker({
            allowParenthesized,
            allowWhitespaceBeforeColon,
            captureName,
            headwordBody: lemmaBody,
        });

    return {
        meta,
        pageStartPrevWordStoplist,
        samePagePrevWordStoplist,
        regex,
        split: 'at',
    };
};
