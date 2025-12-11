/**
 * Utility functions for regex matching and result processing.
 *
 * These functions were extracted from `segmenter.ts` to reduce complexity
 * and enable independent testing. They handle match filtering, capture
 * extraction, and occurrence-based selection.
 *
 * @module match-utils
 */

import { isPageExcluded } from './breakpoint-utils.js';
import type { SplitRule } from './types.js';

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
export const extractNamedCaptures = (
    groups: Record<string, string> | undefined,
    captureNames: string[],
): Record<string, string> | undefined => {
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
export const getLastPositionalCapture = (match: RegExpExecArray): string | undefined => {
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
): MatchResult[] => {
    return matches.filter((m) => {
        const id = getId(m.start);
        if (rule.min !== undefined && id < rule.min) {
            return false;
        }
        if (rule.max !== undefined && id > rule.max) {
            return false;
        }
        if (isPageExcluded(id, rule.exclude)) {
            return false;
        }
        return true;
    });
};

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
export const filterByOccurrence = (matches: MatchResult[], occurrence?: 'first' | 'last' | 'all'): MatchResult[] => {
    if (!matches.length) {
        return [];
    }
    if (occurrence === 'first') {
        return [matches[0]];
    }
    if (occurrence === 'last') {
        return [matches[matches.length - 1]];
    }
    return matches;
};

/**
 * Groups matches using a sliding window approach based on page ID difference.
 *
 * Uses a lookahead algorithm where `maxSpan` is the maximum page ID difference
 * allowed when looking ahead for the next split point. This prefers longer
 * segments by looking as far ahead as allowed before selecting a match.
 *
 * Algorithm:
 * 1. Start from the first page in the pages list
 * 2. Look for matches within `maxSpan` page IDs ahead
 * 3. Apply occurrence filter (e.g., 'last') to select a match
 * 4. If match found, add it; move window to start from the next page after the match
 * 5. If no match in window, skip to the next page and repeat
 *
 * @param matches - Array of match results (must be sorted by start position)
 * @param maxSpan - Maximum page ID difference allowed when looking ahead
 * @param occurrence - Which occurrence(s) to keep within each window
 * @param getId - Function that returns the page ID for a given offset
 * @param pageIds - Sorted array of all page IDs in the content
 * @returns Filtered array with sliding window and occurrence filter applied
 *
 * @example
 * // Pages: [1, 2, 3], maxSpan=1, occurrence='last'
 * // Window from page 1: pages 1-2 (diff <= 1)
 * // Finds last match in pages 1-2, adds it
 * // Next window from page 3: just page 3
 * // Result: segments span pages 1-2 and page 3
 */
export const groupBySpanAndFilter = (
    matches: MatchResult[],
    maxSpan: number,
    occurrence: 'first' | 'last' | 'all' | undefined,
    getId: (offset: number) => number,
    pageIds?: number[],
): MatchResult[] => {
    if (!matches.length) {
        return [];
    }

    // Precompute pageId per match once to avoid O(P×M) behavior for large inputs.
    // Since match offsets are in concatenated page order, pageIds are expected to be non-decreasing.
    const matchPageIds = matches.map((m) => getId(m.start));

    // If no pageIds provided, fall back to unique page IDs from matches
    const uniquePageIds =
        pageIds ?? [...new Set(matchPageIds)].sort((a, b) => a - b);

    if (!uniquePageIds.length) {
        return filterByOccurrence(matches, occurrence);
    }

    const result: MatchResult[] = [];
    let windowStartIdx = 0; // Index into uniquePageIds
    let matchIdx = 0; // Index into matches/matchPageIds

    while (windowStartIdx < uniquePageIds.length) {
        const windowStartPageId = uniquePageIds[windowStartIdx];
        const windowEndPageId = windowStartPageId + maxSpan;

        // Advance matchIdx to first match in or after the window start page.
        while (matchIdx < matches.length && matchPageIds[matchIdx] < windowStartPageId) {
            matchIdx++;
        }

        // No remaining matches anywhere
        if (matchIdx >= matches.length) {
            break;
        }

        // Find range of matches that fall within [windowStartPageId, windowEndPageId]
        const windowMatchStart = matchIdx;
        let windowMatchEndExclusive = windowMatchStart;
        while (windowMatchEndExclusive < matches.length && matchPageIds[windowMatchEndExclusive] <= windowEndPageId) {
            windowMatchEndExclusive++;
        }

        if (windowMatchEndExclusive <= windowMatchStart) {
            // No matches in this window, move to next page
            windowStartIdx++;
            continue;
        }

        // Apply occurrence selection without allocating/filtering per window.
        let selectedStart = windowMatchStart;
        let selectedEndExclusive = windowMatchEndExclusive;
        if (occurrence === 'first') {
            selectedEndExclusive = selectedStart + 1;
        } else if (occurrence === 'last') {
            selectedStart = windowMatchEndExclusive - 1;
        }

        for (let i = selectedStart; i < selectedEndExclusive; i++) {
            result.push(matches[i]);
        }

        const lastSelectedIndex = selectedEndExclusive - 1;
        const lastMatchPageId = matchPageIds[lastSelectedIndex];

        // Move window to start after the last selected match's page
        while (windowStartIdx < uniquePageIds.length && uniquePageIds[windowStartIdx] <= lastMatchPageId) {
            windowStartIdx++;
        }

        // Matches before this index can never be selected again (windowStartPageId only increases)
        matchIdx = lastSelectedIndex + 1;
    }

    return result;
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
export const anyRuleAllowsId = (rules: Pick<SplitRule, 'min' | 'max'>[], pageId: number): boolean => {
    return rules.some((r) => {
        const minOk = r.min === undefined || pageId >= r.min;
        const maxOk = r.max === undefined || pageId <= r.max;
        return minOk && maxOk;
    });
};
