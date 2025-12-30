import type { BreakpointRule, SplitRule } from './types.js';

export type DebugConfig = { includeBreakpoint: boolean; includeRule: boolean; metaKey: string } | null;

export const resolveDebugConfig = (debug: unknown): DebugConfig => {
    if (!debug) {
        return null;
    }
    if (debug === true) {
        return { includeBreakpoint: true, includeRule: true, metaKey: '_flappa' };
    }
    if (typeof debug !== 'object') {
        return null;
    }
    const metaKey = (debug as any).metaKey;
    const include = (debug as any).include;
    const includeRule = Array.isArray(include) ? include.includes('rule') : true;
    const includeBreakpoint = Array.isArray(include) ? include.includes('breakpoint') : true;
    return { includeBreakpoint, includeRule, metaKey: typeof metaKey === 'string' && metaKey ? metaKey : '_flappa' };
};

export const getRulePatternType = (rule: SplitRule) => {
    if ('lineStartsWith' in rule) {
        return 'lineStartsWith';
    }
    if ('lineStartsAfter' in rule) {
        return 'lineStartsAfter';
    }
    if ('lineEndsWith' in rule) {
        return 'lineEndsWith';
    }
    if ('template' in rule) {
        return 'template';
    }
    return 'regex';
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export const mergeDebugIntoMeta = (
    meta: Record<string, unknown> | undefined,
    metaKey: string,
    patch: Record<string, unknown>,
): Record<string, unknown> => {
    const out = meta ? { ...meta } : {};
    const existing = out[metaKey];
    const existingObj = isPlainObject(existing) ? existing : {};
    out[metaKey] = { ...existingObj, ...patch };
    return out;
};

export const buildRuleDebugPatch = (ruleIndex: number, rule: SplitRule) => ({
    rule: { index: ruleIndex, patternType: getRulePatternType(rule) },
});

export const buildBreakpointDebugPatch = (breakpointIndex: number, rule: BreakpointRule) => ({
    breakpoint: {
        index: breakpointIndex,
        kind: rule.pattern === '' ? 'pageBoundary' : 'pattern',
        pattern: rule.pattern,
    },
});
