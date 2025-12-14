/**
 * Utility functions for breakpoint processing in the segmentation engine.
 *
 * These functions handle breakpoint normalization, page exclusion checking,
 * and segment creation. Extracted for independent testing and reuse.
 *
 * @module breakpoint-utils
 */

import type { Breakpoint, BreakpointRule, PageRange, Segment } from './types.js';

/**
 * Normalizes a breakpoint to the object form.
 * Strings are converted to { pattern: str } with no constraints.
 *
 * @param bp - Breakpoint as string or object
 * @returns Normalized BreakpointRule object
 *
 * @example
 * normalizeBreakpoint('\\n\\n')
 * // → { pattern: '\\n\\n' }
 *
 * normalizeBreakpoint({ pattern: '\\n', min: 10 })
 * // → { pattern: '\\n', min: 10 }
 */
export const normalizeBreakpoint = (bp: Breakpoint): BreakpointRule => (typeof bp === 'string' ? { pattern: bp } : bp);

/**
 * Checks if a page ID is in an excluded list (single pages or ranges).
 *
 * @param pageId - Page ID to check
 * @param excludeList - List of page IDs or [from, to] ranges to exclude
 * @returns True if page is excluded
 *
 * @example
 * isPageExcluded(5, [1, 5, 10])
 * // → true
 *
 * isPageExcluded(5, [[3, 7]])
 * // → true
 *
 * isPageExcluded(5, [[10, 20]])
 * // → false
 */
export const isPageExcluded = (pageId: number, excludeList: PageRange[] | undefined): boolean => {
    if (!excludeList || excludeList.length === 0) {
        return false;
    }
    for (const item of excludeList) {
        if (typeof item === 'number') {
            if (pageId === item) {
                return true;
            }
        } else {
            const [from, to] = item;
            if (pageId >= from && pageId <= to) {
                return true;
            }
        }
    }
    return false;
};

/**
 * Checks if a page ID is within a breakpoint's min/max range and not excluded.
 *
 * @param pageId - Page ID to check
 * @param rule - Breakpoint rule with optional min/max/exclude constraints
 * @returns True if page is within valid range
 *
 * @example
 * isInBreakpointRange(50, { pattern: '\\n', min: 10, max: 100 })
 * // → true
 *
 * isInBreakpointRange(5, { pattern: '\\n', min: 10 })
 * // → false (below min)
 */
export const isInBreakpointRange = (pageId: number, rule: BreakpointRule): boolean => {
    if (rule.min !== undefined && pageId < rule.min) {
        return false;
    }
    if (rule.max !== undefined && pageId > rule.max) {
        return false;
    }
    return !isPageExcluded(pageId, rule.exclude);
};

/**
 * Builds an exclude set from a PageRange array for O(1) lookups.
 *
 * @param excludeList - List of page IDs or [from, to] ranges
 * @returns Set of all excluded page IDs
 *
 * @remarks
 * This expands ranges into explicit page IDs for fast membership checks. For typical
 * book-scale inputs (thousands of pages), this is small and keeps downstream logic
 * simple and fast. If you expect extremely large ranges (e.g., millions of pages),
 * consider avoiding broad excludes or introducing a range-based membership structure.
 *
 * @example
 * buildExcludeSet([1, 5, [10, 12]])
 * // → Set { 1, 5, 10, 11, 12 }
 */
export const buildExcludeSet = (excludeList: PageRange[] | undefined): Set<number> => {
    const excludeSet = new Set<number>();
    for (const item of excludeList || []) {
        if (typeof item === 'number') {
            excludeSet.add(item);
        } else {
            for (let i = item[0]; i <= item[1]; i++) {
                excludeSet.add(i);
            }
        }
    }
    return excludeSet;
};

/**
 * Creates a segment with optional to and meta fields.
 * Returns null if content is empty after trimming.
 *
 * @param content - Segment content
 * @param fromPageId - Starting page ID
 * @param toPageId - Optional ending page ID (omitted if same as from)
 * @param meta - Optional metadata to attach
 * @returns Segment object or null if empty
 *
 * @example
 * createSegment('Hello world', 1, 3, { chapter: 1 })
 * // → { content: 'Hello world', from: 1, to: 3, meta: { chapter: 1 } }
 *
 * createSegment('   ', 1, undefined, undefined)
 * // → null (empty content)
 */
export const createSegment = (
    content: string,
    fromPageId: number,
    toPageId: number | undefined,
    meta: Record<string, unknown> | undefined,
): Segment | null => {
    const trimmed = content.trim();
    if (!trimmed) {
        return null;
    }
    const seg: Segment = { content: trimmed, from: fromPageId };
    if (toPageId !== undefined && toPageId !== fromPageId) {
        seg.to = toPageId;
    }
    if (meta) {
        seg.meta = meta;
    }
    return seg;
};

/** Expanded breakpoint with pre-compiled regex and exclude set */
export type ExpandedBreakpoint = {
    rule: BreakpointRule;
    regex: RegExp | null;
    excludeSet: Set<number>;
    skipWhenRegex: RegExp | null;
};

/** Function type for pattern processing */
export type PatternProcessor = (pattern: string) => string;

/**
 * Expands breakpoint patterns and pre-computes exclude sets.
 *
 * @param breakpoints - Array of breakpoint patterns or rules
 * @param processPattern - Function to expand tokens in patterns
 * @returns Array of expanded breakpoints with compiled regexes
 *
 * @remarks
 * This function compiles regex patterns dynamically. This can be a ReDoS vector
 * if patterns come from untrusted sources. In typical usage, breakpoint rules
 * are application configuration, not user input.
 */
export const expandBreakpoints = (breakpoints: Breakpoint[], processPattern: PatternProcessor): ExpandedBreakpoint[] =>
    breakpoints.map((bp) => {
        const rule = normalizeBreakpoint(bp);
        const excludeSet = buildExcludeSet(rule.exclude);
        const skipWhenRegex =
            rule.skipWhen !== undefined
                ? (() => {
                      const expandedSkip = processPattern(rule.skipWhen);
                      try {
                          return new RegExp(expandedSkip, 'mu');
                      } catch (error) {
                          const message = error instanceof Error ? error.message : String(error);
                          throw new Error(`Invalid breakpoint skipWhen regex: ${rule.skipWhen}\n  Cause: ${message}`);
                      }
                  })()
                : null;
        if (rule.pattern === '') {
            return { excludeSet, regex: null, rule, skipWhenRegex };
        }
        const expanded = processPattern(rule.pattern);
        try {
            return { excludeSet, regex: new RegExp(expanded, 'gmu'), rule, skipWhenRegex };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid breakpoint regex: ${rule.pattern}\n  Cause: ${message}`);
        }
    });

/** Normalized page data for efficient lookups */
export type NormalizedPage = { content: string; length: number; index: number };

/**
 * Finds the actual ending page index by searching backwards for page content prefix.
 * Used to determine which page a segment actually ends on based on content matching.
 *
 * @param pieceContent - Content of the segment piece
 * @param currentFromIdx - Current starting index in pageIds
 * @param toIdx - Maximum ending index to search
 * @param pageIds - Array of page IDs
 * @param normalizedPages - Map of page ID to normalized content
 * @returns The actual ending page index
 */
export const findActualEndPage = (
    pieceContent: string,
    currentFromIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
): number => {
    for (let pi = toIdx; pi > currentFromIdx; pi--) {
        const pageData = normalizedPages.get(pageIds[pi]);
        if (pageData) {
            const checkPortion = pageData.content.slice(0, Math.min(30, pageData.length));
            if (checkPortion.length > 0 && pieceContent.indexOf(checkPortion) > 0) {
                return pi;
            }
        }
    }
    return currentFromIdx;
};

/**
 * Finds the actual starting page index by searching forwards for page content prefix.
 * Used to determine which page content actually starts from based on content matching.
 *
 * This is the counterpart to findActualEndPage - it searches forward to find which
 * page the content starts on, rather than which page it ends on.
 *
 * @param pieceContent - Content of the segment piece
 * @param currentFromIdx - Current starting index in pageIds
 * @param toIdx - Maximum ending index to search
 * @param pageIds - Array of page IDs
 * @param normalizedPages - Map of page ID to normalized content
 * @returns The actual starting page index
 */
export const findActualStartPage = (
    pieceContent: string,
    currentFromIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
): number => {
    const trimmedPiece = pieceContent.trimStart();
    if (!trimmedPiece) {
        return currentFromIdx;
    }

    // Search forward from currentFromIdx to find which page the content starts on
    for (let pi = currentFromIdx; pi <= toIdx; pi++) {
        const pageData = normalizedPages.get(pageIds[pi]);
        if (pageData) {
            const pagePrefix = pageData.content.slice(0, Math.min(30, pageData.length)).trim();
            const piecePrefix = trimmedPiece.slice(0, Math.min(30, trimmedPiece.length));

            // Check both directions:
            // 1. pieceContent starts with page prefix (page content is longer)
            // 2. page content starts with pieceContent prefix (pieceContent is shorter)
            if (pagePrefix.length > 0) {
                if (trimmedPiece.startsWith(pagePrefix)) {
                    return pi;
                }
                if (pageData.content.trimStart().startsWith(piecePrefix)) {
                    return pi;
                }
            }
        }
    }
    return currentFromIdx;
};

/** Context required for finding break positions */
export type BreakpointContext = {
    pageIds: number[];
    normalizedPages: Map<number, NormalizedPage>;
    expandedBreakpoints: ExpandedBreakpoint[];
    prefer: 'longer' | 'shorter';
};

/**
 * Checks if any page in a range is excluded by the given exclude set.
 *
 * @param excludeSet - Set of excluded page IDs
 * @param pageIds - Array of page IDs
 * @param fromIdx - Start index (inclusive)
 * @param toIdx - End index (inclusive)
 * @returns True if any page in range is excluded
 */
export const hasExcludedPageInRange = (
    excludeSet: Set<number>,
    pageIds: number[],
    fromIdx: number,
    toIdx: number,
): boolean => {
    if (excludeSet.size === 0) {
        return false;
    }
    for (let pageIdx = fromIdx; pageIdx <= toIdx; pageIdx++) {
        if (excludeSet.has(pageIds[pageIdx])) {
            return true;
        }
    }
    return false;
};

/**
 * Finds the position of the next page content within remaining content.
 * Returns -1 if not found.
 *
 * @param remainingContent - Content to search in
 * @param nextPageData - Normalized data for the next page
 * @returns Position of next page content, or -1 if not found
 */
export const findNextPagePosition = (remainingContent: string, nextPageData: NormalizedPage): number => {
    const searchPrefix = nextPageData.content.trim().slice(0, Math.min(30, nextPageData.length));
    if (searchPrefix.length === 0) {
        return -1;
    }
    const pos = remainingContent.indexOf(searchPrefix);
    return pos > 0 ? pos : -1;
};

/**
 * Finds matches within a window and returns the selected position based on preference.
 *
 * @param windowContent - Content to search
 * @param regex - Regex to match
 * @param prefer - 'longer' for last match, 'shorter' for first match
 * @returns Break position after the selected match, or -1 if no matches
 */
export const findPatternBreakPosition = (
    windowContent: string,
    regex: RegExp,
    prefer: 'longer' | 'shorter',
): number => {
    // OPTIMIZATION: Stream matches instead of collecting all into an array.
    // Only track first and last match to avoid allocating large arrays for dense patterns.
    let first: { index: number; length: number } | undefined;
    let last: { index: number; length: number } | undefined;
    for (const m of windowContent.matchAll(regex)) {
        const match = { index: m.index, length: m[0].length };
        if (!first) {
            first = match;
        }
        last = match;
    }
    if (!first) {
        return -1;
    }
    const selected = prefer === 'longer' ? last! : first;
    return selected.index + selected.length;
};

/**
 * Tries to find a break position within the current window using breakpoint patterns.
 * Returns the break position or -1 if no suitable break was found.
 *
 * @param remainingContent - Content remaining to be segmented
 * @param currentFromIdx - Current starting page index
 * @param toIdx - Ending page index
 * @param windowEndIdx - Maximum window end index
 * @param ctx - Breakpoint context with page data and patterns
 * @returns Break position in the content, or -1 if no break found
 */
export const findBreakPosition = (
    remainingContent: string,
    currentFromIdx: number,
    toIdx: number,
    windowEndIdx: number,
    windowEndPosition: number,
    ctx: BreakpointContext,
): number => {
    const { pageIds, normalizedPages, expandedBreakpoints, prefer } = ctx;

    for (const { rule, regex, excludeSet, skipWhenRegex } of expandedBreakpoints) {
        // Check if this breakpoint applies to the current segment's starting page
        if (!isInBreakpointRange(pageIds[currentFromIdx], rule)) {
            continue;
        }

        // Check if ANY page in the current WINDOW is excluded (not the entire segment)
        if (hasExcludedPageInRange(excludeSet, pageIds, currentFromIdx, windowEndIdx)) {
            continue;
        }

        // Check if content matches skipWhen pattern (pre-compiled)
        if (skipWhenRegex?.test(remainingContent)) {
            continue;
        }

        // Handle page boundary (empty pattern)
        if (regex === null) {
            // Break at the window boundary (i.e. start of the page AFTER windowEndIdx)
            // Prefer using detected next-page position if available, but never exceed windowEndPosition.
            const nextPageIdx = windowEndIdx + 1;
            if (nextPageIdx <= toIdx) {
                const nextPageData = normalizedPages.get(pageIds[nextPageIdx]);
                if (nextPageData) {
                    const pos = findNextPagePosition(remainingContent, nextPageData);
                    if (pos > 0) {
                        return Math.min(pos, windowEndPosition, remainingContent.length);
                    }
                }
            }
            return Math.min(windowEndPosition, remainingContent.length);
        }

        // Find matches within window
        const windowContent = remainingContent.slice(0, Math.min(windowEndPosition, remainingContent.length));
        const breakPos = findPatternBreakPosition(windowContent, regex, prefer);
        if (breakPos > 0) {
            return breakPos;
        }
    }

    return -1;
};
