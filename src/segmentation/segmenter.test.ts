import { describe, expect, it } from 'bun:test';

import { segmentPages } from './segmenter';
import type { Page, SplitRule } from './types';

describe('segmenter', () => {
    describe('segmentPages', () => {
        // ─────────────────────────────────────────────────────────────
        // Basic split: 'at' tests (current behavior)
        // ─────────────────────────────────────────────────────────────

        it('should segment a single plain-text page with 3 numeric markers', () => {
            const pages: Page[] = [{ content: '١ - الحديث الأول\r٢ - الحديث الثاني\r٣ - الحديث الثالث', id: 1 }];

            const rules: SplitRule[] = [{ regex: '^[٠-٩]+ - ', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(3);
            expect(result[0]).toMatchObject({ content: '١ - الحديث الأول', from: 1 });
            expect(result[1]).toMatchObject({ content: '٢ - الحديث الثاني', from: 1 });
            expect(result[2]).toMatchObject({ content: '٣ - الحديث الثالث', from: 1 });
        });

        it('should segment a single page with HTML title markers', () => {
            const pages: Page[] = [
                {
                    content:
                        '<span data-type="title" id=toc-1>باب الأول</span>\rنص الباب الأول\r<span data-type="title" id=toc-2>باب الثاني</span>\rنص الباب الثاني',
                    id: 5,
                },
            ];

            const rules: SplitRule[] = [{ regex: '^<span data-type="title"', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                content: '<span data-type="title" id=toc-1>باب الأول</span>\nنص الباب الأول',
                from: 5,
            });
            expect(result[1]).toMatchObject({
                content: '<span data-type="title" id=toc-2>باب الثاني</span>\nنص الباب الثاني',
                from: 5,
            });
        });

        it('should handle content spanning across 2 pages with space joining', () => {
            const pages: Page[] = [
                { content: '١ - الحديث الأول كامل\r٢ - بداية الحديث الثاني', id: 10 },
                { content: 'تكملة الحديث الثاني\r٣ - الحديث الثالث', id: 11 },
            ];

            const rules: SplitRule[] = [{ regex: '^[٠-٩]+ - ', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(3);
            expect(result[0]).toMatchObject({ content: '١ - الحديث الأول كامل', from: 10 });
            expect(result[1]).toMatchObject({
                content: '٢ - بداية الحديث الثاني تكملة الحديث الثاني',
                from: 10,
                to: 11,
            });
            expect(result[2]).toMatchObject({ content: '٣ - الحديث الثالث', from: 11 });
        });

        // ─────────────────────────────────────────────────────────────
        // Template and token expansion tests
        // ─────────────────────────────────────────────────────────────

        it('should expand {{raqms}} token in template patterns', () => {
            const pages: Page[] = [
                { content: '١ - الحديث الأول', id: 1 },
                { content: '٢ - الحديث الثاني', id: 2 },
            ];

            const rules: SplitRule[] = [{ split: 'at', template: '^{{raqms}} - ' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ content: '١ - الحديث الأول', from: 1 });
            expect(result[1]).toMatchObject({ content: '٢ - الحديث الثاني', from: 2 });
        });

        it('should expand {{dash}} token in template patterns', () => {
            const pages: Page[] = [
                { content: '١ – الحديث الأول', id: 1 }, // en-dash
                { content: '٢ — الحديث الثاني', id: 2 }, // em-dash
            ];

            const rules: SplitRule[] = [{ split: 'at', template: '^{{raqms}} {{dash}} ' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ content: '١ – الحديث الأول', from: 1 });
            expect(result[1]).toMatchObject({ content: '٢ — الحديث الثاني', from: 2 });
        });

        it('should expand {{bab}} token in template patterns with fuzzy matching', () => {
            const pages: Page[] = [
                { content: 'بَابُ الصلاة', id: 1 },
                { content: 'باب الزكاة', id: 2 }, // No diacritics
            ];

            // {{bab}} expands to 'باب', fuzzy: true makes it match بَابُ too
            const rules: SplitRule[] = [{ fuzzy: true, lineStartsWith: ['{{bab}}'], split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ content: 'بَابُ الصلاة', from: 1 });
            expect(result[1]).toMatchObject({ content: 'باب الزكاة', from: 2 });
        });

        // ─────────────────────────────────────────────────────────────
        // lineStartsWith syntax sugar tests
        // ─────────────────────────────────────────────────────────────

        it('should support lineStartsWith with multiple patterns and fuzzy matching', () => {
            const pages: Page[] = [
                { content: '## باب الأول', id: 1 },
                { content: 'بَابُ الثاني', id: 2 },
                { content: '١ - الحديث الأول', id: 3 },
            ];

            // Mix markdown headers, {{bab}} token with fuzzy, and numeral pattern
            const rules: SplitRule[] = [
                {
                    fuzzy: true,
                    lineStartsWith: ['## ', '{{bab}}', '{{raqms}} - '],
                    meta: { type: 'chapter' },
                    split: 'at',
                },
            ];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(3);
            expect(result[0]).toMatchObject({
                content: '## باب الأول',
                from: 1,
                meta: { type: 'chapter' },
            });
            expect(result[1]).toMatchObject({ content: 'بَابُ الثاني', from: 2, meta: { type: 'chapter' } });
            expect(result[2]).toMatchObject({ content: '١ - الحديث الأول', from: 3, meta: { type: 'chapter' } });
        });

        it('should support lineStartsAfter to exclude marker from content', () => {
            const pages: Page[] = [
                { content: 'Introduction text here', id: 1 },
                { content: '## Chapter 1 Title\nChapter content', id: 2 },
                { content: '## Chapter 2 Title\nMore content', id: 3 },
            ];

            // lineStartsAfter: matches lines starting with ## but excludes the marker from segment content
            // Content extends to next split point, not just end of line
            const rules: SplitRule[] = [{ lineStartsAfter: ['## '], meta: { type: 'chapter' }, split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(3);
            expect(result[0]).toMatchObject({ content: 'Introduction text here', from: 1 });
            // The ## is NOT included in the content, but segment extends to next split
            expect(result[1]).toMatchObject({
                content: 'Chapter 1 Title\nChapter content',
                from: 2,
                meta: { type: 'chapter' },
            });
            expect(result[2]).toMatchObject({
                content: 'Chapter 2 Title\nMore content',
                from: 3,
                meta: { type: 'chapter' },
            });
        });

        it('should auto-detect capture groups in regex and use captured content', () => {
            const pages: Page[] = [
                { content: 'Header: Important Title\nBody text here', id: 1 },
                { content: 'Header: Another Title\nMore body text', id: 2 },
            ];

            // Regex with capture group - only captured content should be used (same line)
            const rules: SplitRule[] = [{ meta: { type: 'header' }, regex: '^Header: (.+)$', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            // The "Header: " prefix is NOT included, only the captured group (to end of line)
            expect(result[0]).toMatchObject({ content: 'Important Title', from: 1, meta: { type: 'header' } });
            expect(result[1]).toMatchObject({ content: 'Another Title', from: 2, meta: { type: 'header' } });
        });

        it('should include full content when regex has no capture groups', () => {
            const pages: Page[] = [
                { content: 'Header: Important Title\nBody text here', id: 1 },
                { content: 'Header: Another Title\nMore body text', id: 2 },
            ];

            // Regex WITHOUT capture group - splits at match but includes all content up to next split
            const rules: SplitRule[] = [{ meta: { type: 'header' }, regex: '^Header: .+$', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            // Full content from split point to next split (includes body text)
            expect(result[0]).toMatchObject({
                content: 'Header: Important Title\nBody text here',
                from: 1,
                meta: { type: 'header' },
            });
            expect(result[1]).toMatchObject({
                content: 'Header: Another Title\nMore body text',
                from: 2,
                meta: { type: 'header' },
            });
        });

        // ─────────────────────────────────────────────────────────────
        // Page constraints (min/max) tests
        // ─────────────────────────────────────────────────────────────

        it('should only apply pattern when page is >= min', () => {
            const pages: Page[] = [
                { content: '١ - الحديث الأول', id: 1 },
                { content: '٢ - الحديث الثاني', id: 5 },
                { content: '٣ - الحديث الثالث', id: 10 },
            ];

            const rules: SplitRule[] = [{ min: 5, regex: '^[٠-٩]+ - ', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ content: '٢ - الحديث الثاني', from: 5 });
            expect(result[1]).toMatchObject({ content: '٣ - الحديث الثالث', from: 10 });
        });

        it('should only apply pattern when page is <= max', () => {
            const pages: Page[] = [
                { content: '١ - الحديث الأول', id: 1 },
                { content: '٢ - الحديث الثاني', id: 5 },
                { content: '٣ - الحديث الثالث', id: 10 },
            ];

            const rules: SplitRule[] = [{ max: 5, regex: '^[٠-٩]+ - ', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ content: '١ - الحديث الأول', from: 1 });
            expect(result[1]).toMatchObject({ content: '٢ - الحديث الثاني ٣ - الحديث الثالث', from: 5, to: 10 });
        });

        it('should apply pattern only within min-max range', () => {
            const pages: Page[] = [
                { content: '١ - الحديث الأول', id: 1 },
                { content: '٢ - الحديث الثاني', id: 5 },
                { content: '٣ - الحديث الثالث', id: 10 },
                { content: '٤ - الحديث الرابع', id: 15 },
            ];

            const rules: SplitRule[] = [{ max: 10, min: 5, regex: '^[٠-٩]+ - ', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ content: '٢ - الحديث الثاني', from: 5 });
            expect(result[1]).toMatchObject({ content: '٣ - الحديث الثالث ٤ - الحديث الرابع', from: 10, to: 15 });
        });

        // ─────────────────────────────────────────────────────────────
        // HTML preprocessing tests
        // ─────────────────────────────────────────────────────────────

        it('should match patterns on pre-processed content (client strips HTML)', () => {
            // Client pre-processes content using stripHtmlTags or htmlToMarkdown
            const rawContent = '٦٦٩٦ - حَدَّثَنَا <a href="inr://man-5093">أَبُو نُعَيْمٍ</a>';
            const strippedContent = rawContent.replace(/<[^>]*>/g, ''); // Client strips HTML

            const pages: Page[] = [{ content: strippedContent, id: 142 }];
            const rules: SplitRule[] = [{ regex: '^[٠-٩]+ - ', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(1);
            expect(result[0].content).toBe('٦٦٩٦ - حَدَّثَنَا أَبُو نُعَيْمٍ');
            expect(result[0].from).toBe(142);
        });

        // ─────────────────────────────────────────────────────────────
        // NEW: split: 'after' tests (end markers)
        // ─────────────────────────────────────────────────────────────

        it('should split after pattern when split is after', () => {
            const pages: Page[] = [
                { content: 'The quick brown fox jumps over the lazy dog', id: 1 },
                { content: 'This is another sentence about the quick brown fox jumping over the lazy dog', id: 2 },
            ];

            const rules: SplitRule[] = [{ regex: 'lazy', split: 'after' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(3);
            expect(result[0]).toMatchObject({ content: 'The quick brown fox jumps over the lazy', from: 1 });
            // Leading space preserved (original behavior)
            expect(result[1]).toMatchObject({
                content: ' dog This is another sentence about the quick brown fox jumping over the lazy',
                from: 1,
                to: 2,
            });
            expect(result[2]).toMatchObject({ content: ' dog', from: 2 });
        });

        it('should support lineEndsWith syntax sugar', () => {
            const pages: Page[] = [{ content: 'Line a\nLine b\nLine c1\nLine d', id: 1 }];

            // lineEndsWith: pattern at end of line
            const rules: SplitRule[] = [{ lineEndsWith: ['\\d+'], split: 'after' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ content: 'Line a\nLine b\nLine c1', from: 1 });
            // Leading newline preserved (original behavior)
            expect(result[1]).toMatchObject({ content: '\nLine d', from: 1 });
        });

        // ─────────────────────────────────────────────────────────────
        // NEW: occurrence tests
        // ─────────────────────────────────────────────────────────────

        it('should only split at last occurrence when occurrence is last', () => {
            const pages: Page[] = [{ content: 'Sentence 1. Sentence 2. Sentence 3', id: 1 }];

            const rules: SplitRule[] = [{ occurrence: 'last', regex: '\\.\\s*', split: 'after' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            // Trailing whitespace is trimmed from segments
            expect(result[0]).toMatchObject({ content: 'Sentence 1. Sentence 2.', from: 1 });
            expect(result[1]).toMatchObject({ content: 'Sentence 3', from: 1 });
        });

        it('should only split at first occurrence when occurrence is first', () => {
            const pages: Page[] = [{ content: 'Hello. World. Foo.', id: 1 }];

            const rules: SplitRule[] = [{ occurrence: 'first', regex: '\\.', split: 'at' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ content: 'Hello', from: 1 });
            expect(result[1]).toMatchObject({ content: '. World. Foo.', from: 1 });
        });

        it('should split at all occurrences by default', () => {
            const pages: Page[] = [{ content: 'A.B.C.D', id: 1 }];

            const rules: SplitRule[] = [{ regex: '\\.', split: 'after' }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(4);
            expect(result[0]).toMatchObject({ content: 'A.', from: 1 });
            expect(result[1]).toMatchObject({ content: 'B.', from: 1 });
            expect(result[2]).toMatchObject({ content: 'C.', from: 1 });
            expect(result[3]).toMatchObject({ content: 'D', from: 1 });
        });

        it('should only set "to" field when segment spans multiple IDs', () => {
            // Test 1: Segment within single ID - should NOT have "to" field
            const singleIdPages: Page[] = [
                { content: 'First. Second.', id: 1 },
                { content: 'Third.', id: 2 },
            ];

            const result1 = segmentPages(singleIdPages, { rules: [{ regex: '\\.', split: 'after' }] });

            // Segments within ID 1 should not have 'to'
            expect(result1[0].from).toBe(1);
            expect(result1[0].to).toBeUndefined();
            expect(result1[1].from).toBe(1);
            expect(result1[1].to).toBeUndefined();

            // Test 2: Segment spanning multiple IDs - should have "to" field
            const multiIdPages: Page[] = [
                { content: 'First part no punctuation', id: 1 },
                { content: 'continues here.', id: 2 },
            ];

            const result2 = segmentPages(multiIdPages, { rules: [{ regex: '\\.', split: 'after' }] });

            // First segment spans ID 1 to 2, so 'to' should be set
            expect(result2[0].from).toBe(1);
            expect(result2[0].to).toBe(2);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // NEW: maxSpan tests (page-group occurrence filtering)
    // ─────────────────────────────────────────────────────────────

    describe('maxSpan option', () => {
        // Test data: 4 entries with 0-indexed IDs (id 0, 1, 2, 3)
        const multiPageContent: Page[] = [
            { content: 'P1A. P1B. E1', id: 0 },
            { content: 'P2A. P2B. E2', id: 1 },
            { content: 'P3A. P3B. E3', id: 2 },
            { content: 'P4A. P4B. E4', id: 3 },
        ];

        it('should apply occurrence globally when maxSpan is undefined', () => {
            // occurrence: 'last' should find the LAST period across ALL pages (in page 4)
            const rules: SplitRule[] = [{ occurrence: 'last', regex: '\\.', split: 'after' }];

            const result = segmentPages(multiPageContent, { rules });

            // 1 split point (last period in entry 3) = 2 segments
            expect(result).toHaveLength(2);
            expect(result[0].from).toBe(0);
            expect(result[0].content).toContain('P1A');
            expect(result[0].content).toContain('P4B.');
            expect(result[1].content.trim()).toBe('E4');
        });

        it('should create split points per-page when maxSpan is 1', () => {
            // occurrence: 'last' with maxSpan: 1 creates one split point per page
            const rules: SplitRule[] = [{ maxSpan: 1, occurrence: 'last', regex: '\\.', split: 'after' }];

            const result = segmentPages(multiPageContent, { rules });

            // 4 entries = 4 split points = 5 segments
            expect(result.length).toBe(5);

            // First segment: from start to entry 0's last period
            expect(result[0].from).toBe(0);
            expect(result[0].content).toBe('P1A. P1B.');

            // Last segment: after entry 3's last period to end
            expect(result[result.length - 1].content.trim()).toBe('E4');
        });

        it('should create split points per 2-page group when maxSpan is 2', () => {
            // occurrence: 'last' with maxSpan: 2 creates one split per 2-page group
            const rules: SplitRule[] = [{ maxSpan: 2, occurrence: 'last', regex: '\\.', split: 'after' }];

            const result = segmentPages(multiPageContent, { rules });

            // 2 groups (id 0-1, id 2-3) = 2 split points = 3 segments
            expect(result.length).toBe(3);

            // First segment: from start to entry 1's last period
            expect(result[0].from).toBe(0);
            expect(result[0].content).toContain('P2B.');

            // Last segment: after entry 3's last period
            expect(result[result.length - 1].content.trim()).toBe('E4');
        });

        it('should treat maxSpan 0 as no grouping (entire content)', () => {
            // maxSpan: 0 should behave like undefined (no grouping)
            const rules: SplitRule[] = [{ maxSpan: 0, occurrence: 'last', regex: '\\.', split: 'after' }];

            const result = segmentPages(multiPageContent, { rules });

            // Same as undefined - 1 split = 2 segments
            expect(result).toHaveLength(2);
            expect(result[0].from).toBe(0);
            expect(result[1].content.trim()).toBe('E4');
        });

        it('should work with occurrence first and maxSpan 1', () => {
            // occurrence: 'first' with maxSpan: 1 finds FIRST period on EACH page
            const rules: SplitRule[] = [{ maxSpan: 1, occurrence: 'first', regex: '\\.', split: 'at' }];

            const result = segmentPages(multiPageContent, { rules });

            // 4 split points (first period each entry) = 5 segments
            expect(result.length).toBe(5);

            // First segment: from start to first period on entry 0
            expect(result[0].content).toBe('P1A');
            expect(result[0].from).toBe(0);
        });

        it('should combine maxSpan with min/max page constraints', () => {
            // Only apply to pages 2-3, with per-page occurrence
            const rules: SplitRule[] = [
                { max: 3, maxSpan: 1, min: 2, occurrence: 'last', regex: '\\.', split: 'after' },
            ];

            const result = segmentPages(multiPageContent, { rules });

            // IDs 2 and 3 each have split = 2 split points
            // Result: 2 segments
            expect(result.length).toBe(2);

            // First segment starts from id 2
            expect(result[0].from).toBe(2);
        });

        it('should work correctly with non-contiguous page IDs (gaps in page sequence)', () => {
            // Page IDs with gaps: 1, 5, 10, 100 (non-sequential)
            const gappedPages: Page[] = [
                { content: 'Page1A. Page1B. End1', id: 1 },
                { content: 'Page5A. Page5B. End5', id: 5 },
                { content: 'Page10A. Page10B. End10', id: 10 },
                { content: 'Page100A. Page100B. End100', id: 100 },
            ];

            // Without maxSpan - should find last period globally
            const globalRules: SplitRule[] = [{ occurrence: 'last', regex: '\\.', split: 'after' }];
            const globalResult = segmentPages(gappedPages, { rules: globalRules });

            expect(globalResult).toHaveLength(2);
            expect(globalResult[1].content.trim()).toBe('End100');

            // With maxSpan: 1 - note: grouping is Math.floor(id / maxSpan)
            // With gaps, each page gets its own group since they have unique floor(id/1) values
            const perPageRules: SplitRule[] = [{ maxSpan: 1, occurrence: 'last', regex: '\\.', split: 'after' }];
            const perPageResult = segmentPages(gappedPages, { rules: perPageRules });

            // 4 pages = 4 split points = 5 segments
            expect(perPageResult).toHaveLength(5);

            // Verify from/to values reflect actual page IDs (not indices)
            expect(perPageResult[0].from).toBe(1);
            expect(perPageResult[1].from).toBe(1);
            expect(perPageResult[1].to).toBe(5); // Content spans from page 1 to page 5
            expect(perPageResult[4].from).toBe(100);
        });

        it('should handle maxSpan with large gaps between page IDs', () => {
            // Edge case: very large gaps could theoretically cause grouping issues
            const largeGapPages: Page[] = [
                { content: 'A. B.', id: 1 },
                { content: 'C. D.', id: 1000 },
            ];

            const rules: SplitRule[] = [{ maxSpan: 1, occurrence: 'last', regex: '\\.', split: 'after' }];
            const result = segmentPages(largeGapPages, { rules });

            // Last period on page 1 is after "B." (position 4)
            // Last period on page 1000 is after "D." (at end of content, so no trailing segment)
            // 2 split points but D. is at end = 2 segments
            expect(result).toHaveLength(2);
            expect(result[0].from).toBe(1);
            expect(result[0].content).toBe('A. B.');
            expect(result[1].from).toBe(1);
            expect(result[1].to).toBe(1000); // Content spans both pages
        });
    });

    // ─────────────────────────────────────────────────────────────
    // NEW: fallback option tests
    // ─────────────────────────────────────────────────────────────

    describe('fallback option', () => {
        it('should create page-boundary splits when fallback is page and no matches found', () => {
            // Pages with no punctuation marks
            const pages: Page[] = [
                { content: 'No punctuation here', id: 1 },
                { content: 'Also no punctuation', id: 2 },
                { content: 'Third page without marks', id: 3 },
            ];

            // Rule looking for period with fallback: 'page'
            const rules: SplitRule[] = [
                { fallback: 'page', maxSpan: 1, occurrence: 'last', regex: '\\.', split: 'after' },
            ];

            const result = segmentPages(pages, { rules });

            // Should create 3 segments, one per page
            expect(result).toHaveLength(3);
            expect(result[0]).toMatchObject({ content: 'No punctuation here', from: 1 });
            expect(result[1]).toMatchObject({ content: 'Also no punctuation', from: 2 });
            expect(result[2]).toMatchObject({ content: 'Third page without marks', from: 3 });
        });

        it('should merge pages when fallback is omitted and no matches found', () => {
            // Same pages but without fallback
            const pages: Page[] = [
                { content: 'No punctuation here', id: 1 },
                { content: 'Also no punctuation', id: 2 },
                { content: 'Third page without marks', id: 3 },
            ];

            // Rule looking for period WITHOUT fallback (default behavior)
            const rules: SplitRule[] = [{ maxSpan: 1, occurrence: 'last', regex: '\\.', split: 'after' }];

            const result = segmentPages(pages, { rules });

            // No matches found, no splits created - entire content returned as one segment
            // (because anyRuleAllowsId returns true for first page)
            expect(result).toHaveLength(1);
        });

        it('should mix matched and fallback pages correctly', () => {
            const pages: Page[] = [
                { content: 'First page.', id: 1 }, // Has punctuation
                { content: 'No punctuation here', id: 2 }, // No punctuation
                { content: 'Third page.', id: 3 }, // Has punctuation
            ];

            const rules: SplitRule[] = [
                { fallback: 'page', maxSpan: 1, occurrence: 'last', regex: '\\.', split: 'after' },
            ];

            const result = segmentPages(pages, { rules });

            // Page 1: has punctuation match at end
            // Page 2: no match, but fallback creates split at page start
            // Page 3: has punctuation match at end
            expect(result.length).toBeGreaterThanOrEqual(2);
            // First segment ends with 'First page.'
            expect(result[0].content).toContain('First page.');
            // Last segment should contain 'Third page.'
            expect(result[result.length - 1].content).toContain('Third page.');
        });

        it('should respect min/max constraints with fallback', () => {
            const pages: Page[] = [
                { content: 'Page 1 no match', id: 1 },
                { content: 'Page 5 no match', id: 5 },
                { content: 'Page 10 no match', id: 10 },
            ];

            const rules: SplitRule[] = [
                { fallback: 'page', max: 5, maxSpan: 1, min: 5, occurrence: 'last', regex: '\\.', split: 'after' },
            ];

            const result = segmentPages(pages, { rules });

            // Page 5 is within constraints, gets fallback split
            // Pages 1 and 10 are outside constraints
            expect(result.length).toBeGreaterThanOrEqual(1);
            // Should have segment starting from page 5
            expect(result.some((s) => s.from === 5)).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // NEW: Fuzzy matching and phrase token tests
    // ─────────────────────────────────────────────────────────────

    describe('fuzzy matching', () => {
        it('should match Arabic words regardless of diacritics placement when fuzzy is true', () => {
            const pages: Page[] = [
                { content: 'بَابُ الصلاة', id: 1 }, // With harakat
                { content: 'باب الزكاة', id: 2 }, // Without harakat
                { content: 'بابٌ ثالث', id: 3 }, // With tanwin
            ];

            // Note: Regular regex already matches since diacritics appear after base letters
            // The main value of fuzzy is character equivalences (tested below)
            const fuzzyRules: SplitRule[] = [{ fuzzy: true, lineStartsWith: ['باب'], split: 'at' }];
            const fuzzyResult = segmentPages(pages, { rules: fuzzyRules });
            expect(fuzzyResult.length).toBe(3);
        });

        it('should handle character equivalences (ا/آ/أ/إ, ة/ه, ى/ي)', () => {
            const pages: Page[] = [
                { content: 'إسناد صحيح', id: 1 }, // إ
                { content: 'اسناد حسن', id: 2 }, // ا
                { content: 'أسناد ضعيف', id: 3 }, // أ
            ];

            const rules: SplitRule[] = [{ fuzzy: true, lineStartsWith: ['اسناد'], split: 'at' }];
            const result = segmentPages(pages, { rules });

            // All three should match due to ا/إ/أ equivalence
            expect(result.length).toBe(3);
        });

        it('should not apply fuzzy to non-Arabic patterns', () => {
            const pages: Page[] = [
                { content: '## Chapter 1', id: 1 },
                { content: '## Chapter 2', id: 2 },
            ];

            // fuzzy should have no effect on non-Arabic patterns
            const rules: SplitRule[] = [{ fuzzy: true, lineStartsWith: ['## '], split: 'at' }];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('## Chapter 1');
        });

        it('should apply fuzzy with lineStartsAfter', () => {
            const pages: Page[] = [
                { content: 'كِتَابُ الصلاة\nمحتوى الكتاب', id: 1 },
                { content: 'كتاب الصيام\nمحتوى آخر', id: 2 },
            ];

            // lineStartsAfter with fuzzy: excludes marker but content extends to next split
            const rules: SplitRule[] = [
                { fuzzy: true, lineStartsAfter: ['كتاب '], meta: { type: 'book' }, split: 'at' },
            ];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBe(2);
            // Content has marker excluded but extends to next split
            expect(result[0].content).toBe('الصلاة\nمحتوى الكتاب');
            expect(result[1].content).toBe('الصيام\nمحتوى آخر');
        });

        it('should apply fuzzy with lineEndsWith', () => {
            const pages: Page[] = [{ content: 'First sentence.\nSecond sentenceٌ\nThird', id: 1 }];

            // Match lines ending with period or tanwin
            const rules: SplitRule[] = [{ fuzzy: true, lineEndsWith: ['\\.', 'ة'], split: 'after' }];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBeGreaterThan(1);
        });
    });

    describe('phrase tokens', () => {
        it('should expand {{bab}} token for chapter markers', () => {
            const pages: Page[] = [
                { content: 'بَابُ الإيمان', id: 1 },
                { content: 'باب الصلاة', id: 2 },
            ];

            const rules: SplitRule[] = [{ fuzzy: true, lineStartsWith: ['{{bab}}'], split: 'at' }];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBe(2);
        });

        it('should expand {{kitab}} token for book markers', () => {
            const pages: Page[] = [
                { content: 'كِتَابُ الطهارة', id: 1 },
                { content: 'كتاب الصلاة', id: 2 },
            ];

            const rules: SplitRule[] = [{ fuzzy: true, lineStartsWith: ['{{kitab}}'], split: 'at' }];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBe(2);
        });

        it('should expand {{naql}} token for hadith chains', () => {
            const pages: Page[] = [
                { content: 'حَدَّثَنَا أبو بكر', id: 1 },
                { content: 'أخبرنا محمد', id: 2 },
                { content: 'حدثني علي', id: 3 },
                { content: 'سمعت عمر', id: 4 },
            ];

            const rules: SplitRule[] = [{ fuzzy: true, lineStartsWith: ['{{naql}}'], split: 'at' }];
            const result = segmentPages(pages, { rules });

            // All 4 should match different narrator phrases
            expect(result.length).toBe(4);
        });

        it('should expand {{basmalah}} token for bismillah patterns', () => {
            const pages: Page[] = [
                { content: 'بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيمِ', id: 1 },
                { content: 'بسم الله', id: 2 },
            ];

            const rules: SplitRule[] = [{ fuzzy: true, lineStartsWith: ['{{basmalah}}'], split: 'at' }];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBe(2);
        });

        it('should combine multiple phrase tokens in lineStartsWith', () => {
            const pages: Page[] = [
                { content: 'كتاب الإيمان', id: 1 },
                { content: 'باب أركان الإيمان', id: 2 },
                { content: 'حدثنا أبو هريرة', id: 3 },
            ];

            const rules: SplitRule[] = [
                { fuzzy: true, lineStartsWith: ['{{kitab}}', '{{bab}}', '{{naql}}'], split: 'at' },
            ];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBe(3);
        });
    });

    describe('character tokens', () => {
        it('should expand {{harf}} token for single Arabic letter', () => {
            const pages: Page[] = [
                { content: 'أ - البند الأول', id: 1 },
                { content: 'ب - البند الثاني', id: 2 },
            ];

            const rules: SplitRule[] = [{ lineStartsWith: ['{{harf}} - '], split: 'at' }];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBe(2);
        });

        it('should expand {{bullet}} token for bullet markers', () => {
            const pages: Page[] = [{ content: '• النقطة الأولى\n* النقطة الثانية\n° النقطة الثالثة', id: 1 }];

            const rules: SplitRule[] = [{ lineStartsWith: ['{{bullet}} '], split: 'at' }];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBe(3);
        });

        it('should combine harf with raqm for numbered letter patterns', () => {
            const pages: Page[] = [
                { content: '٥ أ - البند', id: 1 },
                { content: '٥ ب - البند التالي', id: 2 },
            ];

            const rules: SplitRule[] = [{ lineStartsWith: ['{{raqms}} {{harf}} - '], split: 'at' }];
            const result = segmentPages(pages, { rules });

            expect(result.length).toBe(2);
        });
    });

    describe('composite tokens', () => {
        it('should expand {{numbered}} token with lineStartsAfter for common hadith format', () => {
            const pages: Page[] = [
                { content: '٢٢ - حَدَّثَنَا أَبُو بَكْرٍ عَنِ النَّبِيِّ', id: 1 },
                { content: '٢٣ – أَخْبَرَنَا عُمَرُ قَالَ', id: 2 }, // en-dash
                { content: '٦٦٩٦ — حَدَّثَنِي مُحَمَّدٌ', id: 3 }, // em-dash
            ];

            // {{numbered}} expands to {{raqms}} {{dash}} = [٠-٩]+ [-–—ـ]
            const rules: SplitRule[] = [{ lineStartsAfter: ['{{numbered}}'], meta: { type: 'hadith' }, split: 'at' }];
            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(3);
            // Content should NOT include the number prefix (lineStartsAfter excludes marker)
            expect(result[0]).toMatchObject({
                content: 'حَدَّثَنَا أَبُو بَكْرٍ عَنِ النَّبِيِّ',
                from: 1,
                meta: { type: 'hadith' },
            });
            expect(result[1]).toMatchObject({
                content: 'أَخْبَرَنَا عُمَرُ قَالَ',
                from: 2,
                meta: { type: 'hadith' },
            });
            expect(result[2]).toMatchObject({
                content: 'حَدَّثَنِي مُحَمَّدٌ',
                from: 3,
                meta: { type: 'hadith' },
            });
        });

        it('should handle {{numbered}} with content spanning multiple pages', () => {
            const pages: Page[] = [
                { content: '٢٢ - بداية الحديث', id: 10 },
                { content: 'تكملة الحديث الأول\n٢٣ - الحديث الثاني', id: 11 },
            ];

            const rules: SplitRule[] = [{ lineStartsAfter: ['{{numbered}}'], split: 'at' }];
            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            // lineStartsAfter excludes marker but extends content to next split point
            expect(result[0]).toMatchObject({
                content: 'بداية الحديث تكملة الحديث الأول',
                from: 10,
                to: 11,
            });
            expect(result[1]).toMatchObject({
                content: 'الحديث الثاني',
                from: 11,
            });
        });
    });

    // ─────────────────────────────────────────────────────────────
    // Named Capture Groups: {{token:name}} syntax
    // ─────────────────────────────────────────────────────────────

    describe('named capture groups', () => {
        describe('template patterns', () => {
            it('should extract single named capture from template', () => {
                const pages: Page[] = [
                    { content: '٦٦٩٦ - حَدَّثَنَا أَبُو بَكْرٍ', id: 1 },
                    { content: '٦٦٩٧ - حَدَّثَنَا عُمَرُ', id: 2 },
                ];

                // {{raqms:num}} captures the number into meta.num
                const rules: SplitRule[] = [{ split: 'at', template: '^{{raqms:num}} {{dash}} ' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0].meta?.num).toBe('٦٦٩٦');
                expect(result[1].meta?.num).toBe('٦٦٩٧');
            });

            it('should extract multiple named captures from template', () => {
                const pages: Page[] = [{ content: '٣/٤٥٦ - نص الحديث', id: 1 }];

                // Capture volume and page separately
                const rules: SplitRule[] = [{ split: 'at', template: '^{{raqms:vol}}/{{raqms:page}} {{dash}} ' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(1);
                expect(result[0].meta?.vol).toBe('٣');
                expect(result[0].meta?.page).toBe('٤٥٦');
            });

            it('should capture rest of content with {{:name}} syntax', () => {
                const pages: Page[] = [{ content: '٦٦٩٦ - حَدَّثَنَا أَبُو بَكْرٍ', id: 1 }];

                // {{:text}} captures everything after the pattern
                const rules: SplitRule[] = [{ split: 'at', template: '^{{raqms:num}} {{dash}} {{:text}}' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(1);
                expect(result[0].meta?.num).toBe('٦٦٩٦');
                expect(result[0].meta?.text).toBe('حَدَّثَنَا أَبُو بَكْرٍ');
            });
        });

        describe('lineStartsWith patterns', () => {
            it('should extract named capture from lineStartsWith', () => {
                const pages: Page[] = [
                    { content: '١ - الحديث الأول', id: 1 },
                    { content: '٢ - الحديث الثاني', id: 2 },
                ];

                const rules: SplitRule[] = [{ lineStartsWith: ['{{raqms:hadithNum}} {{dash}} '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0].meta?.hadithNum).toBe('١');
                expect(result[1].meta?.hadithNum).toBe('٢');
            });

            it('should merge extracted captures with existing meta', () => {
                const pages: Page[] = [{ content: '١٢٣ - الحديث', id: 1 }];

                const rules: SplitRule[] = [
                    { lineStartsWith: ['{{raqms:num}} {{dash}} '], meta: { type: 'hadith' }, split: 'at' },
                ];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(1);
                expect(result[0].meta).toEqual({ num: '١٢٣', type: 'hadith' });
            });

            it('should handle phrase token with named capture', () => {
                const pages: Page[] = [
                    { content: 'حدثنا أبو بكر', id: 1 },
                    { content: 'أخبرنا محمد', id: 2 },
                ];

                const rules: SplitRule[] = [{ fuzzy: true, lineStartsWith: ['{{naql:phrase}}'], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0].meta?.phrase).toBe('حدثنا');
                expect(result[1].meta?.phrase).toBe('أخبرنا');
            });
        });

        describe('lineStartsAfter patterns', () => {
            it('should extract named capture and exclude marker from content', () => {
                const pages: Page[] = [
                    { content: '٦٦٩٦ - حَدَّثَنَا أَبُو بَكْرٍ', id: 1 },
                    { content: '٦٦٩٧ - أَخْبَرَنَا عُمَرُ', id: 2 },
                ];

                // lineStartsAfter excludes marker, named capture extracts number
                const rules: SplitRule[] = [{ lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                // Content should NOT include the marker
                expect(result[0].content).toBe('حَدَّثَنَا أَبُو بَكْرٍ');
                expect(result[0].meta?.num).toBe('٦٦٩٦');
                expect(result[1].content).toBe('أَخْبَرَنَا عُمَرُ');
                expect(result[1].meta?.num).toBe('٦٦٩٧');
            });

            it('should extract multiple captures with lineStartsAfter', () => {
                const pages: Page[] = [{ content: '٣/٤٥٦ - نص الحديث هنا', id: 1 }];

                const rules: SplitRule[] = [
                    { lineStartsAfter: ['{{raqms:vol}}/{{raqms:page}} {{dash}} '], split: 'at' },
                ];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(1);
                expect(result[0].content).toBe('نص الحديث هنا');
                expect(result[0].meta?.vol).toBe('٣');
                expect(result[0].meta?.page).toBe('٤٥٦');
            });
        });

        describe('edge cases', () => {
            it('should handle tokens without capture (no :name suffix)', () => {
                const pages: Page[] = [{ content: '١ - الحديث', id: 1 }];

                // No :name suffix - should work as before, no captures
                const rules: SplitRule[] = [{ lineStartsWith: ['{{raqms}} {{dash}} '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(1);
                expect(result[0].meta).toBeUndefined();
            });

            it('should handle mixed captured and non-captured tokens', () => {
                const pages: Page[] = [{ content: '٥ أ - البند الأول', id: 1 }];

                // Only capture the number, not the letter
                const rules: SplitRule[] = [{ lineStartsWith: ['{{raqms:num}} {{harf}} {{dash}} '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(1);
                expect(result[0].meta?.num).toBe('٥');
                expect(result[0].meta?.harf).toBeUndefined(); // Not captured
            });

            it('should work with fuzzy and named captures together', () => {
                const pages: Page[] = [
                    { content: 'كِتَابُ الصلاة', id: 1 },
                    { content: 'كتاب الصيام', id: 2 },
                ];

                const rules: SplitRule[] = [{ fuzzy: true, lineStartsAfter: ['{{kitab:book}} '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                // fuzzy should match both despite diacritics
                expect(result[0].content).toBe('الصلاة');
                expect(result[0].meta?.book).toBeDefined(); // Should capture the matched variant
                expect(result[1].content).toBe('الصيام');
            });
        });

        describe('error handling', () => {
            it('should throw helpful error for invalid regex patterns', () => {
                const pages: Page[] = [{ content: 'test content', id: 1 }];

                // Invalid regex: unbalanced parenthesis
                const rules: SplitRule[] = [{ regex: '(unclosed', split: 'at' }];

                expect(() => segmentPages(pages, { rules })).toThrow(/Invalid regex pattern/);
            });

            it('should throw error when no pattern type is specified', () => {
                const pages: Page[] = [{ content: 'test', id: 1 }];

                // Empty rule with only split behavior
                const rules: SplitRule[] = [{ split: 'at' } as SplitRule];

                expect(() => segmentPages(pages, { rules })).toThrow(/must specify exactly one pattern type/);
            });
        });
    });
});
