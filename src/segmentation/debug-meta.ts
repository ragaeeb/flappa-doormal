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
    contentLengthSplit: {
        actualLength,
        maxContentLength,
        splitReason,
    },
});

/**
 * Helper to format the debug info into a human-readable string.
 * @param meta - The segment metadata object
 */
export const getDebugReason = (meta: Record<string, any> | undefined): string => {
    const debug = meta?._flappa;
    if (!debug) {
        return '-';
    }

    if (debug.rule) {
        const { index, patternType, wordIndex, word } = debug.rule;
        const wordInfo = word ? ` (Matched: "${word}")` : '';
        const indexInfo = wordIndex !== undefined ? ` [idx:${wordIndex}]` : '';
        return `Rule #${index} (${patternType})${indexInfo}${wordInfo}`;
    }

    if (debug.breakpoint) {
        const { index, kind, pattern, wordIndex, word } = debug.breakpoint;
        if (kind === 'pageBoundary') {
            return 'Page Boundary (Fallback)';
        }

        // For words array matches
        if (word) {
            return `Breakpoint #${index} (Words) [idx:${wordIndex}] - "${word}"`;
        }

        // For standard patterns
        return `Breakpoint #${index} (${kind}) - "${pattern}"`;
    }

    if (debug.contentLengthSplit) {
        const { maxContentLength, splitReason } = debug.contentLengthSplit;
        return `Safety Split (${splitReason}) > ${maxContentLength}`;
    }

    return 'Unknown';
};

/**
 * Convenience helper to get the formatted debug reason directly from a segment.
 * @param segment - The segment object
 */
export const getSegmentDebugReason = (segment: Segment) => getDebugReason(segment.meta);
