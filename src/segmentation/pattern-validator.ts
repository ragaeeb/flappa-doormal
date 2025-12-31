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
const buildBareTokenRegex = (): RegExp => {
    // Sort by length descending to match longer tokens first
    const tokens = [...KNOWN_TOKENS].sort((a, b) => b.length - a.length);
    // Match token name followed by optional :name, but NOT inside {{}}
    // Use negative lookbehind for {{ and negative lookahead for }}
    return new RegExp(`(?<!\\{\\{)(${tokens.join('|')})(?::\\w+)?(?!\\}\\})`, 'g');
};

/**
 * Validates a single pattern for common issues.
 */
const validatePattern = (pattern: string, seenPatterns: Set<string>): ValidationIssue | undefined => {
    if (!pattern.trim()) {
        return { message: 'Empty pattern is not allowed', type: 'empty_pattern' };
    }
    // Check for duplicates
    if (seenPatterns.has(pattern)) {
        return {
            message: `Duplicate pattern: "${pattern}"`,
            pattern,
            type: 'duplicate',
        };
    }
    seenPatterns.add(pattern);

    // Check for unknown tokens inside {{}}
    const tokensInBraces = [...pattern.matchAll(TOKEN_INSIDE_BRACES)];
    for (const match of tokensInBraces) {
        const tokenName = match[1];
        if (!KNOWN_TOKENS.has(tokenName)) {
            return {
                message: `Unknown token: {{${tokenName}}}. Available tokens: ${[...KNOWN_TOKENS].slice(0, 5).join(', ')}...`,
                suggestion: `Check spelling or use a known token`,
                token: tokenName,
                type: 'unknown_token',
            };
        }
    }

    // Check for bare token names not inside {{}}
    const bareTokenRegex = buildBareTokenRegex();
    const bareMatches = [...pattern.matchAll(bareTokenRegex)];
    for (const match of bareMatches) {
        const tokenName = match[1];
        const fullMatch = match[0];
        // Make sure this isn't inside {{}} by checking the original pattern
        const matchIndex = match.index!;
        const before = pattern.slice(Math.max(0, matchIndex - 2), matchIndex);
        const after = pattern.slice(matchIndex + fullMatch.length, matchIndex + fullMatch.length + 2);
        if (before !== '{{' && after !== '}}') {
            return {
                message: `Token "${tokenName}" appears to be missing {{}}. Did you mean "{{${fullMatch}}}"?`,
                suggestion: `{{${fullMatch}}}`,
                token: tokenName,
                type: 'missing_braces',
            };
        }
    }

    return undefined;
};

/**
 * Validates an array of patterns, returning parallel array of issues.
 */
const validatePatternArray = (patterns: string[]): (ValidationIssue | undefined)[] | undefined => {
    const seenPatterns = new Set<string>();
    const issues = patterns.map((p) => validatePattern(p, seenPatterns));

    // If all undefined, return undefined for the whole array
    if (issues.every((i) => i === undefined)) {
        return undefined;
    }
    return issues;
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
export const validateRules = (rules: SplitRule[]): (RuleValidationResult | undefined)[] => {
    return rules.map((rule) => {
        const result: RuleValidationResult = {};
        let hasIssues = false;

        if ('lineStartsWith' in rule && rule.lineStartsWith) {
            const issues = validatePatternArray(rule.lineStartsWith);
            if (issues) {
                result.lineStartsWith = issues;
                hasIssues = true;
            }
        }

        if ('lineStartsAfter' in rule && rule.lineStartsAfter) {
            const issues = validatePatternArray(rule.lineStartsAfter);
            if (issues) {
                result.lineStartsAfter = issues;
                hasIssues = true;
            }
        }

        if ('lineEndsWith' in rule && rule.lineEndsWith) {
            const issues = validatePatternArray(rule.lineEndsWith);
            if (issues) {
                result.lineEndsWith = issues;
                hasIssues = true;
            }
        }

        if ('template' in rule && rule.template !== undefined) {
            const seenPatterns = new Set<string>();
            const issue = validatePattern(rule.template, seenPatterns);
            if (issue) {
                result.template = issue;
                hasIssues = true;
            }
        }

        // Note: We don't validate `regex` patterns as they are raw regex, not templates

        return hasIssues ? result : undefined;
    });
};
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
export const formatValidationReport = (results: (RuleValidationResult | undefined)[]): string[] => {
    const errors: string[] = [];

    results.forEach((result, ruleIndex) => {
        if (!result) {
            return;
        }

        // Helper to format a single issue
        // eslint-disable-next-line
        const formatIssue = (issue: any, location: string) => {
            if (!issue) {
                return;
            }
            const type = issue.type as ValidationIssueType;

            if (type === 'missing_braces' && issue.token) {
                errors.push(`${location}: Missing {{}} around token "${issue.token}"`);
            } else if (type === 'unknown_token' && issue.token) {
                errors.push(`${location}: Unknown token "{{${issue.token}}}"`);
            } else if (type === 'duplicate' && issue.pattern) {
                errors.push(`${location}: Duplicate pattern "${issue.pattern}"`);
            } else if (issue.message) {
                errors.push(`${location}: ${issue.message}`);
            } else {
                errors.push(`${location}: ${type}`);
            }
        };

        // Each result is a Record with pattern types as keys
        for (const [patternType, issues] of Object.entries(result)) {
            const list = Array.isArray(issues) ? issues : [issues];
            for (const issue of list) {
                if (issue) {
                    formatIssue(issue, `Rule ${ruleIndex + 1}, ${patternType}`);
                }
            }
        }
    });

    return errors;
};
