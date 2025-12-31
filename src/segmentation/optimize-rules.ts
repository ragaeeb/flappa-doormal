/**
 * Rule optimization utilities for merging and sorting split rules.
 *
 * Provides `optimizeRules()` to:
 * 1. Merge compatible rules with same pattern type and options
 * 2. Deduplicate patterns within each rule
 * 3. Sort rules by specificity (longer patterns first)
 *
 * @module optimize-rules
 */

import { PATTERN_TYPE_KEYS, type PatternTypeKey, type SplitRule } from './types.js';

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
const getPatternKey = (rule: SplitRule): PatternTypeKey => {
    for (const key of PATTERN_TYPE_KEYS) {
        if (key in rule) {
            return key;
        }
    }
    return 'regex'; // fallback
};

/**
 * Get the pattern array for a mergeable rule.
 */
const getPatternArray = (rule: SplitRule, key: PatternTypeKey): string[] => {
    const value = (rule as Record<string, unknown>)[key];
    return Array.isArray(value) ? (value as string[]) : [];
};

/**
 * Get a string representation of the pattern value (for specificity scoring).
 */
const getPatternString = (rule: SplitRule, key: PatternTypeKey): string => {
    const value = (rule as Record<string, unknown>)[key];
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.join('\n');
    }
    return '';
};

/**
 * Deduplicate and sort patterns by length (longest first).
 */
const normalizePatterns = (patterns: string[]): string[] => {
    const unique = [...new Set(patterns)];
    return unique.sort((a, b) => b.length - a.length || a.localeCompare(b));
};

/**
 * Calculate specificity score for a rule (higher = more specific).
 * Based on the longest pattern length.
 */
const getSpecificityScore = (rule: SplitRule): number => {
    const key = getPatternKey(rule);

    if (MERGEABLE_KEYS.has(key)) {
        const patterns = getPatternArray(rule, key);
        return patterns.reduce((max, p) => Math.max(max, p.length), 0);
    }

    return getPatternString(rule, key).length;
};

/**
 * Create a merge key for a rule based on pattern type and all non-pattern properties.
 * Rules with the same merge key can have their patterns combined.
 */
const createMergeKey = (rule: SplitRule): string => {
    const patternKey = getPatternKey(rule);
    const { [patternKey]: _pattern, ...rest } = rule as Record<string, unknown>;
    return `${patternKey}|${JSON.stringify(rest)}`;
};

/**
 * Optimize split rules by merging compatible rules and sorting by specificity.
 *
 * This function:
 * 1. **Merges compatible rules**: Rules with the same pattern type and identical
 *    options (meta, fuzzy, min/max, etc.) have their pattern arrays combined
 * 2. **Deduplicates patterns**: Removes duplicate patterns within each rule
 * 3. **Sorts by specificity**: Rules with longer patterns come first
 *
 * Only array-based pattern types (`lineStartsWith`, `lineStartsAfter`, `lineEndsWith`)
 * can be merged. `template` and `regex` rules are kept separate.
 *
 * @param rules - Array of split rules to optimize
 * @returns Optimized rules and count of merged rules
 *
 * @example
 * import { optimizeRules } from 'flappa-doormal';
 *
 * const { rules, mergedCount } = optimizeRules([
 *   { lineStartsWith: ['{{kitab}}'], fuzzy: true, meta: { type: 'header' } },
 *   { lineStartsWith: ['{{bab}}'], fuzzy: true, meta: { type: 'header' } },
 *   { lineStartsAfter: ['{{numbered}}'], meta: { type: 'entry' } },
 * ]);
 *
 * // rules[0] = { lineStartsWith: ['{{kitab}}', '{{bab}}'], fuzzy: true, meta: { type: 'header' } }
 * // rules[1] = { lineStartsAfter: ['{{numbered}}'], meta: { type: 'entry' } }
 * // mergedCount = 1
 */
export const optimizeRules = (rules: SplitRule[]): OptimizeResult => {
    const output: SplitRule[] = [];
    const indexByMergeKey = new Map<string, number>();
    let mergedCount = 0;

    for (const rule of rules) {
        const patternKey = getPatternKey(rule);

        // Only merge array-pattern rules
        if (!MERGEABLE_KEYS.has(patternKey)) {
            output.push(rule);
            continue;
        }

        const mergeKey = createMergeKey(rule);
        const existingIndex = indexByMergeKey.get(mergeKey);

        if (existingIndex === undefined) {
            // New rule - normalize patterns and add
            indexByMergeKey.set(mergeKey, output.length);
            output.push({
                ...rule,
                [patternKey]: normalizePatterns(getPatternArray(rule, patternKey)),
            } as SplitRule);
            continue;
        }

        // Merge patterns into existing rule
        const existing = output[existingIndex] as Record<string, unknown>;
        existing[patternKey] = normalizePatterns([
            ...getPatternArray(existing as SplitRule, patternKey),
            ...getPatternArray(rule, patternKey),
        ]);
        mergedCount++;
    }

    // Sort by specificity (most specific first)
    output.sort((a, b) => getSpecificityScore(b) - getSpecificityScore(a));

    return { mergedCount, rules: output };
};
