import { describe, expect, it } from 'bun:test';
// Real data from Sahih al-Bukhari (book.json)
import bookData from '../../book.json';

import { htmlToMarkdown } from './html';
import { segmentPages } from './segmenter';
import type { PageInput, SplitRule } from './types';

describe('segmenter with real Bukhari data', () => {
    // Convert book.json pages to PageInput format with HTML converted to Markdown
    const allPages: PageInput[] = bookData.pages.map((p) => ({ content: htmlToMarkdown(p.content), id: p.id }));

    // Get specific entries by ID for testing
    const getById = (id: number) => allPages.find((p) => p.id === id);
    const entry1 = getById(1)!;
    const entry2 = getById(2)!;
    const entry3 = getById(3)!;
    const entry8 = getById(8)!; // This is page 5 content (intro symbols)
    const entry9 = getById(9)!; // Page 6 content

    describe('punctuation-based segmentation for intro pages (max: 8)', () => {
        const punctuationRule: SplitRule = {
            max: 8,
            maxSpan: 1, // Per-page occurrence filtering
            occurrence: 'last',
            regex: '[،.؟!]\\s*',
            split: 'after',
        };

        it('should find the last Arabic comma in page 2 content', () => {
            // Page 2 content ends with "سلطان المسلمين" - there's a comma before it
            const result = segmentPages([entry2], { rules: [punctuationRule] });

            // Should have 2 segments: everything up to and including last comma, then remainder
            expect(result).toHaveLength(2);
            expect(result[0].from).toBe(2);
            expect(result[1].from).toBe(2);

            // First segment should end with a comma (،)
            expect(result[0].content).toMatch(/،\s*$/);

            // Second segment should be the text after the last comma
            expect(result[1].content).toContain('سلطان المسلمين');
        });

        it('should replicate real test', () => {
            const segments = segmentPages(allPages, {
                rules: [
                    // Editor's introduction (pages 1-8): split on last punctuation per page
                    { max: 8, maxSpan: 1, occurrence: 'last', regex: '[؛.،؟!]\\s*', split: 'after' },
                    // Chapter headings: Markdown headers (converted from HTML title spans)
                    { lineStartsWith: ['## ', 'بَابُ'], meta: { type: 'chapter' }, min: 9, split: 'before' },
                    // Hadith entries: Arabic number + dash (using {{raqms}} token)
                    { min: 9, split: 'before', template: '^{{raqms}} {{dash}} ' },
                ],
            });

            // With htmlToMarkdown preprocessing, we get more segments due to ## header detection
            expect(segments).toHaveLength(34);

            expect(segments[0]).toMatchObject({ from: 1, to: 2 });
            // Content now includes ## headers from htmlToMarkdown conversion
            expect(segments[0].content).toContain('(هذا نص التقرير)');

            expect(segments.at(-1)).toMatchObject({ from: 11208 });
            // Verify it's the last hadith (7563) and ends with the expected text
            expect(segments.at(-1)!.content).toMatch(/^٧٥٦٣/);
            expect(segments.at(-1)!.content).toMatch(/سُبْحَانَ اللهِ الْعَظِيمِ\.»$/);
        });

        it('should find the last period in page 3 content', () => {
            // Page 3 ends with "بعلم الحديث." (has a period at the end)
            const result = segmentPages([entry3], { rules: [punctuationRule] });

            // Since it ends with punctuation, we should get 1 segment (nothing after last punct)
            // or 2 if there's whitespace after
            expect(result.length).toBeGreaterThanOrEqual(1);
            expect(result[0].from).toBe(3);

            // Content should include the scholars list
            expect(result[0].content).toContain('الأستاذ الشيخ');
        });

        it('should segment entry8 (page 5 content) at its last punctuation', () => {
            // Entry8 (id=8) has page 5 content with multiple sentences and punctuation
            const result = segmentPages([entry8], { rules: [punctuationRule] });

            expect(result.length).toBeGreaterThanOrEqual(1);
            expect(result[0].from).toBe(8);

            // Should include symbols explanation text
            expect(result[0].content).toContain('رموز');
        });

        it('should segment multiple intro pages together', () => {
            // Pages 1, 2, 3, 5 are intro pages (max: 8 applies)
            const introPages = allPages.filter((p) => p.id <= 5);

            const result = segmentPages(introPages, { rules: [punctuationRule] });

            // Should produce multiple segments across the intro pages
            expect(result.length).toBeGreaterThan(1);

            // First segment should start from page 1
            expect(result[0].from).toBe(1);

            // Should have segments from different pages
            const pagesInSegments = new Set(result.map((s) => s.from));
            expect(pagesInSegments.size).toBeGreaterThan(1);
        });
    });

    describe('hadith detection with Arabic numerals (min: 10)', () => {
        // Use min: 10 so entry9 (id=9) is excluded and entries with ids >= 10 are included
        const hadithRule: SplitRule = { min: 10, split: 'before', template: '^{{raqms}} {{dash}} ' };

        it('should NOT detect hadiths on entry9 (id=9 is below min: 10)', () => {
            // Entry 9 (page 6 content) has hadith markers but id=9 < min=10
            const result = segmentPages([entry9], { rules: [hadithRule] });

            // Should return empty because id 9 < min 10
            expect(result).toHaveLength(0);
        });

        it('should detect hadiths on entries with IDs >= 10', () => {
            // Get entries with hadiths (ids 30-38 have page 12 content with hadiths 14-18)
            const hadithEntries = allPages.filter((p) => p.id >= 30 && p.id <= 38);

            const result = segmentPages(hadithEntries, { rules: [hadithRule] });

            // Should detect hadith entries (those starting with Arabic numbers)
            const hadithSegments = result.filter((s) => s.content.match(/^[٠-٩]+\s*[-–—]/));
            expect(hadithSegments.length).toBeGreaterThan(0);

            // Each hadith segment should start with Arabic numeral
            for (const seg of hadithSegments) {
                expect(seg.content).toMatch(/^[٠-٩]+/);
            }
        });

        it('should extract specific hadith numbers', () => {
            // Entries with ids 30-38 have page 12 content with hadiths 14, 15, 16, 17, 18
            const hadithEntries = allPages.filter((p) => p.id >= 30 && p.id <= 38);

            const result = segmentPages(hadithEntries, { rules: [hadithRule] });

            // Find hadith 14
            const hadith14 = result.find((s) => s.content.startsWith('١٤'));
            expect(hadith14).toBeDefined();
            // Hadiths contain narrator chain - check for Arabic numeral + dash pattern in content
            expect(hadith14!.content).toMatch(/^١٤\s*[-–—]/);

            // Find hadith 15
            const hadith15 = result.find((s) => s.content.startsWith('١٥'));
            expect(hadith15).toBeDefined();
            expect(hadith15!.content).toMatch(/^١٥\s*[-–—]/);

            // Find hadith 16
            const hadith16 = result.find((s) => s.content.startsWith('١٦'));
            expect(hadith16).toBeDefined();
            expect(hadith16!.content).toMatch(/^١٦\s*[-–—]/);
        });
    });

    describe('chapter detection with ## headers and بَابُ patterns (min: 10)', () => {
        const chapterRule: SplitRule = {
            lineStartsWith: ['## ', 'بَابُ'],
            meta: { type: 'chapter' },
            min: 10,
            split: 'before',
        };

        it('should detect markdown header chapters on entries with IDs >= 30', () => {
            // Entries with ids 30-38 have page 12 content - htmlToMarkdown converts title spans to ## headers
            const chapterEntries = allPages.filter((p) => p.id >= 30 && p.id <= 38);

            const result = segmentPages(chapterEntries, { rules: [chapterRule] });

            // Should have chapter segments with meta
            const chapters = result.filter((s) => s.meta?.type === 'chapter');
            expect(chapters.length).toBeGreaterThan(0);

            // Chapters should start with ## or contain بَاب
            for (const ch of chapters) {
                expect(ch.content).toMatch(/^## |بَاب/);
            }
        });

        it('should detect plain text بَابُ chapter on page 159', () => {
            // Page 159 has a plain text chapter without <span> wrapper
            const page159 = allPages.find((p) => p.id === 159);
            if (!page159) {
                return; // Skip if not in truncated data
            }

            const result = segmentPages([page159], { rules: [chapterRule] });

            expect(result).toHaveLength(1);
            expect(result[0].meta).toEqual({ type: 'chapter' });
            expect(result[0].content).toContain('بَابُ قَوْلِ اللهِ تَعَالَى');
        });
    });

    describe('combined rules for full book segmentation', () => {
        const allRules: SplitRule[] = [
            // Editor's introduction (pages 1-8): split on last punctuation per page
            { max: 8, maxSpan: 1, occurrence: 'last', regex: '[،.؟!]\\s*', split: 'after' },
            // Chapter headings (pages 9+) - uses markdown headers from htmlToMarkdown
            { lineStartsWith: ['## ', 'بَابُ'], meta: { type: 'chapter' }, min: 9, split: 'before' },
            // Hadith entries (pages 9+)
            { min: 9, split: 'before', template: '^{{raqms}} {{dash}} ' },
        ];

        it('should segment intro pages with punctuation rule', () => {
            const result = segmentPages(allPages, { rules: allRules });

            // Should have segments from pages 1-5 (intro)
            const introSegments = result.filter((s) => s.from <= 5);
            expect(introSegments.length).toBeGreaterThan(0);

            // First segment should be from page 1
            expect(result[0].from).toBe(1);
        });

        it('should segment main content with chapter and hadith rules', () => {
            const result = segmentPages(allPages, { rules: allRules });

            // Should have chapter segments
            const chapters = result.filter((s) => s.meta?.type === 'chapter');
            expect(chapters.length).toBeGreaterThan(0);

            // Should have hadith segments (no meta)
            const hadiths = result.filter((s) => !s.meta && s.content.match(/^[٠-٩]+\s*[-–—]/));
            expect(hadiths.length).toBeGreaterThan(0);
        });
    });

    describe('meta property behavior', () => {
        it('should have undefined meta when rule does not define it', () => {
            const rules: SplitRule[] = [{ split: 'before', template: '^{{raqms}} {{dash}} ' }];
            const page = allPages.find((p) => p.content.includes('١٤ - حَدَّثَنَا'));

            if (!page) {
                return;
            }

            const result = segmentPages([page], { rules });

            // Meta should be undefined, not { type: undefined }
            for (const seg of result) {
                expect(seg.meta).toBeUndefined();
                expect('meta' in seg && seg.meta !== undefined).toBe(false);
            }
        });

        it('should have meta property when rule defines it', () => {
            const rules: SplitRule[] = [
                { lineStartsWith: ['## '], meta: { source: 'shamela', type: 'chapter' }, split: 'before' },
            ];
            // Content is preprocessed with htmlToMarkdown which converts title spans to ## headers
            // We need a page where ## is at the START of a line (not just anywhere in content)
            const page = allPages.find((p) => /^## |\n## /.test(p.content));

            if (!page) {
                return;
            }

            const result = segmentPages([page], { rules });

            // Find the segment that has meta (the one that matched the pattern)
            const segmentWithMeta = result.find((s) => s.meta !== undefined);
            expect(segmentWithMeta?.meta).toEqual({ source: 'shamela', type: 'chapter' });
        });
    });

    describe('htmlToMarkdown preprocessing', () => {
        it('should have content with HTML already converted to markdown', () => {
            // Find a page that originally had HTML title span
            const pageWithHeader = allPages.find((p) => p.content.includes('## '));

            // Pages are already preprocessed with htmlToMarkdown
            if (pageWithHeader) {
                // Verify ## header is present (may not be at absolute line start due to special chars)
                expect(pageWithHeader.content).toContain('## ');
                // Verify HTML title spans are removed
                expect(pageWithHeader.content).not.toMatch(/<span[^>]*data-type/);
            }
        });

        it('should have narrator links stripped from content', () => {
            // After htmlToMarkdown, <a href="inr://..."> should be stripped
            for (const page of allPages.slice(0, 50)) {
                expect(page.content).not.toMatch(/<a[^>]*href=["']inr:\/\//);
            }
        });
    });
});
