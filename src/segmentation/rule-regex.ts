/**
 * Split rule → compiled regex builder.
 *
 * Extracted from `segmenter.ts` to reduce cognitive complexity and enable
 * independent unit testing of regex compilation and token expansion behavior.
 */

import type { SplitRule } from '@/types/rules.js';
import { escapeTemplateBrackets, makeDiacriticInsensitive } from '@/utils/textUtils.js';
import { buildArabicDictionaryEntryRegexSource } from '../dictionary/arabic-dictionary-rule.js';
import { expandTokensWithCaptures, shouldDefaultToFuzzy } from './tokens.js';

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

type RuleRegexSource = {
    captureNames: string[];
    regex: string;
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
export const hasCapturingGroup = (pattern: string): boolean => /\((?!\?)/.test(pattern);

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
export const extractNamedCaptureNames = (pattern: string): string[] =>
    [...pattern.matchAll(/\(\?<([A-Za-z_]\w*)>/g)]
        .map((m) => m[1])
        .filter((n) => !n.startsWith('_r') && !n.startsWith('_w'));

/**
 * Safely compiles a regex pattern, throwing a helpful error if invalid.
 */
export const compileRuleRegex = (pattern: string): RegExp => {
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
export const processPattern = (pattern: string, fuzzy: boolean, capturePrefix?: string): ProcessedPattern => {
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
export const processBreakpointPattern = (pattern: string): string => {
    const { pattern: expanded } = expandTokensWithCaptures(pattern);
    return expanded;
};

/**
 * Builds the raw regex source for a `lineStartsAfter` rule.
 *
 * Expands each pattern through `processPattern()`, combines them into an
 * alternation at the start of a line, and appends a trailing content capture.
 *
 * @param patterns - Template-like line-start markers to match
 * @param fuzzy - Whether Arabic fuzzy matching should be applied during expansion
 * @param capturePrefix - Optional prefix used for internal named captures
 * @returns Regex source plus the named captures extracted from the patterns
 */
export const buildLineStartsAfterRegexSource = (
    patterns: string[],
    fuzzy: boolean,
    capturePrefix?: string,
): RuleRegexSource => {
    const processed = patterns.map((p) => processPattern(p, fuzzy, capturePrefix));
    const alternatives = processed.map((p, i) => `(?<_r${i}>${p.pattern})`).join('|');
    return {
        captureNames: processed.flatMap((p) => p.captureNames),
        regex: `^[\\u200E\\u200F\\u061C\\u200B\\u200C\\u200D\\uFEFF]*(?:${alternatives})${capturePrefix ? `(?<${capturePrefix}__content>.*)` : '(.*)'}`,
    };
};

/**
 * Builds the raw regex source for a `lineStartsWith` rule.
 *
 * Expands each pattern through `processPattern()` and combines them into an
 * alternation anchored at the start of a line.
 *
 * @param patterns - Template-like line-start markers to match
 * @param fuzzy - Whether Arabic fuzzy matching should be applied during expansion
 * @param capturePrefix - Optional prefix used for internal named captures
 * @returns Regex source plus the named captures extracted from the patterns
 */
export const buildLineStartsWithRegexSource = (
    patterns: string[],
    fuzzy: boolean,
    capturePrefix?: string,
): RuleRegexSource => {
    const processed = patterns.map((p) => processPattern(p, fuzzy, capturePrefix));
    const alternatives = processed.map((p, i) => `(?<_r${i}>${p.pattern})`).join('|');
    return {
        captureNames: processed.flatMap((p) => p.captureNames),
        regex: `^[\\u200E\\u200F\\u061C\\u200B\\u200C\\u200D\\uFEFF]*(?:${alternatives})`,
    };
};

/**
 * Builds the raw regex source for a `lineEndsWith` rule.
 *
 * Expands each pattern through `processPattern()` and combines them into an
 * end-anchored alternation.
 *
 * @param patterns - Template-like line-end markers to match
 * @param fuzzy - Whether Arabic fuzzy matching should be applied during expansion
 * @param capturePrefix - Optional prefix used for internal named captures
 * @returns Regex source plus the named captures extracted from the patterns
 */
export const buildLineEndsWithRegexSource = (
    patterns: string[],
    fuzzy: boolean,
    capturePrefix?: string,
): RuleRegexSource => {
    const processed = patterns.map((p) => processPattern(p, fuzzy, capturePrefix));
    const alternatives = processed.map((p, i) => `(?<_r${i}>${p.pattern})`).join('|');
    return {
        captureNames: processed.flatMap((p) => p.captureNames),
        regex: `(?:${alternatives})$`,
    };
};

/**
 * Builds the raw regex source for a `template` rule.
 *
 * Expands tokens and named captures via `expandTokensWithCaptures()` after
 * applying `escapeTemplateBrackets()` to non-token brackets.
 *
 * @param template - Template string containing optional `{{token}}` markers
 * @param capturePrefix - Optional prefix used for internal named captures
 * @returns Regex source plus the named captures extracted from the template
 */
export const buildTemplateRegexSource = (template: string, capturePrefix?: string): RuleRegexSource => {
    const { pattern, captureNames } = expandTokensWithCaptures(
        escapeTemplateBrackets(template),
        undefined,
        capturePrefix,
    );
    return { captureNames, regex: pattern };
};

const getFuzzyCandidatePatterns = (rule: SplitRule): string[] => [
    ...('lineStartsWith' in rule && Array.isArray(rule.lineStartsWith) ? rule.lineStartsWith : []),
    ...('lineStartsAfter' in rule && Array.isArray(rule.lineStartsAfter) ? rule.lineStartsAfter : []),
    ...('lineEndsWith' in rule && Array.isArray(rule.lineEndsWith) ? rule.lineEndsWith : []),
];

const buildLineBasedRuleRegex = (rule: SplitRule, fuzzy: boolean, capturePrefix?: string): RuleRegexSource | null => {
    if ('lineStartsWith' in rule && Array.isArray(rule.lineStartsWith) && rule.lineStartsWith.length > 0) {
        return buildLineStartsWithRegexSource(rule.lineStartsWith, fuzzy, capturePrefix);
    }
    if ('lineEndsWith' in rule && Array.isArray(rule.lineEndsWith) && rule.lineEndsWith.length > 0) {
        return buildLineEndsWithRegexSource(rule.lineEndsWith, fuzzy, capturePrefix);
    }
    if ('template' in rule && typeof rule.template === 'string') {
        return buildTemplateRegexSource(rule.template, capturePrefix);
    }
    if ('dictionaryEntry' in rule && rule.dictionaryEntry) {
        return buildArabicDictionaryEntryRegexSource(rule.dictionaryEntry, capturePrefix);
    }
    return null;
};

/**
 * Builds a compiled regex and metadata from a split rule.
 *
 * Behavior mirrors the previous implementation in `segmenter.ts`.
 */
export const buildRuleRegex = (rule: SplitRule, capturePrefix?: string): RuleRegex => {
    const fuzzy = rule.fuzzy ?? shouldDefaultToFuzzy(getFuzzyCandidatePatterns(rule));

    if ('lineStartsAfter' in rule && Array.isArray(rule.lineStartsAfter) && rule.lineStartsAfter.length > 0) {
        const { regex: lsaRegex, captureNames } = buildLineStartsAfterRegexSource(
            rule.lineStartsAfter,
            fuzzy,
            capturePrefix,
        );
        return { captureNames, regex: compileRuleRegex(lsaRegex), usesCapture: true, usesLineStartsAfter: true };
    }

    const ruleRegexSource = buildLineBasedRuleRegex(rule, fuzzy, capturePrefix);
    let finalRegex: string | undefined = ruleRegexSource?.regex;
    let allCaptureNames: string[] = ruleRegexSource?.captureNames ?? [];
    if (!finalRegex && 'regex' in rule && typeof rule.regex === 'string') {
        finalRegex = rule.regex;
    }

    if (!finalRegex) {
        throw new Error(
            'Rule must specify exactly one pattern type: regex, template, lineStartsWith, lineStartsAfter, lineEndsWith, or dictionaryEntry',
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
