import { describe, expect, it } from 'bun:test';
import type { Page } from '@/types/index.js';
import { segmentPages } from './segmenter';

describe('Max Content Length Segmentation', () => {
    // Helper to generate long content with markers
    const generateLongContent = (length: number, markers: { offset: number; text: string }[]) => {
        let content = 'x'.repeat(length);
        // Apply markers in reverse to not shift offsets
        const sortedMarkers = [...markers].sort((a, b) => b.offset - a.offset);
        for (const marker of sortedMarkers) {
            content = content.slice(0, marker.offset) + marker.text + content.slice(marker.offset);
        }
        return content;
    };

    it('should split at safe boundaries when maxContentLength is exceeded', () => {
        // Content is 120 chars, limit is 50. Should split at the dot at index 45.
        const content = generateLongContent(120, [{ offset: 45, text: '. ' }]);
        const pages: Page[] = [{ content, id: 1 }];

        const result = segmentPages(pages, {
            breakpoints: ['\\. '],
            maxContentLength: 60,
        });

        // Should split at the dot
        expect(result.length).toBeGreaterThan(1);
        expect(result[0].content).toContain('.');
        expect(result[0].content.length).toBeLessThanOrEqual(60);
    });

    it('should fall back to whitespace split if no breakpoints match', () => {
        const content =
            'This is a long sentence that should be split at some whitespace because it exceeds fifty chars.'.repeat(2);
        const pages: Page[] = [{ content, id: 1 }];

        const result = segmentPages(pages, {
            breakpoints: ['MISSING_PATTERN'],
            maxContentLength: 60,
        });

        expect(result.length).toBeGreaterThan(1);
        expect(result[0].content.length).toBeLessThanOrEqual(60);
        expect(result[0].content).toContain('sentence');
    });

    it('should fall back to unicode boundary if no whitespace found', () => {
        const content =
            'VeryLongContentWithoutAnySpacesToTestHardSplitFallbackForUnicodeBoundariesAndItNeedsToBeAtLeastOneHundredCharsLong'.repeat(
                1,
            );
        const pages: Page[] = [{ content, id: 1 }];

        const result = segmentPages(pages, {
            breakpoints: [],
            maxContentLength: 60,
        });

        expect(result.length).toBeGreaterThan(1);
        expect(result[0].content.length).toBeLessThanOrEqual(60);
    });

    it('should respect maxContentLength across page boundaries', () => {
        const pages: Page[] = [
            { content: 'Page 1 has some content that is quite long and should exceed the limit.'.repeat(2), id: 1 },
            {
                content: 'Page 2 also has very long content to ensure it triggers the split logic correctly.'.repeat(2),
                id: 2,
            },
        ];

        const result = segmentPages(pages, {
            maxContentLength: 60,
        });

        expect(result.length).toBeGreaterThan(2);
        expect(result[0].content.length).toBeLessThanOrEqual(60);
    });

    it('should prioritize breakpoints over simple length splits', () => {
        // Limit 80.
        // First dot at 40.
        // Second dot at 90.
        // Whitespace at 75.
        // Should pick dot at 40 because second dot is too far.
        const content =
            'First sentence with enough length to be significant. Second sentence that also has significant length and is long. Third sentence.';
        const pages: Page[] = [{ content, id: 1 }];

        const result = segmentPages(pages, {
            breakpoints: ['\\. '],
            maxContentLength: 80,
        });

        expect(result[0].content).toBe('First sentence with enough length to be significant.');
        expect(result[1].content).toBe('Second sentence that also has significant length and is long. Third sentence.');
    });

    it('should handle maxContentLength correctly for multiple segments', () => {
        const content = 'abc def ghi jkl mno pqr stu vwx yz '.repeat(5);
        const pages: Page[] = [{ content, id: 1 }];

        const result = segmentPages(pages, {
            maxContentLength: 50,
        });

        expect(result.length).toBeGreaterThan(3);
        for (const seg of result) {
            expect(seg.content.length).toBeLessThanOrEqual(50);
        }
    });

    it('should avoid producing segments that start with a combining mark when hard-splitting', () => {
        // 'a' + combining acute accent + 'b'
        const content = 'a\u0301b '.repeat(40);
        const pages: Page[] = [{ content, id: 1 }];

        const result = segmentPages(pages, {
            maxContentLength: 50,
        });

        for (const seg of result) {
            const firstChar = seg.content[0];
            expect(firstChar).not.toBe('\u0301');
        }
    });

    describe('debug metadata for maxContentLength splits', () => {
        it('should include contentLengthSplit in debug meta when enabled and split due to maxContentLength', () => {
            const content =
                'This is a long sentence without enough periods to match breakpoints within the limit.'.repeat(2);
            const pages: Page[] = [{ content, id: 1 }];

            const result = segmentPages(pages, {
                breakpoints: ['\\. '],
                debug: true,
                maxContentLength: 60,
            });

            expect(result[0].meta?._flappa).toBeDefined();
            const flappa = (result[0].meta?._flappa as any).contentLengthSplit;
            expect(flappa).toBeDefined();
            expect(flappa.maxContentLength).toBe(60);
        });

        it('should include breakpoint in debug meta when split was due to breakpoint pattern', () => {
            const content = 'Word. '.repeat(20);
            const pages: Page[] = [{ content, id: 1 }];

            const result = segmentPages(pages, {
                breakpoints: ['\\. '],
                debug: true,
                maxContentLength: 60,
            });

            expect(result[0].meta?._flappa).toBeDefined();
            const flappa = result[0].meta?._flappa as any;
            expect(flappa.breakpoint).toBeDefined();
            expect(flappa.breakpoint.pattern).toBe('\\. ');
        });

        it('should include unicode_boundary as splitReason when no whitespace found', () => {
            const content =
                'VeryLongStringWithoutAnySafeSplitPointsLikeWhitespaceOrPunctuationToTriggerUnicodeSplitReason'.repeat(
                    2,
                );
            const pages: Page[] = [{ content, id: 1 }];

            const result = segmentPages(pages, {
                debug: true,
                maxContentLength: 60,
            });

            const flappa = (result[0].meta?._flappa as any).contentLengthSplit;
            expect(flappa.splitReason).toBe('unicode_boundary');
        });

        it('should track different breakpoints across multiple segments if triggered by length', () => {
            const content = 'First. '.repeat(10) + 'Second! '.repeat(10);
            const pages: Page[] = [{ content, id: 1 }];

            const result = segmentPages(pages, {
                breakpoints: ['\\. ', '! '],
                debug: true,
                maxContentLength: 50,
            });

            // Each piece should be roughly 49 chars (7 blocks of 'First. ') or similar.
            expect((result[0].meta?._flappa as any).breakpoint.pattern).toBe('\\. ');

            const firstExclamation = result.find((s) => s.content.includes('Second!'));
            if (firstExclamation) {
                expect((firstExclamation.meta?._flappa as any).breakpoint.pattern).toBe('! ');
            }
        });
    });
});
