import { describe, expect, it } from 'bun:test';
import { applyBreakpoints, computeNextFromIdx, computeWindowEndIdx } from './breakpoint-processor.js';
import type { NormalizedPage } from './breakpoint-utils.js';
import type { Segment } from './types.js';

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

        it('should apply pageJoiner space by default', () => {
            const pages = [
                { content: 'First', id: 1 },
                { content: 'Second', id: 2 },
            ];
            const segments: Segment[] = [{ content: 'First\nSecond', from: 1, to: 2 }];
            const normalizedContent = ['First', 'Second'];

            const result = applyBreakpoints(segments, pages, normalizedContent, 2, [], 'longer', patternProcessor);

            expect(result).toHaveLength(1);
            // Content should have page join normalized
        });
    });
});
