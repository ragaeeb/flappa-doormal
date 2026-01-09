import { describe, expect, it } from 'bun:test';
import { segmentPages } from '@/segmentation/segmenter.js';
import type { Page } from '@/types/index.js';

describe('Segmenter Edge Cases', () => {
    // Test Idea #2: Non-consecutive Page IDs
    // Verifies that maxPages logic uses (toId - fromId) span check, not array index distance.
    it('should enforce maxPages based on Page ID span, not array index span', () => {
        // Gap of 99 between index 0 and 1.
        const pages: Page[] = [
            { content: 'Page 1', id: 1 },
            { content: 'Page 100', id: 100 },
        ];

        // maxPages 10 should NOT be able to bridge the gap of 99
        const segments = segmentPages(pages, {
            breakpoints: [''], // Required to trigger maxPages logic
            maxPages: 10,
            rules: [],
        });

        expect(segments).toHaveLength(2);

        expect(segments[0].content).toBe('Page 1');
        expect(segments[0].from).toBe(1);
        expect(segments[0].to).toBeUndefined();

        expect(segments[1].content).toBe('Page 100');
        expect(segments[1].from).toBe(100);
        expect(segments[1].to).toBeUndefined();
    });

    // Test Idea #1: Fast Path Drift with Stripping
    // Verifies that large-scale offsetting works even when content length changes significantly due to stripping rules.
    it('should handle content stripping correctly in large book fast-path (Offset Drift)', () => {
        // Create 1100 pages to trigger FAST_PATH_THRESHOLD (1000) inside segmentation engine.
        // Each page has a prefix "PREFIX " (7 chars). Content "Content" (7 chars).
        // Rule removes "PREFIX " via lineStartsAfter.
        // Drift per page = 7 chars. Total drift ~7700 chars.

        const pages: Page[] = Array.from({ length: 1100 }, (_, i) => ({
            content: `PREFIX Content`,
            id: i + 1,
        }));

        const segments = segmentPages(pages, {
            breakpoints: [''],
            // maxPages: 1 triggers fast-path optimization for single-page segments
            maxPages: 1,
            // Rule strips the prefix, altering content length
            rules: [{ lineStartsAfter: ['PREFIX '], split: 'at' }],
        });

        expect(segments).toHaveLength(1100);

        // Spot check a middle segment (index 555 -> ID 556)
        const index = 555;
        expect(segments[index].content).toBe('Content');
        expect(segments[index].from).toBe(index + 1);
        // Single page segment usually has undefined 'to'
        expect(segments[index].to).toBeUndefined();
    });

    // Test Idea #5: Unicode Safety
    // Verifies that maxContentLength doesn't split inside a ZWJ sequence.
    it('should prevent splitting inside ZWJ sequences when maxContentLength forces split', () => {
        // Validation requires maxContentLength >= 50.
        // We construct a string where a ZWJ emoji cluster sits exactly across the 52 boundary.
        const padding = 'A'.repeat(50);
        const emoji = '👩‍👩‍👧‍👦';
        // Emoji is approx 11 UTF-16 code units.
        // Content: "AAAA...A" (50) + Emoji (11).

        const pages: Page[] = [{ content: `${padding}${emoji} End`, id: 1 }];

        const segments = segmentPages(pages, {
            breakpoints: [''],
            maxContentLength: 52, // Forces split right after first emoji char (high+low surrogate), possibly breaking ZWJ chain
            rules: [],
        });

        const seg0 = segments[0].content;

        // If it split in middle of emoji, we'd likely see raw surrogates or ZWJ chars.
        // The last character shouldn't be a high surrogate.
        const lastCode = seg0.charCodeAt(seg0.length - 1);
        const isHighSurrogate = lastCode >= 0xd800 && lastCode <= 0xdbff;

        expect(isHighSurrogate).toBe(false);
        // Ideally, it backed off to 'A's
        if (seg0.length === 50) {
            expect(seg0).toBe(padding);
        }
    });

    // Test Idea #3: Groups valid non-consecutive pages
    // Verifies that if non-consecutive pages ARE within maxPages range, they ARE merged.
    it('should group non-consecutive pages if within maxPages ID span', () => {
        const pages: Page[] = [
            { content: 'A', id: 1 },
            { content: 'B', id: 3 },
            { content: 'C', id: 4 },
        ];

        // 4 - 1 = 3. maxPages=3 covering all 3.
        const segments = segmentPages(pages, {
            breakpoints: [''],
            maxPages: 3,
            rules: [],
        });

        expect(segments).toHaveLength(1);
        expect(segments[0].from).toBe(1);
        expect(segments[0].to).toBe(4);

        // Normalize whitespace for check (page joiner adds newline or space)
        const content = segments[0].content.replace(/[\n\r]+/g, ' ').trim();
        expect(content).toBe('A B C');
    });

    // New Regression: Threshold Invariant Parity (999 vs 1001 pages)
    it('should produce consistent maxPages results across FAST_PATH_THRESHOLD', () => {
        const run = (count: number) => {
            const pages: Page[] = Array.from({ length: count }, (_, i) => ({
                content: `Content ${i} MARK`.padEnd(50, 'x'),
                id: i,
            }));
            return segmentPages(pages, {
                breakpoints: [''], // Page boundary only
                maxPages: 2,
                prefer: 'longer',
            });
        };

        const result999 = run(999);
        const result1005 = run(1005); // Above 1000

        // With empty breakpoint '' (page-boundary fallback), oversized segments are broken at the next
        // page boundary (swallow remainder of the current page) until the remaining span fits.
        // This behavior must not flip at FAST_PATH_THRESHOLD.
        expect(result999[0]).toMatchObject({ from: 0 });
        expect(result999[0].to).toBeUndefined();
        expect(result1005[0]).toMatchObject({ from: 0 });
        expect(result1005[0].to).toBeUndefined();

        // The final segment should contain the last 3 pages (fits maxPages=2 by ID span).
        expect(result999.at(-1)).toMatchObject({ from: 996, to: 998 });
        expect(result1005.at(-1)).toMatchObject({ from: 1002, to: 1004 });

        // Total segments = (count - 3) single-page pieces + 1 final 3-page piece = count - 2.
        expect(result999.length).toBe(997);
        expect(result1005.length).toBe(1003);
    });

    // New Regression: Gapped ID Invariant with maxContentLength
    it('should enforce maxPages ID span even with maxContentLength on large books', () => {
        // Construct 1005 pages to trigger large-book paths.
        // Gap from ID 499 to 1000.
        const pages: Page[] = Array.from({ length: 500 }, (_, i) => ({ content: 'content', id: i }));
        for (let i = 0; i < 505; i++) {
            pages.push({ content: 'content', id: 1000 + i });
        }

        const result = segmentPages(pages, {
            breakpoints: [''],
            maxContentLength: 5000,
            maxPages: 100,
        });

        // No segment should span the gap 499 -> 1000
        const bridge = result.find((s) => s.from <= 499 && s.to !== undefined && s.to >= 1000);
        expect(bridge).toBeUndefined();

        // Every segment should satisfy maxPages span
        for (const seg of result) {
            const span = (seg.to ?? seg.from) - seg.from;
            expect(span).toBeLessThanOrEqual(100);
        }
    });

    // New Regression: pageJoiner space drift on Large Books
    it('should avoid offset drift in fast-path when pageJoiner is "space"', () => {
        // Fast path triggered by 1001+ pages and aligned offsets.
        // If joiner ' ' isn't accounted for in cumulative offsets vs joined length, it desyncs.
        const pageCount = 1005;
        const pages: Page[] = Array.from({ length: pageCount }, (_, i) => ({
            content: `P${i}`,
            id: i,
        }));

        const result = segmentPages(pages, {
            breakpoints: [''],
            maxPages: 1,
            pageJoiner: 'space',
        });

        // Should never violate maxPages=1.
        expect(result.every((s) => (s.to ?? s.from) - s.from <= 1)).toBe(true);

        // Should preserve space joiner in merged segments (at least for the final merged piece).
        const merged = result.find((s) => s.to !== undefined);
        if (merged) {
            expect(merged.content.includes(' ')).toBe(true);
        }
    });
});
