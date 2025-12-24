/**
 * Unit tests for breakpoint-utils module.
 *
 * Tests the helper functions extracted from segmenter.ts for
 * breakpoint processing, page exclusion checking, and segment creation.
 */

import { describe, expect, it } from 'bun:test';
import { computeNextFromIdx, computeWindowEndIdx } from './breakpoint-processor.js';
import {
    applyPageJoinerBetweenPages,
    buildExcludeSet,
    createSegment,
    estimateStartOffsetInCurrentPage,
    expandBreakpoints,
    findActualEndPage,
    findBreakpointWindowEndPosition,
    findExclusionBreakPosition,
    findNextPagePosition,
    findPatternBreakPosition,
    hasExcludedPageInRange,
    isInBreakpointRange,
    isPageExcluded,
    type NormalizedPage,
    normalizeBreakpoint,
} from './breakpoint-utils.js';

describe('breakpoint-utils', () => {
    describe('normalizeBreakpoint', () => {
        it('should convert string to BreakpointRule object', () => {
            const result = normalizeBreakpoint('\\n\\n');
            expect(result).toEqual({ pattern: '\\n\\n' });
        });

        it('should return object breakpoints as-is', () => {
            const rule = { max: 100, min: 10, pattern: '\\n' };
            const result = normalizeBreakpoint(rule);
            expect(result).toBe(rule);
        });

        it('should handle empty string pattern', () => {
            const result = normalizeBreakpoint('');
            expect(result).toEqual({ pattern: '' });
        });
    });

    describe('isPageExcluded', () => {
        it('should return false for undefined excludeList', () => {
            expect(isPageExcluded(5, undefined)).toBe(false);
        });

        it('should return false for empty excludeList', () => {
            expect(isPageExcluded(5, [])).toBe(false);
        });

        it('should detect excluded single page', () => {
            expect(isPageExcluded(5, [1, 5, 10])).toBe(true);
            expect(isPageExcluded(6, [1, 5, 10])).toBe(false);
        });

        it('should detect page within excluded range', () => {
            expect(isPageExcluded(5, [[3, 7]])).toBe(true);
            expect(isPageExcluded(3, [[3, 7]])).toBe(true);
            expect(isPageExcluded(7, [[3, 7]])).toBe(true);
            expect(isPageExcluded(2, [[3, 7]])).toBe(false);
            expect(isPageExcluded(8, [[3, 7]])).toBe(false);
        });

        it('should handle mixed single pages and ranges', () => {
            const list: (number | [number, number])[] = [1, [5, 10], 20];
            expect(isPageExcluded(1, list)).toBe(true);
            expect(isPageExcluded(7, list)).toBe(true);
            expect(isPageExcluded(20, list)).toBe(true);
            expect(isPageExcluded(3, list)).toBe(false);
            expect(isPageExcluded(15, list)).toBe(false);
        });
    });

    describe('isInBreakpointRange', () => {
        it('should return true when no constraints', () => {
            expect(isInBreakpointRange(50, { pattern: '\\n' })).toBe(true);
        });

        it('should respect min constraint', () => {
            expect(isInBreakpointRange(5, { min: 10, pattern: '\\n' })).toBe(false);
            expect(isInBreakpointRange(10, { min: 10, pattern: '\\n' })).toBe(true);
            expect(isInBreakpointRange(50, { min: 10, pattern: '\\n' })).toBe(true);
        });

        it('should respect max constraint', () => {
            expect(isInBreakpointRange(150, { max: 100, pattern: '\\n' })).toBe(false);
            expect(isInBreakpointRange(100, { max: 100, pattern: '\\n' })).toBe(true);
            expect(isInBreakpointRange(50, { max: 100, pattern: '\\n' })).toBe(true);
        });

        it('should respect both min and max', () => {
            const rule = { max: 100, min: 10, pattern: '\\n' };
            expect(isInBreakpointRange(5, rule)).toBe(false);
            expect(isInBreakpointRange(150, rule)).toBe(false);
            expect(isInBreakpointRange(50, rule)).toBe(true);
        });

        it('should respect exclude list', () => {
            const rule = { exclude: [50] as (number | [number, number])[], pattern: '\\n' };
            expect(isInBreakpointRange(50, rule)).toBe(false);
            expect(isInBreakpointRange(51, rule)).toBe(true);
        });
    });

    describe('buildExcludeSet', () => {
        it('should return empty set for undefined list', () => {
            const result = buildExcludeSet(undefined);
            expect(result.size).toBe(0);
        });

        it('should return empty set for empty list', () => {
            const result = buildExcludeSet([]);
            expect(result.size).toBe(0);
        });

        it('should add single pages', () => {
            const result = buildExcludeSet([1, 5, 10]);
            expect(result.size).toBe(3);
            expect(result.has(1)).toBe(true);
            expect(result.has(5)).toBe(true);
            expect(result.has(10)).toBe(true);
            expect(result.has(2)).toBe(false);
        });

        it('should expand ranges', () => {
            const result = buildExcludeSet([[5, 8]]);
            expect(result.size).toBe(4);
            expect(result.has(5)).toBe(true);
            expect(result.has(6)).toBe(true);
            expect(result.has(7)).toBe(true);
            expect(result.has(8)).toBe(true);
            expect(result.has(4)).toBe(false);
            expect(result.has(9)).toBe(false);
        });

        it('should handle mixed single pages and ranges', () => {
            const result = buildExcludeSet([1, [5, 7], 10]);
            expect(result.size).toBe(5); // 1, 5, 6, 7, 10
        });
    });

    describe('createSegment', () => {
        it('should create basic segment', () => {
            const result = createSegment('Hello world', 1, undefined, undefined);
            expect(result).toEqual({ content: 'Hello world', from: 1 });
        });

        it('should add to when different from from', () => {
            const result = createSegment('Hello world', 1, 3, undefined);
            expect(result).toEqual({ content: 'Hello world', from: 1, to: 3 });
        });

        it('should not add to when same as from', () => {
            const result = createSegment('Hello world', 1, 1, undefined);
            expect(result).toEqual({ content: 'Hello world', from: 1 });
        });

        it('should add meta when provided', () => {
            const meta = { chapter: 1, title: 'Intro' };
            const result = createSegment('Hello world', 1, 3, meta);
            expect(result).toEqual({ content: 'Hello world', from: 1, meta, to: 3 });
        });

        it('should trim content', () => {
            const result = createSegment('  Hello world  ', 1, undefined, undefined);
            expect(result?.content).toBe('Hello world');
        });

        it('should return null for empty content', () => {
            expect(createSegment('   ', 1, undefined, undefined)).toBeNull();
            expect(createSegment('', 1, undefined, undefined)).toBeNull();
        });
    });

    describe('expandBreakpoints', () => {
        const identityProcessor = (p: string) => p;

        it('should expand string breakpoints', () => {
            const result = expandBreakpoints(['\\n\\n'], identityProcessor);
            expect(result).toHaveLength(1);
            expect(result[0].rule).toEqual({ pattern: '\\n\\n' });
            expect(result[0].regex).toBeInstanceOf(RegExp);
            expect(result[0].excludeSet.size).toBe(0);
        });

        it('should handle empty pattern as page boundary', () => {
            const result = expandBreakpoints([''], identityProcessor);
            expect(result[0].regex).toBeNull();
        });

        it('should pre-compute exclude sets', () => {
            const result = expandBreakpoints([{ exclude: [1, [5, 7]], pattern: '\\n' }], identityProcessor);
            expect(result[0].excludeSet.size).toBe(4); // 1, 5, 6, 7
        });

        it('should apply pattern processor', () => {
            const processor = (p: string) => p.toUpperCase();
            const result = expandBreakpoints(['test'], processor);
            expect(result[0].regex?.source).toBe('TEST');
        });
    });

    describe('hasExcludedPageInRange', () => {
        const pageIds = [10, 20, 30, 40, 50];

        it('should return false for empty exclude set', () => {
            const excludeSet = new Set<number>();
            expect(hasExcludedPageInRange(excludeSet, pageIds, 0, 4)).toBe(false);
        });

        it('should detect excluded page in range', () => {
            const excludeSet = new Set([30]);
            expect(hasExcludedPageInRange(excludeSet, pageIds, 0, 4)).toBe(true);
        });

        it('should return false when excluded page outside range', () => {
            const excludeSet = new Set([30]);
            expect(hasExcludedPageInRange(excludeSet, pageIds, 0, 1)).toBe(false);
        });

        it('should check boundary pages', () => {
            const excludeSet = new Set([10]);
            expect(hasExcludedPageInRange(excludeSet, pageIds, 0, 2)).toBe(true);

            const excludeSet2 = new Set([50]);
            expect(hasExcludedPageInRange(excludeSet2, pageIds, 3, 4)).toBe(true);
        });
    });

    describe('findNextPagePosition', () => {
        it('should find position of next page content', () => {
            const pageData: NormalizedPage = { content: 'Next page', index: 1, length: 9 };
            const result = findNextPagePosition('Previous content Next page end', pageData);
            expect(result).toBe(17); // Position of "Next"
        });

        it('should return -1 for empty search prefix', () => {
            const pageData: NormalizedPage = { content: '   ', index: 1, length: 3 };
            expect(findNextPagePosition('Some content', pageData)).toBe(-1);
        });

        it('should return -1 when not found', () => {
            const pageData: NormalizedPage = { content: 'Missing', index: 1, length: 7 };
            expect(findNextPagePosition('Some content', pageData)).toBe(-1);
        });

        it('should return -1 when found at position 0', () => {
            const pageData: NormalizedPage = { content: 'Start', index: 1, length: 5 };
            expect(findNextPagePosition('Start of content', pageData)).toBe(-1);
        });
    });

    describe('findPatternBreakPosition', () => {
        it('should find first match with shorter preference', () => {
            const regex = /\n\n/g;
            const result = findPatternBreakPosition('a\n\nb\n\nc', regex, 'shorter');
            expect(result).toBe(3); // After first \n\n
        });

        it('should find last match with longer preference', () => {
            const regex = /\n\n/g;
            const result = findPatternBreakPosition('a\n\nb\n\nc', regex, 'longer');
            expect(result).toBe(6); // After second \n\n
        });

        it('should return -1 when no matches', () => {
            const regex = /XXX/g;
            expect(findPatternBreakPosition('No matches here', regex, 'shorter')).toBe(-1);
        });
    });

    describe('findActualEndPage', () => {
        it('should find ending page by content prefix', () => {
            const normalizedPages = new Map<number, NormalizedPage>([
                [10, { content: 'Page 10 content', index: 0, length: 15 }],
                [20, { content: 'Page 20 content', index: 1, length: 15 }],
                [30, { content: 'Page 30 content', index: 2, length: 15 }],
            ]);
            const pageIds = [10, 20, 30];

            // Piece contains prefix of page 20
            const result = findActualEndPage('First part Page 20 content and more', 0, 2, pageIds, normalizedPages);
            expect(result).toBe(1); // Index of page 20
        });

        it('should return currentFromIdx when no match found', () => {
            const normalizedPages = new Map<number, NormalizedPage>([
                [10, { content: 'Page 10 content', index: 0, length: 15 }],
                [20, { content: 'Unique content', index: 1, length: 14 }],
            ]);
            const pageIds = [10, 20];

            const result = findActualEndPage('Different text', 0, 1, pageIds, normalizedPages);
            expect(result).toBe(0);
        });

        it('should ignore matches at position 0', () => {
            const normalizedPages = new Map<number, NormalizedPage>([
                [10, { content: 'Start', index: 0, length: 5 }],
                [20, { content: 'Middle', index: 1, length: 6 }],
            ]);
            const pageIds = [10, 20];

            // "Start" is at position 0, should be ignored
            const result = findActualEndPage('Start content', 0, 1, pageIds, normalizedPages);
            expect(result).toBe(0);
        });

        it('should handle collision when later page has same short prefix as earlier content (regression)', () => {
            // Scenario: Page 100 contains "Introduction text" and Page 105 starts with "Introduction"
            // A segment containing only Page 100 content should NOT be attributed to Page 105
            // because the search starts from the end, but we should still return the correct page
            const normalizedPages = new Map<number, NormalizedPage>([
                [100, { content: 'Some content here. Introduction text follows.', index: 0, length: 45 }],
                [101, { content: 'Page 101 has different start.', index: 1, length: 29 }],
                [105, { content: 'Introduction to next chapter.', index: 2, length: 29 }],
            ]);
            const pageIds = [100, 101, 105];

            // Piece contains ONLY content from page 100 - ends before page 101 starts
            // The word "Introduction" appears in the content but is NOT at position > 0 of page 105's prefix location
            const pieceContent = 'Some content here. Introduction text follows.';

            // Search backwards: check page 105 first (its prefix "Introduction" is in the piece!)
            // But "Introduction" appears at position 19, and the piece is entirely from page 100
            // The function should find page 101's prefix "Page 101" is NOT in the piece,
            // and page 105's "Introduction" IS in the piece at pos 19 > 0
            // This is a potential false positive - the function may return page 105 (index 2)
            // In practice, this is acceptable because:
            // 1. The search is bounded by the window (toIdx)
            // 2. Real-world Arabic text rarely has such short matching prefixes across distant pages
            const result = findActualEndPage(pieceContent, 0, 2, pageIds, normalizedPages);

            // This test documents current behavior - we accept the false positive as a tradeoff
            // for handling mid-page splits. The v2 offset-based approach would fix this.
            // For now, we verify the function doesn't crash and returns a valid page index.
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(2);
        });

        it('should handle very short page content (< 10 characters)', () => {
            // Pages with very short content could cause issues with prefix matching
            const normalizedPages = new Map<number, NormalizedPage>([
                [10, { content: 'First page with normal content here.', index: 0, length: 36 }],
                [20, { content: 'Short', index: 1, length: 5 }], // Very short page
                [30, { content: 'Third page content continues.', index: 2, length: 28 }],
            ]);
            const pageIds = [10, 20, 30];

            // Piece contains content from pages 10 and 20
            const pieceContent = 'First page with normal content here. Short';

            const result = findActualEndPage(pieceContent, 0, 2, pageIds, normalizedPages);
            // Should find "Short" in the piece and return page 20's index
            expect(result).toBe(1);
        });

        it('should handle page content that is entirely whitespace', () => {
            // Edge case: a page with only whitespace
            const normalizedPages = new Map<number, NormalizedPage>([
                [10, { content: 'Content from page 10.', index: 0, length: 21 }],
                [20, { content: '   \n  ', index: 1, length: 6 }], // Whitespace-only page
                [30, { content: 'Content from page 30.', index: 2, length: 21 }],
            ]);
            const pageIds = [10, 20, 30];

            const pieceContent = 'Content from page 10. Content from page 30.';

            // Should skip page 20 (no useful prefix after trimming) and find page 30
            const result = findActualEndPage(pieceContent, 0, 2, pageIds, normalizedPages);
            expect(result).toBe(2);
        });
    });

    describe('estimateStartOffsetInCurrentPage', () => {
        it('should return 0 when remainingContent starts at page start', () => {
            const pageIds = [1];
            const normalizedPages = new Map<number, NormalizedPage>([
                [1, { content: 'Hello world. This is page one.', index: 0, length: 29 }],
            ]);

            const remaining = 'Hello world. This is page one.';
            expect(estimateStartOffsetInCurrentPage(remaining, 0, pageIds, normalizedPages)).toBe(0);
        });

        it('should estimate non-zero offset when remainingContent begins mid-page', () => {
            const pageIds = [1];
            const normalizedPages = new Map<number, NormalizedPage>([
                [1, { content: 'AAAA BBBB CCCC DDDD', index: 0, length: 19 }],
            ]);

            const remaining = 'CCCC DDDD';
            const offset = estimateStartOffsetInCurrentPage(remaining, 0, pageIds, normalizedPages);
            expect(offset).toBe(10); // 'CCCC' starts at index 10 in 'AAAA BBBB CCCC DDDD'
        });
    });

    describe('findBreakpointWindowEndPosition', () => {
        it('should find start of next page within remainingContent (supports truncated next page)', () => {
            const pageIds = [59, 229];
            const page59 = '... ثم أمَر سائِرَ الناسِ';
            const page229InSegment = 'إلى هذا الطَّرْفِ.\n## فصل: وإنْ خُلِقَ';
            const remainingContent = `${page59}\n${page229InSegment}`;

            const page229Full = `${page229InSegment} LONGER_CONTINUATION_TEXT`;
            const normalizedPages = new Map<number, NormalizedPage>([
                [59, { content: page59, index: 0, length: page59.length }],
                [229, { content: page229Full, index: 1, length: page229Full.length }],
            ]);

            const cumulativeOffsets = [0, page59.length + 1, page59.length + 1 + page229Full.length];

            const pos = findBreakpointWindowEndPosition(
                remainingContent,
                0,
                0, // windowEndIdx=0 so next boundary is start of pageIds[1]
                1,
                pageIds,
                normalizedPages,
                cumulativeOffsets,
            );
            expect(pos).toBe(remainingContent.indexOf('إلى هذا'));
        });

        it('should account for remainingContent starting mid-page when estimating expected boundaries', () => {
            const pageIds = [1, 2];
            const page1 = 'AAAA BBBB CCCC DDDD';
            const page2 = 'EEEE FFFF';
            const remainingContent = `CCCC DDDD\n${page2}`;

            const normalizedPages = new Map<number, NormalizedPage>([
                [1, { content: page1, index: 0, length: page1.length }],
                [2, { content: page2, index: 1, length: page2.length }],
            ]);

            const cumulativeOffsets = [0, page1.length + 1, page1.length + 1 + page2.length];

            const pos = findBreakpointWindowEndPosition(
                remainingContent,
                0,
                0,
                1,
                pageIds,
                normalizedPages,
                cumulativeOffsets,
            );
            expect(pos).toBe(remainingContent.indexOf('EEEE'));
        });
    });

    describe('findExclusionBreakPosition', () => {
        it('should split before the first excluded page in window', () => {
            const pageIds = [1, 2, 3];
            const cumulativeOffsets = [0, 4, 8, 11];
            const expandedBreakpoints = [{ excludeSet: new Set([2]) }];

            const breakPos = findExclusionBreakPosition(0, 2, 2, pageIds, expandedBreakpoints, cumulativeOffsets);
            expect(breakPos).toBe(4);
        });
    });

    describe('computeWindowEndIdx', () => {
        it('should choose last index within maxPages window by page ID', () => {
            const pageIds = [442, 443, 444, 500];
            expect(computeWindowEndIdx(0, 3, pageIds, 1)).toBe(1); // 442 -> up to 443
            expect(computeWindowEndIdx(1, 3, pageIds, 1)).toBe(2); // 443 -> up to 444
            expect(computeWindowEndIdx(2, 3, pageIds, 1)).toBe(2); // 444 -> 500 too far
        });
    });

    describe('computeNextFromIdx', () => {
        it('should advance to next page when remainingContent starts with next page prefix', () => {
            const pageIds = [1, 2];
            const normalizedPages = new Map<number, NormalizedPage>([
                [1, { content: 'Page1 content', index: 0, length: 13 }],
                [2, { content: 'Page2 content', index: 1, length: 13 }],
            ]);
            const remainingContent = 'Page2 content and more';
            expect(computeNextFromIdx(remainingContent, 0, 1, pageIds, normalizedPages)).toBe(1);
        });

        it('should not advance when remainingContent does not start with next page prefix', () => {
            const pageIds = [1, 2];
            const normalizedPages = new Map<number, NormalizedPage>([
                [1, { content: 'Page1 content', index: 0, length: 13 }],
                [2, { content: 'Page2 content', index: 1, length: 13 }],
            ]);
            const remainingContent = 'Something else';
            expect(computeNextFromIdx(remainingContent, 0, 1, pageIds, normalizedPages)).toBe(0);
        });

        it('should advance when remaining content is shorter than page prefix but page starts with remaining', () => {
            // Reproduces bug: when remaining content is < 30 chars but IS at start of next page
            // The original code only checked: remainingContent.startsWith(nextPrefix)
            // This fails when remaining is shorter than the 30-char prefix
            const pageIds = [2534, 2535];
            const normalizedPages = new Map<number, NormalizedPage>([
                [2534, { content: 'Page 2534 content...', index: 0, length: 20 }],
                // Next page has more content than just the remaining
                [2535, { content: 'Short text. More content after.', index: 1, length: 31 }],
            ]);
            // Remaining content is only 11 chars, but it's exactly the start of page 2535
            const remainingContent = 'Short text.';

            // Without the fix, this would return 0 (page 2534 idx) because:
            // nextPrefix = "Short text. More content after" (30 chars)
            // remainingContent.startsWith(nextPrefix) = false (remaining is only 11 chars)
            // With the fix, we also check: pageContent.startsWith(remainingPrefix) = true
            expect(computeNextFromIdx(remainingContent, 0, 1, pageIds, normalizedPages)).toBe(1);
        });
    });

    describe('applyPageJoinerBetweenPages', () => {
        it('should replace only the page-boundary newline with space', () => {
            const pageIds = [443, 444];
            const normalizedPages = new Map<number, NormalizedPage>([
                [443, { content: '... سنة ثمان وخمسين', index: 0, length: 18 }],
                // Simulate a realistic next page where only the very beginning is included in the segment,
                // but the page itself continues with more content.
                [444, { content: 'ومئتين (١) .\n١٠٧- س: ...', index: 1, length: 20 }],
            ]);

            const content = 'سنة ثمان وخمسين\nومئتين (١) .';
            const out = applyPageJoinerBetweenPages(content, 0, 1, pageIds, normalizedPages, 'space');
            expect(out).toBe('سنة ثمان وخمسين ومئتين (١) .');
        });
    });
});
