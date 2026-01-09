import type { BreakpointRule } from '@/types/breakpoints';
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

export const buildRuleDebugPatch = (ruleIndex: number, rule: SplitRule) => ({
    rule: { index: ruleIndex, patternType: getRulePatternType(rule) },
});

export const buildBreakpointDebugPatch = (breakpointIndex: number, rule: BreakpointRule) => ({
    breakpoint: {
        index: breakpointIndex,
        kind: rule.pattern === '' ? 'pageBoundary' : 'pattern',
        pattern: rule.pattern ?? rule.regex,
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
