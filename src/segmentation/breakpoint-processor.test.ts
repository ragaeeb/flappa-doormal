import { describe, expect, it } from 'bun:test';
import type { Segment } from '@/types/index.js';
import { applyBreakpoints, computeNextFromIdx, computeWindowEndIdx } from './breakpoint-processor.js';
import type { NormalizedPage } from './breakpoint-utils.js';

describe('breakpoint-processor', () => {
    describe('computeWindowEndIdx', () => {
        it('should return currentFromIdx when window size is 0', () => {
            const pageIds = [1, 2, 3, 4, 5];
            const result = computeWindowEndIdx(0, 4, pageIds, 0);
            expect(result).toBe(0);
        });

        it('should compute correct window end for maxPages = 1', () => {
            const pageIds = [1, 2, 3, 4, 5];
            const result = computeWindowEndIdx(0, 4, pageIds, 1);
            expect(result).toBe(1);
        });

        it('should compute correct window end for maxPages = 2', () => {
            const pageIds = [1, 2, 3, 4, 5];
            const result = computeWindowEndIdx(0, 4, pageIds, 2);
            expect(result).toBe(2);
        });

        it('should not exceed toIdx', () => {
            const pageIds = [1, 2, 3, 4, 5];
            const result = computeWindowEndIdx(0, 2, pageIds, 10);
            expect(result).toBe(2);
        });

        it('should handle non-consecutive page IDs', () => {
            const pageIds = [1, 5, 10, 15, 20];
            const result = computeWindowEndIdx(0, 4, pageIds, 5);
            expect(result).toBe(1); // page 5 is within +5 of page 1
        });

        it('should work when starting from middle of page list', () => {
            const pageIds = [1, 2, 3, 4, 5];
            const result = computeWindowEndIdx(2, 4, pageIds, 1);
            expect(result).toBe(3); // page 4 is within +1 of page 3
        });

        it('should return currentFromIdx when no pages in range', () => {
            const pageIds = [1, 10, 20, 30];
            const result = computeWindowEndIdx(0, 3, pageIds, 1);
            expect(result).toBe(0); // page 10 is not within +1 of page 1
        });
    });

    describe('computeNextFromIdx', () => {
        const createNormalizedPages = (pages: Array<{ id: number; content: string }>) => {
            const map = new Map<number, NormalizedPage>();
            pages.forEach((p, i) => {
                map.set(p.id, { content: p.content, index: i, length: p.content.length });
            });
            return map;
        };

        it('should return actualEndIdx when remaining content is empty', () => {
            const pageIds = [1, 2, 3];
            const normalizedPages = createNormalizedPages([
                { content: 'Page one', id: 1 },
                { content: 'Page two', id: 2 },
                { content: 'Page three', id: 3 },
            ]);
            const result = computeNextFromIdx('', 0, 2, pageIds, normalizedPages);
            expect(result).toBe(0);
        });

        it('should advance to next page when remaining content starts with next page prefix', () => {
            const pageIds = [1, 2, 3];
            const normalizedPages = createNormalizedPages([
                { content: 'Page one content', id: 1 },
                { content: 'Page two content', id: 2 },
                { content: 'Page three content', id: 3 },
            ]);
            const result = computeNextFromIdx('Page two content here', 0, 2, pageIds, normalizedPages);
            expect(result).toBe(1);
        });

        it('should stay at current index when content does not match next page', () => {
            const pageIds = [1, 2, 3];
            const normalizedPages = createNormalizedPages([
                { content: 'Page one content', id: 1 },
                { content: 'Page two content', id: 2 },
                { content: 'Page three content', id: 3 },
            ]);
            const result = computeNextFromIdx('Something completely different', 0, 2, pageIds, normalizedPages);
            expect(result).toBe(0);
        });

        it('should not advance past toIdx', () => {
            const pageIds = [1, 2, 3];
            const normalizedPages = createNormalizedPages([
                { content: 'Page one', id: 1 },
                { content: 'Page two', id: 2 },
                { content: 'Page three', id: 3 },
            ]);
            const result = computeNextFromIdx('Page three content', 2, 2, pageIds, normalizedPages);
            expect(result).toBe(2);
        });

        it('should handle whitespace at start of remaining content', () => {
            const pageIds = [1, 2, 3];
            const normalizedPages = createNormalizedPages([
                { content: 'Page one', id: 1 },
                { content: 'Page two', id: 2 },
                { content: 'Page three', id: 3 },
            ]);
            // The function uses trimStart().slice(0,30) for comparison
            // So '  Page two' becomes 'Page two' which matches page 2 content
            const result = computeNextFromIdx('  Page two', 0, 2, pageIds, normalizedPages);
            expect(result).toBe(1);
        });
    });

    describe('applyBreakpoints', () => {
        const patternProcessor = (p: string) => p;

        it('should return segments unchanged when span is within maxPages', () => {
            const segments: Segment[] = [{ content: 'Short content', from: 1 }];
            const pages = [{ content: 'Short content', id: 1 }];
            const normalizedContent = ['Short content'];

            const result = applyBreakpoints(segments, pages, normalizedContent, 2, [], 'longer', patternProcessor);

            expect(result).toHaveLength(1);
            expect(result[0].content).toBe('Short content');
        });

        it('should break oversized segments using page boundary fallback', () => {
            const pages = [
                { content: 'Page one content', id: 1 },
                { content: 'Page two content', id: 2 },
                { content: 'Page three content', id: 3 },
            ];
            const segments: Segment[] = [
                { content: 'Page one content\nPage two content\nPage three content', from: 1, to: 3 },
            ];
            const normalizedContent = pages.map((p) => p.content);

            const result = applyBreakpoints(
                segments,
                pages,
                normalizedContent,
                1,
                [''], // Empty pattern = page boundary fallback
                'longer',
                patternProcessor,
            );

            expect(result.length).toBeGreaterThan(1);
        });

        it('should treat empty breakpoint "" as next-page-boundary fallback (page-bounded window)', () => {
            // With maxPages=1, we are allowed a 2-page window, but when no other patterns match
            // the empty breakpoint must swallow only the remainder of the CURRENT page (break at next page start).
            const pages = [
                { content: 'A'.repeat(50), id: 1 },
                { content: 'B'.repeat(50), id: 2 },
                { content: 'C'.repeat(50), id: 3 },
            ];
            const normalizedContent = pages.map((p) => p.content);
            const joined = normalizedContent.join(' ');

            const result = applyBreakpoints(
                [{ content: joined, from: 1, to: 3 }],
                pages,
                normalizedContent,
                1,
                [''],
                'longer',
                patternProcessor,
            );

            // First piece should be page 1 only (no to), second piece can be pages 2-3 (fits maxPages=1).
            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ from: 1 });
            expect(result[0].to).toBeUndefined();
            expect(result[1]).toMatchObject({ from: 2, to: 3 });
        });

        it('should not hang and should return correct count on fast path (1000+ pages, maxPages=0, breakpoints=[""])', () => {
            // Regression guard for the 25k-page hang class: keep this small but above the fast-path threshold.
            const pageCount = 1005;
            const pages = Array.from({ length: pageCount }, (_, i) => ({ content: `P${i}`, id: i }));
            const normalizedContent = pages.map((p) => p.content);
            const joined = normalizedContent.join(' ');
            const segments: Segment[] = [{ content: joined, from: 0, to: pageCount - 1 }];

            const result = applyBreakpoints(segments, pages, normalizedContent, 0, [''], 'longer', patternProcessor);

            expect(result).toHaveLength(pageCount);
            expect(result[0]).toMatchObject({ from: 0 });
            expect(result.at(-1)).toMatchObject({ from: pageCount - 1 });
            expect(result.some((s) => s.to !== undefined)).toBe(false);
        });

        it('should respect maxPages by page ID span in offset fast path even when page IDs have gaps', () => {
            const pageCount = 1005;
            // Gapped page IDs: every next page is +2, so no pair fits maxPages=1 by ID span.
            const pages = Array.from({ length: pageCount }, (_, i) => ({ content: `P${i}`, id: i * 2 }));
            const normalizedContent = pages.map((p) => p.content);
            const joined = normalizedContent.join(' ');
            const segments: Segment[] = [{ content: joined, from: 0, to: (pageCount - 1) * 2 }];

            const result = applyBreakpoints(segments, pages, normalizedContent, 1, [''], 'longer', patternProcessor);

            expect(result).toHaveLength(pageCount);
            expect(result.every((s) => s.to === undefined)).toBe(true);
            expect(result[0].from).toBe(0);
            expect(result[1].from).toBe(2);
            expect(result[2].from).toBe(4);
            expect(result.at(-1)?.from).toBe((pageCount - 1) * 2);
        });

        it('should not advance page index based on overlapping content when maxPages=0 (position-based detection)', () => {
            // Reproduces the class of bug from src/index.test.ts:
            // after a sub-page split within page 0, the next piece can START with text that also
            // happens to be page 1's prefix. Content-based heuristics must NOT advance to page 1
            // until the actual page boundary is crossed.
            const shared = 'SHARED_PREFIX';
            const page0 = `${'x'.repeat(45)} ${shared} ${'y'.repeat(60)}`; // split should land before shared
            const page1 = `${shared} page1 starts here ${'z'.repeat(20)}`;
            const pages = [
                { content: page0, id: 0 },
                { content: page1, id: 1 },
            ];
            const normalizedContent = pages.map((p) => p.content);
            const joined = normalizedContent.join(' ');

            const result = applyBreakpoints(
                [{ content: joined, from: 0, to: 1 }],
                pages,
                normalizedContent,
                0,
                [''],
                'longer',
                patternProcessor,
                undefined,
                'space',
                undefined,
                50, // maxContentLength forces sub-page split within page0
            );

            expect(result.every((s) => s.to === undefined)).toBe(true);

            const firstFrom1 = result.findIndex((s) => s.from === 1);
            expect(firstFrom1).toBeGreaterThan(0);
            // Everything before the first page-1 segment must be attributed to page 0.
            expect(result.slice(0, firstFrom1).every((s) => s.from === 0)).toBe(true);

            // And we should have at least one piece within page0 that starts with the shared prefix,
            // proving we hit the dangerous "looks like next page" state while still inside page0.
            expect(result.some((s) => s.from === 0 && s.content.startsWith(shared))).toBe(true);
        });

        it('should preserve metadata from first piece only', () => {
            const pages = [
                { content: 'Content one', id: 1 },
                { content: 'Content two', id: 2 },
                { content: 'Content three', id: 3 },
            ];
            const segments: Segment[] = [
                { content: 'Content one\nContent two\nContent three', from: 1, meta: { type: 'section' }, to: 3 },
            ];
            const normalizedContent = pages.map((p) => p.content);

            const result = applyBreakpoints(segments, pages, normalizedContent, 1, [''], 'longer', patternProcessor);

            expect(result.length).toBeGreaterThanOrEqual(1);
            expect(result[0].meta).toEqual({ type: 'section' });
            if (result.length > 1) {
                expect(result[1].meta).toBeUndefined();
            }
        });

        it('should handle empty segment list', () => {
            const result = applyBreakpoints([], [], [], 2, [], 'longer', patternProcessor);
            expect(result).toEqual([]);
        });

        it('should handle single-page segments', () => {
            const pages = [{ content: 'Single page', id: 1 }];
            const segments: Segment[] = [{ content: 'Single page', from: 1 }];
            const normalizedContent = ['Single page'];

            const result = applyBreakpoints(segments, pages, normalizedContent, 0, [''], 'longer', patternProcessor);

            expect(result).toHaveLength(1);
            expect(result[0].from).toBe(1);
        });

        it('should apply pageJoiner space by default (replaces newlines with spaces)', () => {
            const pages = [
                { content: 'First page content', id: 1 },
                { content: 'Second page content', id: 2 },
                { content: 'Third page content', id: 3 },
            ];
            // Content with newlines between pages that will be broken and rejoined
            const segments: Segment[] = [
                { content: 'First page content\nSecond page content\nThird page content', from: 1, to: 3 },
            ];
            const normalizedContent = pages.map((p) => p.content);

            // maxPages=1 forces breaking, pageJoiner=space should replace newlines with spaces
            const result = applyBreakpoints(
                segments,
                pages,
                normalizedContent,
                1,
                [''],
                'longer',
                patternProcessor,
                undefined,
                'space',
            );

            expect(result.length).toBeGreaterThan(1);
            // Broken segments spanning multiple pages have newlines replaced with spaces
            for (const seg of result) {
                if (seg.to && seg.to > seg.from) {
                    // Should not have newlines at page boundaries (normalized to space)
                    expect(seg.content).not.toContain('\n');
                }
            }
        });

        it('should preserve newlines when pageJoiner is newline', () => {
            const pages = [
                { content: 'First page content', id: 1 },
                { content: 'Second page content', id: 2 },
                { content: 'Third page content', id: 3 },
            ];
            // Content with newlines between pages
            const segments: Segment[] = [
                { content: 'First page content\nSecond page content\nThird page content', from: 1, to: 3 },
            ];
            const normalizedContent = pages.map((p) => p.content);

            // maxPages=1 forces breaking, pageJoiner=newline preserves newlines
            const result = applyBreakpoints(
                segments,
                pages,
                normalizedContent,
                1,
                [''],
                'longer',
                patternProcessor,
                undefined,
                'newline',
            );

            expect(result.length).toBeGreaterThan(1);
            // When pageJoiner is 'newline', newlines at page boundaries are preserved
            for (const seg of result) {
                if (seg.to && seg.to > seg.from) {
                    expect(seg.content).toContain('\n');
                }
            }
        });

        it('should not over-split remaining content within current page when maxPages=0 and maxContentLength is set', () => {
            // BUG FIX: When maxPages=0 and remaining content on the current page fits within maxContentLength,
            // it should NOT keep splitting. The bug was that remainingSpan was computed using toIdx
            // (the original segment's end page) instead of the ACTUAL end page of remaining content.
            //
            // This test verifies correct behavior:
            // - Page 0 has 352 chars with whitespace at positions 150 and 301
            // - maxContentLength=200 forces splitting at whitespace boundaries
            // - Expected: 3 segments from page 0 (150, 150, 50), 1 from page 1 (100)
            const page0Content = 'A'.repeat(150) + ' ' + 'B'.repeat(150) + ' ' + 'C'.repeat(50);
            const page1Content = 'D'.repeat(100);
            const pages = [
                { content: page0Content, id: 0 },
                { content: page1Content, id: 1 },
            ];
            const normalizedContent = [page0Content, page1Content];
            const joined = normalizedContent.join(' ');
            const segments: Segment[] = [{ content: joined, from: 0, to: 1 }];

            const result = applyBreakpoints(
                segments,
                pages,
                normalizedContent,
                0, // maxPages=0: each segment must be from single page
                [''], // page boundary fallback
                'longer',
                patternProcessor,
                undefined,
                'space',
                undefined,
                200, // maxContentLength=200: splits within page 0
            );

            const page0Segments = result.filter((s) => s.from === 0);
            const page1Segments = result.filter((s) => s.from === 1);

            // Page 0: splits at whitespace 150, 301 → 3 segments (150, 150, 50)
            // Page 1: 100 chars fits → 1 segment
            expect(page0Segments.length).toBe(3);
            expect(page1Segments.length).toBe(1);
            // All segments should be <= 200 chars
            for (const seg of result) {
                expect(seg.content.length).toBeLessThanOrEqual(200);
            }
            // No segment should span multiple pages (maxPages=0)
            for (const seg of result) {
                expect(seg.to).toBeUndefined();
            }
        });

        it('should not fragment page 0 into tiny segments when page 1 is added (BUG REGRESSION)', () => {
            // BUG: Adding a second page caused page 0 to be over-split into tiny fragments
            // even when page 0's remaining content fit within maxContentLength.
            //
            // ROOT CAUSE: When segment spanned multiple pages (page 0 + page 1),
            // the code checked ALL remaining content's span (which crosses pages),
            // instead of just the CURRENT page's remaining content.
            //
            // SYMPTOM: With only page 0, segments were normal (e.g., ~800 chars each).
            //          With page 0 + page 1, page 0 got over-split into tiny fragments
            //          (e.g., 147, 229, 65 chars) because breakpoints kept triggering.
            //
            // THIS TEST FAILS WITHOUT THE FIX - it produces tiny fragments on page 0.

            // Page 0: 1500 chars with punctuation at 800 and 1400
            const page0Content = 'A'.repeat(800) + '. ' + 'B'.repeat(600) + '. ' + 'C'.repeat(96);
            // Page 1: 500 chars (fits within maxContentLength)
            const page1Content = 'D'.repeat(500);

            const pages = [
                { content: page0Content, id: 0 },
                { content: page1Content, id: 1 },
            ];
            const normalizedContent = [page0Content, page1Content];
            const joined = normalizedContent.join(' ');
            const segments: Segment[] = [{ content: joined, from: 0, to: 1 }];

            const result = applyBreakpoints(
                segments,
                pages,
                normalizedContent,
                0, // maxPages=0
                ['\\.'], // punctuation breakpoint
                'longer',
                patternProcessor,
                undefined,
                'space',
                undefined,
                1000, // maxContentLength=1000
            );

            // EXPECTED BEHAVIOR:
            // - Page 0 (1500 chars): split at punctuation → 2 segments (~800, ~700 chars)
            // - Page 1 (500 chars): fits within 1000 → 1 segment
            //
            // BUG BEHAVIOR (without fix):
            // - Page 0 would get over-split into many tiny segments (147, 229, 65, etc.)
            // - because breakpoints kept triggering even when not needed

            const page0Segments = result.filter((s) => s.from === 0);
            const page1Segments = result.filter((s) => s.from === 1);

            // Page 0 should have exactly 2 segments (split at punctuation)
            expect(page0Segments.length).toBe(2);
            // Page 1 should have exactly 1 segment
            expect(page1Segments.length).toBe(1);

            // No tiny fragments - all page 0 segments should be substantial
            for (const seg of page0Segments) {
                expect(seg.content.length).toBeGreaterThan(500);
            }

            // All segments within maxContentLength
            for (const seg of result) {
                expect(seg.content.length).toBeLessThanOrEqual(1000);
            }

            // No multi-page segments
            for (const seg of result) {
                expect(seg.to).toBeUndefined();
            }
        });
    });
});
