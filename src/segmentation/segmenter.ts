/**
 * Core segmentation engine for splitting Arabic text pages into logical segments.
 *
 * The segmenter takes an array of pages and applies pattern-based rules to
 * identify split points, producing segments with content, page references,
 * and optional metadata.
 *
 * @module segmenter
 */

import { applyBreakpoints } from './breakpoint-processor.js';
import {
    anyRuleAllowsId,
    extractNamedCaptures,
    filterByConstraints,
    filterByOccurrence,
    getLastPositionalCapture,
    type MatchResult,
} from './match-utils.js';
import { buildRuleRegex, processPattern } from './rule-regex.js';
import { normalizeLineEndings } from './textUtils.js';
import type { Page, Segment, SegmentationOptions, SplitRule } from './types.js';

// buildRuleRegex + processPattern extracted to src/segmentation/rule-regex.ts

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
 * Deduplicate split points by index, preferring ones with more information.
 *
 * Preference rules (when same index):
 * - Prefer a split with `contentStartOffset` (needed for `lineStartsAfter` marker stripping)
 * - Otherwise prefer a split with `meta` over one without
 */
export const dedupeSplitPoints = (splitPoints: SplitPoint[]): SplitPoint[] => {
    const byIndex = new Map<number, SplitPoint>();
    for (const p of splitPoints) {
        const existing = byIndex.get(p.index);
        if (!existing) {
            byIndex.set(p.index, p);
            continue;
        }
        const hasMoreInfo =
            (p.contentStartOffset !== undefined && existing.contentStartOffset === undefined) ||
            (p.meta !== undefined && existing.meta === undefined);
        if (hasMoreInfo) {
            byIndex.set(p.index, p);
        }
    }
    const unique = [...byIndex.values()];
    unique.sort((a, b) => a.index - b.index);
    return unique;
};

/**
 * If no structural rules produced segments, create a single segment spanning all pages.
 * This allows breakpoint processing to still run.
 */
export const ensureFallbackSegment = (
    segments: Segment[],
    pages: Page[],
    normalizedContent: string[],
    pageJoiner: 'space' | 'newline',
): Segment[] => {
    if (segments.length > 0 || pages.length === 0) {
        return segments;
    }
    const firstPage = pages[0];
    const lastPage = pages[pages.length - 1];
    const joinChar = pageJoiner === 'newline' ? '\n' : ' ';
    const allContent = normalizedContent.join(joinChar).trim();
    if (!allContent) {
        return segments;
    }
    const initialSeg: Segment = { content: allContent, from: firstPage.id };
    if (lastPage.id !== firstPage.id) {
        initialSeg.to = lastPage.id;
    }
    return [initialSeg];
};

const collectSplitPointsFromRules = (rules: SplitRule[], matchContent: string, pageMap: PageMap): SplitPoint[] => {
    const collectSplitPointsFromRule = (rule: SplitRule): SplitPoint[] => {
        const { regex, usesCapture, captureNames, usesLineStartsAfter } = buildRuleRegex(rule);
        const allMatches = findMatches(matchContent, regex, usesCapture, captureNames);
        const constrainedMatches = filterByConstraints(allMatches, rule, pageMap.getId);
        const finalMatches = filterByOccurrence(constrainedMatches, rule.occurrence);

        return finalMatches.map((m) => {
            const isLineStartsAfter = usesLineStartsAfter && m.captured !== undefined;
            const markerLength = isLineStartsAfter ? m.end - m.captured!.length - m.start : 0;
            return {
                capturedContent: isLineStartsAfter ? undefined : m.captured,
                contentStartOffset: isLineStartsAfter ? markerLength : undefined,
                index: (rule.split ?? 'at') === 'at' ? m.start : m.end,
                meta: rule.meta,
                namedCaptures: m.namedCaptures,
            };
        });
    };

    return rules.flatMap(collectSplitPointsFromRule);
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
    // OPTIMIZATION: Fast-path for empty or no-newline content (common cases)
    if (!content || !content.includes('\n')) {
        return content;
    }

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
// applyBreakpoints implementation moved to breakpoint-processor.ts to reduce complexity in this module.

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
    const { rules = [], maxPages, breakpoints, prefer = 'longer', pageJoiner = 'space', logger } = options;
    if (!pages.length) {
        return [];
    }

    const { content: matchContent, normalizedPages: normalizedContent, pageMap } = buildPageMap(pages);
    const splitPoints = collectSplitPointsFromRules(rules, matchContent, pageMap);
    const unique = dedupeSplitPoints(splitPoints);

    // Build initial segments from structural rules
    let segments = buildSegments(unique, matchContent, pageMap, rules);

    segments = ensureFallbackSegment(segments, pages, normalizedContent, pageJoiner);

    // Apply breakpoints post-processing for oversized segments
    if (maxPages !== undefined && maxPages >= 0 && breakpoints?.length) {
        const patternProcessor = (p: string) => processPattern(p, false).pattern;
        return applyBreakpoints(
            segments,
            pages,
            normalizedContent,
            maxPages,
            breakpoints,
            prefer,
            patternProcessor,
            logger,
            pageJoiner,
        );
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
