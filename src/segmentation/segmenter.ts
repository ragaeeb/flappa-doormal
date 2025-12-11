/**
 * Core segmentation engine for splitting Arabic text pages into logical segments.
 *
 * The segmenter takes an array of pages and applies pattern-based rules to
 * identify split points, producing segments with content, page references,
 * and optional metadata.
 *
 * @module segmenter
 */

import {
    type BreakpointContext,
    createSegment,
    expandBreakpoints,
    findActualEndPage,
    findActualStartPage,
    findBreakPosition,
    hasExcludedPageInRange,
    type NormalizedPage,
} from './breakpoint-utils.js';
import { makeDiacriticInsensitive } from './fuzzy.js';
import {
    anyRuleAllowsId,
    extractNamedCaptures,
    filterByConstraints,
    filterByOccurrence,
    getLastPositionalCapture,
    type MatchResult,
} from './match-utils.js';
import { normalizeLineEndings } from './textUtils.js';
import { expandTokensWithCaptures } from './tokens.js';
import type { Breakpoint, Page, Segment, SegmentationOptions, SplitRule } from './types.js';

/**
 * Checks if a regex pattern contains standard (anonymous) capturing groups.
 *
 * Detects standard capturing groups `(...)` while excluding:
 * - Non-capturing groups `(?:...)`
 * - Lookahead assertions `(?=...)` and `(?!...)`
 * - Lookbehind assertions `(?<=...)` and `(?<!...)`
 * - Named groups `(?<name>...)` (start with `(?` so excluded here)
 *
 * **Note**: Named capture groups `(?<name>...)` ARE capturing groups but are
 * excluded by this check because they are tracked separately via the
 * `captureNames` array from token expansion. This function only detects
 * anonymous capturing groups like `(.*)`.
 *
 * @param pattern - Regex pattern string to analyze
 * @returns `true` if the pattern contains at least one anonymous capturing group
 */
const hasCapturingGroup = (pattern: string): boolean => {
    // Match ( that is NOT followed by ? (excludes non-capturing and named groups)
    return /\((?!\?)/.test(pattern);
};

/**
 * Result of processing a pattern with token expansion and optional fuzzy matching.
 */
type ProcessedPattern = {
    /** The expanded regex pattern string (tokens replaced with regex) */
    pattern: string;
    /** Names of captured groups extracted from `{{token:name}}` syntax */
    captureNames: string[];
};

/**
 * Processes a pattern string by expanding tokens and optionally applying fuzzy matching.
 *
 * Fuzzy matching makes Arabic text diacritic-insensitive. When enabled, the
 * transform is applied to token patterns BEFORE wrapping with capture groups,
 * ensuring regex metacharacters (`(`, `)`, `|`, etc.) are not corrupted.
 *
 * @param pattern - Pattern string potentially containing `{{token}}` placeholders
 * @param fuzzy - Whether to apply diacritic-insensitive transformation
 * @returns Processed pattern with expanded tokens and capture names
 *
 * @example
 * processPattern('{{raqms:num}} {{dash}}', false)
 * // → { pattern: '(?<num>[٠-٩]+) [-–—ـ]', captureNames: ['num'] }
 *
 * @example
 * processPattern('{{naql}}', true)
 * // → { pattern: 'حَ?دَّ?ثَ?نَ?ا|...', captureNames: [] }
 */
const processPattern = (pattern: string, fuzzy: boolean): ProcessedPattern => {
    // Pass fuzzy transform to expandTokensWithCaptures so it can apply to raw token patterns
    const fuzzyTransform = fuzzy ? makeDiacriticInsensitive : undefined;
    const { pattern: expanded, captureNames } = expandTokensWithCaptures(pattern, fuzzyTransform);
    return { captureNames, pattern: expanded };
};

/**
 * Compiled regex and metadata for a split rule.
 */
type RuleRegex = {
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
 * Builds a compiled regex and metadata from a split rule.
 *
 * Handles all pattern types:
 * - `regex`: Used as-is (no token expansion)
 * - `template`: Tokens expanded via `expandTokensWithCaptures`
 * - `lineStartsWith`: Converted to `^(?:patterns...)`
 * - `lineStartsAfter`: Converted to `^(?:patterns...)(.*)`
 * - `lineEndsWith`: Converted to `(?:patterns...)$`
 *
 * @param rule - Split rule containing pattern and options
 * @returns Compiled regex with capture metadata
 */
const buildRuleRegex = (rule: SplitRule): RuleRegex => {
    const s: {
        lineStartsWith?: string[];
        lineStartsAfter?: string[];
        lineEndsWith?: string[];
        template?: string;
        regex?: string;
    } = { ...rule };

    const fuzzy = (rule as { fuzzy?: boolean }).fuzzy ?? false;
    let allCaptureNames: string[] = [];

    /**
     * Safely compiles a regex pattern, throwing a helpful error if invalid.
     *
     * @remarks
     * This catches syntax errors only. It does NOT protect against ReDoS
     * (catastrophic backtracking) from pathological patterns. Avoid compiling
     * patterns from untrusted sources.
     */
    const compileRegex = (pattern: string): RegExp => {
        try {
            return new RegExp(pattern, 'gmu');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid regex pattern: ${pattern}\n  Cause: ${message}`);
        }
    };

    // lineStartsAfter: creates a capturing group to exclude the marker from content
    if (s.lineStartsAfter?.length) {
        const processed = s.lineStartsAfter.map((p) => processPattern(p, fuzzy));
        const patterns = processed.map((p) => p.pattern).join('|');
        allCaptureNames = processed.flatMap((p) => p.captureNames);
        // Wrap patterns with named captures in a non-capturing group, then capture rest
        s.regex = `^(?:${patterns})(.*)`;
        return {
            captureNames: allCaptureNames,
            regex: compileRegex(s.regex),
            usesCapture: true,
            usesLineStartsAfter: true,
        };
    }

    if (s.lineStartsWith?.length) {
        const processed = s.lineStartsWith.map((p) => processPattern(p, fuzzy));
        const patterns = processed.map((p) => p.pattern).join('|');
        allCaptureNames = processed.flatMap((p) => p.captureNames);
        s.template = `^(?:${patterns})`;
    }
    if (s.lineEndsWith?.length) {
        const processed = s.lineEndsWith.map((p) => processPattern(p, fuzzy));
        const patterns = processed.map((p) => p.pattern).join('|');
        allCaptureNames = processed.flatMap((p) => p.captureNames);
        s.template = `(?:${patterns})$`;
    }
    if (s.template) {
        // Template: expand tokens with captures
        const { pattern, captureNames } = expandTokensWithCaptures(s.template);
        s.regex = pattern;
        allCaptureNames = [...allCaptureNames, ...captureNames];
    }

    if (!s.regex) {
        throw new Error(
            'Rule must specify exactly one pattern type: regex, template, lineStartsWith, lineStartsAfter, or lineEndsWith',
        );
    }

    const usesCapture = hasCapturingGroup(s.regex) || allCaptureNames.length > 0;
    return {
        captureNames: allCaptureNames,
        regex: compileRegex(s.regex),
        usesCapture,
        usesLineStartsAfter: false,
    };
};

/**
 * Represents the byte offset boundaries of a single page within concatenated content.
 */
type PageBoundary = {
    /** Start offset (inclusive) in the concatenated content string */
    start: number;
    /** End offset (inclusive) in the concatenated content string */
    end: number;
    /** Page ID from the original `Page` */
    id: number;
};

/**
 * Page mapping utilities for tracking positions across concatenated pages.
 */
type PageMap = {
    /**
     * Returns the page ID for a given offset in the concatenated content.
     *
     * @param offset - Character offset in concatenated content
     * @returns Page ID containing that offset
     */
    getId: (offset: number) => number;
    /** Array of page boundaries in order */
    boundaries: PageBoundary[];
    /** Sorted array of offsets where page breaks occur (for binary search) */
    pageBreaks: number[];
    /** Array of all page IDs in order (for sliding window algorithm) */
    pageIds: number[];
};

/**
 * Builds a concatenated content string and page mapping from input pages.
 *
 * Pages are joined with newline characters, and a page map is created to
 * track which page each offset belongs to. This allows pattern matching
 * across page boundaries while preserving page reference information.
 *
 * @param pages - Array of input pages with id and content
 * @returns Concatenated content string and page mapping utilities
 *
 * @example
 * const pages = [
 *   { id: 1, content: 'Page 1 text' },
 *   { id: 2, content: 'Page 2 text' }
 * ];
 * const { content, pageMap } = buildPageMap(pages);
 * // content = 'Page 1 text\nPage 2 text'
 * // pageMap.getId(0) = 1
 * // pageMap.getId(12) = 2
 */
const buildPageMap = (pages: Page[]): { content: string; normalizedPages: string[]; pageMap: PageMap } => {
    const boundaries: PageBoundary[] = [];
    const pageBreaks: number[] = []; // Sorted array for binary search
    let offset = 0;
    const parts: string[] = [];

    for (let i = 0; i < pages.length; i++) {
        const normalized = normalizeLineEndings(pages[i].content);
        boundaries.push({ end: offset + normalized.length, id: pages[i].id, start: offset });
        parts.push(normalized);
        if (i < pages.length - 1) {
            pageBreaks.push(offset + normalized.length); // Already in sorted order
            offset += normalized.length + 1;
        } else {
            offset += normalized.length;
        }
    }

    /**
     * Finds the page boundary containing the given offset using binary search.
     * O(log n) complexity for efficient lookup with many pages.
     *
     * @param off - Character offset to look up
     * @returns Page boundary or the last boundary as fallback
     */
    const findBoundary = (off: number): PageBoundary | undefined => {
        let lo = 0;
        let hi = boundaries.length - 1;

        while (lo <= hi) {
            const mid = (lo + hi) >>> 1; // Unsigned right shift for floor division
            const b = boundaries[mid];
            if (off < b.start) {
                hi = mid - 1;
            } else if (off > b.end) {
                lo = mid + 1;
            } else {
                return b;
            }
        }
        // Fallback to last boundary if not found
        return boundaries[boundaries.length - 1];
    };

    return {
        content: parts.join('\n'),
        normalizedPages: parts, // OPTIMIZATION: Return already-normalized content for reuse
        pageMap: {
            boundaries,
            getId: (off: number) => findBoundary(off)?.id ?? 0,
            pageBreaks,
            pageIds: boundaries.map((b) => b.id),
        },
    };
};

/**
 * Represents a position where content should be split, with associated metadata.
 */
type SplitPoint = {
    /** Character index in the concatenated content where the split occurs */
    index: number;
    /** Static metadata from the matched rule */
    meta?: Record<string, unknown>;
    /** Content captured by regex patterns with capturing groups */
    capturedContent?: string;
    /** Named captures from `{{token:name}}` patterns */
    namedCaptures?: Record<string, string>;
    /**
     * Offset from index where content actually starts (for lineStartsAfter).
     * If set, the segment content starts at `index + contentStartOffset`.
     * This allows excluding the marker from content while keeping the split index
     * at the match start so previous segment doesn't include the marker.
     */
    contentStartOffset?: number;
};

/**
 * Executes a regex against content and extracts match results with capture information.
 *
 * @param content - Full content string to search
 * @param regex - Compiled regex with 'g' flag
 * @param usesCapture - Whether to extract captured content
 * @param captureNames - Names of expected named capture groups
 * @returns Array of match results with positions and captures
 */
const findMatches = (content: string, regex: RegExp, usesCapture: boolean, captureNames: string[]) => {
    const matches: MatchResult[] = [];
    regex.lastIndex = 0;
    let m = regex.exec(content);

    while (m !== null) {
        const result: MatchResult = { end: m.index + m[0].length, start: m.index };

        // Extract named captures if present
        result.namedCaptures = extractNamedCaptures(m.groups, captureNames);

        // For lineStartsAfter, get the last positional capture (the .* content)
        if (usesCapture) {
            result.captured = getLastPositionalCapture(m);
        }

        matches.push(result);

        if (m[0].length === 0) {
            regex.lastIndex++;
        }
        m = regex.exec(content);
    }

    return matches;
};

/**
 * Finds page breaks within a given offset range using binary search.
 * O(log n + k) where n = total breaks, k = breaks in range.
 *
 * @param startOffset - Start of range (inclusive)
 * @param endOffset - End of range (exclusive)
 * @param sortedBreaks - Sorted array of page break offsets
 * @returns Array of break offsets relative to startOffset
 */
const findBreaksInRange = (startOffset: number, endOffset: number, sortedBreaks: number[]) => {
    if (sortedBreaks.length === 0) {
        return [];
    }

    // Binary search for first break >= startOffset
    let lo = 0;
    let hi = sortedBreaks.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sortedBreaks[mid] < startOffset) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    // Collect breaks until we exceed endOffset
    const result: number[] = [];
    for (let i = lo; i < sortedBreaks.length && sortedBreaks[i] < endOffset; i++) {
        result.push(sortedBreaks[i] - startOffset);
    }
    return result;
};

/**
 * Converts page-break newlines to spaces in segment content.
 *
 * When a segment spans multiple pages, the newline characters that were
 * inserted as page separators during concatenation are converted to spaces
 * for more natural reading.
 *
 * Uses binary search for O(log n + k) lookup instead of O(n) iteration.
 *
 * @param content - Segment content string
 * @param startOffset - Starting offset of this content in concatenated string
 * @param pageBreaks - Sorted array of page break offsets
 * @returns Content with page-break newlines converted to spaces
 */
const convertPageBreaks = (content: string, startOffset: number, pageBreaks: number[]): string => {
    const endOffset = startOffset + content.length;
    const breaksInRange = findBreaksInRange(startOffset, endOffset, pageBreaks);

    // No page breaks in this segment - return as-is (most common case)
    if (breaksInRange.length === 0) {
        return content;
    }

    // Convert ONLY page-break newlines (the ones inserted during concatenation) to spaces.
    //
    // NOTE: Offsets from findBreaksInRange are string indices (code units). Using Array.from()
    // would index by Unicode code points and can desync indices if surrogate pairs appear.
    const breakSet = new Set(breaksInRange);
    return content.replace(/\n/g, (match, offset: number) => (breakSet.has(offset) ? ' ' : match));
};

/**
 * Applies breakpoints to oversized segments.
 *
 * For each segment that spans more than maxPages, tries the breakpoint patterns
 * in order to find a suitable split point. Structural markers (from rules) are
 * always respected - segments are only broken within their boundaries.
 *
 * @param segments - Initial segments from rule processing
 * @param pages - Original pages for page lookup
 * @param maxPages - Maximum pages before breakpoints apply
 * @param breakpoints - Patterns to try in order (tokens supported)
 * @param prefer - 'longer' for last match, 'shorter' for first match
 * @returns Processed segments with oversized ones broken up
 */
const applyBreakpoints = (
    segments: Segment[],
    pages: Page[],
    normalizedContent: string[], // OPTIMIZATION: Pre-normalized content from buildPageMap
    maxPages: number,
    breakpoints: Breakpoint[],
    prefer: 'longer' | 'shorter',
): Segment[] => {
    const findExclusionBreakPosition = (
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

    // Get page IDs in order
    const pageIds = pages.map((p) => p.id);

    // OPTIMIZATION: Build pageId to index Map for O(1) lookups instead of O(P) indexOf
    const pageIdToIndex = new Map(pageIds.map((id, i) => [id, i]));

    // OPTIMIZATION: Build normalized pages Map from pre-normalized content
    const normalizedPages = new Map<number, NormalizedPage>();
    for (let i = 0; i < pages.length; i++) {
        const content = normalizedContent[i];
        normalizedPages.set(pages[i].id, { content, index: i, length: content.length });
    }

    // OPTIMIZATION: Pre-compute cumulative offsets for O(1) window size calculation
    const cumulativeOffsets: number[] = [0];
    let totalOffset = 0;
    for (let i = 0; i < pageIds.length; i++) {
        const pageData = normalizedPages.get(pageIds[i]);
        totalOffset += pageData ? pageData.length : 0;
        if (i < pageIds.length - 1) {
            totalOffset += 1; // separator between pages
        }
        cumulativeOffsets.push(totalOffset);
    }

    // Use extracted helper to expand breakpoints
    // Create pattern processor function for breakpoint-utils
    const patternProcessor = (p: string) => processPattern(p, false).pattern;
    const expandedBreakpoints = expandBreakpoints(breakpoints, patternProcessor);

    const result: Segment[] = [];

    for (const segment of segments) {
        const fromIdx = pageIdToIndex.get(segment.from) ?? -1;
        const toIdx = segment.to !== undefined ? (pageIdToIndex.get(segment.to) ?? fromIdx) : fromIdx;

        // Calculate span using actual page IDs (not array indices)
        const segmentSpan = (segment.to ?? segment.from) - segment.from;
        // If segment span is within limit AND no pages are excluded, keep as-is
        // Check if any page in this segment is excluded by any breakpoint
        const hasExclusions = expandedBreakpoints.some((bp) =>
            hasExcludedPageInRange(bp.excludeSet, pageIds, fromIdx, toIdx),
        );
        if (segmentSpan <= maxPages && !hasExclusions) {
            result.push(segment);
            continue;
        }

        // Rebuild content for this segment from individual pages
        // We need to work with the actual page content, not the merged segment content

        // Process this segment, potentially breaking it into multiple
        let remainingContent = segment.content;
        let currentFromIdx = fromIdx;
        let isFirstPiece = true;

        while (currentFromIdx <= toIdx) {
            // Calculate remaining span using actual page IDs (not array indices)
            const remainingSpan = pageIds[toIdx] - pageIds[currentFromIdx];

            // Check if any page in remaining segment is excluded
            const remainingHasExclusions = expandedBreakpoints.some((bp) =>
                hasExcludedPageInRange(bp.excludeSet, pageIds, currentFromIdx, toIdx),
            );

            // If remaining span is within limit AND no exclusions, output and done
            if (remainingSpan <= maxPages && !remainingHasExclusions) {
                const finalSeg = createSegment(
                    remainingContent,
                    pageIds[currentFromIdx],
                    currentFromIdx !== toIdx ? pageIds[toIdx] : undefined,
                    isFirstPiece ? segment.meta : undefined,
                );
                if (finalSeg) {
                    result.push(finalSeg);
                }
                break;
            }

            // Need to break within maxPages window (based on page IDs, not indices)
            // Find the last page index where pageId <= currentPageId + maxPages
            const currentPageId = pageIds[currentFromIdx];
            const maxWindowPageId = currentPageId + maxPages;
            let windowEndIdx = currentFromIdx;
            for (let i = currentFromIdx; i <= toIdx; i++) {
                if (pageIds[i] <= maxWindowPageId) {
                    windowEndIdx = i;
                } else {
                    break;
                }
            }

            // Special case: if we have exclusions IN THE CURRENT WINDOW, handle them
            // Check if any page in the WINDOW (not entire segment) is excluded
            const windowHasExclusions = expandedBreakpoints.some((bp) =>
                hasExcludedPageInRange(bp.excludeSet, pageIds, currentFromIdx, windowEndIdx),
            );
            let breakPosition = -1;
            if (windowHasExclusions) {
                breakPosition = findExclusionBreakPosition(
                    currentFromIdx,
                    windowEndIdx,
                    toIdx,
                    pageIds,
                    expandedBreakpoints,
                    cumulativeOffsets,
                );
            }

            // If no exclusion-based split found, use normal breakpoint finding
            if (breakPosition <= 0) {
                // Use extracted helper to find break position
                const breakpointCtx: BreakpointContext = {
                    cumulativeOffsets,
                    expandedBreakpoints,
                    normalizedPages,
                    pageIds,
                    prefer,
                };
                breakPosition = findBreakPosition(remainingContent, currentFromIdx, toIdx, windowEndIdx, breakpointCtx);
            }

            if (breakPosition <= 0) {
                // No pattern matched - fallback to page boundary split
                // If only one page in window, output it and continue to next page
                if (windowEndIdx === currentFromIdx) {
                    // Output this single page as a segment
                    const pageContent =
                        cumulativeOffsets[currentFromIdx + 1] !== undefined
                            ? remainingContent.slice(
                                  0,
                                  cumulativeOffsets[currentFromIdx + 1] - cumulativeOffsets[currentFromIdx],
                              )
                            : remainingContent;
                    const pageSeg = createSegment(
                        pageContent.trim(),
                        pageIds[currentFromIdx],
                        undefined,
                        isFirstPiece ? segment.meta : undefined,
                    );
                    if (pageSeg) {
                        result.push(pageSeg);
                    }
                    // Move to next page
                    remainingContent = remainingContent.slice(pageContent.length).trim();
                    currentFromIdx++;
                    isFirstPiece = false;
                    continue;
                }
                // Multi-page window with no pattern match - output entire window and continue
                breakPosition = cumulativeOffsets[windowEndIdx + 1] - cumulativeOffsets[currentFromIdx];
            }

            const pieceContent = remainingContent.slice(0, breakPosition).trim();

            // Find the actual starting and ending pages for this piece content
            // currentFromIdx might not be the actual starting page if content was split across pages
            const actualStartIdx = pieceContent
                ? findActualStartPage(pieceContent, currentFromIdx, toIdx, pageIds, normalizedPages)
                : currentFromIdx;
            const actualEndIdx = pieceContent
                ? findActualEndPage(pieceContent, actualStartIdx, windowEndIdx, pageIds, normalizedPages)
                : currentFromIdx;

            if (pieceContent) {
                const pieceSeg = createSegment(
                    pieceContent,
                    pageIds[actualStartIdx],
                    actualEndIdx > actualStartIdx ? pageIds[actualEndIdx] : undefined,
                    isFirstPiece ? segment.meta : undefined,
                );
                if (pieceSeg) {
                    result.push(pieceSeg);
                }
            }

            // Update for next iteration
            remainingContent = remainingContent.slice(breakPosition).trim();

            // Find which page the remaining content actually starts on
            // The next piece starts from actualEndIdx OR the next page if the break was at a page boundary
            let nextFromIdx = actualEndIdx;

            // Check if remaining content starts with content from the next page
            if (remainingContent && actualEndIdx + 1 <= toIdx) {
                const nextPageData = normalizedPages.get(pageIds[actualEndIdx + 1]);
                if (nextPageData) {
                    const nextPrefix = nextPageData.content.slice(0, Math.min(30, nextPageData.length));
                    if (nextPrefix && remainingContent.startsWith(nextPrefix)) {
                        nextFromIdx = actualEndIdx + 1;
                    }
                }
            }

            currentFromIdx = nextFromIdx;
            isFirstPiece = false;
        }
    }

    return result;
};

/**
 * Segments pages of content based on pattern-matching rules.
 *
 * This is the main entry point for the segmentation engine. It takes an array
 * of pages and applies the provided rules to identify split points, producing
 * an array of segments with content, page references, and metadata.
 *
 * @param pages - Array of pages with id and content
 * @param options - Segmentation options including splitting rules
 * @returns Array of segments with content, from/to page references, and optional metadata
 *
 * @example
 * // Split markdown by headers
 * const segments = segmentPages(pages, {
 *   rules: [
 *     { lineStartsWith: ['## '], split: 'at', meta: { type: 'chapter' } }
 *   ]
 * });
 *
 * @example
 * // Split Arabic hadith text with number extraction
 * const segments = segmentPages(pages, {
 *   rules: [
 *     {
 *       lineStartsAfter: ['{{raqms:hadithNum}} {{dash}} '],
 *       split: 'at',
 *       fuzzy: true,
 *       meta: { type: 'hadith' }
 *     }
 *   ]
 * });
 *
 * @example
 * // Multiple rules with page constraints
 * const segments = segmentPages(pages, {
 *   rules: [
 *     { lineStartsWith: ['{{kitab}}'], split: 'at', meta: { type: 'book' } },
 *     { lineStartsWith: ['{{bab}}'], split: 'at', min: 10, meta: { type: 'chapter' } },
 *     { regex: '^[٠-٩]+ - ', split: 'at', meta: { type: 'hadith' } }
 *   ]
 * });
 */
export const segmentPages = (pages: Page[], options: SegmentationOptions): Segment[] => {
    const { rules = [], maxPages, breakpoints, prefer = 'longer' } = options;
    if (!pages.length) {
        return [];
    }

    const { content: matchContent, normalizedPages: normalizedContent, pageMap } = buildPageMap(pages);
    const splitPoints: SplitPoint[] = [];

    // Process rules to find structural split points
    for (const rule of rules) {
        const { regex, usesCapture, captureNames, usesLineStartsAfter } = buildRuleRegex(rule);
        const allMatches = findMatches(matchContent, regex, usesCapture, captureNames);

        // Filter matches by page ID constraints
        const constrainedMatches = filterByConstraints(allMatches, rule, pageMap.getId);

        // Apply occurrence filtering (global)
        const finalMatches = filterByOccurrence(constrainedMatches, rule.occurrence);

        for (const m of finalMatches) {
            // For lineStartsAfter: we want to exclude the marker from content.
            // - Split at m.start so previous segment doesn't include the marker
            // - Set contentStartOffset to skip the marker when slicing this segment
            const isLineStartsAfter = usesLineStartsAfter && m.captured !== undefined;
            const markerLength = isLineStartsAfter ? m.end - m.captured!.length - m.start : 0;

            splitPoints.push({
                // lineStartsAfter: DON'T use capturedContent, let normal slicing extend to next split
                capturedContent: isLineStartsAfter ? undefined : m.captured,
                // lineStartsAfter: skip the marker when slicing content
                contentStartOffset: isLineStartsAfter ? markerLength : undefined,
                index: rule.split === 'at' ? m.start : m.end,
                meta: rule.meta,
                namedCaptures: m.namedCaptures,
            });
        }
    }

    // Deduplicate split points by index, preferring ones with more information
    // (contentStartOffset or meta over plain splits)
    const byIndex = new Map<number, SplitPoint>();
    for (const p of splitPoints) {
        const existing = byIndex.get(p.index);
        if (!existing) {
            byIndex.set(p.index, p);
        } else {
            // Prefer split with contentStartOffset (for lineStartsAfter stripping)
            // or with meta over one without
            const hasMoreInfo =
                (p.contentStartOffset !== undefined && existing.contentStartOffset === undefined) ||
                (p.meta !== undefined && existing.meta === undefined);
            if (hasMoreInfo) {
                byIndex.set(p.index, p);
            }
        }
    }
    const unique = [...byIndex.values()];
    unique.sort((a, b) => a.index - b.index);

    // Build initial segments from structural rules
    let segments = buildSegments(unique, matchContent, pageMap, rules);

    // Handle case where no rules or no split points - create one segment from all content
    // This allows breakpoints to still process the content
    if (segments.length === 0 && pages.length > 0) {
        const firstPage = pages[0];
        const lastPage = pages[pages.length - 1];
        const allContent = pages.map((p) => normalizeLineEndings(p.content)).join('\n');
        const initialSeg: Segment = {
            content: allContent.trim(),
            from: firstPage.id,
        };
        if (lastPage.id !== firstPage.id) {
            initialSeg.to = lastPage.id;
        }
        if (initialSeg.content) {
            segments = [initialSeg];
        }
    }

    // Apply breakpoints post-processing for oversized segments
    if (maxPages !== undefined && maxPages >= 0 && breakpoints?.length) {
        return applyBreakpoints(segments, pages, normalizedContent, maxPages, breakpoints, prefer);
    }

    return segments;
};

/**
 * Creates segment objects from split points.
 *
 * Handles segment creation including:
 * - Content extraction (with captured content for `lineStartsAfter`)
 * - Page break conversion to spaces
 * - From/to page reference calculation
 * - Metadata merging (static + named captures)
 *
 * @param splitPoints - Sorted, unique split points
 * @param content - Full concatenated content string
 * @param pageMap - Page mapping utilities
 * @param rules - Original rules (for constraint checking on first segment)
 * @returns Array of segment objects
 */
const buildSegments = (splitPoints: SplitPoint[], content: string, pageMap: PageMap, rules: SplitRule[]): Segment[] => {
    /**
     * Creates a single segment from a content range.
     */
    const createSegment = (
        start: number,
        end: number,
        meta?: Record<string, unknown>,
        capturedContent?: string,
        namedCaptures?: Record<string, string>,
        contentStartOffset?: number,
    ): Segment | null => {
        // For lineStartsAfter, skip the marker by using contentStartOffset
        const actualStart = start + (contentStartOffset ?? 0);
        // For lineStartsAfter (contentStartOffset set), trim leading whitespace after marker
        // For other rules, only trim trailing whitespace to preserve intentional leading spaces
        const sliced = content.slice(actualStart, end);
        let text = capturedContent?.trim() ?? (contentStartOffset ? sliced.trim() : sliced.replace(/[\s\n]+$/, ''));
        if (!text) {
            return null;
        }
        if (!capturedContent) {
            text = convertPageBreaks(text, actualStart, pageMap.pageBreaks);
        }
        const from = pageMap.getId(actualStart);
        const to = capturedContent ? pageMap.getId(end - 1) : pageMap.getId(actualStart + text.length - 1);
        const seg: Segment = { content: text, from };
        if (to !== from) {
            seg.to = to;
        }
        if (meta || namedCaptures) {
            seg.meta = { ...meta, ...namedCaptures };
        }
        return seg;
    };

    /**
     * Creates segments from an array of split points.
     */
    const createSegmentsFromSplitPoints = (): Segment[] => {
        const result: Segment[] = [];
        for (let i = 0; i < splitPoints.length; i++) {
            const sp = splitPoints[i];
            const end = i < splitPoints.length - 1 ? splitPoints[i + 1].index : content.length;
            const s = createSegment(
                sp.index,
                end,
                sp.meta,
                sp.capturedContent,
                sp.namedCaptures,
                sp.contentStartOffset,
            );
            if (s) {
                result.push(s);
            }
        }
        return result;
    };

    const segments: Segment[] = [];

    // Handle case with no split points
    if (!splitPoints.length) {
        const firstId = pageMap.getId(0);
        if (anyRuleAllowsId(rules, firstId)) {
            const s = createSegment(0, content.length);
            if (s) {
                segments.push(s);
            }
        }
        return segments;
    }

    // Add first segment if there's content before first split
    if (splitPoints[0].index > 0) {
        const firstId = pageMap.getId(0);
        if (anyRuleAllowsId(rules, firstId)) {
            const s = createSegment(0, splitPoints[0].index);
            if (s) {
                segments.push(s);
            }
        }
    }

    // Create segments from split points using extracted utility
    return [...segments, ...createSegmentsFromSplitPoints()];
};
