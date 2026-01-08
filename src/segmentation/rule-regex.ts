/**
 * Split rule → compiled regex builder.
 *
 * Extracted from `segmenter.ts` to reduce cognitive complexity and enable
 * independent unit testing of regex compilation and token expansion behavior.
 */

import { makeDiacriticInsensitive } from './fuzzy.js';
import { escapeTemplateBrackets, expandTokensWithCaptures, shouldDefaultToFuzzy } from './tokens.js';
import type { SplitRule } from './types.js';

/**
 * Result of processing a pattern with token expansion and optional fuzzy matching.
 */
export type ProcessedPattern = {
    /** The expanded regex pattern string (tokens replaced with regex) */
    pattern: string;
    /** Names of captured groups extracted from `{{token:name}}` syntax */
    captureNames: string[];
};

/**
 * Compiled regex and metadata for a split rule.
 */
export type RuleRegex = {
    /** Compiled RegExp with 'gmu' flags (global, multiline, unicode) */
    regex: RegExp;
    /** Whether the regex uses capturing groups for content extraction */
    usesCapture: boolean;
    /** Names of captured groups from `{{token:name}}` syntax */
    captureNames: string[];
    /** Whether this rule uses `lineStartsAfter` (content capture at end) */
    usesLineStartsAfter: boolean;
};

/**
 * Checks if a regex pattern contains standard (anonymous) capturing groups.
 *
 * Detects standard capturing groups `(...)` while excluding:
 * - Non-capturing groups `(?:...)`
 * - Lookahead assertions `(?=...)` and `(?!...)`
 * - Lookbehind assertions `(?<=...)` and `(?<!...)`
 * - Named groups `(?<name>...)` (start with `(?` so excluded here)
 *
 * NOTE: Named capture groups are still captures, but they're tracked via `captureNames`.
 */
export const hasCapturingGroup = (pattern: string) => /\((?!\?)/.test(pattern);

/**
 * Extracts named capture group names from a regex pattern.
 *
 * Parses patterns like `(?<num>[0-9]+)` and returns `['num']`.
 *
 * @example
 * extractNamedCaptureNames('^(?<num>[٠-٩]+)\\s+') // ['num']
 * extractNamedCaptureNames('^(?<a>\\d+)(?<b>\\w+)') // ['a', 'b']
 * extractNamedCaptureNames('^\\d+') // []
 */
export const extractNamedCaptureNames = (pattern: string) => [...pattern.matchAll(/\(\?<([^>]+)>/g)].map((m) => m[1]);

/**
 * Safely compiles a regex pattern, throwing a helpful error if invalid.
 */
export const compileRuleRegex = (pattern: string) => {
    try {
        return new RegExp(pattern, 'gmu');
    } catch (error) {
        throw new Error(
            `Invalid regex pattern: ${pattern}\n  Cause: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
};

/**
 * Processes a pattern string by expanding tokens and optionally applying fuzzy matching.
 *
 * Brackets `()[]` outside `{{tokens}}` are auto-escaped.
 */
export const processPattern = (pattern: string, fuzzy: boolean, capturePrefix?: string) => {
    const { pattern: expanded, captureNames } = expandTokensWithCaptures(
        escapeTemplateBrackets(pattern),
        fuzzy ? makeDiacriticInsensitive : undefined,
        capturePrefix,
    );
    return { captureNames, pattern: expanded };
};

/**
 * Processes a breakpoint pattern by expanding tokens only.
 *
 * Unlike `processPattern`, this does NOT escape brackets because breakpoints
 * are treated as raw regex patterns (like the `regex` rule type).
 * Users have full control over regex syntax including `(?:...)` groups.
 */
export const processBreakpointPattern = (pattern: string) => {
    const { pattern: expanded } = expandTokensWithCaptures(pattern);
    return expanded;
};

export const buildLineStartsAfterRegexSource = (patterns: string[], fuzzy: boolean, capturePrefix?: string) => {
    const processed = patterns.map((p) => processPattern(p, fuzzy, capturePrefix));
    return {
        captureNames: processed.flatMap((p) => p.captureNames),
        regex: `^[\\u200E\\u200F\\u061C\\u200B\\u200C\\u200D\\uFEFF]*(?:${processed.map((p) => p.pattern).join('|')})${capturePrefix ? `(?<${capturePrefix}__content>.*)` : '(.*)'}`,
    };
};

export const buildLineStartsWithRegexSource = (patterns: string[], fuzzy: boolean, capturePrefix?: string) => {
    const processed = patterns.map((p) => processPattern(p, fuzzy, capturePrefix));
    return {
        captureNames: processed.flatMap((p) => p.captureNames),
        regex: `^[\\u200E\\u200F\\u061C\\u200B\\u200C\\u200D\\uFEFF]*(?:${processed.map((p) => p.pattern).join('|')})`,
    };
};

export const buildLineEndsWithRegexSource = (patterns: string[], fuzzy: boolean, capturePrefix?: string) => {
    const processed = patterns.map((p) => processPattern(p, fuzzy, capturePrefix));
    return {
        captureNames: processed.flatMap((p) => p.captureNames),
        regex: `(?:${processed.map((p) => p.pattern).join('|')})$`,
    };
};

export const buildTemplateRegexSource = (template: string, capturePrefix?: string) => {
    const { pattern, captureNames } = expandTokensWithCaptures(
        escapeTemplateBrackets(template),
        undefined,
        capturePrefix,
    );
    return { captureNames, regex: pattern };
};

/**
 * Builds a compiled regex and metadata from a split rule.
 *
 * Behavior mirrors the previous implementation in `segmenter.ts`.
 */
export const buildRuleRegex = (rule: SplitRule, capturePrefix?: string) => {
    const { lineStartsWith, lineStartsAfter, lineEndsWith, template, regex } = rule as any;
    const fuzzy =
        (rule as { fuzzy?: boolean }).fuzzy ??
        shouldDefaultToFuzzy([...(lineStartsWith ?? []), ...(lineStartsAfter ?? []), ...(lineEndsWith ?? [])]);

    if (lineStartsAfter?.length) {
        const { regex: lsaRegex, captureNames } = buildLineStartsAfterRegexSource(
            lineStartsAfter,
            fuzzy,
            capturePrefix,
        );
        return { captureNames, regex: compileRuleRegex(lsaRegex), usesCapture: true, usesLineStartsAfter: true };
    }

    let finalRegex = regex;
    let allCaptureNames: string[] = [];

    if (lineStartsWith?.length) {
        const res = buildLineStartsWithRegexSource(lineStartsWith, fuzzy, capturePrefix);
        finalRegex = res.regex;
        allCaptureNames = res.captureNames;
    }
    if (lineEndsWith?.length) {
        const res = buildLineEndsWithRegexSource(lineEndsWith, fuzzy, capturePrefix);
        finalRegex = res.regex;
        allCaptureNames = res.captureNames;
    }
    if (template) {
        const res = buildTemplateRegexSource(template, capturePrefix);
        finalRegex = res.regex;
        allCaptureNames = [...allCaptureNames, ...res.captureNames];
    }

    if (!finalRegex) {
        throw new Error(
            'Rule must specify exactly one pattern type: regex, template, lineStartsWith, lineStartsAfter, or lineEndsWith',
        );
    }
    if (allCaptureNames.length === 0) {
        allCaptureNames = extractNamedCaptureNames(finalRegex);
    }

    return {
        captureNames: allCaptureNames,
        regex: compileRuleRegex(finalRegex),
        usesCapture: hasCapturingGroup(finalRegex),
        usesLineStartsAfter: false,
    };
};
