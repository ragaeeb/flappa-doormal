import { applyPreprocessToPage } from '@/preprocessing/transforms.js';
import type { Page, Segment } from '@/types';
import type { SegmentationOptions } from '@/types/options.js';
import type { ValidationIssue, ValidationReport } from '@/types/validation.js';
import { normalizeLineEndings } from '@/utils/textUtils.js';

type NormalizedPage = {
    id: number;
    content: string;
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

const findContentMatches = (content: string, pages: NormalizedPage[]) => {
    const matches: Array<{ pageId: number; matchIndex: number }> = [];
    for (const page of pages) {
        const idx = page.content.indexOf(content);
        if (idx >= 0) {
            matches.push({ matchIndex: idx, pageId: page.id });
            continue;
        }
        const trimmed = page.content.trim();
        const idxTrimmed = trimmed.indexOf(content);
        if (idxTrimmed >= 0) {
            matches.push({ matchIndex: idxTrimmed, pageId: page.id });
        }
    }
    return matches;
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

const getAttributionIssues = (
    segment: Segment,
    segmentIndex: number,
    segmentSnapshot: ReturnType<typeof buildSegmentSnapshot>,
    normalizedPages: NormalizedPage[],
    maxPages: number | undefined,
): ValidationIssue[] => {
    if (maxPages !== 0 && maxPages !== undefined) {
        return [];
    }

    const matches = findContentMatches(segment.content, normalizedPages);

    if (matches.length === 0) {
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

    if (matches.length === 1) {
        const match = matches[0];
        if (match.pageId === segment.from) {
            return [];
        }

        const page = normalizedPages.find((p) => p.id === match.pageId);
        return [
            {
                actual: { from: segment.from, to: segment.to },
                evidence: `Content found in page ${match.pageId}, but segment.from=${segment.from}.`,
                expected: { from: match.pageId, to: match.pageId },
                hint: 'Check buildBoundaryPositions() and findPageStartNearExpectedBoundary().',
                pageContext: page
                    ? {
                          matchIndex: match.matchIndex,
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
    }

    const matchIds = matches.map((m) => m.pageId);
    if (!matchIds.includes(segment.from)) {
        return [
            {
                actual: { from: segment.from, to: segment.to },
                evidence: `Content appears on pages [${matchIds.join(', ')}], but segment.from=${segment.from}.`,
                expected: { from: matches[0]?.pageId, to: matches[0]?.pageId },
                hint: 'Check content matching and boundary attribution logic.',
                segment: segmentSnapshot,
                segmentIndex,
                severity: 'error',
                type: 'page_attribution_mismatch',
            },
        ];
    }

    const firstMatch = matches[0];
    const page = normalizedPages.find((p) => p.id === firstMatch.pageId);
    return [
        {
            actual: { from: segment.from, to: segment.to },
            evidence: `Content appears on multiple pages [${matchIds.join(', ')}].`,
            hint: 'Content duplicates may require stronger anchors or additional rules.',
            pageContext: page
                ? { matchIndex: firstMatch.matchIndex, pageId: page.id, pagePreview: buildPreview(page.content) }
                : undefined,
            segment: segmentSnapshot,
            segmentIndex,
            severity: 'warn',
            type: 'ambiguous_attribution',
        },
    ];
};

export const validateSegments = (
    pages: Page[],
    options: SegmentationOptions,
    segments: Segment[],
): ValidationReport => {
    const normalizedPages = normalizePages(pages, options);
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
        issues.push(...getAttributionIssues(segment, i, segmentSnapshot, normalizedPages, maxPages));
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
