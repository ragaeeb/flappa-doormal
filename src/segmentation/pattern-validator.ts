/**
 * Pattern validation utilities for detecting common mistakes in rule patterns.
 *
 * These utilities help catch typos and issues early, before rules are used
 * for segmentation.
 */

import type { DictionaryEntryPatternOptions, SplitRule } from '@/types/rules.js';
import { getAvailableTokens } from './tokens.js';

/**
 * Types of validation issues that can be detected.
 */
export type ValidationIssueType =
    | 'missing_braces'
    | 'unknown_token'
    | 'duplicate'
    | 'empty_pattern'
    | 'invalid_regex'
    | 'invalid_option';

/**
 * A validation issue found in a pattern.
 */
export type ValidationIssue = {
    type: ValidationIssueType;
    message: string;
    suggestion?: string;
    /** The token name involved in the issue (for unknown_token / missing_braces) */
    token?: string;
    /** The specific pattern involved (for duplicate) */
    pattern?: string;
};

/**
 * Validation result for a single rule, with issues keyed by pattern type.
 * Arrays parallel the input pattern arrays - undefined means no issue.
 */
export type RuleValidationResult = {
    lineStartsWith?: (ValidationIssue | undefined)[];
    lineStartsAfter?: (ValidationIssue | undefined)[];
    lineEndsWith?: (ValidationIssue | undefined)[];
    template?: ValidationIssue;
    regex?: ValidationIssue;
    dictionaryEntry?: Partial<Record<keyof DictionaryEntryPatternOptions, ValidationIssue>>;
};

// Known token names from the tokens module
const KNOWN_TOKENS = new Set<string>(getAvailableTokens());

// Regex to find tokens inside {{}} - both with and without capture syntax
const TOKEN_INSIDE_BRACES = /\{\{(\w+)(?::\w+)?\}\}/g;

// Regex to find potential token names NOT inside {{}}
// Matches word boundaries around known token names
const buildBareTokenRegex = () => {
    const tokens = [...KNOWN_TOKENS].sort((a, b) => b.length - a.length);
    return new RegExp(`(?<!\\{\\{)(${tokens.join('|')})(?::\\w+)?(?!\\}\\})`, 'g');
};

/**
 * Validates a single pattern for common issues.
 */
const validatePattern = (pattern: string, seenPatterns: Set<string>) => {
    if (!pattern.trim()) {
        return { message: 'Empty pattern is not allowed', type: 'empty_pattern' } as const;
    }
    if (seenPatterns.has(pattern)) {
        return { message: `Duplicate pattern: "${pattern}"`, pattern, type: 'duplicate' } as const;
    }
    seenPatterns.add(pattern);

    // TOKEN_INSIDE_BRACES is a global /g regex. Ensure lastIndex does not leak between calls.
    TOKEN_INSIDE_BRACES.lastIndex = 0;
    for (const match of pattern.matchAll(TOKEN_INSIDE_BRACES)) {
        const name = match[1];
        if (name && !KNOWN_TOKENS.has(name)) {
            return {
                message: `Unknown token: {{${name}}}. Available tokens: ${[...KNOWN_TOKENS].slice(0, 5).join(', ')}...`,
                suggestion: 'Check spelling or use a known token',
                token: name,
                type: 'unknown_token',
            } as const;
        }
    }

    for (const match of pattern.matchAll(buildBareTokenRegex())) {
        const [full, name] = match;
        const idx = match.index!;
        if (
            pattern.slice(Math.max(0, idx - 2), idx) !== '{{' ||
            pattern.slice(idx + full.length, idx + full.length + 2) !== '}}'
        ) {
            return {
                message: `Token "${name}" appears to be missing {{}}. Did you mean "{{${full}}}"?`,
                suggestion: `{{${full}}}`,
                token: name,
                type: 'missing_braces',
            } as const;
        }
    }
};

/**
 * Validates an array of patterns, returning parallel array of issues.
 */
const validatePatternArray = (patterns: string[]) => {
    const seen = new Set<string>();
    const issues = patterns.map((p) => validatePattern(p, seen));
    return issues.some(Boolean) ? issues : undefined;
};

const applyRulePatternValidation = (
    result: RuleValidationResult,
    key: 'lineStartsWith' | 'lineStartsAfter' | 'lineEndsWith',
    patterns: string[] | undefined,
): boolean => {
    if (!patterns) {
        return false;
    }
    const issues = validatePatternArray(patterns);
    if (!issues) {
        return false;
    }
    result[key] = issues;
    return true;
};

const validateTemplateRule = (rule: SplitRule, result: RuleValidationResult) => {
    if (!('template' in rule)) {
        return false;
    }

    const issue = validatePattern(rule.template, new Set());
    if (!issue) {
        return false;
    }

    result.template = issue;
    return true;
};

const validateRegexRule = (rule: SplitRule, result: RuleValidationResult) => {
    if (!('regex' in rule)) {
        return false;
    }

    if (!rule.regex.trim()) {
        result.regex = { message: 'Empty pattern is not allowed', type: 'empty_pattern' };
        return true;
    }

    try {
        new RegExp(rule.regex, 'u');
        return false;
    } catch (error) {
        result.regex = {
            message: error instanceof Error ? error.message : String(error),
            pattern: rule.regex,
            type: 'invalid_regex',
        };
        return true;
    }
};

const invalidDictionaryEntryIssue = (message: string): ValidationIssue => ({
    message,
    type: 'invalid_option',
});

const addBooleanDictionaryEntryIssue = (
    issues: Partial<Record<keyof DictionaryEntryPatternOptions, ValidationIssue>>,
    key: 'allowCommaSeparated' | 'allowParenthesized' | 'allowWhitespaceBeforeColon' | 'midLineSubentries',
    value: unknown,
) => {
    if (value !== undefined && typeof value !== 'boolean') {
        issues[key] = invalidDictionaryEntryIssue(`${key} must be a boolean`);
    }
};

const addCaptureNameIssue = (
    issues: Partial<Record<keyof DictionaryEntryPatternOptions, ValidationIssue>>,
    captureName: string | undefined,
) => {
    if (captureName !== undefined && !captureName.match(/^[A-Za-z_]\w*$/)) {
        issues.captureName = invalidDictionaryEntryIssue(
            `captureName must match /^[A-Za-z_]\\w*$/, got "${captureName}"`,
        );
    }
};

const addMinLettersIssue = (
    issues: Partial<Record<keyof DictionaryEntryPatternOptions, ValidationIssue>>,
    minLetters: number | undefined,
) => {
    if (minLetters !== undefined && (!Number.isInteger(minLetters) || minLetters < 1)) {
        issues.minLetters = invalidDictionaryEntryIssue('minLetters must be an integer >= 1');
    }
};

const addMaxLettersIssue = (
    issues: Partial<Record<keyof DictionaryEntryPatternOptions, ValidationIssue>>,
    maxLetters: number | undefined,
    minLetters: number | undefined,
) => {
    const min = minLetters ?? 2;
    if (maxLetters !== undefined && (!Number.isInteger(maxLetters) || maxLetters < min)) {
        issues.maxLetters = invalidDictionaryEntryIssue(`maxLetters must be an integer >= ${min}`);
    }
};

const validateDictionaryEntryRule = (rule: SplitRule, result: RuleValidationResult) => {
    if (!('dictionaryEntry' in rule) || !rule.dictionaryEntry) {
        return false;
    }

    const issues: Partial<Record<keyof DictionaryEntryPatternOptions, ValidationIssue>> = {};
    const {
        allowCommaSeparated,
        allowParenthesized,
        allowWhitespaceBeforeColon,
        captureName,
        maxLetters,
        midLineSubentries,
        minLetters,
        stopWords,
    } = rule.dictionaryEntry;

    if (!Array.isArray(stopWords) || stopWords.some((word) => typeof word !== 'string' || !word.trim())) {
        issues.stopWords = invalidDictionaryEntryIssue('stopWords must be a string[] with non-empty entries');
    }
    addBooleanDictionaryEntryIssue(issues, 'allowCommaSeparated', allowCommaSeparated);
    addBooleanDictionaryEntryIssue(issues, 'allowParenthesized', allowParenthesized);
    addBooleanDictionaryEntryIssue(issues, 'allowWhitespaceBeforeColon', allowWhitespaceBeforeColon);
    addBooleanDictionaryEntryIssue(issues, 'midLineSubentries', midLineSubentries);
    addCaptureNameIssue(issues, captureName);
    addMinLettersIssue(issues, minLetters);
    addMaxLettersIssue(issues, maxLetters, minLetters);

    if (Object.keys(issues).length === 0) {
        return false;
    }

    result.dictionaryEntry = issues;
    return true;
};

const formatValidationIssue = (_type: string, issue: ValidationIssue | undefined, loc: string): string | null => {
    if (!issue) {
        return null;
    }
    if (issue.type === 'missing_braces') {
        return `${loc}: Missing {{}} around token "${issue.token}"`;
    }
    if (issue.type === 'unknown_token') {
        return `${loc}: Unknown token "{{${issue.token}}}"`;
    }
    if (issue.type === 'duplicate') {
        return `${loc}: Duplicate pattern "${issue.pattern}"`;
    }
    if (issue.type === 'invalid_regex') {
        return `${loc}: Invalid regex (${issue.message})`;
    }
    return `${loc}: ${issue.message || issue.type}`;
};

/**
 * Validates split rules for common pattern issues.
 *
 * Checks for:
 * - Missing `{{}}` around known token names (e.g., `raqms:num` instead of `{{raqms:num}}`)
 * - Unknown token names inside `{{}}` (e.g., `{{nonexistent}}`)
 * - Duplicate patterns within the same rule
 *
 * @param rules - Array of split rules to validate
 * @returns Array parallel to input with validation results (undefined if no issues)
 *
 * @example
 * const issues = validateRules([
 *   { lineStartsAfter: ['raqms:num'] },  // Missing braces
 *   { lineStartsWith: ['{{unknown}}'] }, // Unknown token
 * ]);
 * // issues[0]?.lineStartsAfter?.[0]?.type === 'missing_braces'
 * // issues[1]?.lineStartsWith?.[0]?.type === 'unknown_token'
 */
export const validateRules = (rules: SplitRule[]) =>
    rules.map((rule) => {
        const result: RuleValidationResult = {};
        const startsWithIssues = applyRulePatternValidation(
            result,
            'lineStartsWith',
            'lineStartsWith' in rule ? rule.lineStartsWith : undefined,
        );
        const startsAfterIssues = applyRulePatternValidation(
            result,
            'lineStartsAfter',
            'lineStartsAfter' in rule ? rule.lineStartsAfter : undefined,
        );
        const endsWithIssues = applyRulePatternValidation(
            result,
            'lineEndsWith',
            'lineEndsWith' in rule ? rule.lineEndsWith : undefined,
        );
        const templateIssues = validateTemplateRule(rule, result);
        const regexIssues = validateRegexRule(rule, result);
        const dictionaryEntryIssues = validateDictionaryEntryRule(rule, result);
        const hasIssues =
            startsWithIssues ||
            startsAfterIssues ||
            endsWithIssues ||
            templateIssues ||
            regexIssues ||
            dictionaryEntryIssues;

        return hasIssues ? result : undefined;
    });
/**
 * Formats a validation result array into a list of human-readable error messages.
 *
 * Useful for displaying validation errors in UIs.
 *
 * @param results - The result array from `validateRules()`
 * @returns Array of formatted error strings
 *
 * @example
 * const issues = validateRules(rules);
 * const errors = formatValidationReport(issues);
 * // ["Rule 1, lineStartsWith: Missing {{}} around token..."]
 */
export const formatValidationReport = (results: (RuleValidationResult | undefined)[]) =>
    results.flatMap((result, i) => {
        if (!result) {
            return [];
        }
        return Object.entries(result).flatMap(([type, issues]) => formatValidationIssues(type, issues, i + 1));
    });

const formatValidationIssues = (type: string, issues: unknown, ruleNumber: number) => {
    if (type === 'dictionaryEntry' && issues && typeof issues === 'object' && !Array.isArray(issues)) {
        return Object.entries(issues)
            .map(([field, issue]) =>
                formatValidationIssue(
                    type,
                    issue as ValidationIssue | undefined,
                    `Rule ${ruleNumber}, ${type}.${field}`,
                ),
            )
            .filter((msg): msg is string => msg !== null);
    }

    return (Array.isArray(issues) ? issues : [issues])
        .map((issue) =>
            formatValidationIssue(type, issue as ValidationIssue | undefined, `Rule ${ruleNumber}, ${type}`),
        )
        .filter((msg): msg is string => msg !== null);
};
