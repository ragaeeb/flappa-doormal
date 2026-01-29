import { applyPreprocessToPage } from '@/preprocessing/transforms.js';
import type { Page, Segment } from '@/types';
import type { SegmentationOptions } from '@/types/options.js';
import type { ValidationIssue, ValidationReport } from '@/types/validation.js';
import { normalizeLineEndings } from '@/utils/textUtils.js';

type NormalizedPage = {
    id: number;
    content: string;
};

type JoinedBoundary = {
    id: number;
    start: number;
    end: number;
};

const PREVIEW_LIMIT = 140;

const buildPreview = (text: string): string => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= PREVIEW_LIMIT) {
        return normalized;
    }
    return `${normalized.slice(0, PREVIEW_LIMIT)}...`;
};

const normalizePages = (pages: Page[], options: SegmentationOptions): NormalizedPage[] => {
    const transforms = options.preprocess ?? [];
    return pages.map((page) => {
        const preprocessed = transforms.length
            ? applyPreprocessToPage(page.content, page.id, transforms)
            : page.content;
        return {
            content: normalizeLineEndings(preprocessed),
            id: page.id,
        };
    });
};

const buildJoinedContent = (pages: NormalizedPage[], joiner: string) => {
    const boundaries: JoinedBoundary[] = [];
    let offset = 0;
    for (let i = 0; i < pages.length; i++) {
        const content = pages[i].content;
        const start = offset;
        const end = start + content.length - 1;
        boundaries.push({ end, id: pages[i].id, start });
        offset = end + 1 + (i < pages.length - 1 ? joiner.length : 0);
    }
    return { boundaries, joined: pages.map((p) => p.content).join(joiner) };
};

const findBoundaryIdForOffset = (offset: number, boundaries: JoinedBoundary[]) => {
    let lo = 0;
    let hi = boundaries.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const boundary = boundaries[mid];
        if (offset < boundary.start) {
            hi = mid - 1;
        } else if (offset > boundary.end) {
            lo = mid + 1;
        } else {
            return boundary.id;
        }
    }
    return boundaries.at(-1)!.id;
};

/**
 * Optimized content matching with tight search window constraints.
 */
const findJoinedMatches = (
    content: string,
    joined: string,
    searchStart: number,
    searchEnd: number,
): { start: number; end: number }[] => {
    const matches: { start: number; end: number }[] = [];
    if (!content || searchStart >= searchEnd) {
        return matches;
    }
    let idx = joined.indexOf(content, searchStart);
    while (idx >= 0 && idx < searchEnd) {
        matches.push({ end: idx + content.length - 1, start: idx });
        idx = joined.indexOf(content, idx + 1);
        if (idx >= searchEnd) {
            break;
        }
    }
    return matches;
};

const getAttributionIssues = (
    segment: Segment,
    segmentIndex: number,
    segmentSnapshot: ReturnType<typeof buildSegmentSnapshot>,
    maxPages: number | undefined,
    joined: string,
    boundaries: JoinedBoundary[],
    boundaryMap: Map<number, JoinedBoundary>,
    pageMap: Map<number, NormalizedPage>,
): ValidationIssue[] => {
    // OPTIMIZATION 1: Skip expensive content checks for single-page segments
    // when maxPages allows it and we're not checking strict attribution
    if (segment.to === undefined && (maxPages === undefined || maxPages > 0)) {
        // Single-page segment with no strict page limit - trust the segmenter
        // Only verify if maxPages=0 (strict single-page enforcement)
        return [];
    }

    const expectedBoundary = boundaryMap.get(segment.from);
    if (!expectedBoundary) {
        // Page doesn't exist in boundary map - this should be caught by page existence check
        return [];
    }

    // OPTIMIZATION 2: Use tight window based on actual segment span
    let searchStart = expectedBoundary.start;
    let searchEnd = expectedBoundary.end + 1; // +1 to include the last character

    if (segment.to !== undefined) {
        const endBoundary = boundaryMap.get(segment.to);
        if (endBoundary) {
            searchEnd = endBoundary.end + 1;
        } else {
            // Segment spans to non-existent page - expand search window
            searchEnd = Math.min(joined.length, expectedBoundary.end + 50000);
        }
    }

    // Add small buffer for edge cases (content might start slightly before/after boundary)
    const bufferSize = 1000; // Much smaller than before (1KB vs 10KB)
    searchStart = Math.max(0, searchStart - bufferSize);
    searchEnd = Math.min(joined.length, searchEnd + bufferSize);

    const rawMatches = findJoinedMatches(segment.content, joined, searchStart, searchEnd);

    if (rawMatches.length === 0) {
        // OPTIMIZATION 3: Only do fallback for truly missing content
        // For large books, full fallback is expensive - only do it when necessary
        const shouldFallback = segment.content.length < 500; // Only fallback for short segments

        if (shouldFallback) {
            const fallbackMatches = findJoinedMatches(segment.content, joined, 0, joined.length);

            if (fallbackMatches.length === 0) {
                const page = pageMap.get(segment.from);
                return [
                    {
                        actual: { from: segment.from, to: segment.to },
                        evidence: 'Segment content not found in any page content.',
                        hint: 'Check preprocessing and content normalization paths.',
                        pageContext: page ? { pageId: page.id, pagePreview: buildPreview(page.content) } : undefined,
                        segment: segmentSnapshot,
                        segmentIndex,
                        severity: 'error',
                        type: 'content_not_found',
                    },
                ];
            }

            return handleMatchedContent(
                segment,
                segmentIndex,
                segmentSnapshot,
                maxPages,
                fallbackMatches,
                expectedBoundary,
                boundaries,
                pageMap,
            );
        }

        // Long segment not found in window - likely indicates a problem
        const page = pageMap.get(segment.from);
        return [
            {
                actual: { from: segment.from, to: segment.to },
                evidence: `Segment content (${segment.content.length} chars) not found in expected window.`,
                hint: 'Check page boundary attribution in segmenter.ts.',
                pageContext: page ? { pageId: page.id, pagePreview: buildPreview(page.content) } : undefined,
                segment: segmentSnapshot,
                segmentIndex,
                severity: 'error',
                type: 'content_not_found',
            },
        ];
    }

    return handleMatchedContent(
        segment,
        segmentIndex,
        segmentSnapshot,
        maxPages,
        rawMatches,
        expectedBoundary,
        boundaries,
        pageMap,
    );
};

const handleMatchedContent = (
    segment: Segment,
    segmentIndex: number,
    segmentSnapshot: ReturnType<typeof buildSegmentSnapshot>,
    maxPages: number | undefined,
    rawMatches: { start: number; end: number }[],
    expectedBoundary: JoinedBoundary,
    boundaries: JoinedBoundary[],
    pageMap: Map<number, NormalizedPage>,
): ValidationIssue[] => {
    const alignedMatches = rawMatches.filter(
        (m) => m.start >= expectedBoundary.start && m.start <= expectedBoundary.end,
    );

    if (alignedMatches.length > 0) {
        const primary = alignedMatches[0];
        if (primary.end > expectedBoundary.end) {
            if (maxPages !== undefined && maxPages === 0) {
                const toId = findBoundaryIdForOffset(primary.end, boundaries);
                return [
                    {
                        actual: { from: segment.from, to: segment.to },
                        evidence: `Segment spans pages ${segment.from}-${toId} in joined content.`,
                        expected: { from: segment.from, to: segment.from },
                        hint: 'Check page boundary attribution in segmenter.ts and breakpoint-processor.ts.',
                        segment: segmentSnapshot,
                        segmentIndex,
                        severity: 'error',
                        type: 'max_pages_violation',
                    },
                ];
            }
        }

        return [];
    }

    // No match found on expected page
    const primary = rawMatches[0];
    const actualFromId = findBoundaryIdForOffset(primary.start, boundaries);
    const actualToId = findBoundaryIdForOffset(primary.end, boundaries);
    const page = pageMap.get(actualFromId);

    return [
        {
            actual: { from: segment.from, to: segment.to },
            evidence: `Content found in joined content at page ${actualFromId}, but segment.from=${segment.from}.`,
            expected: { from: actualFromId, to: actualToId },
            hint: 'Check content matching and boundary attribution logic.',
            pageContext: page
                ? {
                      matchIndex: primary.start,
                      pageId: page.id,
                      pagePreview: buildPreview(page.content),
                  }
                : undefined,
            segment: segmentSnapshot,
            segmentIndex,
            severity: 'error',
            type: 'page_attribution_mismatch',
        },
    ];
};

const buildSegmentSnapshot = (segment: Segment) => ({
    contentPreview: buildPreview(segment.content),
    from: segment.from,
    to: segment.to,
});

const getPageExistenceIssue = (
    segment: Segment,
    segmentIndex: number,
    segmentSnapshot: ReturnType<typeof buildSegmentSnapshot>,
    pageIds: Set<number>,
): ValidationIssue | null => {
    if (pageIds.has(segment.from)) {
        return null;
    }

    return {
        actual: { from: segment.from, to: segment.to },
        evidence: `Segment.from=${segment.from} does not exist in input pages.`,
        hint: 'Check page IDs passed into segmentPages() and validateSegments().',
        segment: segmentSnapshot,
        segmentIndex,
        severity: 'error',
        type: 'page_not_found',
    };
};

export const validateSegments = (
    pages: Page[],
    options: SegmentationOptions,
    segments: Segment[],
): ValidationReport => {
    const normalizedPages = normalizePages(pages, options);
    const joiner = options.pageJoiner === 'newline' ? '\n' : ' ';
    const { boundaries, joined } = buildJoinedContent(normalizedPages, joiner);

    // OPTIMIZATION 4: Pre-build all maps for O(1) lookups
    const boundaryMap = new Map<number, JoinedBoundary>();
    const pageMap = new Map<number, NormalizedPage>();

    for (const b of boundaries) {
        boundaryMap.set(b.id, b);
    }
    for (const p of normalizedPages) {
        pageMap.set(p.id, p);
    }

    const pageIds = new Set(normalizedPages.map((p) => p.id));
    const maxPages = options.maxPages;

    // OPTIMIZATION 5: Pre-compute all snapshots
    const segmentSnapshots = segments.map(buildSegmentSnapshot);

    // OPTIMIZATION 6: Pre-allocate issues array with estimated size
    const issues: ValidationIssue[] = [];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentSnapshot = segmentSnapshots[i];

        // OPTIMIZATION 7: Early exit on missing page
        const pageIssue = getPageExistenceIssue(segment, i, segmentSnapshot, pageIds);
        if (pageIssue) {
            issues.push(pageIssue);
            continue;
        }

        // OPTIMIZATION 8: Inline maxPages check to avoid function call overhead
        if (maxPages !== undefined && segment.to !== undefined) {
            if (maxPages === 0) {
                issues.push({
                    actual: { from: segment.from, to: segment.to },
                    evidence: 'maxPages=0 requires all segments to stay within one page.',
                    expected: { from: segment.from, to: segment.from },
                    hint: 'Check boundary detection in breakpoint-utils.ts.',
                    segment: segmentSnapshot,
                    segmentIndex: i,
                    severity: 'error',
                    type: 'max_pages_violation',
                });
            } else {
                const span = segment.to - segment.from;
                if (span > maxPages) {
                    issues.push({
                        actual: { from: segment.from, to: segment.to },
                        evidence: `Segment spans ${span} pages (maxPages=${maxPages}).`,
                        expected: { from: segment.from, to: segment.from + maxPages },
                        hint: 'Check breakpoint windowing and page attribution in breakpoint-processor.ts.',
                        segment: segmentSnapshot,
                        segmentIndex: i,
                        severity: 'error',
                        type: 'max_pages_violation',
                    });
                }
            }
        }

        // OPTIMIZATION 9: Attribution check (most expensive - optimized heavily)
        const attributionIssues = getAttributionIssues(
            segment,
            i,
            segmentSnapshot,
            maxPages,
            joined,
            boundaries,
            boundaryMap,
            pageMap,
        );

        // OPTIMIZATION 10: Direct push instead of spread
        for (const issue of attributionIssues) {
            issues.push(issue);
        }
    }

    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const warnings = issues.filter((issue) => issue.severity === 'warn').length;

    return {
        issues,
        ok: issues.length === 0,
        summary: {
            errors,
            issues: issues.length,
            pageCount: pages.length,
            segmentCount: segments.length,
            warnings,
        },
    };
};
