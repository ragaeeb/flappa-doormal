/**
 * Utility functions for breakpoint processing in the segmentation engine.
 *
 * These functions handle breakpoint normalization, page exclusion checking,
 * and segment creation. Extracted for independent testing and reuse.
 *
 * @module breakpoint-utils
 */

import { FAST_PATH_THRESHOLD } from './breakpoint-constants.js';
import type { Breakpoint, BreakpointRule, Logger, PageRange, Segment } from './types.js';

const WINDOW_PREFIX_LENGTHS = [80, 60, 40, 30, 20, 15] as const;
// For page-join normalization we need to handle cases where only the very beginning of the next page
// is present in the current segment (e.g. the segment ends right before the next structural marker).
// That can be as short as a few words, so we allow shorter prefixes here.
const JOINER_PREFIX_LENGTHS = [80, 60, 40, 30, 20, 15, 12, 10, 8, 6] as const;

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
 * Applies a configured joiner at detected page boundaries within a multi-page content chunk.
 *
 * This is used for breakpoint-generated segments which don't have access to the original
 * `pageMap.pageBreaks` offsets. We detect page starts sequentially by searching for each page's
 * prefix after the previous boundary, then replace ONLY the single newline immediately before
 * that page start.
 *
 * This avoids converting real in-page newlines, while still normalizing page joins consistently.
 */
export const applyPageJoinerBetweenPages = (
    content: string,
    fromIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
    joiner: 'space' | 'newline',
): string => {
    if (joiner === 'newline' || fromIdx >= toIdx || !content.includes('\n')) {
        return content;
    }

    let updated = content;
    let searchFrom = 0;

    for (let pi = fromIdx + 1; pi <= toIdx; pi++) {
        const pageData = normalizedPages.get(pageIds[pi]);
        if (!pageData) {
            continue;
        }

        const found = findPrefixPositionInContent(updated, pageData.content.trimStart(), searchFrom);
        if (found > 0 && updated[found - 1] === '\n') {
            updated = `${updated.slice(0, found - 1)} ${updated.slice(found)}`;
        }
        if (found > 0) {
            searchFrom = found;
        }
    }

    return updated;
};

/**
 * Finds the position of a page prefix in content, trying multiple prefix lengths.
 */
const findPrefixPositionInContent = (content: string, trimmedPageContent: string, searchFrom: number): number => {
    for (const len of JOINER_PREFIX_LENGTHS) {
        const prefix = trimmedPageContent.slice(0, Math.min(len, trimmedPageContent.length)).trim();
        if (!prefix) {
            continue;
        }
        const pos = content.indexOf(prefix, searchFrom);
        if (pos > 0) {
            return pos;
        }
    }
    return -1;
};

/**
 * Estimates how far into the current page `remainingContent` begins.
 *
 * During breakpoint processing, `remainingContent` can begin mid-page after a previous split.
 * When that happens, raw cumulative page offsets (computed from full page starts) can overestimate
 * expected boundary positions. This helper computes an approximate starting offset by matching
 * a short prefix of `remainingContent` inside the current page content.
 */
export const estimateStartOffsetInCurrentPage = (
    remainingContent: string,
    currentFromIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
): number => {
    const currentPageData = normalizedPages.get(pageIds[currentFromIdx]);
    if (!currentPageData) {
        return 0;
    }

    const remStart = remainingContent.trimStart().slice(0, Math.min(60, remainingContent.length));
    const needle = remStart.slice(0, Math.min(30, remStart.length));
    if (!needle) {
        return 0;
    }

    const idx = currentPageData.content.indexOf(needle);
    return idx > 0 ? idx : 0;
};

/**
 * Attempts to find the start position of a target page within remainingContent,
 * anchored near an expected boundary position to reduce collisions.
 *
 * This is used to define breakpoint windows in terms of actual content being split, rather than
 * raw per-page offsets which can desync when structural rules strip markers.
 */
export const findPageStartNearExpectedBoundary = (
    remainingContent: string,
    _currentFromIdx: number, // unused but kept for API compatibility
    targetPageIdx: number,
    expectedBoundary: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
    logger?: Logger,
): number => {
    const targetPageData = normalizedPages.get(pageIds[targetPageIdx]);
    if (!targetPageData) {
        return -1;
    }

    // Anchor search near the expected boundary to avoid matching repeated phrases earlier in content.
    const approx = Math.min(Math.max(0, expectedBoundary), remainingContent.length);
    const searchStart = Math.max(0, approx - 10_000);
    const searchEnd = Math.min(remainingContent.length, approx + 2_000);

    // The target page content might be truncated in the current segment due to structural split points
    // early in that page (e.g. headings). Use progressively shorter prefixes.
    const targetTrimmed = targetPageData.content.trimStart();
    for (const len of WINDOW_PREFIX_LENGTHS) {
        const prefix = targetTrimmed.slice(0, Math.min(len, targetTrimmed.length)).trim();
        if (!prefix) {
            continue;
        }

        // Collect all candidate positions within the search range
        const candidates: { pos: number; isNewline: boolean }[] = [];
        let pos = remainingContent.indexOf(prefix, searchStart);
        while (pos !== -1 && pos <= searchEnd) {
            if (pos > 0) {
                const charBefore = remainingContent[pos - 1];
                if (charBefore === '\n') {
                    // Page boundaries are marked by newlines - this is the strongest signal
                    candidates.push({ isNewline: true, pos });
                } else if (/\s/.test(charBefore)) {
                    // Other whitespace is acceptable but less preferred
                    candidates.push({ isNewline: false, pos });
                }
            }
            pos = remainingContent.indexOf(prefix, pos + 1);
        }

        if (candidates.length > 0) {
            // Prioritize: 1) newline-preceded matches, 2) closest to expected boundary
            const newlineCandidates = candidates.filter((c) => c.isNewline);
            const pool = newlineCandidates.length > 0 ? newlineCandidates : candidates;

            // Select the candidate closest to the expected boundary
            let bestCandidate = pool[0];
            let bestDistance = Math.abs(pool[0].pos - expectedBoundary);
            for (let i = 1; i < pool.length; i++) {
                const dist = Math.abs(pool[i].pos - expectedBoundary);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    bestCandidate = pool[i];
                }
            }

            // Only accept the match if it's within MAX_DEVIATION of the expected boundary.
            // This prevents false positives when content is duplicated within pages.
            // MAX_DEVIATION of 2000 chars allows ~50-100% variance for typical
            // Arabic book pages (1000-3000 chars) while rejecting false positives
            // from duplicated content appearing mid-page.
            const MAX_DEVIATION = 2000;
            if (bestDistance <= MAX_DEVIATION) {
                return bestCandidate.pos;
            }

            logger?.debug?.('[breakpoints] findPageStartNearExpectedBoundary: Rejected match exceeding deviation', {
                bestDistance,
                expectedBoundary,
                matchPos: bestCandidate.pos,
                maxDeviation: MAX_DEVIATION,
                prefixLength: len,
                targetPageIdx,
            });

            // If best match is too far, continue to try shorter prefixes or return -1
        }
    }

    return -1;
};

/**
 * Builds a boundary position map for pages within the given range.
 *
 * This function computes page boundaries once per segment and enables
 * O(log n) page lookups via binary search with `findPageIndexForPosition`.
 *
 * Boundaries are derived from segmentContent (post-structural-rules).
 * When the segment starts mid-page, an offset correction is applied to
 * keep boundary estimates aligned with the segment's actual content space.
 *
 * @param segmentContent - Full segment content (already processed by structural rules)
 * @param fromIdx - Starting page index
 * @param toIdx - Ending page index
 * @param pageIds - Array of all page IDs
 * @param normalizedPages - Map of page ID to normalized content
 * @param cumulativeOffsets - Cumulative character offsets (for estimates)
 * @param logger - Optional logger for debugging
 * @returns Array where boundaryPositions[i] = start position of page (fromIdx + i),
 *          with a sentinel boundary at segmentContent.length as the last element
 *
 * @example
 * // For a 3-page segment:
 * buildBoundaryPositions(content, 0, 2, pageIds, normalizedPages, offsets)
 * // → [0, 23, 45, 67] where 67 is content.length (sentinel)
 */
export const buildBoundaryPositions = (
    segmentContent: string,
    fromIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
    cumulativeOffsets: number[],
    logger?: Logger,
): number[] => {
    const boundaryPositions: number[] = [0];
    const pageCount = toIdx - fromIdx + 1;

    // FAST PATH: For large segments (1000+ pages), use cumulative offsets directly.
    // The expensive string-search verification is only useful when structural rules
    // have stripped content causing offset drift. For large books with simple breakpoints,
    // the precomputed offsets are accurate and O(n) vs O(n×m) string searching.
    if (pageCount >= FAST_PATH_THRESHOLD) {
        logger?.debug?.('[breakpoints] Using fast-path for large segment in buildBoundaryPositions', {
            fromIdx,
            pageCount,
            toIdx,
        });

        const baseOffset = cumulativeOffsets[fromIdx] ?? 0;
        for (let i = fromIdx + 1; i <= toIdx; i++) {
            const offset = cumulativeOffsets[i];
            if (offset !== undefined) {
                const boundary = Math.max(0, offset - baseOffset);
                const prevBoundary = boundaryPositions[boundaryPositions.length - 1];
                // Ensure strictly increasing boundaries
                boundaryPositions.push(Math.max(prevBoundary + 1, Math.min(boundary, segmentContent.length)));
            }
        }
        boundaryPositions.push(segmentContent.length); // sentinel
        return boundaryPositions;
    }

    // ACCURATE PATH: For smaller segments, verify boundaries with string search
    // This handles cases where structural rules stripped markers causing offset drift
    // WARNING: This path is O(n×m) - if this log appears for large pageCount, investigate!
    logger?.debug?.('[breakpoints] buildBoundaryPositions: Using accurate string-search path', {
        contentLength: segmentContent.length,
        fromIdx,
        pageCount,
        toIdx,
    });
    const startOffsetInFromPage = estimateStartOffsetInCurrentPage(segmentContent, fromIdx, pageIds, normalizedPages);

    for (let i = fromIdx + 1; i <= toIdx; i++) {
        const expectedBoundary =
            cumulativeOffsets[i] !== undefined && cumulativeOffsets[fromIdx] !== undefined
                ? Math.max(0, cumulativeOffsets[i] - cumulativeOffsets[fromIdx] - startOffsetInFromPage)
                : segmentContent.length;

        const pos = findPageStartNearExpectedBoundary(
            segmentContent,
            fromIdx,
            i,
            expectedBoundary,
            pageIds,
            normalizedPages,
            logger,
        );

        const prevBoundary = boundaryPositions[boundaryPositions.length - 1];

        // Strict > prevents duplicate boundaries when pages have identical content
        const MAX_DEVIATION = 2000;
        const isValidPosition = pos > 0 && pos > prevBoundary && Math.abs(pos - expectedBoundary) < MAX_DEVIATION;

        if (isValidPosition) {
            boundaryPositions.push(pos);
        } else {
            // Fallback for whitespace-only pages, identical content, or stripped markers.
            // Ensure estimate is strictly > prevBoundary to prevent duplicate zero-length
            // boundaries, which would break binary-search page-attribution logic.
            const estimate = Math.max(prevBoundary + 1, expectedBoundary);
            boundaryPositions.push(Math.min(estimate, segmentContent.length));
        }
    }

    boundaryPositions.push(segmentContent.length); // sentinel
    logger?.debug?.('[breakpoints] buildBoundaryPositions: Complete', { boundaryCount: boundaryPositions.length });
    return boundaryPositions;
};

/**
 * Binary search to find which page a position falls within.
 * Uses "largest i where boundaryPositions[i] <= position" semantics.
 *
 * @param position - Character position in segmentContent
 * @param boundaryPositions - Precomputed boundary positions (from buildBoundaryPositions)
 * @param fromIdx - Base page index (boundaryPositions[0] corresponds to pageIds[fromIdx])
 * @returns Page index in pageIds array
 *
 * @example
 * // With boundaries [0, 20, 40, 60] and fromIdx=0:
 * findPageIndexForPosition(15, boundaries, 0) // → 0 (first page)
 * findPageIndexForPosition(25, boundaries, 0) // → 1 (second page)
 * findPageIndexForPosition(40, boundaries, 0) // → 2 (exactly on boundary = that page)
 */
export const findPageIndexForPosition = (position: number, boundaryPositions: number[], fromIdx: number): number => {
    // Handle edge cases
    if (boundaryPositions.length <= 1) {
        return fromIdx;
    }

    // Binary search for largest i where boundaryPositions[i] <= position
    let left = 0;
    let right = boundaryPositions.length - 2; // Exclude sentinel

    while (left < right) {
        const mid = Math.ceil((left + right) / 2);
        if (boundaryPositions[mid] <= position) {
            left = mid;
        } else {
            right = mid - 1;
        }
    }

    return fromIdx + left;
};
/**
 * Finds the end position of a breakpoint window inside `remainingContent`.
 *
 * The window end is defined as the start of the page AFTER `windowEndIdx` (i.e. `windowEndIdx + 1`),
 * found within the actual `remainingContent` string being split. This avoids relying on raw page offsets
 * that can diverge when structural rules strip markers (e.g. `lineStartsAfter`).
 */
export const findBreakpointWindowEndPosition = (
    remainingContent: string,
    currentFromIdx: number,
    windowEndIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
    cumulativeOffsets: number[],
    logger?: Logger,
): number => {
    // If the window already reaches the end of the segment, the window is the remaining content.
    if (windowEndIdx >= toIdx) {
        return remainingContent.length;
    }

    const desiredNextIdx = windowEndIdx + 1;
    const minNextIdx = currentFromIdx + 1;
    const maxNextIdx = Math.min(desiredNextIdx, toIdx);

    const startOffsetInCurrentPage = estimateStartOffsetInCurrentPage(
        remainingContent,
        currentFromIdx,
        pageIds,
        normalizedPages,
    );

    // Track the best expected boundary for fallback
    let bestExpectedBoundary = remainingContent.length;

    // If we can't find the boundary for the desired next page, progressively fall back
    // to earlier page boundaries (smaller window), which is conservative but still correct.
    for (let nextIdx = maxNextIdx; nextIdx >= minNextIdx; nextIdx--) {
        const expectedBoundary =
            cumulativeOffsets[nextIdx] !== undefined && cumulativeOffsets[currentFromIdx] !== undefined
                ? Math.max(0, cumulativeOffsets[nextIdx] - cumulativeOffsets[currentFromIdx] - startOffsetInCurrentPage)
                : remainingContent.length;

        // Keep track of the expected boundary for fallback
        if (nextIdx === maxNextIdx) {
            bestExpectedBoundary = expectedBoundary;
        }

        const pos = findPageStartNearExpectedBoundary(
            remainingContent,
            currentFromIdx,
            nextIdx,
            expectedBoundary,
            pageIds,
            normalizedPages,
            logger,
        );
        if (pos > 0) {
            return pos;
        }
    }

    // Fallback: Use the expected boundary from cumulative offsets.
    // This is more accurate than returning remainingContent.length, which would
    // merge all remaining pages into one segment.
    return Math.min(bestExpectedBoundary, remainingContent.length);
};

/**
 * Finds exclusion-based break position using raw cumulative offsets.
 *
 * This is used to ensure pages excluded by breakpoints are never merged into the same output segment.
 * Returns a break position relative to the start of `remainingContent` (i.e. the currentFromIdx start).
 */
export const findExclusionBreakPosition = (
    currentFromIdx: number,
    windowEndIdx: number,
    toIdx: number,
    pageIds: number[],
    expandedBreakpoints: Array<{ excludeSet: Set<number> }>,
    cumulativeOffsets: number[],
): number => {
    const startingPageId = pageIds[currentFromIdx];
    const startingPageExcluded = expandedBreakpoints.some((bp) => bp.excludeSet.has(startingPageId));
    if (startingPageExcluded && currentFromIdx < toIdx) {
        // Output just this one page as a segment (break at next page boundary)
        return cumulativeOffsets[currentFromIdx + 1] - cumulativeOffsets[currentFromIdx];
    }

    // Find the first excluded page AFTER the starting page (within window) and split BEFORE it
    for (let pageIdx = currentFromIdx + 1; pageIdx <= windowEndIdx; pageIdx++) {
        const pageId = pageIds[pageIdx];
        const isExcluded = expandedBreakpoints.some((bp) => bp.excludeSet.has(pageId));
        if (isExcluded) {
            return cumulativeOffsets[pageIdx] - cumulativeOffsets[currentFromIdx];
        }
    }
    return -1;
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
 * Handles page boundary breakpoint (empty pattern).
 * Returns break position or -1 if no valid position found.
 */
const handlePageBoundaryBreak = (
    remainingContent: string,
    windowEndIdx: number,
    windowEndPosition: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
): number => {
    const nextPageIdx = windowEndIdx + 1;
    if (nextPageIdx <= toIdx) {
        const nextPageData = normalizedPages.get(pageIds[nextPageIdx]);
        if (nextPageData) {
            const pos = findNextPagePosition(remainingContent, nextPageData);
            // Only trust findNextPagePosition if the result is reasonably close to windowEndPosition.
            // This prevents incorrect breaks when content is duplicated within pages.
            // Use a generous tolerance (2000 chars or 50% of windowEndPosition, whichever is larger).
            const tolerance = Math.max(2000, windowEndPosition * 0.5);
            if (pos > 0 && Math.abs(pos - windowEndPosition) <= tolerance) {
                return Math.min(pos, windowEndPosition, remainingContent.length);
            }
        }
    }
    // Fall back to windowEndPosition which is computed from cumulative offsets
    return Math.min(windowEndPosition, remainingContent.length);
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
): { breakpointIndex: number; breakPos: number; rule: BreakpointRule } | null => {
    const { pageIds, normalizedPages, expandedBreakpoints, prefer } = ctx;

    for (let i = 0; i < expandedBreakpoints.length; i++) {
        const { rule, regex, excludeSet, skipWhenRegex } = expandedBreakpoints[i];
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
            return {
                breakPos: handlePageBoundaryBreak(
                    remainingContent,
                    windowEndIdx,
                    windowEndPosition,
                    toIdx,
                    pageIds,
                    normalizedPages,
                ),
                breakpointIndex: i,
                rule,
            };
        }

        // Find matches within window
        const windowContent = remainingContent.slice(0, Math.min(windowEndPosition, remainingContent.length));
        const breakPos = findPatternBreakPosition(windowContent, regex, prefer);
        if (breakPos > 0) {
            return { breakPos, breakpointIndex: i, rule };
        }
    }

    return null;
};

/**
 * Searches backward from a target position to find a "safe" split point.
 * A safe split point is after whitespace or punctuation.
 *
 * @param content The text content
 * @param targetPosition The desired split position (hard limit)
 * @param lookbackChars How far back to search for a safe break
 * @returns The new split position (index), or -1 if no safe break found
 */
export const findSafeBreakPosition = (content: string, targetPosition: number, lookbackChars = 100): number => {
    // 1. Sanity check bounds
    const startSearch = Math.max(0, targetPosition - lookbackChars);

    // 2. Iterate backward
    for (let i = targetPosition - 1; i >= startSearch; i--) {
        const char = content[i];

        // Check for safe delimiter: Whitespace or Punctuation
        // Includes Arabic comma (،), semicolon (؛), full stop (.), etc.
        if (/[\s\n.,;!?؛،۔]/.test(char)) {
            return i + 1;
        }
    }
    return -1;
};

/**
 * Ensures the position does not split a surrogate pair.
 * If position is between High and Low surrogate, returns position - 1.
 */
export const adjustForSurrogate = (content: string, position: number): number => {
    if (position <= 0 || position >= content.length) {
        return position;
    }

    const high = content.charCodeAt(position - 1);
    const low = content.charCodeAt(position);

    // Check if previous char is High Surrogate (0xD800–0xDBFF)
    // AND current char is Low Surrogate (0xDC00–0xDFFF)
    if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) {
        return position - 1;
    }

    return position;
};
