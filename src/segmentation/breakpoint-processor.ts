/**
 * Breakpoint post-processing engine extracted from segmenter.ts.
 *
 * This module is intentionally split into small helpers to reduce cognitive complexity
 * and allow unit testing of tricky edge cases (window sizing, next-page advancement, etc.).
 */

import { FAST_PATH_THRESHOLD } from './breakpoint-constants.js';
import {
    adjustForSurrogate,
    applyPageJoinerBetweenPages,
    type BreakpointContext,
    buildBoundaryPositions,
    createSegment,
    expandBreakpoints,
    findBreakPosition,
    findBreakpointWindowEndPosition,
    findExclusionBreakPosition,
    findPageIndexForPosition,
    findSafeBreakPosition,
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
        totalOffset += pageData?.length ?? 0;
        if (i < pageIds.length - 1) {
            totalOffset += 1;
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
) => expandedBreakpoints.some((bp) => hasExcludedPageInRange(bp.excludeSet, pageIds, fromIdx, toIdx));

export const computeWindowEndIdx = (currentFromIdx: number, toIdx: number, pageIds: number[], maxPages: number) => {
    const maxWindowPageId = pageIds[currentFromIdx] + maxPages;
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
) => {
    const actualStartIdx = findPageIndexForPosition(pieceStartPos, boundaryPositions, baseFromIdx);
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
            const nextPrefix = nextPageData.content.slice(0, 30);
            const remainingPrefix = remainingContent.trimStart().slice(0, 30);
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
    maxContentLength?: number,
) => {
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
        maxContentLength,
    );

    if (patternMatch && patternMatch.breakPos > 0) {
        return {
            breakOffset: patternMatch.breakPos,
            breakpointIndex: patternMatch.breakpointIndex,
            breakpointRule: patternMatch.rule,
        };
    }

    // Fallback: Always try to find a safe break position (avoid mid-word splits)
    if (windowEndPosition < remainingContent.length) {
        const safeOffset = findSafeBreakPosition(remainingContent, windowEndPosition);
        if (safeOffset !== -1) {
            return { breakOffset: safeOffset };
        }
        // If no safe break (whitespace) found, ensure we don't split a surrogate pair
        const adjustedOffset = adjustForSurrogate(remainingContent, windowEndPosition);
        return { breakOffset: adjustedOffset };
    }

    return { breakOffset: windowEndPosition };
};

/**
 * Advances cursor position past any leading whitespace.
 */
const skipWhitespace = (content: string, startPos: number) => {
    let pos = startPos;
    while (pos < content.length && /\s/.test(content[pos])) {
        pos++;
    }
    return pos;
};

/**
 * Validates that cumulative offsets match actual content length within a tolerance.
 * Required to detect if structural rules (like `lineStartsAfter`) have stripped content
 * which would make offset-based calculations inaccurate.
 */
const checkFastPathAlignment = (
    cumulativeOffsets: number[],
    fullContent: string,
    fromIdx: number,
    toIdx: number,
    pageCount: number,
    logger?: Logger,
) => {
    const expectedLength = (cumulativeOffsets[toIdx + 1] ?? fullContent.length) - (cumulativeOffsets[fromIdx] ?? 0);
    const driftTolerance = Math.max(100, fullContent.length * 0.01);
    const isAligned = Math.abs(expectedLength - fullContent.length) <= driftTolerance;

    if (!isAligned && pageCount >= FAST_PATH_THRESHOLD) {
        logger?.warn?.('[breakpoints] Offset drift detected in fast-path candidate, falling back to slow path', {
            actualLength: fullContent.length,
            drift: Math.abs(expectedLength - fullContent.length),
            expectedLength,
            pageCount,
        });
    }
    return isAligned;
};

/**
 * Handles the special optimized case for maxPages=0 (1 page per segment).
 * This is O(n) and safer than offset arithmetic as it uses source pages directly.
 */
const processTrivialFastPath = (
    fromIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
    pageCount: number,
    originalMeta?: Segment['meta'],
    debugMetaKey?: string,
    logger?: Logger,
) => {
    logger?.debug?.('[breakpoints] Using trivial per-page fast-path (maxPages=0)', { fromIdx, pageCount, toIdx });
    const result: Segment[] = [];
    for (let i = fromIdx; i <= toIdx; i++) {
        const pageData = normalizedPages.get(pageIds[i]);
        if (pageData?.content.trim()) {
            const isFirstPiece = i === fromIdx;
            const meta = getSegmentMetaWithDebug(isFirstPiece, debugMetaKey, originalMeta, null);
            const seg = createSegment(pageData.content.trim(), pageIds[i], undefined, meta);
            if (seg) {
                result.push(seg);
            }
        }
    }
    return result;
};

/**
 * Handles fast-path segmentation for maxPages > 0 using cumulative offsets.
 * Avoids O(n²) string searching but requires accurate offsets.
 */
const processOffsetFastPath = (
    fullContent: string,
    fromIdx: number,
    toIdx: number,
    pageIds: number[],
    cumulativeOffsets: number[],
    maxPages: number,
    originalMeta?: Segment['meta'],
    debugMetaKey?: string,
    logger?: Logger,
) => {
    const result: Segment[] = [];
    const effectiveMaxPages = maxPages + 1;
    const pageCount = toIdx - fromIdx + 1;

    logger?.debug?.('[breakpoints] Using offset-based fast-path for large segment', {
        effectiveMaxPages,
        fromIdx,
        maxPages,
        pageCount,
        toIdx,
    });

    const baseOffset = cumulativeOffsets[fromIdx] ?? 0;

    for (let segStart = fromIdx; segStart <= toIdx; segStart += effectiveMaxPages) {
        const segEnd = Math.min(segStart + effectiveMaxPages - 1, toIdx);

        const startOffset = Math.max(0, (cumulativeOffsets[segStart] ?? 0) - baseOffset);
        const endOffset =
            segEnd < toIdx
                ? Math.max(0, (cumulativeOffsets[segEnd + 1] ?? fullContent.length) - baseOffset)
                : fullContent.length;

        const rawContent = fullContent.slice(startOffset, endOffset).trim();
        if (rawContent) {
            const isFirstPiece = segStart === fromIdx;
            const meta = getSegmentMetaWithDebug(isFirstPiece, debugMetaKey, originalMeta, null);

            const seg: Segment = {
                content: rawContent,
                from: pageIds[segStart],
            };
            if (segEnd > segStart) {
                seg.to = pageIds[segEnd];
            }
            if (meta) {
                seg.meta = meta;
            }
            result.push(seg);
        }
    }
    return result;
};

/**
 * Checks if the remaining content fits within paged/length limits.
 * If so, pushes the final segment and returns true.
 */
const handleOversizedSegmentFit = (
    remainingContent: string,
    currentFromIdx: number,
    toIdx: number,
    pageIds: number[],
    expandedBreakpoints: Array<{ excludeSet: Set<number> }>,
    maxPages: number,
    maxContentLength: number | undefined,
    isFirstPiece: boolean,
    debugMetaKey: string | undefined,
    originalMeta: Segment['meta'] | undefined,
    lastBreakpoint: { breakpointIndex: number; rule: { pattern: string } } | null,
    result: Segment[],
) => {
    const remainingSpan = computeRemainingSpan(currentFromIdx, toIdx, pageIds);
    const remainingHasExclusions = hasAnyExclusionsInRange(expandedBreakpoints, pageIds, currentFromIdx, toIdx);

    const fitsInPages = remainingSpan <= maxPages;
    const fitsInLength = !maxContentLength || remainingContent.length <= maxContentLength;

    if (fitsInPages && fitsInLength && !remainingHasExclusions) {
        const includeMeta = isFirstPiece || Boolean(debugMetaKey);
        const meta = getSegmentMetaWithDebug(isFirstPiece, debugMetaKey, originalMeta, lastBreakpoint);
        const finalSeg = createFinalSegment(remainingContent, currentFromIdx, toIdx, pageIds, meta, includeMeta);
        if (finalSeg) {
            result.push(finalSeg);
        }
        return true;
    }
    return false;
};

/**
 * Builds metadata for a segment piece, optionally including debug info.
 */
const getSegmentMetaWithDebug = (
    isFirstPiece: boolean,
    debugMetaKey: string | undefined,
    originalMeta: Segment['meta'] | undefined,
    lastBreakpoint: { breakpointIndex: number; rule: { pattern: string } } | null,
) => {
    const includeMeta = isFirstPiece || Boolean(debugMetaKey);
    if (!includeMeta) {
        return undefined;
    }

    if (debugMetaKey && lastBreakpoint) {
        return mergeDebugIntoMeta(
            isFirstPiece ? originalMeta : undefined,
            debugMetaKey,
            buildBreakpointDebugPatch(lastBreakpoint.breakpointIndex, lastBreakpoint.rule as any),
        );
    }
    return isFirstPiece ? originalMeta : undefined;
};

/**
 * Calculates window end position, capped by maxContentLength if present.
 */
const getWindowEndPosition = (
    remainingContent: string,
    currentFromIdx: number,
    windowEndIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
    cumulativeOffsets: number[],
    maxContentLength: number | undefined,
    logger?: Logger,
) => {
    const pos = findBreakpointWindowEndPosition(
        remainingContent,
        currentFromIdx,
        windowEndIdx,
        toIdx,
        pageIds,
        normalizedPages,
        cumulativeOffsets,
        logger,
    );
    return maxContentLength ? Math.min(pos, maxContentLength) : pos;
};

/**
 * Advances cursorPos and currentFromIdx for the next iteration.
 */
const advanceCursorAndIndex = (
    fullContent: string,
    breakPos: number,
    actualEndIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
) => {
    const nextCursorPos = skipWhitespace(fullContent, breakPos);
    const nextFromIdx = computeNextFromIdx(
        fullContent.slice(nextCursorPos, nextCursorPos + 500),
        actualEndIdx,
        toIdx,
        pageIds,
        normalizedPages,
    );
    return { currentFromIdx: nextFromIdx, cursorPos: nextCursorPos };
};

/**
 * Applies breakpoints to oversized segments.
 *
 * Note: This is an internal engine used by `segmentPages()`.
 */
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
) => {
    const result: Segment[] = [];
    const fullContent = segment.content;
    const pageCount = toIdx - fromIdx + 1;

    // FAST PATH LOGIC
    // -------------------------------------------------------------------------
    // For large segments (1000+ pages), use cumulative offsets directly to avoid O(n²) processing.
    // We skip this optimization if:
    // 1. debugMetaKey is set (we need full provenance)
    // 2. maxContentLength is set (requires character-accurate checks)
    // 3. Offset drift is detected (structural rules modified content length)

    const isAligned = checkFastPathAlignment(cumulativeOffsets, fullContent, fromIdx, toIdx, pageCount, logger);

    if (pageCount >= FAST_PATH_THRESHOLD && isAligned && !maxContentLength && !debugMetaKey) {
        if (maxPages === 0) {
            return processTrivialFastPath(
                fromIdx,
                toIdx,
                pageIds,
                normalizedPages,
                pageCount,
                segment.meta,
                debugMetaKey,
                logger,
            );
        }
        return processOffsetFastPath(
            fullContent,
            fromIdx,
            toIdx,
            pageIds,
            cumulativeOffsets,
            maxPages,
            segment.meta,
            debugMetaKey,
            logger,
        );
    }

    // SLOW PATH: Iterative breakpoint processing
    // WARNING: This path can be slow for large segments - if this log shows large pageCount, investigate!
    logger?.debug?.('[breakpoints] processOversizedSegment: Using iterative path', {
        contentLength: fullContent.length,
        fromIdx,
        maxContentLength,
        maxPages,
        pageCount,
        toIdx,
    });

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

    let i = 0;
    const MAX_SAFE_ITERATIONS = 100_000;
    while (cursorPos < fullContent.length && currentFromIdx <= toIdx && i < MAX_SAFE_ITERATIONS) {
        i++;
        // Optimization: slice only what's needed to avoid O(N^2) copying for large content
        const safeSliceLen = maxContentLength ? maxContentLength + 4000 : undefined;
        const remainingContent = safeSliceLen
            ? fullContent.slice(cursorPos, cursorPos + safeSliceLen)
            : fullContent.slice(cursorPos);

        if (!remainingContent.trim()) {
            break;
        }

        if (
            handleOversizedSegmentFit(
                remainingContent,
                currentFromIdx,
                toIdx,
                pageIds,
                expandedBreakpoints,
                maxPages,
                maxContentLength,
                isFirstPiece,
                debugMetaKey,
                segment.meta,
                lastBreakpoint,
                result,
            )
        ) {
            break;
        }

        const windowEndIdx = computeWindowEndIdx(currentFromIdx, toIdx, pageIds, maxPages);
        // When maxPages=0, the window MUST NOT extend beyond the current page boundary.
        // Otherwise, breakpoint matching can "see" into the next page and create segments spanning pages,
        // even though maxPages=0 semantically means each segment must stay within a single page.
        let windowEndPosition: number;
        if (maxPages === 0) {
            const boundaryIdx = currentFromIdx - fromIdx + 1; // boundaryPositions[0] is fromIdx start
            const nextPageStartPos = boundaryPositions[boundaryIdx] ?? fullContent.length;
            const remainingInCurrentPage = Math.max(0, nextPageStartPos - cursorPos);
            windowEndPosition = maxContentLength
                ? Math.min(remainingInCurrentPage, maxContentLength)
                : remainingInCurrentPage;
            // Cap to the amount of content we actually sliced into remainingContent.
            windowEndPosition = Math.min(windowEndPosition, remainingContent.length);
        } else {
            windowEndPosition = getWindowEndPosition(
                remainingContent,
                currentFromIdx,
                windowEndIdx,
                toIdx,
                pageIds,
                normalizedPages,
                cumulativeOffsets,
                maxContentLength,
                logger,
            );
            // Cap to the amount of content we actually sliced into remainingContent.
            windowEndPosition = Math.min(windowEndPosition, remainingContent.length);
        }

        // Per-iteration log at trace level to avoid spam in debug mode
        logger?.trace?.(`[breakpoints] iteration=${i}`, { currentFromIdx, cursorPos, windowEndIdx, windowEndPosition });

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
            maxContentLength,
        );

        // Progress safeguard: Ensure we advance by at least one character to prevent infinite loops.
        // This is critical if findBreakOffsetForWindow returns 0 (e.g. from an empty windowEndPosition).
        let breakOffset = found.breakOffset;
        if (breakOffset <= 0) {
            const fallbackPos = maxContentLength ? Math.min(maxContentLength, remainingContent.length) : 1;
            breakOffset = Math.max(1, fallbackPos);
            logger?.warn?.('[breakpoints] No progress from findBreakOffsetForWindow; forcing forward movement', {
                breakOffset,
                cursorPos,
            });
        }

        if (found.breakpointIndex !== undefined && found.breakpointRule) {
            lastBreakpoint = { breakpointIndex: found.breakpointIndex, rule: found.breakpointRule };
        }

        const breakPos = cursorPos + breakOffset;
        const pieceContent = fullContent.slice(cursorPos, breakPos).trim();

        if (pieceContent) {
            let { actualEndIdx, actualStartIdx } = computePiecePages(
                cursorPos,
                breakPos,
                boundaryPositions,
                fromIdx,
                toIdx,
            );

            // When maxPages=0, enforce that the piece cannot span beyond the current page.
            // This is necessary because boundaryPositions-based page detection can be confused
            // when pages have duplicate/overlapping content at boundaries.
            if (maxPages === 0) {
                actualEndIdx = Math.min(actualEndIdx, currentFromIdx);
                actualStartIdx = Math.min(actualStartIdx, currentFromIdx);
            }

            const meta = getSegmentMetaWithDebug(isFirstPiece, debugMetaKey, segment.meta, lastBreakpoint);
            const pieceSeg = createPieceSegment(pieceContent, actualStartIdx, actualEndIdx, pageIds, meta, true);
            if (pieceSeg) {
                result.push(pieceSeg);
            }

            const next = advanceCursorAndIndex(fullContent, breakPos, actualEndIdx, toIdx, pageIds, normalizedPages);
            cursorPos = next.cursorPos;
            currentFromIdx = next.currentFromIdx;

            // When maxPages=0, the content-based page detection in computeNextFromIdx can be confused
            // by overlapping content between pages. Use position-based detection from boundaryPositions
            // as the authoritative source for the current page index.
            if (maxPages === 0) {
                currentFromIdx = findPageIndexForPosition(cursorPos, boundaryPositions, fromIdx);
            }
        } else {
            cursorPos = breakPos;
        }

        isFirstPiece = false;
    }

    if (i >= MAX_SAFE_ITERATIONS) {
        logger?.error?.('[breakpoints] Stopped processing oversized segment: reached MAX_SAFE_ITERATIONS', {
            cursorPos,
            fullContentLength: fullContent.length,
            iterations: i,
        });
    }

    logger?.debug?.('[breakpoints] processOversizedSegment: Complete', { iterations: i, resultCount: result.length });
    return result;
};

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

        // Log details about why this segment needs breaking up
        logger?.debug?.('[breakpoints] Processing oversized segment', {
            contentLength: segment.content.length,
            from: segment.from,
            hasExclusions,
            pageSpan: toIdx - fromIdx + 1,
            reasonFitsInLength: fitsInLength,
            reasonFitsInPages: fitsInPages,
            to: segment.to,
        });

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
