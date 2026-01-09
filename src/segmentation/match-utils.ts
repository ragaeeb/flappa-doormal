import type { SplitRule } from '@/types/rules.js';
import { isPageExcluded } from './breakpoint-utils.js';

/**
 * Result of a regex match with position and optional capture information.
 *
 * Represents a single match found by the segmentation engine, including
 * its position in the concatenated content and any captured values.
 */
export type MatchResult = {
    /**
     * Start offset (inclusive) of the match in the content string.
     */
    start: number;

    /**
     * End offset (exclusive) of the match in the content string.
     *
     * The matched text is `content.slice(start, end)`.
     */
    end: number;

    /**
     * Content captured by `lineStartsAfter` patterns.
     *
     * For patterns like `^٦٦٩٦ - (.*)`, this contains the text
     * matched by the `(.*)` group (the rest of the line after the marker).
     */
    captured?: string;

    /**
     * Named capture group values from `{{token:name}}` syntax.
     *
     * Keys are the capture names, values are the matched strings.
     *
     * @example
     * // For pattern '{{raqms:num}} {{dash}}'
     * { num: '٦٦٩٦' }
     */
    namedCaptures?: Record<string, string>;
};

/**
 * Extracts named capture groups from a regex match.
 *
 * Only includes groups that are in the `captureNames` list and have
 * defined values. This filters out positional captures and ensures
 * only explicitly requested named captures are returned.
 *
 * @param groups - The `match.groups` object from `RegExp.exec()`
 * @param captureNames - List of capture names to extract (from `{{token:name}}` syntax)
 * @returns Object with capture name → value pairs, or `undefined` if none found
 *
 * @example
 * const match = /(?<num>[٠-٩]+) -/.exec('٦٦٩٦ - text');
 * extractNamedCaptures(match.groups, ['num'])
 * // → { num: '٦٦٩٦' }
 *
 * @example
 * // No matching captures
 * extractNamedCaptures({}, ['num'])
 * // → undefined
 *
 * @example
 * // Undefined groups
 * extractNamedCaptures(undefined, ['num'])
 * // → undefined
 */
export const extractNamedCaptures = (groups: Record<string, string> | undefined, captureNames: string[]) => {
    if (!groups || captureNames.length === 0) {
        return undefined;
    }
    const namedCaptures: Record<string, string> = {};
    for (const name of captureNames) {
        if (groups[name] !== undefined) {
            namedCaptures[name] = groups[name];
        }
    }
    return Object.keys(namedCaptures).length > 0 ? namedCaptures : undefined;
};

/**
 * Gets the last defined positional capture group from a match array.
 *
 * Used for `lineStartsAfter` patterns where the content capture (`.*`)
 * is always at the end of the pattern. Named captures may shift the
 * positional indices, so we iterate backward to find the actual content.
 *
 * @param match - RegExp exec result array
 * @returns The last defined capture group value, or `undefined` if none
 *
 * @example
 * // Pattern: ^(?:(?<num>[٠-٩]+) - )(.*)
 * // Match array: ['٦٦٩٦ - content', '٦٦٩٦', 'content']
 * getLastPositionalCapture(match)
 * // → 'content'
 *
 * @example
 * // No captures
 * getLastPositionalCapture(['full match'])
 * // → undefined
 */
export const getLastPositionalCapture = (match: RegExpExecArray) => {
    if (match.length <= 1) {
        return undefined;
    }
    for (let i = match.length - 1; i >= 1; i--) {
        if (match[i] !== undefined) {
            return match[i];
        }
    }
    return undefined;
};

/**
 * Filters matches to only include those within page ID constraints.
 *
 * Applies the `min`, `max`, and `exclude` constraints from a rule to filter out
 * matches that occur on pages outside the allowed range or explicitly excluded.
 *
 * @param matches - Array of match results to filter
 * @param rule - Rule containing `min`, `max`, and/or `exclude` page constraints
 * @param getId - Function that returns the page ID for a given offset
 * @returns Filtered array containing only matches within constraints
 *
 * @example
 * const matches = [
 *   { start: 0, end: 10 },   // Page 1
 *   { start: 100, end: 110 }, // Page 5
 *   { start: 200, end: 210 }, // Page 10
 * ];
 * filterByConstraints(matches, { min: 3, max: 8 }, getId)
 * // → [{ start: 100, end: 110 }] (only page 5 match)
 */
export const filterByConstraints = (
    matches: MatchResult[],
    rule: Pick<SplitRule, 'min' | 'max' | 'exclude'>,
    getId: (offset: number) => number,
) =>
    matches.filter((m) => {
        const id = getId(m.start);
        return (
            (rule.min === undefined || id >= rule.min) &&
            (rule.max === undefined || id <= rule.max) &&
            !isPageExcluded(id, rule.exclude)
        );
    });

/**
 * Filters matches based on occurrence setting (first, last, or all).
 *
 * Applies occurrence-based selection to a list of matches:
 * - `'all'` or `undefined`: Return all matches (default)
 * - `'first'`: Return only the first match
 * - `'last'`: Return only the last match
 *
 * @param matches - Array of match results to filter
 * @param occurrence - Which occurrence(s) to keep
 * @returns Filtered array based on occurrence setting
 *
 * @example
 * const matches = [{ start: 0 }, { start: 10 }, { start: 20 }];
 *
 * filterByOccurrence(matches, 'first')
 * // → [{ start: 0 }]
 *
 * filterByOccurrence(matches, 'last')
 * // → [{ start: 20 }]
 *
 * filterByOccurrence(matches, 'all')
 * // → [{ start: 0 }, { start: 10 }, { start: 20 }]
 *
 * filterByOccurrence(matches, undefined)
 * // → [{ start: 0 }, { start: 10 }, { start: 20 }] (default: all)
 */
export const filterByOccurrence = (matches: MatchResult[], occurrence?: 'first' | 'last' | 'all') => {
    if (!matches.length) {
        return [];
    }
    if (occurrence === 'first') {
        return [matches[0]];
    }
    if (occurrence === 'last') {
        return [matches.at(-1)!];
    }
    return matches;
};

/**
 * Checks if any rule in the list allows the given page ID.
 *
 * A rule allows an ID if it falls within the rule's `min`/`max` constraints.
 * Rules without constraints allow all page IDs.
 *
 * This is used to determine whether to create a segment for content
 * that appears before any split points (the "first segment").
 *
 * @param rules - Array of rules with optional `min` and `max` constraints
 * @param pageId - Page ID to check
 * @returns `true` if at least one rule allows the page ID
 *
 * @example
 * const rules = [
 *   { min: 5, max: 10 },  // Allows pages 5-10
 *   { min: 20 },          // Allows pages 20+
 * ];
 *
 * anyRuleAllowsId(rules, 7)   // → true (first rule allows)
 * anyRuleAllowsId(rules, 3)   // → false (no rule allows)
 * anyRuleAllowsId(rules, 25)  // → true (second rule allows)
 *
 * @example
 * // Rules without constraints allow everything
 * anyRuleAllowsId([{}], 999) // → true
 */
export const anyRuleAllowsId = (rules: Pick<SplitRule, 'min' | 'max'>[], pageId: number) =>
    rules.some((r) => (r.min === undefined || pageId >= r.min) && (r.max === undefined || pageId <= r.max));
