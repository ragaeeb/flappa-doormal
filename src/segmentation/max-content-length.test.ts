import { describe, expect, it } from 'bun:test';
import { segmentPages } from './segmenter';
import type { Page } from './types';

describe('Max Content Length Segmentation', () => {
    // Helper to generate long content with markers
    const generateContent = (length: number, markerInterval: number, marker = '.') => {
        let content = '';
        while (content.length < length) {
            const chunk = 'x'.repeat(markerInterval - 1) + marker;
            content += chunk;
        }
        return content.slice(0, length);
    };

    it('should split a single large page based on maxContentLength', () => {
        // 500 chars, marker every 100.
        // Max length 250. Should split at 200 (2nd marker).
        const content = generateContent(500, 100, '.'); // "xx...x.xx...x."
        const pages: Page[] = [{ content, id: 0 }];

        const result = segmentPages(pages, {
            breakpoints: ['\\.'],
            maxContentLength: 250,
            prefer: 'longer',
        });

        // Expect roughly 2 segments (or 3 if residue).
        // 500 total. split at ~200.
        // Seg 1: 0-200 (length 200)
        // Seg 2: 200-400 (length 200)
        // Seg 3: 400-500 (length 100)

        expect(result.length).toBeGreaterThanOrEqual(2);
        for (const seg of result) {
            expect(seg.content.length).toBeLessThanOrEqual(250);
            expect(seg.from).toBe(0);
            expect(seg.to).toBeUndefined(); // Single page segment
        }
    });

    it('should respect "prefer: longer" by filling the bucket', () => {
        // Markers at 100, 200, 300, 400.
        // Max 350.
        // 'longer' should pick 300.
        const content = generateContent(500, 100, '.');
        const pages: Page[] = [{ content, id: 0 }];

        const result = segmentPages(pages, {
            breakpoints: ['\\.'],
            maxContentLength: 350,
            prefer: 'longer',
        });

        // First segment should be ~300 chars long, not 100.
        expect(result[0].content.length).toBe(300);
    });

    it('should respect "prefer: shorter" by splitting early', () => {
        // Markers at 100, 200, 300.
        // Max 350.
        // 'shorter' should pick 100.
        const content = generateContent(500, 100, '.');
        const pages: Page[] = [{ content, id: 0 }];

        const result = segmentPages(pages, {
            breakpoints: ['\\.'],
            maxContentLength: 350,
            prefer: 'shorter',
        });

        // First segment should be 100 chars long.
        expect(result[0].content.length).toBe(100);
    });

    it('should respect the intersection of maxPages and maxContentLength', () => {
        // 3 pages. Each 1000 chars. Total 3000.
        // maxPages = 2 (allows 2000 chars).
        // maxContentLength = 500 (stricter!).
        // Should split every 500 chars.

        const pages: Page[] = [
            { content: 'a'.repeat(1000), id: 0 },
            { content: 'b'.repeat(1000), id: 1 },
            { content: 'c'.repeat(1000), id: 2 },
        ];

        const result = segmentPages(pages, {
            breakpoints: [''], // Any break
            maxContentLength: 500,
            maxPages: 2,
        });

        // Each segment must be <= 500 chars.
        for (const seg of result) {
            expect(seg.content.length).toBeLessThanOrEqual(500);
        }
        // At least 6 segments.
        expect(result.length).toBeGreaterThanOrEqual(6);
    });

    it('should fall back to hard split if no breakpoint matches', () => {
        // 500 chars, NO markers.
        // Max 250.
        // Should split at 250 exactly (force break or fallback).
        // Note: Existing breakpoint logic usually requires at least one match or falls back to 'windowEnd'.
        // If breakpoints=[''] it matches everything? No, '' matches page boundary.
        // If we provide regex that doesn't match, expected behavior is "windowEnd" fallback?
        // Let's rely on standard logic: findBreakOffsetForWindow returns windowEndPosition if no match.

        const content = 'x'.repeat(500);
        const pages: Page[] = [{ content, id: 0 }];

        const result = segmentPages(pages, {
            breakpoints: ['z'], // Won't match
            maxContentLength: 250,
        });

        expect(result.length).toBe(2);
        expect(result[0].content.length).toBe(250);
        expect(result[1].content.length).toBe(250);
    });

    it('should handle character constraints across multiple pages (with safe breaks)', () => {
        // Page 1: 100 chars
        // Page 2: 100 chars (with spaces)
        // Max length: 150.
        // Should merge P1 + part of P2, breaking at a space.

        const p1 = 'a'.repeat(100);
        // "dddd dddd..." to allow safe breaks
        const p2 = Array(20).fill('dddd').join(' ');
        const pages: Page[] = [
            { content: p1, id: 0 },
            { content: p2, id: 1 },
        ];

        const result = segmentPages(pages, {
            breakpoints: [''],
            maxContentLength: 150,
            pageJoiner: 'space',
        });

        // Should break near 150 but at a space
        expect(result[0].content.length).toBeLessThanOrEqual(150);
        expect(result[0].content.length).toBeGreaterThan(140);
        expect(result[0].to).toBe(1);
    });

    it('should split based on maxPages=1 when it is the stricter constraint', () => {
        // Scenario 1: maxPages=1 is hit first.
        // 3 pages, each 100 chars.
        // maxPages: 1 (allows up to 2 pages joined).
        // maxContentLength: 1000 (loose).
        // Should split into [Page 0+1] and [Page 2].

        const pages: Page[] = [
            { content: 'a'.repeat(100), id: 0 },
            { content: 'b'.repeat(100), id: 1 },
            { content: 'c'.repeat(100), id: 2 },
        ];

        const result = segmentPages(pages, {
            breakpoints: [''], // Page boundary breakpoint
            maxContentLength: 1000,
            maxPages: 1,
            prefer: 'longer', // Greedy fill
        });

        // expected: 2 segments.
        // Seg 1: 0-1 (span 1). Length 201 (with space joiner).
        // Seg 2: 2 (span 0). Length 100.
        expect(result.length).toBe(2);

        // Check seg 1
        expect(result[0].from).toBe(0);
        expect(result[0].to).toBe(1);
        expect(result[0].content.length).toBeGreaterThan(200);

        // Check seg 2
        expect(result[1].from).toBe(2);
        expect(result[1].to).toBeUndefined(); // or 2
    });

    it('should split based on maxContentLength when it is the stricter constraint (with maxPages=1)', () => {
        // Scenario 2: maxContentLength is hit first.
        // 1 large page (300 chars).
        // maxPages: 1 (allows chunking this page easily since span is 0).
        // maxContentLength: 100 (strict).
        // Should split every 100 chars.

        const content = 'x'.repeat(300);
        const pages: Page[] = [{ content, id: 0 }];

        const result = segmentPages(pages, {
            breakpoints: ['Z'], // Force split
            maxContentLength: 100,
            maxPages: 1,
            prefer: 'longer',
        });

        expect(result.length).toBe(3);
        expect(result[0].content.length).toBe(100);
        expect(result[1].content.length).toBe(100);
        expect(result[2].content.length).toBe(100);
    });
    it('should fall back to safe split (whitespace) instead of hard split when possible', () => {
        // "aaaaa " (6 chars) repeated 20 times = 120 chars.
        // maxContentLength: 100.
        // Hard split at 100 would be index 100.
        // 100 / 6 = 16.666.
        // 16 * 6 = 96.
        // At index 96, we have a space.
        // Index 97='a', 98='a', 99='a', 100='a'.
        // Hard split at 100 cuts 'aaaaa' at 4th char.
        // Safe split should back up to space at 96.

        const word = 'aaaaa ';
        const content = word.repeat(20); // 120 chars
        const pages: Page[] = [{ content, id: 0 }];

        const result = segmentPages(pages, {
            breakpoints: ['Z'], // No match
            maxContentLength: 100,
        });

        // Expect split at 96 (length 96).
        // BUT createSegment trims trailing whitespace!
        // So the trailing space at index 95 is removed.
        // Result length = 95.
        expect(result[0].content.length).toBe(95);
        expect(result[0].content.endsWith('a')).toBe(true);

        // Second segment starts after the cut.
        // Cut was at 96.
        // Remaining content: chars 96..120. (24 chars).
        // 96 is 'a' (start of next word).
        // 24 chars left.
        expect(result[1].content.length).toBe(23);
    });
    it('should throw an error if maxContentLength is less than 50', () => {
        const pages: Page[] = [{ content: 'test', id: 0 }];
        expect(() => {
            segmentPages(pages, { maxContentLength: 49 });
        }).toThrow(/maxContentLength must be at least 50 characters/);
    });
});
