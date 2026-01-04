/**
 * Breakpoint post-processing engine extracted from segmenter.ts.
 *
 * This module is intentionally split into small helpers to reduce cognitive complexity
 * and allow unit testing of tricky edge cases (window sizing, next-page advancement, etc.).
 */

import {
    applyPageJoinerBetweenPages,
    type BreakpointContext,
    buildBoundaryPositions,
    createSegment,
    expandBreakpoints,
    findBreakPosition,
    findBreakpointWindowEndPosition,
    findExclusionBreakPosition,
    findPageIndexForPosition,
    hasExcludedPageInRange,
    type NormalizedPage,
} from './breakpoint-utils.js';
import { buildBreakpointDebugPatch, mergeDebugIntoMeta } from './debug-meta.js';
import type { Breakpoint, Logger, Page, Segment } from './types.js';

export type BreakpointPatternProcessor = (pattern: string) => string;

const buildPageIdToIndexMap = (pageIds: number[]) => new Map(pageIds.map((id, i) => [id, i]));

const buildNormalizedPagesMap = (pages: Page[], normalizedContent: string[]) => {
    const normalizedPages = new Map<number, NormalizedPage>();
    for (let i = 0; i < pages.length; i++) {
        const content = normalizedContent[i];
        normalizedPages.set(pages[i].id, { content, index: i, length: content.length });
    }
    return normalizedPages;
};

const buildCumulativeOffsets = (pageIds: number[], normalizedPages: Map<number, NormalizedPage>) => {
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
    return cumulativeOffsets;
};

const hasAnyExclusionsInRange = (
    expandedBreakpoints: Array<{ excludeSet: Set<number> }>,
    pageIds: number[],
    fromIdx: number,
    toIdx: number,
): boolean => expandedBreakpoints.some((bp) => hasExcludedPageInRange(bp.excludeSet, pageIds, fromIdx, toIdx));

export const computeWindowEndIdx = (currentFromIdx: number, toIdx: number, pageIds: number[], maxPages: number) => {
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
    return windowEndIdx;
};

const computeRemainingSpan = (currentFromIdx: number, toIdx: number, pageIds: number[]) =>
    pageIds[toIdx] - pageIds[currentFromIdx];

const createFinalSegment = (
    remainingContent: string,
    currentFromIdx: number,
    toIdx: number,
    pageIds: number[],
    meta: Segment['meta'] | undefined,
    includeMeta: boolean,
) =>
    createSegment(
        remainingContent,
        pageIds[currentFromIdx],
        currentFromIdx !== toIdx ? pageIds[toIdx] : undefined,
        includeMeta ? meta : undefined,
    );

type PiecePages = { actualEndIdx: number; actualStartIdx: number };

/**
 * Computes the actual start and end page indices for a piece using
 * precomputed boundary positions and binary search.
 *
 * @param pieceStartPos - Start position of the piece in the full segment content
 * @param pieceEndPos - End position (exclusive) of the piece
 * @param boundaryPositions - Precomputed boundary positions from buildBoundaryPositions
 * @param baseFromIdx - Base page index (boundaryPositions[0] corresponds to pageIds[baseFromIdx])
 * @param toIdx - Maximum page index
 * @returns Object with actualStartIdx and actualEndIdx
 */
const computePiecePages = (
    pieceStartPos: number,
    pieceEndPos: number,
    boundaryPositions: number[],
    baseFromIdx: number,
    toIdx: number,
): PiecePages => {
    const actualStartIdx = findPageIndexForPosition(pieceStartPos, boundaryPositions, baseFromIdx);
    // For end position, use pieceEndPos - 1 to get the page containing the last character
    // (since pieceEndPos is exclusive)
    const endPos = Math.max(pieceStartPos, pieceEndPos - 1);
    const actualEndIdx = Math.min(findPageIndexForPosition(endPos, boundaryPositions, baseFromIdx), toIdx);
    return { actualEndIdx, actualStartIdx };
};

export const computeNextFromIdx = (
    remainingContent: string,
    actualEndIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
) => {
    let nextFromIdx = actualEndIdx;
    if (remainingContent && actualEndIdx + 1 <= toIdx) {
        const nextPageData = normalizedPages.get(pageIds[actualEndIdx + 1]);
        if (nextPageData) {
            const nextPrefix = nextPageData.content.slice(0, Math.min(30, nextPageData.length));
            const remainingPrefix = remainingContent.trimStart().slice(0, Math.min(30, remainingContent.length));
            // Check both directions:
            // 1. remainingContent starts with page prefix (page is longer or equal)
            // 2. page content starts with remaining prefix (remaining is shorter)
            if (
                nextPrefix &&
                (remainingContent.startsWith(nextPrefix) || nextPageData.content.startsWith(remainingPrefix))
            ) {
                nextFromIdx = actualEndIdx + 1;
            }
        }
    }
    return nextFromIdx;
};

const createPieceSegment = (
    pieceContent: string,
    actualStartIdx: number,
    actualEndIdx: number,
    pageIds: number[],
    meta: Segment['meta'] | undefined,
    includeMeta: boolean,
): Segment | null =>
    createSegment(
        pieceContent,
        pageIds[actualStartIdx],
        actualEndIdx > actualStartIdx ? pageIds[actualEndIdx] : undefined,
        includeMeta ? meta : undefined,
    );

/**
 * Finds the break offset within a window, trying exclusions first, then patterns.
 *
 * @returns Break offset relative to remainingContent, or windowEndPosition as fallback
 */
const findBreakOffsetForWindow = (
    remainingContent: string,
    currentFromIdx: number,
    windowEndIdx: number,
    toIdx: number,
    windowEndPosition: number,
    pageIds: number[],
    expandedBreakpoints: ReturnType<typeof expandBreakpoints>,
    cumulativeOffsets: number[],
    normalizedPages: Map<number, NormalizedPage>,
    prefer: 'longer' | 'shorter',
): { breakpointIndex?: number; breakOffset: number; breakpointRule?: { pattern: string } } => {
    const windowHasExclusions = hasAnyExclusionsInRange(expandedBreakpoints, pageIds, currentFromIdx, windowEndIdx);

    if (windowHasExclusions) {
        const exclusionBreak = findExclusionBreakPosition(
            currentFromIdx,
            windowEndIdx,
            toIdx,
            pageIds,
            expandedBreakpoints,
            cumulativeOffsets,
        );
        if (exclusionBreak > 0) {
            return { breakOffset: exclusionBreak };
        }
    }

    const breakpointCtx: BreakpointContext = { expandedBreakpoints, normalizedPages, pageIds, prefer };
    const patternMatch = findBreakPosition(
        remainingContent,
        currentFromIdx,
        toIdx,
        windowEndIdx,
        windowEndPosition,
        breakpointCtx,
    );

    if (patternMatch && patternMatch.breakPos > 0) {
        return {
            breakOffset: patternMatch.breakPos,
            breakpointIndex: patternMatch.breakpointIndex,
            breakpointRule: patternMatch.rule,
        };
    }
    return { breakOffset: windowEndPosition };
};

/**
 * Advances cursor position past any leading whitespace.
 */
const skipWhitespace = (content: string, startPos: number): number => {
    let pos = startPos;
    while (pos < content.length && /\s/.test(content[pos])) {
        pos++;
    }
    return pos;
};

/**
 * Processes an oversized segment by iterating through the content and
 * breaking it into smaller pieces that fit within maxPages constraints.
 *
 * Uses precomputed boundary positions for O(log n) page attribution lookups.
 */
const processOversizedSegment = (
    segment: Segment,
    fromIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
    cumulativeOffsets: number[],
    expandedBreakpoints: ReturnType<typeof expandBreakpoints>,
    maxPages: number,
    prefer: 'longer' | 'shorter',
    logger?: Logger,
    debugMetaKey?: string,
    maxContentLength?: number,
): Segment[] => {
    const result: Segment[] = [];
    const fullContent = segment.content;
    let cursorPos = 0;
    let currentFromIdx = fromIdx;
    let isFirstPiece = true;
    let lastBreakpoint: { breakpointIndex: number; rule: { pattern: string } } | null = null;

    const boundaryPositions = buildBoundaryPositions(
        fullContent,
        fromIdx,
        toIdx,
        pageIds,
        normalizedPages,
        cumulativeOffsets,
        logger,
    );

    logger?.debug?.('[breakpoints] boundaryPositions built', {
        boundaryPositions,
        fromIdx,
        fullContentLength: fullContent.length,
        toIdx,
    });

    const maxIterations = 10000;
    for (let i = 0; i < maxIterations && cursorPos < fullContent.length && currentFromIdx <= toIdx; i++) {
        const remainingContent = fullContent.slice(cursorPos);
        if (!remainingContent.trim()) {
            break;
        }

        const remainingSpan = computeRemainingSpan(currentFromIdx, toIdx, pageIds);
        const remainingHasExclusions = hasAnyExclusionsInRange(expandedBreakpoints, pageIds, currentFromIdx, toIdx);

        // Verification check: Does the remaining content fit within limits?
        const fitsInPages = remainingSpan <= maxPages;
        const fitsInLength = !maxContentLength || remainingContent.length <= maxContentLength;

        if (fitsInPages && fitsInLength && !remainingHasExclusions) {
            const includeMeta = isFirstPiece || Boolean(debugMetaKey);
            const meta =
                debugMetaKey && lastBreakpoint
                    ? mergeDebugIntoMeta(
                          includeMeta ? segment.meta : undefined,
                          debugMetaKey,
                          buildBreakpointDebugPatch(lastBreakpoint.breakpointIndex, lastBreakpoint.rule as any),
                      )
                    : includeMeta
                      ? segment.meta
                      : undefined;
            const finalSeg = createFinalSegment(remainingContent, currentFromIdx, toIdx, pageIds, meta, includeMeta);
            if (finalSeg) {
                result.push(finalSeg);
            }
            break;
        }

        const windowEndIdx = computeWindowEndIdx(currentFromIdx, toIdx, pageIds, maxPages);
        let windowEndPosition = findBreakpointWindowEndPosition(
            remainingContent,
            currentFromIdx,
            windowEndIdx,
            toIdx,
            pageIds,
            normalizedPages,
            cumulativeOffsets,
            logger,
        );

        // Apply maxContentLength constraint (Intersection logic)
        if (maxContentLength && maxContentLength < windowEndPosition) {
            windowEndPosition = maxContentLength;
        }

        logger?.debug?.(`[breakpoints] iteration=${i}`, { currentFromIdx, cursorPos, windowEndIdx, windowEndPosition });

        const found = findBreakOffsetForWindow(
            remainingContent,
            currentFromIdx,
            windowEndIdx,
            toIdx,
            windowEndPosition,
            pageIds,
            expandedBreakpoints,
            cumulativeOffsets,
            normalizedPages,
            prefer,
        );

        if (found.breakpointIndex !== undefined && found.breakpointRule) {
            lastBreakpoint = { breakpointIndex: found.breakpointIndex, rule: found.breakpointRule };
        }

        const breakPos = cursorPos + found.breakOffset;
        const pieceContent = fullContent.slice(cursorPos, breakPos).trim();
        const { actualEndIdx, actualStartIdx } = computePiecePages(
            cursorPos,
            breakPos,
            boundaryPositions,
            fromIdx,
            toIdx,
        );

        logger?.trace?.('[breakpoints] piece', { actualEndIdx, actualStartIdx, pieceLength: pieceContent.length });

        if (pieceContent) {
            const includeMeta = isFirstPiece || Boolean(debugMetaKey);
            const meta =
                debugMetaKey && lastBreakpoint
                    ? mergeDebugIntoMeta(
                          includeMeta ? segment.meta : undefined,
                          debugMetaKey,
                          buildBreakpointDebugPatch(lastBreakpoint.breakpointIndex, lastBreakpoint.rule as any),
                      )
                    : includeMeta
                      ? segment.meta
                      : undefined;
            const pieceSeg = createPieceSegment(pieceContent, actualStartIdx, actualEndIdx, pageIds, meta, includeMeta);
            if (pieceSeg) {
                result.push(pieceSeg);
            }
        }

        cursorPos = skipWhitespace(fullContent, breakPos);
        currentFromIdx = computeNextFromIdx(
            fullContent.slice(cursorPos),
            actualEndIdx,
            toIdx,
            pageIds,
            normalizedPages,
        );
        isFirstPiece = false;
    }

    logger?.debug?.('[breakpoints] done', { resultCount: result.length });
    return result;
};

/**
 * Applies breakpoints to oversized segments.
 *
 * Note: This is an internal engine used by `segmentPages()`.
 */
export const applyBreakpoints = (
    segments: Segment[],
    pages: Page[],
    normalizedContent: string[],
    maxPages: number,
    breakpoints: Breakpoint[],
    prefer: 'longer' | 'shorter',
    patternProcessor: BreakpointPatternProcessor,
    logger?: Logger,
    pageJoiner: 'space' | 'newline' = 'space',
    debugMetaKey?: string,
    maxContentLength?: number,
) => {
    const pageIds = pages.map((p) => p.id);
    const pageIdToIndex = buildPageIdToIndexMap(pageIds);
    const normalizedPages = buildNormalizedPagesMap(pages, normalizedContent);
    const cumulativeOffsets = buildCumulativeOffsets(pageIds, normalizedPages);
    const expandedBreakpoints = expandBreakpoints(breakpoints, patternProcessor);

    const result: Segment[] = [];

    logger?.info?.('Starting breakpoint processing', { maxPages, segmentCount: segments.length });

    logger?.debug?.('[breakpoints] inputSegments', {
        segmentCount: segments.length,
        segments: segments.map((s) => ({ contentLength: s.content.length, from: s.from, to: s.to })),
    });

    for (const segment of segments) {
        const fromIdx = pageIdToIndex.get(segment.from) ?? -1;
        const toIdx = segment.to !== undefined ? (pageIdToIndex.get(segment.to) ?? fromIdx) : fromIdx;

        const segmentSpan = (segment.to ?? segment.from) - segment.from;
        const hasExclusions = hasAnyExclusionsInRange(expandedBreakpoints, pageIds, fromIdx, toIdx);

        const fitsInPages = segmentSpan <= maxPages;
        const fitsInLength = !maxContentLength || segment.content.length <= maxContentLength;

        if (fitsInPages && fitsInLength && !hasExclusions) {
            result.push(segment);
            continue;
        }

        const broken = processOversizedSegment(
            segment,
            fromIdx,
            toIdx,
            pageIds,
            normalizedPages,
            cumulativeOffsets,
            expandedBreakpoints,
            maxPages,
            prefer,
            logger,
            debugMetaKey,
            maxContentLength,
        );
        // Normalize page joins for breakpoint-created pieces
        result.push(
            ...broken.map((s) => {
                const segFromIdx = pageIdToIndex.get(s.from) ?? -1;
                const segToIdx = s.to !== undefined ? (pageIdToIndex.get(s.to) ?? segFromIdx) : segFromIdx;
                if (segFromIdx >= 0 && segToIdx > segFromIdx) {
                    return {
                        ...s,
                        content: applyPageJoinerBetweenPages(
                            s.content,
                            segFromIdx,
                            segToIdx,
                            pageIds,
                            normalizedPages,
                            pageJoiner,
                        ),
                    };
                }
                return s;
            }),
        );
    }

    logger?.info?.('Breakpoint processing completed', { resultCount: result.length });
    return result;
};
