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
import { resolveDebugConfig } from './debug-meta.js';
import { anyRuleAllowsId } from './match-utils.js';
import { applyReplacements } from './replace.js';
import { processPattern } from './rule-regex.js';
import {
    collectFastFuzzySplitPoints,
    createPageStartGuardChecker,
    partitionRulesForMatching,
} from './segmenter-rule-utils.js';
import type { PageBoundary, PageMap, SplitPoint } from './segmenter-types.js';
import {
    applyOccurrenceFilter,
    buildRuleRegexes,
    processCombinedMatches,
    processStandaloneRule,
} from './split-point-helpers.js';
import { normalizeLineEndings } from './textUtils.js';
import type { Logger, Page, Segment, SegmentationOptions, SplitRule } from './types.js';

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
 * Deduplicate split points by index, preferring ones with more information.
 *
 * Preference rules (when same index):
 * - Prefer a split with `contentStartOffset` (needed for `lineStartsAfter` marker stripping)
 * - Otherwise prefer a split with `meta` over one without
 */
export const dedupeSplitPoints = (splitPoints: SplitPoint[]) => {
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
) => {
    if (segments.length > 0 || pages.length === 0) {
        return segments;
    }
    const firstPage = pages[0];
    const lastPage = pages.at(-1)!;
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

const collectSplitPointsFromRules = (
    rules: SplitRule[],
    matchContent: string,
    pageMap: PageMap,
    debugMetaKey: string | undefined,
    logger?: Logger,
) => {
    logger?.debug?.('[segmenter] collecting split points from rules', {
        contentLength: matchContent.length,
        ruleCount: rules.length,
    });

    const passesPageStartGuard = createPageStartGuardChecker(matchContent, pageMap);
    const { combinableRules, fastFuzzyRules, standaloneRules } = partitionRulesForMatching(rules);

    logger?.debug?.('[segmenter] rules partitioned', {
        combinableCount: combinableRules.length,
        fastFuzzyCount: fastFuzzyRules.length,
        standaloneCount: standaloneRules.length,
    });

    // Start with fast-fuzzy matches
    const splitPointsByRule = collectFastFuzzySplitPoints(matchContent, pageMap, fastFuzzyRules, passesPageStartGuard);

    // Process combinable rules in a single pass
    if (combinableRules.length > 0) {
        const ruleRegexes = buildRuleRegexes(combinableRules);
        processCombinedMatches(
            matchContent,
            combinableRules,
            ruleRegexes,
            pageMap,
            passesPageStartGuard,
            splitPointsByRule,
            logger,
        );
    }

    // Process standalone rules
    for (const rule of standaloneRules) {
        const originalIndex = rules.indexOf(rule);
        processStandaloneRule(rule, originalIndex, matchContent, pageMap, passesPageStartGuard, splitPointsByRule);
    }

    // Apply occurrence filtering and flatten
    return applyOccurrenceFilter(rules, splitPointsByRule, debugMetaKey);
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
const convertPageBreaks = (content: string, startOffset: number, pageBreaks: number[]) => {
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
export const segmentPages = (pages: Page[], options: SegmentationOptions) => {
    const { rules = [], breakpoints = [], prefer = 'longer', pageJoiner = 'space', logger, maxContentLength } = options;

    if (maxContentLength && maxContentLength < 50) {
        throw new Error(`maxContentLength must be at least 50 characters.`);
    }

    // Default maxPages to 0 (single page) unless maxContentLength is provided
    const maxPages = options.maxPages ?? (maxContentLength ? Number.MAX_SAFE_INTEGER : 0);

    const debug = resolveDebugConfig((options as any).debug);
    const debugMetaKey = debug?.includeRule ? debug.metaKey : undefined;

    logger?.info?.('[segmenter] starting segmentation', {
        breakpointCount: breakpoints.length,
        maxContentLength,
        maxPages,
        pageCount: pages.length,
        prefer,
        ruleCount: rules.length,
    });

    const processedPages = options.replace ? applyReplacements(pages, options.replace) : pages;
    const { content: matchContent, normalizedPages: normalizedContent, pageMap } = buildPageMap(processedPages);

    logger?.debug?.('[segmenter] content built', {
        pageIds: pageMap.pageIds,
        totalContentLength: matchContent.length,
    });

    const splitPoints = collectSplitPointsFromRules(rules, matchContent, pageMap, debugMetaKey, logger);
    const unique = dedupeSplitPoints(splitPoints);

    logger?.debug?.('[segmenter] split points collected', {
        rawSplitPoints: splitPoints.length,
        uniqueSplitPoints: unique.length,
    });

    // Build initial segments from structural rules
    let segments = buildSegments(unique, matchContent, pageMap, rules);

    logger?.debug?.('[segmenter] structural segments built', {
        segmentCount: segments.length,
        segments: segments.map((s) => ({ contentLength: s.content.length, from: s.from, to: s.to })),
    });

    segments = ensureFallbackSegment(segments, processedPages, normalizedContent, pageJoiner);

    // Apply breakpoints post-processing for oversized segments
    if ((maxPages >= 0 || (maxContentLength && maxContentLength > 0)) && breakpoints.length) {
        logger?.debug?.('[segmenter] applying breakpoints to oversized segments');
        const patternProcessor = (p: string) => processPattern(p, false).pattern;
        const result = applyBreakpoints(
            segments,
            processedPages,
            normalizedContent,
            maxPages,
            breakpoints,
            prefer,
            patternProcessor,
            logger,
            pageJoiner,
            debug?.includeBreakpoint ? debug.metaKey : undefined,
            maxContentLength,
        );
        logger?.info?.('[segmenter] segmentation complete (with breakpoints)', {
            finalSegmentCount: result.length,
        });
        return result;
    }
    logger?.info?.('[segmenter] segmentation complete (structural only)', {
        finalSegmentCount: segments.length,
    });
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
const buildSegments = (splitPoints: SplitPoint[], content: string, pageMap: PageMap, rules: SplitRule[]) => {
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
            const end = splitPoints[i + 1]?.index ?? content.length;
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
