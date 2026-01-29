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

type JoinedMatch = {
    fromId: number;
    matchIndex: number;
    toId: number;
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
    return boundaries.at(-1)?.id;
};

const findJoinedMatches = (content: string, joined: string): { start: number; end: number }[] => {
    const matches: { start: number; end: number }[] = [];
    if (!content) {
        return matches;
    }
    let idx = joined.indexOf(content);
    while (idx >= 0) {
        matches.push({ end: idx + content.length - 1, start: idx });
        idx = joined.indexOf(content, idx + 1);
    }
    return matches;
};

const getAttributionIssues = (
    segment: Segment,
    segmentIndex: number,
    segmentSnapshot: ReturnType<typeof buildSegmentSnapshot>,
    normalizedPages: NormalizedPage[],
    maxPages: number | undefined,
    joined: string,
    boundaries: JoinedBoundary[],
    boundaryMap: Map<number, JoinedBoundary>,
): ValidationIssue[] => {
    // Optimization: Search in the full joined string.
    const rawMatches = findJoinedMatches(segment.content, joined);

    if (rawMatches.length === 0) {
        const page = normalizedPages.find((p) => p.id === segment.from);
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

    const expectedBoundary = boundaryMap.get(segment.from);
    let alignedMatches: { start: number; end: number }[] = [];

    if (expectedBoundary) {
        // Find matches that start within the expected page's bounds
        alignedMatches = rawMatches.filter((m) => m.start >= expectedBoundary.start && m.start <= expectedBoundary.end);
    }

    // If we have matches on the expected page
    if (alignedMatches.length > 0) {
        if (alignedMatches.length > 1) {
            // We can report multiple matches on the same page/region
            // Or should we report general duplication?
            // Previous logic checked if > 1 match started at same page ID.
            // Here alignedMatches are all starting at expectedBoundary (same ID).
            // So yes, this detects multiple occurrences on the source page.
            // Do we warn if content appears on OTHER pages?
            // "ambiguous_attribution" usually implies multiple valid candidates.
            // If alignedMatches > 0, we found it where we expected.
            // If rawMatches > alignedMatches, it implies duplicates elsewhere.

            // The previous logic only warned if `alignedMatches.length > 1` (multiple on expected page).
            // It did NOT warn if appeared elsewhere?
            // Let's stick to previous logic: warn if multiple matches start at `segment.from`.

            return [
                {
                    actual: { from: segment.from, to: segment.to },
                    evidence: `Content appears on multiple joined positions for page ${segment.from}.`,
                    hint: 'Content duplicates may require stronger anchors or additional rules.',
                    segment: segmentSnapshot,
                    segmentIndex,
                    severity: 'warn',
                    type: 'ambiguous_attribution',
                },
            ];
        }

        // Check maxPages violation for the primary aligned match
        const primary = alignedMatches[0];
        // Does it span?
        // We need the ID of where it ends.
        // We know it starts at `segment.from` (because we filtered).
        // Does it exceed the expected boundary end?
        if (primary.end > expectedBoundary!.end) {
            // It spans.
            if (maxPages !== undefined && maxPages === 0) {
                // Violation.
                // We need the ACTUAL toId.
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

    // No match found on expected page. Report mismatch.
    // Use the first match found anywhere.
    const primary = rawMatches[0];
    const actualFromId = findBoundaryIdForOffset(primary.start, boundaries);
    const actualToId = findBoundaryIdForOffset(primary.end, boundaries); // Optional, for context

    const page = normalizedPages.find((p) => p.id === actualFromId);

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

const getMaxPagesIssues = (
    segment: Segment,
    segmentIndex: number,
    segmentSnapshot: ReturnType<typeof buildSegmentSnapshot>,
    maxPages: number | undefined,
): ValidationIssue[] => {
    if (maxPages === undefined || segment.to === undefined) {
        return [];
    }

    if (maxPages === 0) {
        return [
            {
                actual: { from: segment.from, to: segment.to },
                evidence: 'maxPages=0 requires all segments to stay within one page.',
                expected: { from: segment.from, to: segment.from },
                hint: 'Check boundary detection in breakpoint-utils.ts.',
                segment: segmentSnapshot,
                segmentIndex,
                severity: 'error',
                type: 'max_pages_violation',
            },
        ];
    }

    const span = segment.to - segment.from;
    if (span <= maxPages) {
        return [];
    }

    return [
        {
            actual: { from: segment.from, to: segment.to },
            evidence: `Segment spans ${span} pages (maxPages=${maxPages}).`,
            expected: { from: segment.from, to: segment.from + maxPages },
            hint: 'Check breakpoint windowing and page attribution in breakpoint-processor.ts.',
            segment: segmentSnapshot,
            segmentIndex,
            severity: 'error',
            type: 'max_pages_violation',
        },
    ];
};

export const validateSegments = (
    pages: Page[],
    options: SegmentationOptions,
    segments: Segment[],
): ValidationReport => {
    const normalizedPages = normalizePages(pages, options);
    const joiner = options.pageJoiner === 'newline' ? '\n' : ' ';
    const { boundaries, joined } = buildJoinedContent(normalizedPages, joiner);
    // Optimisation: Create map for O(1) boundary lookups
    const boundaryMap = new Map<number, JoinedBoundary>();
    for (const b of boundaries) {
        boundaryMap.set(b.id, b);
    }

    const pageIds = new Set(normalizedPages.map((p) => p.id));
    const issues: ValidationIssue[] = [];
    const maxPages = options.maxPages;

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentSnapshot = buildSegmentSnapshot(segment);
        const pageIssue = getPageExistenceIssue(segment, i, segmentSnapshot, pageIds);
        if (pageIssue) {
            issues.push(pageIssue);
        }
        issues.push(...getMaxPagesIssues(segment, i, segmentSnapshot, maxPages));
        issues.push(
            ...getAttributionIssues(
                segment,
                i,
                segmentSnapshot,
                normalizedPages,
                maxPages,
                joined,
                boundaries,
                boundaryMap,
            ),
        );
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
