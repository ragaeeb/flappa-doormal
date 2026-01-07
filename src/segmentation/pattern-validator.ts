/**
 * Pattern validation utilities for detecting common mistakes in rule patterns.
 *
 * These utilities help catch typos and issues early, before rules are used
 * for segmentation.
 */

import { getAvailableTokens } from './tokens.js';
import type { SplitRule } from './types.js';

/**
 * Types of validation issues that can be detected.
 */
export type ValidationIssueType = 'missing_braces' | 'unknown_token' | 'duplicate' | 'empty_pattern';

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
};

// Known token names from the tokens module
const KNOWN_TOKENS = new Set(getAvailableTokens());

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
        if (!KNOWN_TOKENS.has(name)) {
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
        let hasIssues = false;

        for (const key of ['lineStartsWith', 'lineStartsAfter', 'lineEndsWith'] as const) {
            if (key in rule && (rule as any)[key]) {
                const issues = validatePatternArray((rule as any)[key]);
                if (issues) {
                    result[key] = issues;
                    hasIssues = true;
                }
            }
        }

        if ('template' in rule && rule.template !== undefined) {
            const issue = validatePattern(rule.template, new Set());
            if (issue) {
                result.template = issue;
                hasIssues = true;
            }
        }

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
        return Object.entries(result)
            .flatMap(([type, issues]) =>
                (Array.isArray(issues) ? issues : [issues]).map((issue) => {
                    if (!issue) {
                        return null;
                    }
                    const loc = `Rule ${i + 1}, ${type}`;
                    if (issue.type === 'missing_braces') {
                        return `${loc}: Missing {{}} around token "${issue.token}"`;
                    }
                    if (issue.type === 'unknown_token') {
                        return `${loc}: Unknown token "{{${issue.token}}}"`;
                    }
                    if (issue.type === 'duplicate') {
                        return `${loc}: Duplicate pattern "${issue.pattern}"`;
                    }
                    return `${loc}: ${issue.message || issue.type}`;
                }),
            )
            .filter((msg): msg is string => msg !== null);
    });
