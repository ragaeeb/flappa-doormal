import type { Page, SegmentationOptions } from './types.js';

/**
 * A single replacement rule applied by `applyReplacements()` / `SegmentationOptions.replace`.
 *
 * Notes:
 * - `regex` is a raw JavaScript regex source string (no token expansion).
 * - Default flags are `gu` (global + unicode).
 * - If `flags` is provided, it is validated and `g` + `u` are always enforced.
 * - If `pageIds` is omitted, the rule applies to all pages.
 * - If `pageIds` is `[]`, the rule applies to no pages (rule is skipped).
 */
export type ReplaceRule = NonNullable<SegmentationOptions['replace']>[number];

const DEFAULT_REPLACE_FLAGS = 'gu';

const normalizeReplaceFlags = (flags?: string): string => {
    if (!flags) {
        return DEFAULT_REPLACE_FLAGS;
    }
    // Validate and de-duplicate flags. Force include g + u.
    const allowed = new Set(['g', 'i', 'm', 's', 'u', 'y']);
    const set = new Set<string>();
    for (const ch of flags) {
        if (!allowed.has(ch)) {
            throw new Error(`Invalid replace regex flag: "${ch}" (allowed: gimsyu)`);
        }
        set.add(ch);
    }
    set.add('g');
    set.add('u');

    // Stable ordering for reproducibility
    const order = ['g', 'i', 'm', 's', 'y', 'u'];
    return order.filter((c) => set.has(c)).join('');
};

type CompiledReplaceRule = {
    re: RegExp;
    replacement: string;
    pageIdSet?: ReadonlySet<number>;
};

const compileReplaceRules = (rules: ReplaceRule[]): CompiledReplaceRule[] => {
    const compiled: CompiledReplaceRule[] = [];
    for (const r of rules) {
        if (r.pageIds && r.pageIds.length === 0) {
            // Empty list means "apply to no pages"
            continue;
        }
        const flags = normalizeReplaceFlags(r.flags);
        const re = new RegExp(r.regex, flags);
        compiled.push({
            pageIdSet: r.pageIds ? new Set(r.pageIds) : undefined,
            re,
            replacement: r.replacement,
        });
    }
    return compiled;
};

/**
 * Applies ordered regex replacements to page content (per page).
 *
 * - Replacement rules are applied in array order.
 * - Each rule is applied globally (flag `g` enforced) with unicode mode (flag `u` enforced).
 * - `pageIds` can scope a rule to specific pages. `pageIds: []` skips the rule entirely.
 *
 * This function is intentionally **pure**:
 * it returns a new pages array only when changes are needed, otherwise it returns the original pages.
 */
export const applyReplacements = (pages: Page[], rules?: ReplaceRule[]): Page[] => {
    if (!rules || rules.length === 0 || pages.length === 0) {
        return pages;
    }
    const compiled = compileReplaceRules(rules);
    if (compiled.length === 0) {
        return pages;
    }

    return pages.map((p) => {
        let content = p.content;
        for (const rule of compiled) {
            if (rule.pageIdSet && !rule.pageIdSet.has(p.id)) {
                continue;
            }
            content = content.replace(rule.re, rule.replacement);
        }
        if (content === p.content) {
            return p;
        }
        return { ...p, content };
    });
};


