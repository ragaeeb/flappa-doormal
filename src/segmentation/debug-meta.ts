import type { BreakpointRule } from '@/types/breakpoints';
import type { Segment } from '@/types/index.js';
import { PATTERN_TYPE_KEYS, type SplitRule } from '@/types/rules.js';

export type DebugConfig = { includeBreakpoint: boolean; includeRule: boolean; metaKey: string } | null;

export const resolveDebugConfig = (debug: unknown) => {
    if (debug === true) {
        return { includeBreakpoint: true, includeRule: true, metaKey: '_flappa' };
    }

    if (!debug || typeof debug !== 'object') {
        return null;
    }

    const { metaKey, include } = debug as any;
    const includeRule = Array.isArray(include) ? include.includes('rule') : true;
    const includeBreakpoint = Array.isArray(include) ? include.includes('breakpoint') : true;
    return { includeBreakpoint, includeRule, metaKey: typeof metaKey === 'string' && metaKey ? metaKey : '_flappa' };
};

export const getRulePatternType = (rule: SplitRule) => {
    return PATTERN_TYPE_KEYS.find((key) => key in rule) ?? 'regex';
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export const mergeDebugIntoMeta = (
    meta: Record<string, unknown> | undefined,
    metaKey: string,
    patch: Record<string, unknown>,
) => {
    const out = meta ? { ...meta } : {};
    const existing = out[metaKey];
    out[metaKey] = { ...(isPlainObject(existing) ? existing : {}), ...patch };
    return out;
};

export const buildRuleDebugPatch = (ruleIndex: number, rule: SplitRule, wordIndex?: number) => {
    const patternType = getRulePatternType(rule);
    const patterns = (rule as any)[patternType];
    const word =
        wordIndex !== undefined && Array.isArray(patterns) && patterns[wordIndex] !== undefined
            ? patterns[wordIndex]
            : undefined;

    return {
        rule: {
            index: ruleIndex,
            patternType,
            ...(wordIndex !== undefined ? { wordIndex } : {}),
            ...(word !== undefined ? { word } : {}),
        },
    };
};

export const buildBreakpointDebugPatch = (breakpointIndex: number, rule: BreakpointRule, wordIndex?: number) => ({
    breakpoint: {
        index: breakpointIndex,
        kind: rule.pattern === '' ? 'pageBoundary' : 'pattern',
        pattern: rule.pattern ?? rule.regex,
        ...(wordIndex !== undefined ? { wordIndex } : {}),
        ...(wordIndex !== undefined && rule.words ? { word: rule.words[wordIndex] } : {}),
    },
});

export type ContentLengthSplitReason = 'whitespace' | 'unicode_boundary' | 'grapheme_cluster';

export const buildContentLengthDebugPatch = (
    maxContentLength: number,
    actualLength: number,
    splitReason: ContentLengthSplitReason = 'whitespace',
) => ({
    contentLengthSplit: {
        actualLength,
        maxContentLength,
        splitReason,
    },
});

/**
 * Options for formatting the debug reason.
 */
export type DebugReasonOptions = {
    /**
     * If true, returns a concise string representation.
     * e.g. 'Rule: "Chapter"' instead of 'Rule #1 (lineStartsWith) [idx:0] (Matched: "Chapter")'
     */
    concise?: boolean;
};

/**
 * Helper to format the debug info into a human-readable string.
 * @param meta - The segment metadata object
 * @param options - Formatting options
 */
const formatRuleReason = (rule: any, concise?: boolean) => {
    const { index, patternType, wordIndex, word } = rule;

    if (concise) {
        // "Rule: <value>" (value is word or patternType)
        const val = word ? `"${word}"` : patternType;
        return `Rule: ${val}`;
    }

    const wordInfo = word ? ` (Matched: "${word}")` : '';
    const indexInfo = wordIndex !== undefined ? ` [idx:${wordIndex}]` : '';
    return `Rule #${index} (${patternType})${indexInfo}${wordInfo}`;
};

const formatBreakpointReason = (breakpoint: any, concise?: boolean) => {
    const { index, kind, pattern, wordIndex, word } = breakpoint;

    if (kind === 'pageBoundary') {
        return concise ? 'Breakpoint: <page-boundary>' : 'Page Boundary (Fallback)';
    }

    if (concise) {
        // "Breakpoint: <value>" (value is word or pattern)
        const val = word ? `"${word}"` : `"${pattern}"`;
        return `Breakpoint: ${val}`;
    }

    // For words array matches
    if (word) {
        return `Breakpoint #${index} (Words) [idx:${wordIndex}] - "${word}"`;
    }

    // For standard patterns
    return `Breakpoint #${index} (${kind}) - "${pattern}"`;
};

const formatContentLengthReason = (split: any, concise?: boolean) => {
    const { maxContentLength, splitReason } = split;
    if (concise) {
        return `> ${maxContentLength} (${splitReason})`;
    }
    return `Safety Split (${splitReason}) > ${maxContentLength}`;
};

/**
 * Helper to format the debug info into a human-readable string.
 * @param meta - The segment metadata object
 * @param options - Formatting options
 */
export const getDebugReason = (meta: Record<string, any> | undefined, options?: DebugReasonOptions) => {
    const debug = meta?._flappa;
    if (!debug) {
        return '-';
    }

    const concise = options?.concise;

    if (debug.rule) {
        return formatRuleReason(debug.rule, concise);
    }

    if (debug.breakpoint) {
        return formatBreakpointReason(debug.breakpoint, concise);
    }

    if (debug.contentLengthSplit) {
        return formatContentLengthReason(debug.contentLengthSplit, concise);
    }

    return 'Unknown';
};

/**
 * Convenience helper to get the formatted debug reason directly from a segment.
 * @param segment - The segment object
 * @param options - Formatting options
 */
export const getSegmentDebugReason = (segment: Segment, options?: DebugReasonOptions) => {
    return getDebugReason(segment.meta, options);
};
