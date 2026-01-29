import { applyPreprocessToPage } from '@/preprocessing/transforms.js';
import type { Page, Segment } from '@/types';
import type { SegmentationOptions } from '@/types/options.js';
import type { SegmentValidationIssue, SegmentValidationReport } from '@/types/validation.js';
import { normalizeLineEndings } from '@/utils/textUtils.js';

type JoinedBoundary = {
    id: number;
    start: number;
    end: number;
};

const PREVIEW_LIMIT = 140;

const buildPreview = (text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= PREVIEW_LIMIT) {
        return normalized;
    }
    return `${normalized.slice(0, PREVIEW_LIMIT)}...`;
};

const buildSegmentSnapshot = (segment: Segment) => ({
    contentPreview: buildPreview(segment.content),
    from: segment.from,
    to: segment.to,
});

const normalizePages = (pages: Page[], options: SegmentationOptions): Page[] => {
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

const buildJoinedContent = (pages: Page[], joiner: string) => {
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

    if (boundaries.length === 0) {
        return undefined;
    }

    const last = boundaries.at(-1)!;
    return offset > last.end ? last.id : undefined;
};

type IssueOverrides = Partial<Omit<SegmentValidationIssue, 'type' | 'segment' | 'segmentIndex' | 'severity'>> & {
    matchIndex?: number;
};

const createIssue = (
    type: SegmentValidationIssue['type'],
    segment: Segment,
    segmentIndex: number,
    overrides: IssueOverrides = {},
    pageMap?: Map<number, Page>,
): SegmentValidationIssue => {
    const segmentSnapshot = buildSegmentSnapshot(segment);
    const page = pageMap?.get(segment.from);

    const matchIndex = overrides.matchIndex;
    const { matchIndex: _ignored, ...restOverrides } = overrides;

    const base: Omit<SegmentValidationIssue, 'type' | 'severity'> = {
        actual: { from: segment.from, to: segment.to },
        segment: segmentSnapshot,
        segmentIndex,
        ...restOverrides,
    };

    switch (type) {
        case 'page_not_found':
            return {
                ...base,
                evidence: `Segment.from=${segment.from} does not exist in input pages.`,
                hint: 'Check page IDs passed into segmentPages() and validateSegments().',
                severity: 'error',
                type,
            };
        case 'content_not_found':
            return {
                ...base,
                evidence: overrides.evidence ?? 'Segment content not found in any page content.',
                hint: overrides.hint ?? 'Check preprocessing and content normalization paths.',
                pageContext: page ? { pageId: page.id, pagePreview: buildPreview(page.content) } : undefined,
                severity: 'error',
                type,
            };
        case 'page_attribution_mismatch': {
            const actualFromId = overrides.actual?.from ?? segment.from;
            const actualPage = pageMap?.get(actualFromId);
            return {
                ...base,
                evidence:
                    overrides.evidence ??
                    `Content found in joined content at page ${actualFromId}, but segment.from=${segment.from}.`,
                hint: overrides.hint ?? 'Check content matching and boundary attribution logic.',
                pageContext: actualPage
                    ? {
                          matchIndex: matchIndex ?? -1,
                          pageId: actualPage.id,
                          pagePreview: buildPreview(actualPage.content),
                      }
                    : undefined,
                severity: 'error',
                type,
            };
        }
        case 'max_pages_violation':
            return {
                ...base,
                evidence: overrides.evidence ?? `Segment spans pages ${segment.from}-${overrides.actual?.to}.`,
                hint: overrides.hint ?? 'Check page boundary attribution in segmenter.ts and breakpoint-processor.ts.',
                severity: 'error',
                type,
            };
        default:
            return { ...base, severity: 'error', type };
    }
};

const findJoinedMatches = (
    content: string,
    joined: string,
    searchStart: number,
    searchEnd: number,
    limit: number = Infinity,
): { start: number; end: number }[] => {
    const matches: { start: number; end: number }[] = [];
    if (!content || searchStart >= searchEnd) {
        return matches;
    }
    let idx = joined.indexOf(content, searchStart);
    let count = 0;
    while (idx >= 0 && idx < searchEnd && count < limit) {
        matches.push({ end: idx + content.length - 1, start: idx });
        idx = joined.indexOf(content, idx + 1);
        if (idx >= searchEnd) {
            break;
        }
        count++;
    }
    return matches;
};

const checkMaxPagesViolation = (
    segment: Segment,
    segmentIndex: number,
    maxPages: number | undefined,
    matchEnd: number,
    expectedBoundaryEnd: number,
    boundaries: JoinedBoundary[],
): SegmentValidationIssue[] => {
    if (maxPages === 0 && segment.to === undefined && matchEnd > expectedBoundaryEnd) {
        const actualToId = findBoundaryIdForOffset(matchEnd, boundaries);
        return [
            createIssue('max_pages_violation', segment, segmentIndex, {
                actual: { from: segment.from, to: actualToId },
                evidence: `Segment spans pages ${segment.from}-${actualToId} in joined content.`,
                expected: { from: segment.from, to: segment.from },
            }),
        ];
    }
    return [];
};

const handleMissingBoundary = (
    segment: Segment,
    segmentIndex: number,
    joined: string,
    boundaries: JoinedBoundary[],
    pageMap: Map<number, Page>,
): SegmentValidationIssue[] => {
    // Search full text to see if content exists anywhere
    const matches = findJoinedMatches(segment.content, joined, 0, joined.length, 1);
    if (matches.length === 0) {
        return [
            createIssue(
                'content_not_found',
                segment,
                segmentIndex,
                { evidence: 'Segment content not found in any page content.' },
                pageMap,
            ),
        ];
    }
    // Content exists, but claimed page doesn't - this is a mismatch
    const match = matches[0];
    const actualFromId = findBoundaryIdForOffset(match.start, boundaries);
    const actualToId = findBoundaryIdForOffset(match.end, boundaries);
    return [
        createIssue(
            'page_attribution_mismatch',
            segment,
            segmentIndex,
            {
                actual: { from: segment.from, to: segment.to },
                evidence: `Content found in joined content at page ${actualFromId}, but segment.from=${segment.from}.`,
                expected: { from: actualFromId, to: actualToId },
                matchIndex: match.start,
            },
            pageMap,
        ),
    ];
};

const handleFallbackSearch = (
    segment: Segment,
    segmentIndex: number,
    joined: string,
    searchStart: number,
    searchEnd: number,
    expectedBoundary: JoinedBoundary,
    boundaries: JoinedBoundary[],
    pageMap: Map<number, Page>,
    maxPages: number | undefined,
): SegmentValidationIssue[] => {
    const content = segment.content;
    const bufferSize = 1000;
    const slowSearchStart = Math.max(0, searchStart - bufferSize);
    const slowSearchEnd = Math.min(joined.length, searchEnd + bufferSize);

    const rawMatches = findJoinedMatches(content, joined, slowSearchStart, slowSearchEnd, 5);

    if (rawMatches.length === 0) {
        // Fallback: search entire document only for short segments
        if (content.length < 500) {
            const fullMatches = findJoinedMatches(content, joined, 0, joined.length, 1);
            if (fullMatches.length > 0) {
                const match = fullMatches[0];
                const actualFromId = findBoundaryIdForOffset(match.start, boundaries);
                const actualToId = findBoundaryIdForOffset(match.end, boundaries);
                return [
                    createIssue(
                        'page_attribution_mismatch',
                        segment,
                        segmentIndex,
                        {
                            actual: { from: segment.from, to: segment.to },
                            evidence: `Content found in joined content at page ${actualFromId}, but segment.from=${segment.from}.`,
                            expected: { from: actualFromId, to: actualToId },
                            matchIndex: match.start,
                        },
                        pageMap,
                    ),
                ];
            }
        }

        return [
            createIssue(
                'content_not_found',
                segment,
                segmentIndex,
                {
                    evidence: `Segment content (${content.length} chars) not found in expected window.`,
                    hint: 'Check page boundary attribution in segmenter.ts.',
                },
                pageMap,
            ),
        ];
    }

    // Check if any match aligns with expected page
    const alignedMatches = rawMatches.filter(
        (m) => m.start >= expectedBoundary.start && m.start <= expectedBoundary.end,
    );

    if (alignedMatches.length > 0) {
        const primary = alignedMatches[0];
        return checkMaxPagesViolation(segment, segmentIndex, maxPages, primary.end, expectedBoundary.end, boundaries);
    }

    // No aligned matches - report mismatch
    const primary = rawMatches[0];
    const actualFromId = findBoundaryIdForOffset(primary.start, boundaries);
    const actualToId = findBoundaryIdForOffset(primary.end, boundaries);
    return [
        createIssue(
            'page_attribution_mismatch',
            segment,
            segmentIndex,
            {
                actual: { from: segment.from, to: segment.to },
                evidence: `Content found in joined content at page ${actualFromId}, but segment.from=${segment.from}.`,
                expected: { from: actualFromId, to: actualToId },
                matchIndex: primary.start,
            },
            pageMap,
        ),
    ];
};

const getSearchRange = (
    segment: Segment,
    expectedBoundary: JoinedBoundary,
    boundaryMap: Map<number, JoinedBoundary>,
    joinedLength: number,
) => {
    let searchEnd = expectedBoundary.end + 1;
    if (segment.to !== undefined) {
        const endBoundary = boundaryMap.get(segment.to);
        if (endBoundary) {
            searchEnd = endBoundary.end + 1;
        } else {
            searchEnd = Math.min(joinedLength, expectedBoundary.end + 50000);
        }
    }
    return searchEnd;
};

const getAttributionIssues = (
    segment: Segment,
    segmentIndex: number,
    maxPages: number | undefined,
    joined: string,
    boundaries: JoinedBoundary[],
    boundaryMap: Map<number, JoinedBoundary>,
    pageMap: Map<number, Page>,
): SegmentValidationIssue[] => {
    if (!segment.content) {
        return [
            createIssue('content_not_found', segment, segmentIndex, { evidence: 'Segment content is empty.' }, pageMap),
        ];
    }

    const expectedBoundary = boundaryMap.get(segment.from);
    if (!expectedBoundary) {
        return handleMissingBoundary(segment, segmentIndex, joined, boundaries, pageMap);
    }

    const searchEnd = getSearchRange(segment, expectedBoundary, boundaryMap, joined.length);
    const searchStart = expectedBoundary.start;

    // Fast path: direct check
    const idx = joined.indexOf(segment.content, searchStart);
    if (idx !== -1 && idx < searchEnd) {
        const matchEnd = idx + segment.content.length - 1;
        return checkMaxPagesViolation(segment, segmentIndex, maxPages, matchEnd, expectedBoundary.end, boundaries);
    }

    // Slow path
    return handleFallbackSearch(
        segment,
        segmentIndex,
        joined,
        searchStart,
        searchEnd,
        expectedBoundary,
        boundaries,
        pageMap,
        maxPages,
    );
};

const checkStaticMaxPages = (segment: Segment, index: number, maxPages: number | undefined) => {
    if (maxPages === undefined || segment.to === undefined) {
        return null;
    }

    if (maxPages === 0) {
        return createIssue('max_pages_violation', segment, index, {
            evidence: 'maxPages=0 requires all segments to stay within one page.',
            expected: { from: segment.from, to: segment.from },
            hint: 'Check boundary detection in breakpoint-utils.ts.',
        });
    }

    const span = segment.to - segment.from;
    if (span > maxPages) {
        return createIssue('max_pages_violation', segment, index, {
            evidence: `Segment spans ${span} pages (maxPages=${maxPages}).`,
            expected: { from: segment.from, to: segment.from + maxPages },
            hint: 'Check breakpoint windowing and page attribution in breakpoint-processor.ts.',
        });
    }
    return null;
};

export const validateSegments = (
    pages: Page[],
    options: SegmentationOptions,
    segments: Segment[],
): SegmentValidationReport => {
    const normalizedPages = normalizePages(pages, options);
    const joiner = options.pageJoiner === 'newline' ? '\n' : ' ';
    const { boundaries, joined } = buildJoinedContent(normalizedPages, joiner);

    const boundaryMap = new Map<number, JoinedBoundary>();
    const pageMap = new Map<number, Page>();

    for (const b of boundaries) {
        boundaryMap.set(b.id, b);
    }
    for (const p of normalizedPages) {
        pageMap.set(p.id, p);
    }

    const pageIds = new Set(normalizedPages.map((p) => p.id));
    const maxPages = options.maxPages;

    const issues: SegmentValidationIssue[] = [];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        // Check page existence
        if (!pageIds.has(segment.from)) {
            issues.push(createIssue('page_not_found', segment, i));
        }

        // Check maxPages constraint
        const staticMaxPageIssue = checkStaticMaxPages(segment, i, maxPages);
        if (staticMaxPageIssue) {
            issues.push(staticMaxPageIssue);
        }

        // Attribution check
        const attributionIssues = getAttributionIssues(segment, i, maxPages, joined, boundaries, boundaryMap, pageMap);
        issues.push(...attributionIssues);
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
