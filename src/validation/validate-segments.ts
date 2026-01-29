import { applyPreprocessToPage } from '@/preprocessing/transforms.js';
import type { Page, Segment } from '@/types';
import type { SegmentationOptions } from '@/types/options.js';
import type { SegmentValidationIssue, SegmentValidationReport } from '@/types/validation.js';
import { normalizeLineEndings } from '@/utils/textUtils.js';
import { FULL_SEARCH_THRESHOLD, PREVIEW_LIMIT } from './validation-constants.js';

type JoinedBoundary = {
    id: number;
    start: number;
    end: number;
};

/**
 * Creates a short preview string of text content for error reporting.
 * Truncates content exceeding PREVIEW_LIMIT.
 */
const buildPreview = (text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= PREVIEW_LIMIT) {
        return normalized;
    }
    return `${normalized.slice(0, PREVIEW_LIMIT)}...`;
};

/**
 * Creates a lightweight snapshot of a segment for inclusion in validation checks.
 */
const buildSegmentSnapshot = (segment: Segment) => ({
    contentPreview: buildPreview(segment.content),
    from: segment.from,
    to: segment.to,
});

/**
 * Normalizes page content by applying preprocessing transforms and standardizing line endings.
 */
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

/**
 * Joins all page content into a single string with boundary tracking.
 * Returns the joined string and a list of boundary mappings (start/end indices for each page).
 */
const buildJoinedContent = (pages: Page[], joiner: string) => {
    const boundaries: JoinedBoundary[] = [];
    const nonEmptyPages = pages.filter((p) => p.content);
    const joined = nonEmptyPages.map((p) => p.content).join(joiner);

    let offset = 0;
    for (let i = 0; i < nonEmptyPages.length; i++) {
        const content = nonEmptyPages[i].content;
        const start = offset;
        const end = start + content.length - 1;
        boundaries.push({ end, id: nonEmptyPages[i].id, start });
        offset = end + 1 + (i < nonEmptyPages.length - 1 ? joiner.length : 0);
    }
    return { boundaries, joined };
};

/**
 * Binary search to find which page ID corresponds to a character offset in the joined content.
 * Returns undefined if the offset falls within a joiner gap or outside bounds.
 */
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

export type ValidationOptions = {
    /**
     * Threshold for short segment content (characters).
     * Segments shorter than this will trigger a full-document search fallback.
     * @default 500
     */
    fullSearchThreshold?: number;
};

type IssueOverrides = Partial<Omit<SegmentValidationIssue, 'type' | 'segment' | 'segmentIndex' | 'severity'>> & {
    matchIndex?: number;
};

/**
 * Helper to construct a standardized validation issue object.
 */
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
                evidence: overrides.evidence ?? `Segment.from=${segment.from} does not exist in input pages.`,
                hint: 'Check page IDs passed into segmentPages() and validateSegments().',
                severity: 'error',
                type,
            };
        case 'content_not_found':
            return {
                ...base,
                evidence: overrides.evidence ?? 'Segment content not found in any page content.',
                hint: overrides.hint ?? 'Check preprocessing options, joiner settings, or whitespace normalization.',
                pageContext: page ? { pageId: page.id, pagePreview: buildPreview(page.content) } : undefined,
                severity: 'error',
                type,
            };
        case 'page_attribution_mismatch': {
            const matchedFromId = overrides.expected?.from ?? overrides.actual?.from ?? segment.from;
            const actualPage = pageMap?.get(matchedFromId);
            return {
                ...base,
                evidence:
                    overrides.evidence ??
                    `Content found in joined content at page ${matchedFromId}, but segment.from=${segment.from}.`,
                hint: overrides.hint ?? 'Check duplicate content handling and boundary detection rules.',
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
                hint: overrides.hint ?? 'Check maxPages windowing in breakpoint-processor.ts and page constraints.',
                severity: 'error',
                type,
            };
        default:
            return { ...base, severity: 'error', type };
    }
};

/**
 * Finds all occurrences of a content string within the joined text.
 * Respects search limits to avoid performance cliffs on highly repetitive content.
 */
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

/**
 * Verifies that a matched segment falls within the allowed maxTerms/maxPages constraints.
 * Checks both implicit spans (calculated from match end) and explicit segment.to claims.
 */
const checkMaxPagesViolation = (
    segment: Segment,
    segmentIndex: number,
    maxPages: number | undefined,
    matchEnd: number,
    _expectedBoundaryEnd: number,
    boundaries: JoinedBoundary[],
): SegmentValidationIssue[] => {
    // If maxPages is undefined (no limit) and we trust the segment.to if present (no we verify it now),
    // actually if maxPages is undefined we still might want to verify segment.to integrity?
    // But the issue specifically flagged max_pages_violation.
    // Let's stick to max_pages / boundary enforcement.

    // 1. Identify which page the match extends to
    const actualToId = findBoundaryIdForOffset(matchEnd, boundaries);
    if (actualToId === undefined) {
        return []; // Should not happen if match found
    }

    // 2. Check strict single-page constraint (maxPages=0)
    if (maxPages === 0) {
        // Violation if it spans to a different page
        if (actualToId !== segment.from) {
            return [
                createIssue('max_pages_violation', segment, segmentIndex, {
                    actual: { from: segment.from, to: actualToId },
                    evidence: `Segment spans pages ${segment.from}-${actualToId} in joined content (maxPages=0).`,
                    expected: { from: segment.from, to: segment.from },
                }),
            ];
        }
    }

    // 3. Check explicit segment.to constraint
    if (segment.to !== undefined) {
        if (actualToId > segment.to) {
            return [
                createIssue('max_pages_violation', segment, segmentIndex, {
                    actual: { from: segment.from, to: actualToId },
                    evidence: `Segment content ends on page ${actualToId} but segment.to is ${segment.to}.`,
                    expected: { from: segment.from, to: segment.to },
                }),
            ];
        }
    }
    // 4. Check dynamic maxPages constraint (if segment.to was undefined)
    else if (maxPages !== undefined) {
        const span = actualToId - segment.from;
        if (span > maxPages) {
            return [
                createIssue('max_pages_violation', segment, segmentIndex, {
                    actual: { from: segment.from, to: actualToId },
                    evidence: `Segment spans ${span} pages (maxPages=${maxPages}).`,
                    expected: { from: segment.from, to: segment.from + maxPages },
                }),
            ];
        }
    }

    // Original legacy check (can be removed or kept as fallback?)
    // The above logic covers the original case:
    // maxPages=0, to=undefined, matchEnd implies actualToId > from.
    // -> Matches step 2.

    return [];
};

/**
 * Handles validation when content is not found in the expected boundary window.
 * Fallback strategy: search entire document if segment matches existing content elsewhere.
 */
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

/**
 * Performs a widened search when the direct check fails.
 * Includes a small buffer around the expected position, and optionally a full-document search for short segments.
 */
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
    validationOptions?: ValidationOptions,
): SegmentValidationIssue[] => {
    const content = segment.content;
    const bufferSize = 1000;
    const slowSearchStart = Math.max(0, searchStart - bufferSize);
    const slowSearchEnd = Math.min(joined.length, searchEnd + bufferSize);

    const rawMatches = findJoinedMatches(content, joined, slowSearchStart, slowSearchEnd, 5);

    if (rawMatches.length === 0) {
        // Fallback: search entire document only for short segments
        const threshold = validationOptions?.fullSearchThreshold ?? FULL_SEARCH_THRESHOLD;
        if (content.length < threshold) {
            // Fix: Check all matches (limit 50) to find one that attributes to the correct from page
            const fullMatches = findJoinedMatches(content, joined, 0, joined.length, 50);

            // Check if ANY match aligns with the expected page
            const validMatch = fullMatches.find((m) => {
                const matchFromId = findBoundaryIdForOffset(m.start, boundaries);
                return matchFromId === segment.from;
            });

            if (validMatch) {
                return checkMaxPagesViolation(
                    segment,
                    segmentIndex,
                    maxPages,
                    validMatch.end,
                    expectedBoundary.end,
                    boundaries,
                );
            }

            if (fullMatches.length > 0) {
                // Found matches but none on the correct page. Report attribution mismatch on the first one.
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

/**
 * Calculates the search range end index based on segment.to or strict bounds.
 */
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

/**
 * Validates attribution for a single segment by searching for its content in the joined text.
 * Returns issues if content is missing, mis-attributed, or violates page limits.
 */
const getAttributionIssues = (
    segment: Segment,
    segmentIndex: number,
    maxPages: number | undefined,
    joined: string,
    boundaries: JoinedBoundary[],
    boundaryMap: Map<number, JoinedBoundary>,
    pageMap: Map<number, Page>,
    validationOptions?: ValidationOptions,
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
        validationOptions,
    );
};

/**
 * Performs purely static checks on the segment metadata (Ids and spans) before expensive content searching.
 */
const checkStaticMaxPages = (segment: Segment, index: number, maxPages: number | undefined) => {
    if (maxPages === undefined || segment.to === undefined) {
        return null;
    }

    if (maxPages === 0) {
        if (segment.to !== segment.from) {
            return createIssue('max_pages_violation', segment, index, {
                evidence: 'maxPages=0 requires all segments to stay within one page.',
                expected: { from: segment.from, to: segment.from },
                hint: 'Check boundary detection in breakpoint-utils.ts.',
            });
        }
        return null;
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

/**
 * Validates a list of segments against the source pages.
 * checks for:
 * - Page existence (invalid IDs)
 * - Content fidelity (content must exist in pages)
 * - Page attribution (from/to must match content location)
 * - Page constraints (maxPages violations)
 *
 * @param pages Input pages used for segmentation
 * @param options Operations used during segmentation (for preprocessing/joining consistency)
 * @param segments The output segments to validate
 * @param validationOptions Optional settings for validation behavior
 * @returns A detailed validation report
 */
export const validateSegments = (
    pages: Page[],
    options: SegmentationOptions,
    segments: Segment[],
    validationOptions?: ValidationOptions,
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

        if (!pageIds.has(segment.from)) {
            issues.push(createIssue('page_not_found', segment, i));
            continue;
        }
        if (segment.to !== undefined && !pageIds.has(segment.to)) {
            issues.push(
                createIssue('page_not_found', segment, i, {
                    evidence: `Segment.to=${segment.to} does not exist in input pages.`,
                }),
            );
        }

        // Check maxPages constraint
        const staticMaxPageIssue = checkStaticMaxPages(segment, i, maxPages);
        if (staticMaxPageIssue) {
            issues.push(staticMaxPageIssue);
        }

        // Attribution check
        const attributionIssues = getAttributionIssues(
            segment,
            i,
            maxPages,
            joined,
            boundaries,
            boundaryMap,
            pageMap,
            validationOptions,
        );
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
