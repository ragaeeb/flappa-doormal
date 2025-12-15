import { describe, expect, it } from 'bun:test';

import { dedupeSplitPoints, ensureFallbackSegment } from './segmenter';

describe('segmenter utils', () => {
    describe('dedupeSplitPoints', () => {
        it('should prefer split points with contentStartOffset at same index', () => {
            const splitPoints = [
                { index: 10, meta: { a: 1 } },
                { index: 10, contentStartOffset: 3 },
            ];

            const result = dedupeSplitPoints(splitPoints as never);
            expect(result).toHaveLength(1);
            expect(result[0].index).toBe(10);
            expect(result[0].contentStartOffset).toBe(3);
        });

        it('should prefer split points with meta over those without at same index', () => {
            const splitPoints = [
                { index: 10 },
                { index: 10, meta: { type: 'chapter' } },
            ];

            const result = dedupeSplitPoints(splitPoints as never);
            expect(result).toHaveLength(1);
            expect(result[0].meta).toEqual({ type: 'chapter' });
        });
    });

    describe('ensureFallbackSegment', () => {
        it('should return a single spanning segment when no segments were produced', () => {
            const pages = [
                { id: 1, content: 'A' },
                { id: 3, content: 'B' },
            ];
            const normalizedContent = ['A', 'B'];
            const segments = ensureFallbackSegment([], pages as never, normalizedContent, 'space');
            expect(segments).toHaveLength(1);
            expect(segments[0]).toMatchObject({ content: 'A B', from: 1, to: 3 });
        });
    });
});


