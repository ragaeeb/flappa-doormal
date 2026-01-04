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

    it('should handle character constraints across multiple pages', () => {
        // Page 1: 100 chars
        // Page 2: 100 chars
        // Max length: 150.
        // Should merge P1 + half P2.
        // This confirms we are looking at cumulative length.

        const p1 = 'a'.repeat(100);
        const p2 = 'b'.repeat(100);
        const pages: Page[] = [
            { content: p1, id: 0 },
            { content: p2, id: 1 },
        ];

        const result = segmentPages(pages, {
            breakpoints: [''],
            maxContentLength: 150,
            pageJoiner: 'space', // p1 + " " + p2 = 201 chars
        });

        // Seg 1 gets P1 (100) + space (1) + 49 chars of P2 = 150 total.
        expect(result[0].content.length).toBe(150);
        expect(result[0].from).toBe(0);
        expect(result[0].to).toBe(1);
    });
});
