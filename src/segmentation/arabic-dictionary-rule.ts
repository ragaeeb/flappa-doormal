import type { SplitRule } from '@/types/rules.js';
import { makeDiacriticInsensitive, normalizeArabicForComparison } from '@/utils/textUtils.js';
import { ARABIC_LETTER_WITH_OPTIONAL_MARKS_PATTERN, ARABIC_MARKS_CLASS } from './tokens.js';

export interface ArabicDictionaryEntryRuleOptions {
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
}

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

const buildHeadwordBody = ({
    allowCommaSeparated,
    colonPattern,
    stopAlternation,
    stopwordBody,
    unit,
}: {
    allowCommaSeparated: boolean;
    colonPattern: string;
    stopAlternation: string;
    stopwordBody: string;
    unit: string;
}) => {
    if (!stopAlternation) {
        return allowCommaSeparated ? `${unit}(?:\\s*[،,]\\s*${unit})*` : unit;
    }

    const stopwordBoundary = allowCommaSeparated ? `(?:\\s*[،,]\\s*|${colonPattern})` : colonPattern;
    const guardedUnit = `(?!(?:${stopwordBody})${stopwordBoundary})${unit}`;

    return allowCommaSeparated ? `${guardedUnit}(?:\\s*[،,]\\s*${guardedUnit})*` : guardedUnit;
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

    return `(?:\\(\\s*${withCapture}\\s*\\)|${withCapture})${colon}`;
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

    const zeroWidthPrefix = '[\\u200E\\u200F\\u061C\\u200B\\u200C\\u200D\\uFEFF]*';
    const wawWithMarks = `و${ARABIC_MARKS_CLASS}*`;
    const alWithMarks = `ا${ARABIC_MARKS_CLASS}*ل${ARABIC_MARKS_CLASS}*`;
    const stem = `${ARABIC_LETTER_WITH_OPTIONAL_MARKS_PATTERN}(?:${ARABIC_LETTER_WITH_OPTIONAL_MARKS_PATTERN}){${minLetters - 1},${maxLetters - 1}}`;
    const lemmaUnit = `(?:${wawWithMarks})?(?:${alWithMarks})?${stem}`;
    const stopAlternation = buildStopAlternation(stopWords);
    const colonPattern = allowWhitespaceBeforeColon ? '\\s*:' : ':';
    const stopwordBody = stopAlternation ? `(?:${wawWithMarks})?(?:${stopAlternation})` : '';
    const lemmaBody = buildHeadwordBody({
        allowCommaSeparated,
        colonPattern,
        stopAlternation,
        stopwordBody,
        unit: lemmaUnit,
    });
    const lineStartBoundary = `(?:(?<=^)|(?<=\\n))${zeroWidthPrefix}`;
    const midLineTrigger = allowParenthesized
        ? `(?<=\\s)(?=(?:\\(\\s*)?${wawWithMarks}(?:${alWithMarks})?)`
        : `(?<=\\s)(?=${wawWithMarks}(?:${alWithMarks})?)`;
    const regex =
        `(?:${lineStartBoundary}|${midLineTrigger})` +
        buildBalancedMarker({
            allowParenthesized,
            allowWhitespaceBeforeColon,
            captureName,
            headwordBody: lemmaBody,
        });

    return {
        meta,
        pageStartPrevWordStoplist,
        regex,
        samePagePrevWordStoplist,
        split: 'at',
    };
};
