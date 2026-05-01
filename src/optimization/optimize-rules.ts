import { PATTERN_TYPE_KEYS, type PatternTypeKey, type SplitRule } from '@/types/rules.js';

// Keys that support array patterns and can be merged
const MERGEABLE_KEYS = new Set<PatternTypeKey>(['lineStartsWith', 'lineStartsAfter', 'lineEndsWith']);

/**
 * Result from optimizing rules.
 */
export type OptimizeResult = {
    /** Optimized rules (merged and sorted by specificity) */
    rules: SplitRule[];
    /** Number of rules that were merged into existing rules */
    mergedCount: number;
};

/**
 * Get the pattern type key for a rule.
 */
const getPatternKey = (rule: SplitRule) => PATTERN_TYPE_KEYS.find((key) => key in rule) ?? 'regex';

const getPatternArray = (rule: SplitRule, key: PatternTypeKey) => {
    const value = (rule as Record<string, unknown>)[key];
    return Array.isArray(value) ? (value as string[]) : [];
};

const getPatternString = (rule: SplitRule, key: PatternTypeKey) => {
    const value = (rule as Record<string, unknown>)[key];
    return typeof value === 'string'
        ? value
        : Array.isArray(value)
          ? value.join('\n')
          : value
            ? JSON.stringify(value)
            : '';
};

const normalizePatterns = (patterns: string[]) =>
    [...new Set(patterns)].sort((a, b) => b.length - a.length || a.localeCompare(b));

const getDictionaryEntrySpecificityScore = (rule: SplitRule) => {
    if (!('dictionaryEntry' in rule) || !rule.dictionaryEntry) {
        return 0;
    }

    const {
        allowCommaSeparated = false,
        allowParenthesized = false,
        allowWhitespaceBeforeColon = false,
        maxLetters = 10,
        midLineSubentries = true,
        minLetters = 2,
        stopWords,
    } = rule.dictionaryEntry;

    return (
        minLetters * 20 +
        maxLetters +
        (allowCommaSeparated ? 0 : 120) +
        (allowParenthesized ? 0 : 60) +
        (allowWhitespaceBeforeColon ? 0 : 20) +
        (midLineSubentries ? 0 : 160) +
        Math.min(stopWords.length, 25)
    );
};

const getSpecificityScore = (rule: SplitRule) => {
    const key = getPatternKey(rule);
    if (key === 'dictionaryEntry') {
        return getDictionaryEntrySpecificityScore(rule);
    }
    return MERGEABLE_KEYS.has(key)
        ? getPatternArray(rule, key).reduce((max, p) => Math.max(max, p.length), 0)
        : getPatternString(rule, key).length;
};

const createMergeKey = (rule: SplitRule) => {
    const key = getPatternKey(rule);
    const { [key]: _, ...rest } = rule as any;
    return `${key}|${JSON.stringify(rest)}`;
};

export const optimizeRules = (rules: SplitRule[]) => {
    const output: SplitRule[] = [];
    const indexByMergeKey = new Map<string, number>();
    let mergedCount = 0;

    for (const rule of rules) {
        const key = getPatternKey(rule);
        if (!MERGEABLE_KEYS.has(key)) {
            output.push(rule);
            continue;
        }

        const mergeKey = createMergeKey(rule);
        const existingIndex = indexByMergeKey.get(mergeKey);

        if (existingIndex === undefined) {
            indexByMergeKey.set(mergeKey, output.length);
            output.push({ ...rule, [key]: normalizePatterns(getPatternArray(rule, key)) } as SplitRule);
        } else {
            const existing = output[existingIndex] as any;
            existing[key] = normalizePatterns([...getPatternArray(existing, key), ...getPatternArray(rule, key)]);
            mergedCount++;
        }
    }

    return { mergedCount, rules: output.sort((a, b) => getSpecificityScore(b) - getSpecificityScore(a)) };
};
