/**
 * Breakpoint post-processing engine extracted from segmenter.ts.
 *
 * This module is intentionally split into small helpers to reduce cognitive complexity
 * and allow unit testing of tricky edge cases (window sizing, next-page advancement, etc.).
 */

import {
    applyPageJoinerBetweenPages,
    type BreakpointContext,
    createSegment,
    expandBreakpoints,
    findActualEndPage,
    findActualStartPage,
    findBreakPosition,
    findBreakpointWindowEndPosition,
    findExclusionBreakPosition,
    hasExcludedPageInRange,
    type NormalizedPage,
} from './breakpoint-utils.js';
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

export const computeWindowEndIdx = (
    currentFromIdx: number,
    toIdx: number,
    pageIds: number[],
    maxPages: number,
): number => {
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

const computePiecePages = (
    pieceContent: string,
    currentFromIdx: number,
    toIdx: number,
    windowEndIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
): PiecePages => {
    const actualStartIdx = pieceContent
        ? findActualStartPage(pieceContent, currentFromIdx, toIdx, pageIds, normalizedPages)
        : currentFromIdx;
    const actualEndIdx = pieceContent
        ? findActualEndPage(pieceContent, actualStartIdx, windowEndIdx, pageIds, normalizedPages)
        : currentFromIdx;
    return { actualEndIdx, actualStartIdx };
};

export const computeNextFromIdx = (
    remainingContent: string,
    actualEndIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
): number => {
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
): Segment[] => {
    const result: Segment[] = [];
    let remainingContent = segment.content;
    let currentFromIdx = fromIdx;
    let isFirstPiece = true;
    let iterationCount = 0;
    const maxIterations = 10000;

    while (currentFromIdx <= toIdx) {
        iterationCount++;
        if (iterationCount > maxIterations) {
            logger?.error?.('INFINITE LOOP DETECTED! Breaking out, you should report this bug', {
                iterationCount: maxIterations,
            });
            break;
        }

        const remainingHasExclusions = hasAnyExclusionsInRange(expandedBreakpoints, pageIds, currentFromIdx, toIdx);
        const remainingSpan = computeRemainingSpan(currentFromIdx, toIdx, pageIds);
        if (remainingSpan <= maxPages && !remainingHasExclusions) {
            const finalSeg = createFinalSegment(
                remainingContent,
                currentFromIdx,
                toIdx,
                pageIds,
                segment.meta,
                isFirstPiece,
            );
            if (finalSeg) {
                result.push(finalSeg);
            }
            break;
        }

        const windowEndIdx = computeWindowEndIdx(currentFromIdx, toIdx, pageIds, maxPages);
        logger?.debug?.(`[breakpoints] iteration=${iterationCount}`, {
            currentFromIdx,
            currentFromPageId: pageIds[currentFromIdx],
            remainingContentStart: remainingContent.slice(0, 50),
            remainingContentLength: remainingContent.length,
            remainingSpan,
            toIdx,
            toPageId: pageIds[toIdx],
            windowEndIdx,
            windowEndPageId: pageIds[windowEndIdx],
        });
        const windowEndPosition = findBreakpointWindowEndPosition(
            remainingContent,
            currentFromIdx,
            windowEndIdx,
            toIdx,
            pageIds,
            normalizedPages,
            cumulativeOffsets,
        );

        const windowHasExclusions = hasAnyExclusionsInRange(expandedBreakpoints, pageIds, currentFromIdx, windowEndIdx);
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

        if (breakPosition <= 0) {
            const breakpointCtx: BreakpointContext = { expandedBreakpoints, normalizedPages, pageIds, prefer };
            breakPosition = findBreakPosition(
                remainingContent,
                currentFromIdx,
                toIdx,
                windowEndIdx,
                windowEndPosition,
                breakpointCtx,
            );
        }

        if (breakPosition <= 0) {
            // No pattern matched: fall back to the window boundary.
            breakPosition = windowEndPosition;
        }

        const pieceContent = remainingContent.slice(0, breakPosition).trim();
        logger?.debug?.('[breakpoints] selectedBreak', {
            breakPosition,
            pieceContentEnd: pieceContent.slice(-50),
            pieceContentLength: pieceContent.length,
            windowEndPosition,
        });

        const { actualEndIdx, actualStartIdx } = computePiecePages(
            pieceContent,
            currentFromIdx,
            toIdx,
            windowEndIdx,
            pageIds,
            normalizedPages,
        );

        if (pieceContent) {
            const pieceSeg = createPieceSegment(
                pieceContent,
                actualStartIdx,
                actualEndIdx,
                pageIds,
                segment.meta,
                isFirstPiece,
            );
            if (pieceSeg) {
                result.push(pieceSeg);
            }
        }

        remainingContent = remainingContent.slice(breakPosition).trim();
        logger?.debug?.('[breakpoints] afterSlice', {
            actualEndIdx,
            remainingContentLength: remainingContent.length,
            remainingContentStart: remainingContent.slice(0, 60),
        });
        if (!remainingContent) {
            logger?.debug?.('[breakpoints] done: no remaining content');
            break;
        }

        currentFromIdx = computeNextFromIdx(remainingContent, actualEndIdx, toIdx, pageIds, normalizedPages);
        logger?.debug?.('[breakpoints] nextIteration', {
            currentFromIdx,
            currentFromPageId: pageIds[currentFromIdx],
        });
        isFirstPiece = false;
    }

    logger?.debug?.('[breakpoints] processOversizedSegmentDone', { resultCount: result.length });
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
): Segment[] => {
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

        if (segmentSpan <= maxPages && !hasExclusions) {
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
