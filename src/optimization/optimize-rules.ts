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

const serializePrimitive = (value: null | boolean | number | string | bigint | symbol | undefined) => {
    if (value === undefined) {
        return 'undefined';
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value));
    }
    if (typeof value === 'bigint') {
        return JSON.stringify(`${value}n`);
    }
    if (typeof value === 'symbol') {
        return JSON.stringify(value.toString());
    }
    return JSON.stringify(value);
};

const stableSerializeArray = (values: unknown[], seen: WeakSet<object>): string =>
    `[${values.map((value) => stableSerializeValue(value, seen)).join(',')}]`;

const stableSerializeObject = (value: object, seen: WeakSet<object>): string => {
    if (seen.has(value)) {
        throw new TypeError('Cannot optimize rules with circular option values');
    }

    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
    const serialized = entries
        .map(([entryKey, entryValue]) => `${JSON.stringify(entryKey)}:${stableSerializeValue(entryValue, seen)}`)
        .join(',');
    seen.delete(value);
    return `{${serialized}}`;
};

const stableSerializeValue = (value: unknown, seen: WeakSet<object>): string => {
    if (typeof value === 'function') {
        return JSON.stringify(`[Function:${value.name || 'anonymous'}]`);
    }
    if (!value || typeof value !== 'object') {
        return serializePrimitive(value as null | boolean | number | string | bigint | symbol | undefined);
    }
    if (Array.isArray(value)) {
        return stableSerializeArray(value, seen);
    }
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (value instanceof RegExp) {
        return JSON.stringify(value.toString());
    }
    return stableSerializeObject(value, seen);
};

const stableSerialize = (value: unknown) => stableSerializeValue(value, new WeakSet<object>());

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
    const options = Object.fromEntries(Object.entries(rule).filter(([field]) => field !== key));
    return `${key}|${stableSerialize(options)}`;
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
