/**
 * Split rule → compiled regex builder.
 *
 * Extracted from `segmenter.ts` to reduce cognitive complexity and enable
 * independent unit testing of regex compilation and token expansion behavior.
 */

import { makeDiacriticInsensitive } from './fuzzy.js';
import { escapeTemplateBrackets, expandTokensWithCaptures } from './tokens.js';
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
export const hasCapturingGroup = (pattern: string): boolean => {
    // Match ( that is NOT followed by ? (excludes non-capturing and named groups)
    return /\((?!\?)/.test(pattern);
};

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
export const extractNamedCaptureNames = (pattern: string): string[] => {
    const names: string[] = [];
    // Match (?<name> where name is the capture group name
    const namedGroupRegex = /\(\?<([^>]+)>/g;
    for (const match of pattern.matchAll(namedGroupRegex)) {
        names.push(match[1]);
    }
    return names;
};

/**
 * Safely compiles a regex pattern, throwing a helpful error if invalid.
 */
export const compileRuleRegex = (pattern: string): RegExp => {
    try {
        return new RegExp(pattern, 'gmu');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid regex pattern: ${pattern}\n  Cause: ${message}`);
    }
};

/**
 * Processes a pattern string by expanding tokens and optionally applying fuzzy matching.
 *
 * Brackets `()[]` outside `{{tokens}}` are auto-escaped.
 */
export const processPattern = (pattern: string, fuzzy: boolean, capturePrefix?: string): ProcessedPattern => {
    const escaped = escapeTemplateBrackets(pattern);
    const fuzzyTransform = fuzzy ? makeDiacriticInsensitive : undefined;
    const { pattern: expanded, captureNames } = expandTokensWithCaptures(escaped, fuzzyTransform, capturePrefix);
    return { captureNames, pattern: expanded };
};

export const buildLineStartsAfterRegexSource = (
    patterns: string[],
    fuzzy: boolean,
    capturePrefix?: string,
): { regex: string; captureNames: string[] } => {
    const processed = patterns.map((p) => processPattern(p, fuzzy, capturePrefix));
    const union = processed.map((p) => p.pattern).join('|');
    const captureNames = processed.flatMap((p) => p.captureNames);
    // For lineStartsAfter, we need to capture the content.
    // If we have a prefix (combined-regex mode), we name the internal content capture so the caller
    // can compute marker length. IMPORTANT: this internal group is not a "user capture", so it must
    // NOT be included in `captureNames` (otherwise it leaks into segment.meta as `content`).
    const contentCapture = capturePrefix ? `(?<${capturePrefix}__content>.*)` : '(.*)';
    return { captureNames, regex: `^(?:${union})${contentCapture}` };
};

export const buildLineStartsWithRegexSource = (
    patterns: string[],
    fuzzy: boolean,
    capturePrefix?: string,
): { regex: string; captureNames: string[] } => {
    const processed = patterns.map((p) => processPattern(p, fuzzy, capturePrefix));
    const union = processed.map((p) => p.pattern).join('|');
    const captureNames = processed.flatMap((p) => p.captureNames);
    return { captureNames, regex: `^(?:${union})` };
};

export const buildLineEndsWithRegexSource = (
    patterns: string[],
    fuzzy: boolean,
    capturePrefix?: string,
): { regex: string; captureNames: string[] } => {
    const processed = patterns.map((p) => processPattern(p, fuzzy, capturePrefix));
    const union = processed.map((p) => p.pattern).join('|');
    const captureNames = processed.flatMap((p) => p.captureNames);
    return { captureNames, regex: `(?:${union})$` };
};

export const buildTemplateRegexSource = (
    template: string,
    capturePrefix?: string,
): { regex: string; captureNames: string[] } => {
    const escaped = escapeTemplateBrackets(template);
    const { pattern, captureNames } = expandTokensWithCaptures(escaped, undefined, capturePrefix);
    return { captureNames, regex: pattern };
};

export const determineUsesCapture = (regexSource: string, _captureNames: string[]): boolean =>
    hasCapturingGroup(regexSource);

/**
 * Builds a compiled regex and metadata from a split rule.
 *
 * Behavior mirrors the previous implementation in `segmenter.ts`.
 */
export const buildRuleRegex = (rule: SplitRule, capturePrefix?: string): RuleRegex => {
    const s: {
        lineStartsWith?: string[];
        lineStartsAfter?: string[];
        lineEndsWith?: string[];
        template?: string;
        regex?: string;
    } = { ...rule };

    const fuzzy = (rule as { fuzzy?: boolean }).fuzzy ?? false;
    let allCaptureNames: string[] = [];

    // lineStartsAfter: creates a capturing group to exclude the marker from content
    if (s.lineStartsAfter?.length) {
        const { regex, captureNames } = buildLineStartsAfterRegexSource(s.lineStartsAfter, fuzzy, capturePrefix);
        allCaptureNames = captureNames;
        return {
            captureNames: allCaptureNames,
            regex: compileRuleRegex(regex),
            usesCapture: true,
            usesLineStartsAfter: true,
        };
    }

    if (s.lineStartsWith?.length) {
        const { regex, captureNames } = buildLineStartsWithRegexSource(s.lineStartsWith, fuzzy, capturePrefix);
        s.regex = regex;
        allCaptureNames = captureNames;
    }
    if (s.lineEndsWith?.length) {
        const { regex, captureNames } = buildLineEndsWithRegexSource(s.lineEndsWith, fuzzy, capturePrefix);
        s.regex = regex;
        allCaptureNames = captureNames;
    }
    if (s.template) {
        const { regex, captureNames } = buildTemplateRegexSource(s.template, capturePrefix);
        s.regex = regex;
        allCaptureNames = [...allCaptureNames, ...captureNames];
    }

    if (!s.regex) {
        throw new Error(
            'Rule must specify exactly one pattern type: regex, template, lineStartsWith, lineStartsAfter, or lineEndsWith',
        );
    }

    // Extract named capture groups from raw regex patterns if not already populated
    if (allCaptureNames.length === 0) {
        allCaptureNames = extractNamedCaptureNames(s.regex);
    }

    const usesCapture = determineUsesCapture(s.regex, allCaptureNames);
    return {
        captureNames: allCaptureNames,
        regex: compileRuleRegex(s.regex),
        usesCapture,
        usesLineStartsAfter: false,
    };
};
