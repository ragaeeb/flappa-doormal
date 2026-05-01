import type { DictionaryEntryPatternOptions, SplitRule } from '@/types/rules.js';
import { makeDiacriticInsensitive, normalizeArabicForComparison } from '@/utils/textUtils.js';
import { ARABIC_LETTER_WITH_OPTIONAL_MARKS_PATTERN, ARABIC_MARKS_CLASS } from '../segmentation/tokens.js';

export interface ArabicDictionaryEntryRuleOptions extends DictionaryEntryPatternOptions {
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
     * Static metadata merged into matching segments.
     */
    meta?: Record<string, unknown>;
}

type DictionaryEntryRegexSource = {
    captureNames: string[];
    regex: string;
};

const uniqueCanonicalWords = (words: string[]) => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const word of words) {
        const normalized = normalizeArabicForComparison(word);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(word);
    }

    return result;
};

const buildStopAlternation = (stopWords: string[]) => {
    const unique = uniqueCanonicalWords(stopWords);
    if (unique.length === 0) {
        return '';
    }
    return unique.map((word) => makeDiacriticInsensitive(normalizeArabicForComparison(word))).join('|');
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
    captureName: string;
    headwordBody: string;
}) => {
    const colon = allowWhitespaceBeforeColon ? '\\s*:' : ':';
    const withCapture = `(?<${captureName}>${headwordBody})`;

    if (!allowParenthesized) {
        return `${withCapture}${colon}`;
    }

    return `(?:\\(\\s*${withCapture}\\s*\\)|${withCapture})${colon}`;
};

const validateDictionaryEntryOptions = ({
    captureName = 'lemma',
    maxLetters = 10,
    minLetters = 2,
}: Pick<DictionaryEntryPatternOptions, 'captureName' | 'maxLetters' | 'minLetters'>) => {
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
};

export const buildArabicDictionaryEntryRegexSource = (
    {
        allowCommaSeparated = false,
        allowParenthesized = false,
        allowWhitespaceBeforeColon = false,
        captureName = 'lemma',
        maxLetters = 10,
        midLineSubentries = true,
        minLetters = 2,
        stopWords,
    }: DictionaryEntryPatternOptions,
    capturePrefix?: string,
): DictionaryEntryRegexSource => {
    validateDictionaryEntryOptions({ captureName, maxLetters, minLetters });

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
    const prefixedCaptureName = capturePrefix ? `${capturePrefix}${captureName}` : captureName;
    const regex =
        `(?:${lineStartBoundary}${midLineSubentries ? `|${midLineTrigger}` : ''})` +
        buildBalancedMarker({
            allowParenthesized,
            allowWhitespaceBeforeColon,
            captureName: prefixedCaptureName,
            headwordBody: lemmaBody,
        });

    return {
        captureNames: [prefixedCaptureName],
        regex,
    };
};

/**
 * Creates a reusable split rule for Arabic dictionary entries.
 *
 * The returned rule preserves authoring intent as a serializable
 * `{ dictionaryEntry: ... }` pattern rather than eagerly compiling to a raw
 * regex string.
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
    midLineSubentries = true,
    minLetters = 2,
    pageStartPrevWordStoplist,
    samePagePrevWordStoplist,
    stopWords,
}: ArabicDictionaryEntryRuleOptions): SplitRule => {
    validateDictionaryEntryOptions({ captureName, maxLetters, minLetters });

    return {
        dictionaryEntry: {
            allowCommaSeparated,
            allowParenthesized,
            allowWhitespaceBeforeColon,
            captureName,
            maxLetters,
            midLineSubentries,
            minLetters,
            stopWords: uniqueCanonicalWords(stopWords),
        },
        meta,
        pageStartPrevWordStoplist,
        samePagePrevWordStoplist,
    };
};
