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

const normalizeReplaceFlags = (flags?: string) => {
    if (!flags) {
        return DEFAULT_REPLACE_FLAGS;
    }

    const allowed = new Set(['g', 'i', 'm', 's', 'u', 'y']);
    const set = new Set(
        flags.split('').filter((ch) => {
            if (!allowed.has(ch)) {
                throw new Error(`Invalid replace regex flag: "${ch}" (allowed: gimsyu)`);
            }
            return true;
        }),
    );
    set.add('g');
    set.add('u');

    return ['g', 'i', 'm', 's', 'y', 'u'].filter((c) => set.has(c)).join('');
};

const compileReplaceRules = (rules: ReplaceRule[]) =>
    rules
        .filter((r) => !(r.pageIds && r.pageIds.length === 0))
        .map((r) => ({
            pageIdSet: r.pageIds ? new Set(r.pageIds) : undefined,
            re: new RegExp(r.regex, normalizeReplaceFlags(r.flags)),
            replacement: r.replacement,
        }));

export const applyReplacements = (pages: Page[], rules?: ReplaceRule[]) => {
    if (!rules?.length || !pages.length) {
        return pages;
    }
    const compiled = compileReplaceRules(rules);
    if (!compiled.length) {
        return pages;
    }

    return pages.map((p) => {
        let content = p.content;
        for (const rule of compiled) {
            if (!rule.pageIdSet || rule.pageIdSet.has(p.id)) {
                content = content.replace(rule.re, rule.replacement);
            }
        }
        return content === p.content ? p : { ...p, content };
    });
};
