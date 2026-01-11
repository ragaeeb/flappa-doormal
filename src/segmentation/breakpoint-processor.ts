/**
 * Breakpoint post-processing engine extracted from segmenter.ts.
 *
 * This module is intentionally split into small helpers to reduce cognitive complexity
 * and allow unit testing of tricky edge cases (window sizing, next-page advancement, etc.).
 */

import type { Breakpoint, BreakpointRule } from '@/types/breakpoints.js';
import type { Page, Segment } from '@/types/index.js';
import type { Logger } from '@/types/options.js';
import { adjustForUnicodeBoundary } from '@/utils/textUtils.js';
import { FAST_PATH_THRESHOLD } from './breakpoint-constants.js';
import type { PatternProcessor } from './breakpoint-utils.js';
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
    findSafeBreakPosition,
    hasExcludedPageInRange,
    type NormalizedPage,
} from './breakpoint-utils.js';
import { buildBreakpointDebugPatch, mergeDebugIntoMeta } from './debug-meta.js';

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
            contentLengthSplit: patternMatch.contentLengthSplit,
        };
    }

    // Fallback: Always try to find a safe break position (avoid mid-word splits)
    if (windowEndPosition < remainingContent.length) {
        const safeOffset = findSafeBreakPosition(remainingContent, windowEndPosition);
        if (safeOffset !== -1) {
            return {
                breakOffset: safeOffset,
                contentLengthSplit: maxContentLength ? { maxContentLength, reason: 'whitespace' as const } : undefined,
            };
        }
        // If no safe break (whitespace) found, ensure we don't split a surrogate pair
        const adjustedOffset = adjustForUnicodeBoundary(remainingContent, windowEndPosition);
        return {
            breakOffset: adjustedOffset,
            contentLengthSplit: maxContentLength
                ? { maxContentLength, reason: 'unicode_boundary' as const }
                : undefined,
        };
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
const buildFastPathRawContent = (
    fullContent: string,
    baseOffset: number,
    cumulativeOffsets: number[],
    segStart: number,
    segEnd: number,
    toIdx: number,
) => {
    const startOffset = Math.max(0, (cumulativeOffsets[segStart] ?? 0) - baseOffset);
    const endOffset =
        segEnd < toIdx
            ? Math.max(0, (cumulativeOffsets[segEnd + 1] ?? fullContent.length) - baseOffset)
            : fullContent.length;
    return fullContent.slice(startOffset, endOffset).trim();
};

const buildFastPathSegment = (
    fullContent: string,
    baseOffset: number,
    cumulativeOffsets: number[],
    segStart: number,
    segEnd: number,
    fromIdx: number,
    toIdx: number,
    pageIds: number[],
    originalMeta?: Segment['meta'],
    debugMetaKey?: string,
) => {
    const rawContent = buildFastPathRawContent(fullContent, baseOffset, cumulativeOffsets, segStart, segEnd, toIdx);
    if (!rawContent) {
        return null;
    }

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
    return seg;
};

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
    const pageCount = toIdx - fromIdx + 1;

    logger?.debug?.('[breakpoints] Using offset-based fast-path for large segment', {
        fromIdx,
        maxPages,
        pageCount,
        toIdx,
    });

    const baseOffset = cumulativeOffsets[fromIdx] ?? 0;

    // IMPORTANT: This fast path is only valid when breakpoint behavior is effectively
    // "page boundary fallback" (empty breakpoint ''), which breaks oversized segments
    // at the NEXT page boundary (end of the current page) until the remaining span fits.
    //
    // That means the output shape is:
    // - many single-page pieces, then
    // - one final segment that includes the remaining pages (<= maxPages ID span).
    //
    // This mirrors the iterative breakpoint semantics and avoids "threshold flips" where
    // results change at FAST_PATH_THRESHOLD.
    let segStart = fromIdx;
    const needsPeel = (startIdx: number) => pageIds[toIdx] - pageIds[startIdx] > maxPages;

    for (; segStart <= toIdx && needsPeel(segStart); segStart++) {
        const seg = buildFastPathSegment(
            fullContent,
            baseOffset,
            cumulativeOffsets,
            segStart,
            segStart,
            fromIdx,
            toIdx,
            pageIds,
            originalMeta,
            debugMetaKey,
        );
        if (seg) {
            result.push(seg);
        }
    }

    // Final remainder (fits maxPages by ID span)
    if (segStart <= toIdx) {
        const seg = buildFastPathSegment(
            fullContent,
            baseOffset,
            cumulativeOffsets,
            segStart,
            toIdx,
            fromIdx,
            toIdx,
            pageIds,
            originalMeta,
            debugMetaKey,
        );
        if (seg) {
            result.push(seg);
        }
    }
    return result;
};

/**
 * Checks if the remaining content fits within paged/length limits.
 * If so, pushes the final segment and returns true.
 *
 * @param actualRemainingEndIdx - The actual end page index of the remaining content
 *   (computed from boundaryPositions), NOT the original segment's toIdx. This is critical
 *   for maxPages=0 scenarios where remaining content may end before toIdx.
 */
const handleOversizedSegmentFit = (
    remainingContent: string,
    currentFromIdx: number,
    actualRemainingEndIdx: number,
    pageIds: number[],
    expandedBreakpoints: Array<{ excludeSet: Set<number> }>,
    maxPages: number,
    maxContentLength: number | undefined,
    isFirstPiece: boolean,
    debugMetaKey: string | undefined,
    originalMeta: Segment['meta'] | undefined,
    lastBreakpoint: { breakpointIndex: number; rule: BreakpointRule } | null,
    result: Segment[],
) => {
    const remainingSpan = computeRemainingSpan(currentFromIdx, actualRemainingEndIdx, pageIds);
    const remainingHasExclusions = hasAnyExclusionsInRange(
        expandedBreakpoints,
        pageIds,
        currentFromIdx,
        actualRemainingEndIdx,
    );

    const fitsInPages = remainingSpan <= maxPages;
    const fitsInLength = !maxContentLength || remainingContent.length <= maxContentLength;

    if (fitsInPages && fitsInLength && !remainingHasExclusions) {
        const includeMeta = isFirstPiece || Boolean(debugMetaKey);
        const meta = getSegmentMetaWithDebug(isFirstPiece, debugMetaKey, originalMeta, lastBreakpoint);
        const finalSeg = createFinalSegment(
            remainingContent,
            currentFromIdx,
            actualRemainingEndIdx,
            pageIds,
            meta,
            includeMeta,
        );
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
    lastBreakpoint: { breakpointIndex: number; rule: BreakpointRule } | null,
    contentLengthSplit?: { reason: 'whitespace' | 'unicode_boundary'; maxContentLength: number },
) => {
    const includeMeta = isFirstPiece || Boolean(debugMetaKey);
    if (!includeMeta) {
        return undefined;
    }

    let meta = isFirstPiece ? originalMeta : undefined;

    if (debugMetaKey) {
        if (lastBreakpoint) {
            meta = mergeDebugIntoMeta(
                meta,
                debugMetaKey,
                buildBreakpointDebugPatch(lastBreakpoint.breakpointIndex, lastBreakpoint.rule as any),
            );
        }
        if (contentLengthSplit) {
            meta = mergeDebugIntoMeta(meta, debugMetaKey, {
                contentLengthSplit: {
                    maxContentLength: contentLengthSplit.maxContentLength,
                    splitReason: contentLengthSplit.reason,
                },
            });
        }
    }

    return meta;
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

const computeIterationWindow = (
    fullContent: string,
    cursorPos: number,
    currentFromIdx: number,
    fromIdx: number,
    toIdx: number,
    pageIds: number[],
    boundaryPositions: number[],
    maxPages: number,
    maxContentLength: number | undefined,
) => {
    const windowEndIdx = computeWindowEndIdx(currentFromIdx, toIdx, pageIds, maxPages);

    // Optimization: slice only the active "window" plus a small padding.
    // This avoids O(N^2) copying when maxContentLength is unset (e.g. debug mode forces iterative path).
    const windowEndBoundaryIdx = windowEndIdx - fromIdx + 1; // boundaryPositions[0] is fromIdx start
    const windowEndAbsPos = boundaryPositions[windowEndBoundaryIdx] ?? fullContent.length;
    const sliceEndByPages = Math.min(fullContent.length, windowEndAbsPos + 4000);
    const sliceEndByLength = maxContentLength
        ? Math.min(fullContent.length, cursorPos + maxContentLength + 4000)
        : fullContent.length;
    const sliceEnd = Math.max(cursorPos + 1, Math.min(sliceEndByPages, sliceEndByLength));

    const remainingContent = fullContent.slice(cursorPos, sliceEnd);
    return { remainingContent, sliceEnd, windowEndIdx };
};

const computeWindowEndPositionForIteration = (
    remainingContent: string,
    cursorPos: number,
    currentFromIdx: number,
    fromIdx: number,
    windowEndIdx: number,
    toIdx: number,
    pageIds: number[],
    boundaryPositions: number[],
    normalizedPages: Map<number, NormalizedPage>,
    cumulativeOffsets: number[],
    maxPages: number,
    maxContentLength: number | undefined,
    logger?: Logger,
) => {
    // When maxPages=0, the window MUST NOT extend beyond the current page boundary.
    // Otherwise, breakpoint matching can "see" into the next page and create segments spanning pages,
    // even though maxPages=0 semantically means each segment must stay within a single page.
    if (maxPages === 0) {
        const boundaryIdx = currentFromIdx - fromIdx + 1; // boundaryPositions[0] is fromIdx start
        const nextPageStartPos = boundaryPositions[boundaryIdx] ?? Number.POSITIVE_INFINITY;
        const remainingInCurrentPage = Math.max(0, nextPageStartPos - cursorPos);
        const capped = maxContentLength ? Math.min(remainingInCurrentPage, maxContentLength) : remainingInCurrentPage;
        return Math.min(capped, remainingContent.length);
    }

    const pos = getWindowEndPosition(
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
    return Math.min(pos, remainingContent.length);
};

const ensureProgressingBreakOffset = (
    foundBreakOffset: number,
    remainingContent: string,
    cursorPos: number,
    maxContentLength: number | undefined,
    logger?: Logger,
) => {
    if (foundBreakOffset > 0) {
        return foundBreakOffset;
    }

    // Progress safeguard: Ensure we advance by at least one character to prevent infinite loops.
    // This is critical if findBreakOffsetForWindow returns 0 (e.g. from an empty windowEndPosition).
    const fallbackPos = maxContentLength ? Math.min(maxContentLength, remainingContent.length) : 1;
    const breakOffset = Math.max(1, fallbackPos);
    logger?.warn?.('[breakpoints] No progress from findBreakOffsetForWindow; forcing forward movement', {
        breakOffset,
        cursorPos,
    });
    return breakOffset;
};

const updateLastBreakpointFromFound = (
    found: ReturnType<typeof findBreakOffsetForWindow>,
    lastBreakpoint: { breakpointIndex: number; rule: BreakpointRule } | null,
) => {
    if (found.breakpointIndex !== undefined && found.breakpointRule) {
        return { breakpointIndex: found.breakpointIndex, rule: found.breakpointRule };
    }
    return lastBreakpoint;
};

const appendPieceAndAdvance = (
    fullContent: string,
    cursorPos: number,
    breakPos: number,
    pieceContent: string,
    currentFromIdx: number,
    fromIdx: number,
    toIdx: number,
    pageIds: number[],
    boundaryPositions: number[],
    normalizedPages: Map<number, NormalizedPage>,
    maxPages: number,
    isFirstPiece: boolean,
    debugMetaKey: string | undefined,
    originalMeta: Segment['meta'] | undefined,
    lastBreakpoint: { breakpointIndex: number; rule: BreakpointRule } | null,
    result: Segment[],
    logger?: Logger,
    contentLengthSplit?: { reason: 'whitespace' | 'unicode_boundary'; maxContentLength: number },
) => {
    let { actualEndIdx, actualStartIdx } = computePiecePages(cursorPos, breakPos, boundaryPositions, fromIdx, toIdx);

    // Safety: boundaryPositions can be slightly misaligned in rare cases for very large segments
    // (e.g. if upstream content was trimmed/normalized). Never allow a piece to "start" before
    // the current page cursor, as that can violate maxPages constraints by inflating from/to span.
    if (actualStartIdx < currentFromIdx) {
        logger?.warn?.('[breakpoints] Page attribution drift detected; clamping actualStartIdx', {
            actualStartIdx,
            currentFromIdx,
        });
        actualStartIdx = currentFromIdx;
    }

    // When maxPages=0, enforce that the piece cannot span beyond the current page.
    // This is necessary because boundaryPositions-based page detection can be confused
    // when pages have duplicate/overlapping content at boundaries.
    if (maxPages === 0) {
        actualEndIdx = Math.min(actualEndIdx, currentFromIdx);
        actualStartIdx = Math.min(actualStartIdx, currentFromIdx);
    } else if (maxPages > 0) {
        // Enforce ID-span-based maxPages for page attribution too (handles drift).
        const maxAllowedEndIdx = computeWindowEndIdx(actualStartIdx, toIdx, pageIds, maxPages);
        actualEndIdx = Math.min(actualEndIdx, maxAllowedEndIdx);
    }

    const meta = getSegmentMetaWithDebug(isFirstPiece, debugMetaKey, originalMeta, lastBreakpoint, contentLengthSplit);
    const pieceSeg = createPieceSegment(pieceContent, actualStartIdx, actualEndIdx, pageIds, meta, true);
    if (pieceSeg) {
        result.push(pieceSeg);
    }

    const next = advanceCursorAndIndex(fullContent, breakPos, actualEndIdx, toIdx, pageIds, normalizedPages);
    let nextFromIdx = next.currentFromIdx;
    if (maxPages === 0) {
        // When maxPages=0, content-based detection can be confused by overlapping content; use positions.
        nextFromIdx = findPageIndexForPosition(next.cursorPos, boundaryPositions, fromIdx);
    }
    return { currentFromIdx: nextFromIdx, cursorPos: next.cursorPos };
};

const tryProcessOversizedSegmentFastPath = (
    segment: Segment,
    fromIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
    cumulativeOffsets: number[],
    expandedBreakpoints: ReturnType<typeof expandBreakpoints>,
    maxPages: number,
    logger?: Logger,
    debugMetaKey?: string,
    maxContentLength?: number,
) => {
    const fullContent = segment.content;
    const pageCount = toIdx - fromIdx + 1;

    const isAligned = checkFastPathAlignment(cumulativeOffsets, fullContent, fromIdx, toIdx, pageCount, logger);
    const isPageBoundaryOnly = expandedBreakpoints.every(
        // Note: compileSkipWhenRegex returns null (not undefined) when skipWhen is not set
        (bp) => bp.regex === null && bp.excludeSet.size === 0 && bp.skipWhenRegex === null,
    );
    if (pageCount < FAST_PATH_THRESHOLD || !isAligned || !isPageBoundaryOnly || maxContentLength || debugMetaKey) {
        return null;
    }

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
};

type CurrentPageFitResult =
    | {
          handled: true;
          newCursorPos: number;
          newFromIdx: number;
          newLastBreakpoint: { breakpointIndex: number; rule: BreakpointRule } | null;
      }
    | { handled: false };

/**
 * For maxPages=0 with maxContentLength: if current page's remaining content fits,
 * create a segment and advance to next page without applying breakpoints.
 */
const tryHandleCurrentPageFit = (
    fullContent: string,
    cursorPos: number,
    currentFromIdx: number,
    fromIdx: number,
    actualRemainingEndIdx: number,
    boundaryPositions: number[],
    pageIds: number[],
    expandedBreakpoints: ReturnType<typeof expandBreakpoints>,
    maxPages: number,
    maxContentLength: number | undefined,
    isFirstPiece: boolean,
    debugMetaKey: string | undefined,
    segmentMeta: Record<string, unknown> | undefined,
    lastBreakpoint: { breakpointIndex: number; rule: BreakpointRule } | null,
    result: Segment[],
): CurrentPageFitResult => {
    // Only applies when maxPages=0 AND maxContentLength is set AND we span multiple pages
    if (maxPages !== 0 || !maxContentLength || currentFromIdx >= actualRemainingEndIdx) {
        return { handled: false };
    }

    const boundaryIdx = currentFromIdx - fromIdx + 1;
    const currentPageEndPos = boundaryPositions[boundaryIdx] ?? fullContent.length;
    const currentPageRemainingContent = fullContent.slice(cursorPos, currentPageEndPos).trim();

    if (!currentPageRemainingContent) {
        return { handled: false };
    }

    const currentPageFitsInLength = currentPageRemainingContent.length <= maxContentLength;
    const currentPageHasExclusions = hasAnyExclusionsInRange(
        expandedBreakpoints,
        pageIds,
        currentFromIdx,
        currentFromIdx,
    );

    if (!currentPageFitsInLength || currentPageHasExclusions) {
        return { handled: false };
    }

    // Find the page boundary breakpoint ('') for debug metadata
    const pageBoundaryIdx = expandedBreakpoints.findIndex((bp) => bp.regex === null);
    const pageBoundaryBreakpoint: { breakpointIndex: number; rule: BreakpointRule } | null =
        pageBoundaryIdx >= 0
            ? { breakpointIndex: pageBoundaryIdx, rule: { pattern: '' } as BreakpointRule }
            : lastBreakpoint;

    // Create segment for current page's remaining content
    const includeMeta = isFirstPiece || Boolean(debugMetaKey);
    const meta = getSegmentMetaWithDebug(isFirstPiece, debugMetaKey, segmentMeta, pageBoundaryBreakpoint);
    const seg = createSegment(
        currentPageRemainingContent,
        pageIds[currentFromIdx],
        undefined,
        includeMeta ? meta : undefined,
    );
    if (seg) {
        result.push(seg);
    }

    // Skip whitespace after page boundary
    let newCursorPos = currentPageEndPos;
    while (newCursorPos < fullContent.length && /\s/.test(fullContent[newCursorPos])) {
        newCursorPos++;
    }

    return {
        handled: true,
        newCursorPos,
        newFromIdx: currentFromIdx + 1,
        newLastBreakpoint: pageBoundaryBreakpoint,
    };
};

const processOversizedSegmentIterative = (
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
    let lastBreakpoint: { breakpointIndex: number; rule: BreakpointRule } | null = null;

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

    const MAX_SAFE_ITERATIONS = 100_000;
    let didHitMaxIterations = true;

    for (let i = 1; i <= MAX_SAFE_ITERATIONS; i++) {
        if (cursorPos >= fullContent.length || currentFromIdx > toIdx) {
            didHitMaxIterations = false;
            break;
        }

        const { remainingContent, windowEndIdx } = computeIterationWindow(
            fullContent,
            cursorPos,
            currentFromIdx,
            fromIdx,
            toIdx,
            pageIds,
            boundaryPositions,
            maxPages,
            maxContentLength,
        );

        if (!remainingContent.trim()) {
            didHitMaxIterations = false;
            break;
        }

        // Compute the actual remaining content (full remaining, not windowed) and its actual end page.
        // This fixes the bug where remainingSpan was computed using toIdx even when remaining
        // content only spans fewer pages.
        const actualRemainingContent = fullContent.slice(cursorPos);
        const actualEndPos = Math.max(cursorPos, fullContent.length - 1);
        const actualRemainingEndIdx = Math.min(
            findPageIndexForPosition(actualEndPos, boundaryPositions, fromIdx),
            toIdx,
        );

        // Special handling for maxPages=0 WITH maxContentLength: check if remaining on CURRENT PAGE fits.
        // If so, create a segment for current page content and CONTINUE to next page.
        const currentPageFit = tryHandleCurrentPageFit(
            fullContent,
            cursorPos,
            currentFromIdx,
            fromIdx,
            actualRemainingEndIdx,
            boundaryPositions,
            pageIds,
            expandedBreakpoints,
            maxPages,
            maxContentLength,
            isFirstPiece,
            debugMetaKey,
            segment.meta,
            lastBreakpoint,
            result,
        );
        if (currentPageFit.handled) {
            cursorPos = currentPageFit.newCursorPos;
            currentFromIdx = currentPageFit.newFromIdx;
            lastBreakpoint = currentPageFit.newLastBreakpoint;
            isFirstPiece = false;
            continue;
        }

        if (
            handleOversizedSegmentFit(
                actualRemainingContent,
                currentFromIdx,
                actualRemainingEndIdx,
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
            didHitMaxIterations = false;
            break;
        }

        const windowEndPosition = computeWindowEndPositionForIteration(
            remainingContent,
            cursorPos,
            currentFromIdx,
            fromIdx,
            windowEndIdx,
            toIdx,
            pageIds,
            boundaryPositions,
            normalizedPages,
            cumulativeOffsets,
            maxPages,
            maxContentLength,
            logger,
        );

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

        const breakOffset = ensureProgressingBreakOffset(
            found.breakOffset,
            remainingContent,
            cursorPos,
            maxContentLength,
            logger,
        );
        lastBreakpoint = updateLastBreakpointFromFound(found, lastBreakpoint);

        const breakPos = cursorPos + breakOffset;
        const pieceContent = fullContent.slice(cursorPos, breakPos).trim();
        if (!pieceContent) {
            cursorPos = breakPos;
            isFirstPiece = false;
            continue;
        }

        const next = appendPieceAndAdvance(
            fullContent,
            cursorPos,
            breakPos,
            pieceContent,
            currentFromIdx,
            fromIdx,
            toIdx,
            pageIds,
            boundaryPositions,
            normalizedPages,
            maxPages,
            isFirstPiece,
            debugMetaKey,
            segment.meta,
            lastBreakpoint,
            result,
            logger,
            found.contentLengthSplit,
        );
        cursorPos = next.cursorPos;
        currentFromIdx = next.currentFromIdx;
        isFirstPiece = false;
    }

    if (didHitMaxIterations) {
        logger?.error?.('[breakpoints] Stopped processing oversized segment: reached MAX_SAFE_ITERATIONS', {
            cursorPos,
            fullContentLength: fullContent.length,
            iterations: MAX_SAFE_ITERATIONS,
        });
    }

    logger?.debug?.('[breakpoints] processOversizedSegment: Complete', { resultCount: result.length });
    return result;
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
    const fast = tryProcessOversizedSegmentFastPath(
        segment,
        fromIdx,
        toIdx,
        pageIds,
        normalizedPages,
        cumulativeOffsets,
        expandedBreakpoints,
        maxPages,
        logger,
        debugMetaKey,
        maxContentLength,
    );
    if (fast) {
        return fast;
    }

    return processOversizedSegmentIterative(
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
};

export const applyBreakpoints = (
    segments: Segment[],
    pages: Page[],
    normalizedContent: string[],
    maxPages: number,
    breakpoints: Breakpoint[],
    prefer: 'longer' | 'shorter',
    patternProcessor: PatternProcessor,
    logger?: Logger,
    pageJoiner: 'space' | 'newline' = 'space',
    debugMetaKey?: string,
    maxContentLength?: number,
    rawPatternProcessor?: PatternProcessor,
) => {
    const pageIds = pages.map((p) => p.id);
    const pageIdToIndex = buildPageIdToIndexMap(pageIds);
    const normalizedPages = buildNormalizedPagesMap(pages, normalizedContent);
    const cumulativeOffsets = buildCumulativeOffsets(pageIds, normalizedPages);
    const expandedBreakpoints = expandBreakpoints(breakpoints, patternProcessor, rawPatternProcessor);

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
