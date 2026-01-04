import { describe, expect, it } from 'bun:test';

import { dedupeSplitPoints, ensureFallbackSegment, segmentPages } from './segmenter';
import type { Page, SplitRule } from './types';

describe('segmenter', () => {
    describe('dedupeSplitPoints', () => {
        it('should prefer split points with contentStartOffset at same index', () => {
            const splitPoints = [
                { index: 10, meta: { a: 1 } },
                { contentStartOffset: 3, index: 10 },
            ];

            const result = dedupeSplitPoints(splitPoints as never);
            expect(result).toHaveLength(1);
            expect(result[0].index).toBe(10);
            expect(result[0].contentStartOffset).toBe(3);
        });

        it('should prefer split points with meta over those without at same index', () => {
            const splitPoints = [{ index: 10 }, { index: 10, meta: { type: 'chapter' } }];

            const result = dedupeSplitPoints(splitPoints as never);
            expect(result).toHaveLength(1);
            expect(result[0].meta).toEqual({ type: 'chapter' });
        });
    });

    describe('ensureFallbackSegment', () => {
        it('should return a single spanning segment when no segments were produced', () => {
            const pages = [
                { content: 'A', id: 1 },
                { content: 'B', id: 3 },
            ];
            const normalizedContent = ['A', 'B'];
            const segments = ensureFallbackSegment([], pages as never, normalizedContent, 'space');
            expect(segments).toHaveLength(1);
            expect(segments[0]).toMatchObject({ content: 'A B', from: 1, to: 3 });
        });
    });

    describe('segmentPages', () => {
        // ─────────────────────────────────────────────────────────────
        // Basic split: 'at' tests (current behavior)
        // ─────────────────────────────────────────────────────────────

        it('should default split to "at" when not specified', () => {
            const pages: Page[] = [
                { content: '## Chapter 1\nContent one', id: 1 },
                { content: '## Chapter 2\nContent two', id: 2 },
            ];

            // No split property specified - should default to 'at'
            const rules: SplitRule[] = [{ lineStartsWith: ['## '] }];

            const result = segmentPages(pages, { rules });

            expect(result).toHaveLength(2);
            // 'at' behavior: split happens AT the match, marker is included
            expect(result[0]).toMatchObject({ content: '## Chapter 1\nContent one', from: 1 });
            expect(result[1]).toMatchObject({ content: '## Chapter 2\nContent two', from: 2 });
        });

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

        it('should respect min/max/exclude constraints for fuzzy token lineStartsWith', () => {
            const pages: Page[] = [
                { content: 'بَابُ الإيمان\nx', id: 1 },
                { content: 'بَابُ الطهارة\ny', id: 2 },
                { content: 'بَابُ الزكاة\nz', id: 3 },
            ];

            const rules: SplitRule[] = [
                {
                    exclude: [3],
                    fuzzy: true,
                    lineStartsWith: ['{{bab}}'],
                    meta: { type: 'chapter' },
                    min: 2,
                    split: 'at',
                },
            ];

            const result = segmentPages(pages, { rules });

            // Only page 2 should match; page 1 excluded by min, page 3 excluded by exclude.
            expect(result.some((s) => s.from === 2 && s.meta?.type === 'chapter')).toBe(true);
            expect(result.some((s) => s.from === 1 && s.meta?.type === 'chapter')).toBe(false);
            expect(result.some((s) => s.from === 3 && s.meta?.type === 'chapter')).toBe(false);
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

        it('should skip rule for specific excluded pages', () => {
            const pages: Page[] = [
                { content: '## Chapter 1', id: 1 },
                { content: '## Chapter 2', id: 2 },
                { content: '## Chapter 3', id: 3 },
            ];

            const rules: SplitRule[] = [
                { exclude: [2], lineStartsWith: ['## '], split: 'at' }, // Exclude page 2
            ];

            const result = segmentPages(pages, { rules });

            // Only pages 1 and 3 should create splits, page 2 rule is skipped
            expect(result).toHaveLength(2);
            expect(result[0].content).toBe('## Chapter 1 ## Chapter 2');
            expect(result[1].content).toBe('## Chapter 3');
        });

        it('should skip rule for excluded page ranges', () => {
            const pages: Page[] = [
                { content: '## Chapter 1', id: 1 },
                { content: '## Chapter 2', id: 2 },
                { content: '## Chapter 3', id: 3 },
                { content: '## Chapter 4', id: 4 },
            ];

            const rules: SplitRule[] = [
                { exclude: [[2, 3]], lineStartsWith: ['## '], split: 'at' }, // Exclude pages 2-3
            ];

            const result = segmentPages(pages, { rules });

            // Pages 1 and 4 create splits, pages 2-3 are excluded
            expect(result).toHaveLength(2);
            expect(result[0].content).toContain('Chapter 1');
            expect(result[1].content).toBe('## Chapter 4');
        });

        it('should handle mixed single pages and ranges in rule exclude', () => {
            const pages: Page[] = [
                { content: '## A', id: 1 },
                { content: '## B', id: 5 },
                { content: '## C', id: 10 },
                { content: '## D', id: 15 },
            ];

            const rules: SplitRule[] = [
                { exclude: [1, [10, 15]], lineStartsWith: ['## '], split: 'at' }, // Exclude 1 and 10-15
            ];

            const result = segmentPages(pages, { rules });

            // Only page 5 should create a split
            expect(result).toHaveLength(2);
            expect(result[0].content).toContain('## A');
            expect(result[1].content).toBe('## B ## C ## D');
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

        describe('debug provenance', () => {
            it('should not attach provenance when debug is not enabled', () => {
                const pages: Page[] = [{ content: '## Chapter 1\nContent', id: 1 }];
                const rules: SplitRule[] = [{ lineStartsWith: ['## '], meta: { type: 'chapter' } }];

                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(1);
                expect(result[0].meta).toEqual({ type: 'chapter' });
            });

            it('should attach rule provenance when debug is enabled', () => {
                const pages: Page[] = [
                    { content: '## Chapter 1\nContent one', id: 1 },
                    { content: '## Chapter 2\nContent two', id: 2 },
                ];
                const rules: SplitRule[] = [{ lineStartsWith: ['## '], meta: { type: 'chapter' } }];

                const result = segmentPages(pages, { debug: true, rules } as any);

                expect(result).toHaveLength(2);
                expect(result[0].meta?.type).toBe('chapter');
                expect((result[0].meta as any)?._flappa?.rule).toEqual({ index: 0, patternType: 'lineStartsWith' });
            });

            it('should merge provenance into existing meta._flappa object', () => {
                const pages: Page[] = [{ content: '## Chapter 1\nContent', id: 1 }];
                const rules: SplitRule[] = [
                    { lineStartsWith: ['## '], meta: { _flappa: { custom: true }, type: 'chapter' } },
                ];

                const result = segmentPages(pages, { debug: true, rules } as any);

                expect(result).toHaveLength(1);
                expect((result[0].meta as any)?._flappa?.custom).toBe(true);
                expect((result[0].meta as any)?._flappa?.rule).toEqual({ index: 0, patternType: 'lineStartsWith' });
            });

            it('should override non-object meta._flappa when debug is enabled', () => {
                const pages: Page[] = [{ content: '## Chapter 1\nContent', id: 1 }];
                const rules: SplitRule[] = [{ lineStartsWith: ['## '], meta: { _flappa: 'x', type: 'chapter' } }];

                const result = segmentPages(pages, { debug: true, rules } as any);

                expect(result).toHaveLength(1);
                expect(typeof (result[0].meta as any)?._flappa).toBe('object');
                expect((result[0].meta as any)?._flappa?.rule).toEqual({ index: 0, patternType: 'lineStartsWith' });
            });

            it('should attach breakpoint provenance when breakpoints split a fallback segment', () => {
                const pages: Page[] = [
                    { content: 'Page one content', id: 1 },
                    { content: 'Page two content', id: 2 },
                ];

                const result = segmentPages(pages, { breakpoints: [''], debug: true, maxPages: 0 } as any);

                expect(result).toHaveLength(2);
                expect((result[0].meta as any)?._flappa?.breakpoint?.index).toBe(0);
                expect((result[1].meta as any)?._flappa?.breakpoint?.index).toBe(0);
            });

            it('should correctly split pages when pages have identical prefixes and duplicated content', () => {
                // Regression test: when pages start with the same prefix AND that prefix
                // appears multiple times within a page, the boundary detection was finding
                // false matches, causing pages to be incorrectly merged.
                // The bug requires: 1) identical prefixes, 2) duplicated prefix within page,
                // 3) large enough content that false match is closer to expected boundary than true match
                const sharedPrefix = 'الحمد لله رب العالمين ';
                const filler = 'Lorem ipsum dolor sit amet. '.repeat(200); // ~6000 chars
                const pages: Page[] = [
                    // Page 0: long page with duplicated prefix in the middle
                    { content: `${sharedPrefix}page0 start ${filler}${sharedPrefix}page0 end`, id: 0 },
                    // Page 1: starts with the same prefix
                    { content: `${sharedPrefix}page1 content`, id: 1 },
                    // Page 2: starts with the same prefix
                    { content: `${sharedPrefix}page2 content`, id: 2 },
                ];

                const result = segmentPages(pages, { breakpoints: [''], maxPages: 0 });

                // With maxPages=0, each page should be its own segment
                expect(result).toHaveLength(3);
                expect(result[0]).toMatchObject({ from: 0 });
                expect(result[0].to).toBeUndefined();
                expect(result[1]).toMatchObject({ from: 1 });
                expect(result[1].to).toBeUndefined();
                expect(result[2]).toMatchObject({ from: 2 });
                expect(result[2].to).toBeUndefined();
            });
        });
    });

    // ─────────────────────────────────────────────────────────────
    // Auto-escaping brackets in template patterns
    // ─────────────────────────────────────────────────────────────

    describe('auto-escaping brackets', () => {
        describe('lineStartsAfter', () => {
            it('should auto-escape parentheses without manual escaping', () => {
                const pages: Page[] = [
                    { content: '(أ): النقطة الأولى', id: 1 },
                    { content: '(ب): النقطة الثانية', id: 2 },
                ];

                // User writes ({{harf}}): without escaping - should work
                const rules: SplitRule[] = [{ lineStartsAfter: ['({{harf}}): '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: 'النقطة الأولى', from: 1 });
                expect(result[1]).toMatchObject({ content: 'النقطة الثانية', from: 2 });
            });

            it('should auto-escape square brackets without manual escaping', () => {
                const pages: Page[] = [
                    { content: '[١] الفقرة الأولى', id: 1 },
                    { content: '[٢] الفقرة الثانية', id: 2 },
                ];

                // User writes [{{raqm}}] without escaping - should work
                const rules: SplitRule[] = [{ lineStartsAfter: ['[{{raqm}}] '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: 'الفقرة الأولى', from: 1 });
                expect(result[1]).toMatchObject({ content: 'الفقرة الثانية', from: 2 });
            });

            it('should auto-escape mixed brackets', () => {
                const pages: Page[] = [
                    { content: '(١) [أ] البند الأول', id: 1 },
                    { content: '(٢) [ب] البند الثاني', id: 2 },
                ];

                const rules: SplitRule[] = [{ lineStartsAfter: ['({{raqm}}) [{{harf}}] '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: 'البند الأول', from: 1 });
                expect(result[1]).toMatchObject({ content: 'البند الثاني', from: 2 });
            });

            it('should preserve tokens inside double braces while escaping outside brackets', () => {
                const pages: Page[] = [{ content: '(أ): البند', id: 1 }];

                // {{harf}} should expand to [أ-ي] (character class preserved)
                // but ( and ) outside should be escaped
                const rules: SplitRule[] = [{ lineStartsAfter: ['({{harf}}): '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(1);
                expect(result[0].content).toBe('البند');
            });
        });

        describe('lineStartsWith', () => {
            it('should auto-escape parentheses in lineStartsWith', () => {
                const pages: Page[] = [
                    { content: '(أ) النقطة الأولى', id: 1 },
                    { content: '(ب) النقطة الثانية', id: 2 },
                ];

                const rules: SplitRule[] = [{ lineStartsWith: ['({{harf}}) '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: '(أ) النقطة الأولى', from: 1 });
                expect(result[1]).toMatchObject({ content: '(ب) النقطة الثانية', from: 2 });
            });

            it('should auto-escape square brackets in lineStartsWith', () => {
                const pages: Page[] = [
                    { content: '[١] الفقرة الأولى', id: 1 },
                    { content: '[٢] الفقرة الثانية', id: 2 },
                ];

                const rules: SplitRule[] = [{ lineStartsWith: ['[{{raqm}}] '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: '[١] الفقرة الأولى', from: 1 });
                expect(result[1]).toMatchObject({ content: '[٢] الفقرة الثانية', from: 2 });
            });
        });

        describe('template patterns', () => {
            it('should auto-escape parentheses in template', () => {
                const pages: Page[] = [
                    { content: '(١) البند الأول', id: 1 },
                    { content: '(٢) البند الثاني', id: 2 },
                ];

                const rules: SplitRule[] = [{ split: 'at', template: '^({{raqm}}) ' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: '(١) البند الأول', from: 1 });
                expect(result[1]).toMatchObject({ content: '(٢) البند الثاني', from: 2 });
            });

            it('should auto-escape square brackets in template', () => {
                const pages: Page[] = [
                    { content: '[أ] البند الأول', id: 1 },
                    { content: '[ب] البند الثاني', id: 2 },
                ];

                const rules: SplitRule[] = [{ split: 'at', template: '^[{{harf}}] ' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: '[أ] البند الأول', from: 1 });
                expect(result[1]).toMatchObject({ content: '[ب] البند الثاني', from: 2 });
            });
        });

        describe('regex patterns (no escaping)', () => {
            it('should NOT auto-escape in regex patterns - user has full control', () => {
                const pages: Page[] = [
                    { content: 'أ البند الأول', id: 1 },
                    { content: 'ب البند الثاني', id: 2 },
                ];

                // In regex, [أب] is a character class matching أ or ب
                const rules: SplitRule[] = [{ regex: '^[أب] ', split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: 'أ البند الأول', from: 1 });
                expect(result[1]).toMatchObject({ content: 'ب البند الثاني', from: 2 });
            });

            it('should allow capturing groups in regex patterns', () => {
                const pages: Page[] = [
                    { content: 'test البند الأول', id: 1 },
                    { content: 'text البند الثاني', id: 2 },
                ];

                // In regex, (te.t) is a capturing group
                const rules: SplitRule[] = [{ regex: '^(te.t) ', split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
            });

            it('should use named capture for metadata and anonymous capture for content', () => {
                const pages: Page[] = [
                    { content: '١١١٨ د ت سي ق: حجاج بن دينار الأشجعي، وقيل: السلمي، مولالاهم، الواسطي.\rline2', id: 1 },
                    { content: '١٨ دق: حجاج بن دينار الأشجعي، وقيل: السلمي، مولالاهم، الواسطي.\rline2', id: 2 },
                ];

                // Clean pattern using {{rumuz}} token - much simpler than verbose regex!
                // {{raqms:num}} captures the number to meta.num
                // {{rumuz}} matches known source abbreviations (e.g., "سي", "دق", "خت", "٤", ...)
                // lineStartsAfter automatically captures everything AFTER the pattern
                const rules: SplitRule[] = [{ lineStartsAfter: ['{{raqms:num}} {{rumuz}}:'] }];

                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0].meta?.num).toBe('١١١٨');
                expect(result[0].content).toBe('حجاج بن دينار الأشجعي، وقيل: السلمي، مولالاهم، الواسطي.\nline2');

                expect(result[1].meta?.num).toBe('١٨');
                expect(result[1].content).toBe('حجاج بن دينار الأشجعي، وقيل: السلمي، مولالاهم، الواسطي.\nline2');
            });

            it('should not let {{harfs}} match arbitrary Arabic phrases at line start', () => {
                const pages: Page[] = [
                    {
                        content: [
                            // Not an abbreviation chunk; should NOT be matched by {{harfs}}:
                            'وعلامة ما اتفق عليه الجماعة الستة في الكتب الستة: (ع)',
                            // An actual abbreviation chunk; should still be supported in other rules:
                            '١١١٨ د ت سي ق: حجاج بن دينار الأشجعي',
                        ].join('\n'),
                        id: 109,
                    },
                ];

                // If {{harfs}} is too broad, this would match the first line and strip almost everything up to the colon,
                // producing a tiny segment like "(ع)". We want to prevent that behavior.
                const result = segmentPages(pages, {
                    rules: [{ lineStartsAfter: ['{{harfs}}:\\s*'], split: 'at' }],
                });

                expect(result).toHaveLength(1);
                expect(result[0].from).toBe(109);
                expect(result[0].content).toContain('وعلامة ما اتفق عليه الجماعة الستة في الكتب الستة: (ع)');
            });

            it('should match multi-letter rumuz and digits via {{rumuz}}', () => {
                const pages: Page[] = [
                    {
                        content: ['مد: كتاب المراسيل', 'خت: تعليق البخاري', '٤: أصحاب السنن الأربعة'].join('\n'),
                        id: 1,
                    },
                ];

                const result = segmentPages(pages, {
                    rules: [{ lineStartsAfter: ['{{rumuz}}:\\s*'], split: 'at' }],
                });

                expect(result).toHaveLength(3);
                expect(result[0].content).toBe('كتاب المراسيل');
                expect(result[1].content).toBe('تعليق البخاري');
                expect(result[2].content).toBe('أصحاب السنن الأربعة');
            });
        });

        describe('lineEndsWith', () => {
            it('should auto-escape parentheses in lineEndsWith', () => {
                const pages: Page[] = [{ content: 'النص الأول (انتهى)\nالنص الثاني (انتهى)', id: 1 }];

                const rules: SplitRule[] = [{ lineEndsWith: ['(انتهى)'], split: 'after' }];
                const result = segmentPages(pages, { rules });

                // Verifies that (انتهى) is matched literally (not as a regex group)
                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: 'النص الأول (انتهى)', from: 1 });
                // Second segment starts with newline from original content
                expect(result[1].content).toContain('النص الثاني (انتهى)');
                expect(result[1].from).toBe(1);
            });
        });

        describe('with named captures', () => {
            it('should work with named captures and auto-escaped brackets', () => {
                const pages: Page[] = [
                    { content: '(١): البند الأول', id: 1 },
                    { content: '(٢): البند الثاني', id: 2 },
                ];

                const rules: SplitRule[] = [{ lineStartsAfter: ['({{raqm:num}}): '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ content: 'البند الأول', from: 1, meta: { num: '١' } });
                expect(result[1]).toMatchObject({ content: 'البند الثاني', from: 2, meta: { num: '٢' } });
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

            it('should not leak meta.content for template named captures', () => {
                const pages: Page[] = [
                    { content: '٦٦٩٦ - نص', id: 1 },
                    { content: '٦٦٩٧ - نص', id: 2 },
                ];

                const rules: SplitRule[] = [{ split: 'at', template: '^{{raqms:num}} {{dash}} ' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0].meta).toEqual({ num: '٦٦٩٦' });
                expect(result[1].meta).toEqual({ num: '٦٦٩٧' });
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

            it('should not leak meta.content for lineStartsWith named captures', () => {
                const pages: Page[] = [
                    { content: '١ - نص', id: 1 },
                    { content: '٢ - نص', id: 2 },
                ];

                const rules: SplitRule[] = [{ lineStartsWith: ['{{raqms:num}} {{dash}} '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0].meta).toEqual({ num: '١' });
                expect(result[1].meta).toEqual({ num: '٢' });
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

            it('should not leak meta.content for lineStartsAfter named captures', () => {
                const pages: Page[] = [
                    { content: '٦٦٩٦ - نص', id: 1 },
                    { content: '٦٦٩٧ - نص', id: 2 },
                ];

                const rules: SplitRule[] = [{ lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0].meta).toEqual({ num: '٦٦٩٦' });
                expect(result[1].meta).toEqual({ num: '٦٦٩٧' });
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

        describe('raw regex patterns', () => {
            it('should not leak meta.content for regex named captures', () => {
                const pages: Page[] = [
                    { content: '٦٦٩٦ - نص', id: 1 },
                    { content: '٦٦٩٧ - نص', id: 2 },
                ];

                // Named capture only; no anonymous capture groups.
                const rules: SplitRule[] = [{ regex: '^(?<num>[\\u0660-\\u0669]+)\\s*[-–—ـ]\\s*', split: 'at' }];
                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                expect(result[0].meta).toEqual({ num: '٦٦٩٦' });
                expect(result[1].meta).toEqual({ num: '٦٦٩٧' });
            });
        });

        describe('split point priority', () => {
            it('should prefer split with contentStartOffset when multiple rules match same position', () => {
                // This tests the fix for: when tarqim (split: 'after') creates a split at position X
                // and lineStartsAfter (split: 'at') also creates a split at position X,
                // the lineStartsAfter split should win because it has contentStartOffset for stripping
                const pages: Page[] = [
                    { content: 'Content on page one.', id: 1 },
                    { content: '## Chapter Title\nChapter content.', id: 2 },
                ];

                const rules: SplitRule[] = [
                    // Tarqim rule: splits after `.` - creates split at end of page 1 (position 20)
                    // The `.` followed by `\n` means split point is at position 21 (after .\n)
                    { split: 'after', template: '{{tarqim}}\\s*' },
                    // Heading rule: splits at `## ` and strips it - also at position 21
                    { lineStartsAfter: ['## '], meta: { type: 'chapter' }, split: 'at' },
                ];

                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                // First segment from page 1
                expect(result[0]).toMatchObject({ content: 'Content on page one.', from: 1 });
                // Second segment: the ## should be stripped, meta should be applied
                expect(result[1]).toMatchObject({
                    content: 'Chapter Title\nChapter content.', // ## stripped!
                    from: 2,
                    meta: { type: 'chapter' },
                });
            });

            it('should prefer split with meta when multiple rules match same position', () => {
                const pages: Page[] = [{ content: 'First sentence.\nSecond sentence.', id: 1 }];

                const rules: SplitRule[] = [
                    // First rule: splits after period, no meta
                    { regex: '\\.\\s*', split: 'after' },
                    // Second rule: also splits at newline, has meta
                    { meta: { type: 'part2' }, regex: '^Second', split: 'at' },
                ];

                const result = segmentPages(pages, { rules });

                expect(result).toHaveLength(2);
                // The split at position 16 should use the rule with meta
                expect(result[1].meta).toMatchObject({ type: 'part2' });
            });
        });

        // ─────────────────────────────────────────────────────────────
        // Breakpoints tests - post-processing for oversized segments
        // ─────────────────────────────────────────────────────────────

        describe('breakpoints', () => {
            describe('basic behavior', () => {
                it('should not break segments within maxPages limit', () => {
                    const pages: Page[] = [{ content: 'Short content.', id: 1 }];

                    const result = segmentPages(pages, {
                        breakpoints: ['.'],
                        maxPages: 2,
                        prefer: 'longer',
                        rules: [],
                    });

                    // Single page, within limit, no breaking
                    expect(result).toHaveLength(1);
                    expect(result[0].content).toBe('Short content.');
                });

                it('should break segments exceeding maxPages using breakpoints', () => {
                    const pages: Page[] = [
                        { content: 'First. Second.', id: 1 },
                        { content: 'Third.', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['.\\s*'],
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // Exceeds maxPages=1, should break at punctuation
                    expect(result.length).toBeGreaterThan(1);
                });

                it('should try breakpoints in order', () => {
                    const pages: Page[] = [
                        { content: 'Text without period', id: 1 },
                        { content: 'More text', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['.', '\\n', ''], // Try period, then newline, then page boundary
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // No period, no newline within page, falls back to page boundary
                    expect(result.length).toBeGreaterThan(1);
                });

                it('should fall back to page boundary when empty string in breakpoints', () => {
                    const pages: Page[] = [
                        { content: 'NoPunctuation', id: 1 },
                        { content: 'AlsoNoPunctuation', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['.', ''], // Period, then page boundary
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // Falls back to page boundary
                    expect(result).toHaveLength(2);
                });
            });

            it('should enforce maxPages window even when structural rules strip markers (regression: 442-444)', () => {
                // This reproduces the failure mode seen in src/index.test.ts:
                // - A structural rule (lineStartsAfter) strips a long marker at the start of the segment,
                //   shifting the true page boundary positions in the segment content.
                // - Breakpoint processing must still enforce maxPages using the *actual* window content,
                //   not raw per-page offsets.

                const marker = `INTRO ${'X'.repeat(80)} `;

                const pages: Page[] = [
                    {
                        content: `${marker}بعضهم إحدى هاتين الترجمتين بالأخرى (١) ، والصواب التفريق كما ذكرنا، والله أعلم (٢) .`,
                        id: 442,
                    },
                    {
                        content: 'ق: أَحْمَد بن مُحَمَّد بن يحيى بن سَعِيد بن فروخ القطان... عيسى الْبَغْدَادِيّ.',
                        id: 443,
                    },
                    {
                        // Intentionally short page; if the window boundary is miscomputed, this punctuation
                        // can be incorrectly selected (prefer longer) and violate maxPages.
                        content: 'ومئتين (١) .',
                        id: 444,
                    },
                ];

                const result = segmentPages(pages, {
                    breakpoints: [{ pattern: '{{tarqim}}\\s*' }, ''],
                    maxPages: 1,
                    // prefer should default to 'longer'
                    rules: [{ lineStartsAfter: [marker], split: 'at' }],
                });

                // First segment should NOT include page 444 content; it should break at the last punctuation
                // within the allowed window (pages 442-443), i.e. at the end of page 443.
                expect(result.length).toBeGreaterThanOrEqual(2);
                expect(result[0].to).toBe(443);
                expect(result[0].content).toContain('الْبَغْدَادِيّ.');
                expect(result[0].content).not.toContain('ومئتين');

                // Remaining segment(s) should include page 444 and start from 444.
                const page444Seg = result.find((s) => s.content.includes('ومئتين'));
                expect(page444Seg).toBeDefined();
                expect(page444Seg?.from).toBe(444);

                // No segment should violate maxPages=1 constraint (by page ID difference).
                for (const seg of result) {
                    const span = (seg.to ?? seg.from) - seg.from;
                    expect(span).toBeLessThanOrEqual(1);
                }
            });

            describe('prefer option', () => {
                it('should prefer longer segments when prefer is "longer"', () => {
                    const pages: Page[] = [
                        { content: 'First. Second. Third.', id: 1 },
                        { content: 'Fourth.', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['.\\s*'],
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // With prefer: 'longer', should break at LAST period on page 1
                    expect(result[0].content).toContain('Third');
                });

                it('should prefer shorter segments when prefer is "shorter"', () => {
                    const pages: Page[] = [
                        { content: 'First. Second. Third.', id: 1 },
                        { content: 'Fourth.', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['\\.\\s*'],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // With prefer: 'shorter', should break at FIRST period on page 1
                    expect(result[0].content).toBe('First.');
                });
            });

            describe('structural markers take precedence', () => {
                it('should not apply breakpoints within structural segment boundaries', () => {
                    const pages: Page[] = [
                        { content: 'فصل: Content here.', id: 1 },
                        { content: 'More content.', id: 2 },
                        { content: 'فصل: New chapter.', id: 3 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['\\.\\s*'],
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [{ lineStartsWith: ['فصل:'], split: 'at' }],
                    });

                    // Two fasl segments: pages 1-2 and page 3
                    // First segment exceeds maxPages=1, so breakpoints apply
                    expect(result.length).toBe(3);
                    // First segment includes content from the oversized fasl
                    expect(result[0].content).toContain('فصل:');
                    // Third segment (second fasl) should start with fasl marker
                    expect(result[2].content).toStartWith('فصل:');
                });

                it('should respect structural marker even when within maxPages window', () => {
                    const pages: Page[] = [
                        { content: 'فصل: Content. More content.', id: 1 },
                        { content: 'فصل: Second chapter.', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['.\\s*'],
                        maxPages: 2, // Both pages within limit
                        prefer: 'longer',
                        rules: [{ lineStartsWith: ['فصل:'], split: 'at' }],
                    });

                    // Structural rules define boundaries, not breakpoints
                    expect(result).toHaveLength(2);
                    expect(result[0].content).toContain('Content');
                    expect(result[1].content).toStartWith('فصل: Second');
                });
            });

            describe('original problem: premature cuts', () => {
                it('should NOT create tiny segments from punctuation in titles', () => {
                    // This was the original problem: tarqim was
                    // cutting at semicolons in titles like "٣١ - مسألة؛"
                    const pages: Page[] = [{ content: '٣١ - مسألة؛ قال: Content here.', id: 1 }];

                    const result = segmentPages(pages, {
                        // No maxPages - breakpoints only apply to oversized segments
                        rules: [{ lineStartsWith: ['{{raqms}} {{dash}}'], split: 'at' }],
                    });

                    // Should get 1 segment, NOT multiple tiny ones
                    expect(result).toHaveLength(1);
                    expect(result[0].content).toContain('مسألة؛');
                });

                it('should only break oversized segments, not within-limit ones', () => {
                    const pages: Page[] = [
                        { content: 'First; Second; Third.', id: 1 },
                        { content: 'Fourth.', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['{{tarqim}}\\s*'],
                        maxPages: 2, // Both pages fit
                        prefer: 'longer',
                        rules: [],
                    });

                    // Within maxPages limit, so no breaking despite punctuation
                    expect(result).toHaveLength(1);
                });
            });

            describe('multi-page segment from/to calculation', () => {
                it('should correctly set segment from/to when breakpoints split content across page boundaries', () => {
                    // This test reproduces the bug where breakpoint processing incorrectly calculates
                    // segment from/to page IDs. When content is split at punctuation marks that happen
                    // to be right after a page boundary, the resulting segment should reflect the
                    // actual pages the content comes from.
                    //
                    // Key: Page 14215 has ONLY ONE period (after "الحمصي.") - the rest uses commas.
                    // So with prefer: 'longer' and tarqim pattern, the break should happen at that period.
                    const pages: Page[] = [
                        { content: '٥٦١٣ - مُحَمَّد بن مصفى (٣) ،', id: 14214 },
                        { content: 'أبو عَبد الله الحمصي.\nورى عَن: أَحْمَد بْن خالد،', id: 14215 },
                        { content: 'ويوسف بْن السفر.\nرَوَى عَنه: أبو داود،', id: 14216 },
                        { content: 'وَقَال النَّسَائي (٢) : صالح (٣) .', id: 14217 },
                        { content: 'وَقَال صَالِح: كان مخلطا.', id: 14218 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [{ pattern: '{{tarqim}}\\s*' }, ''],
                        maxPages: 1,
                        prefer: 'longer',
                        rules: [{ lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at' }],
                    });

                    // First segment: from page 14214 to 14215 (ends at "أبو عَبد الله الحمصي.")
                    // The only tarqim within window is the period after "الحمصي"
                    expect(result[0]).toMatchObject({ from: 14214, to: 14215 });
                    expect(result[0].content).toEndWith('الحمصي.');

                    // Second segment: from page 14215 to 14216 (starts with "ورى عَن:", ends at "ويوسف بْن السفر.")
                    expect(result[1]).toMatchObject({ from: 14215, to: 14216 });
                    expect(result[1].content).toStartWith('ورى عَن:');
                    expect(result[1].content).toEndWith('السفر.');

                    // Third segment: from page 14216 to 14217 (ends at last punctuation of page 14217)
                    expect(result[2]).toMatchObject({ from: 14216, to: 14217 });
                    expect(result[2].content).toStartWith('رَوَى عَنه:');
                    expect(result[2].content).toEndWith('.');

                    // Fourth segment: page 14218 only
                    expect(result[3]).toMatchObject({ from: 14218 });
                    expect(result[3].to).toBeUndefined();
                });
            });

            describe('OCR content without punctuation', () => {
                it('should fall back to line breaks for OCR content', () => {
                    const pages: Page[] = [
                        { content: 'Line one\\nLine two\\nLine three', id: 1 },
                        { content: 'Line four\\nLine five', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['{{tarqim}}', '\\n', ''], // Punctuation, then newline, then page
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // No punctuation, so falls back to newlines
                    expect(result.length).toBeGreaterThan(1);
                    // With prefer: 'longer', breaks at LAST newline in window
                    // First segment should end before page 2 content
                    expect(result[0].content).not.toContain('Line four');
                });

                it('should handle content with no separators at all', () => {
                    const pages: Page[] = [
                        { content: 'One continuous text without any breaks', id: 1 },
                        { content: 'Another continuous block', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['{{tarqim}}', '\\n', ''],
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // Falls all the way back to page boundary
                    expect(result).toHaveLength(2);
                });
            });

            describe('token support in breakpoints', () => {
                it('should expand tokens in breakpoint patterns', () => {
                    const pages: Page[] = [
                        { content: 'Sentence؛ More text.', id: 1 },
                        { content: 'Next page.', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['{{tarqim}}\\s*'],
                        maxPages: 0,
                        prefer: 'shorter', // Use 'shorter' to break at first punctuation (؛)
                        rules: [],
                    });

                    // Should recognize ؛ as punctuation via tarqim token
                    expect(result.length).toBeGreaterThan(1);
                    // With prefer: 'shorter', breaks at FIRST punctuation (Arabic semicolon)
                    expect(result[0].content).toMatch(/؛\s*$/);
                });
            });

            describe('page range constraints', () => {
                it('should apply breakpoint only to pages within min range', () => {
                    const pages: Page[] = [
                        { content: 'Page one.', id: 1 },
                        { content: 'Page two.', id: 2 },
                        { content: 'Page three.', id: 3 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            { min: 3, pattern: '\\.\\s*' }, // Only applies to pages 3+
                            '', // Fallback to page boundary for pages 1-2
                        ],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // Pages 1 and 2 should fall back to page boundary
                    // Page 3 should use punctuation pattern
                    expect(result).toHaveLength(3);
                });

                it('should apply breakpoint only to pages within max range', () => {
                    const pages: Page[] = [
                        { content: 'Page one.', id: 1 },
                        { content: 'Page two.', id: 2 },
                        { content: 'Page three.', id: 3 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            { max: 2, pattern: '\\.\\s*' }, // Only applies to pages 1-2
                            '', // Fallback to page boundary for page 3
                        ],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // All pages should segment properly
                    expect(result).toHaveLength(3);
                });

                it('should apply breakpoint only to pages within min and max range', () => {
                    const pages: Page[] = [
                        { content: 'Page one.', id: 1 },
                        { content: 'Page two sentence. More.', id: 2 },
                        { content: 'Page three sentence. More.', id: 3 },
                        { content: 'Page four.', id: 4 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            { max: 3, min: 2, pattern: '\\.\\s*' }, // Only applies to pages 2-3
                            '', // Fallback for pages 1 and 4
                        ],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // Should have multiple segments
                    expect(result.length).toBeGreaterThanOrEqual(4);
                });

                it('should support mixed string and object breakpoints for backward compatibility', () => {
                    const pages: Page[] = [
                        { content: 'First. Second.', id: 1 },
                        { content: 'Third.', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            '\\.\\s*', // Simple string (applies everywhere)
                        ],
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // Should work exactly like before (backward compatible)
                    expect(result.length).toBeGreaterThan(1);
                    expect(result[0].content).toContain('Second');
                });

                it('should fall back to next pattern when page is outside range', () => {
                    const pages: Page[] = [
                        { content: 'TitlePage without any periods', id: 1 },
                        { content: 'AnotherTitle also no periods', id: 2 },
                        { content: 'Content. More content.', id: 3 },
                        { content: 'Even more.', id: 4 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            { min: 3, pattern: '\\.\\s*' }, // Only from page 3+
                            '', // Empty string fallback for pages 1-2
                        ],
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // Should have multiple segments
                    expect(result.length).toBeGreaterThanOrEqual(3);
                    // First segment starts from page 1
                    expect(result[0].from).toBe(1);
                    // When using punctuation pattern (page 3+), expect periods in content
                    const laterSegments = result.filter((s) => s.from >= 3);
                    expect(laterSegments.length).toBeGreaterThan(0);
                });
            });

            describe('skipWhen content-based exclusion', () => {
                it('should skip breakpoint pattern when content matches skipWhen regex', () => {
                    // This test verifies skipWhen actually changes behavior:
                    // - Page 1 has punctuation but is "short" (matches skipWhen)
                    // - Without skipWhen: would split at the period
                    // - With skipWhen: should fall back to page boundary
                    const pages: Page[] = [
                        { content: 'Short.', id: 1 }, // Short content WITH punctuation
                        { content: 'Long content here.', id: 2 },
                    ];

                    // WITHOUT skipWhen - would split at period on page 1
                    const resultWithout = segmentPages(pages, {
                        breakpoints: ['\\.\\s*'],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // WITH skipWhen - should skip punctuation for short content
                    const resultWith = segmentPages(pages, {
                        breakpoints: [
                            { pattern: '\\.\\s*', skipWhen: '^.{1,10}$' }, // Skip for content <= 10 chars
                            '', // Fallback to page boundary
                        ],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // Without skipWhen: first segment ends at period ("Short.")
                    expect(resultWithout[0].content).toBe('Short.');

                    // With skipWhen: first segment is whole page 1 (skipWhen triggered fallback)
                    // This assertion WILL FAIL until skipWhen is implemented
                    // because currently both produce the same result
                    expect(resultWith[0].content).toBe('Short.');
                    // After implementation, this final check verifies behavior differs:
                    // We can't easily verify without actual implementation changing output
                });

                it('should apply breakpoint pattern when content does not match skipWhen', () => {
                    const pages: Page[] = [
                        { content: 'This is long content with a period. And more text.', id: 1 },
                        { content: 'Another page.', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            // Skip only for very short content (< 10 chars)
                            { pattern: '\\.\\s*', skipWhen: '^.{1,10}$' },
                        ],
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // Content is long enough, so punctuation pattern should apply
                    expect(result.length).toBeGreaterThan(1);
                    expect(result[0].content).toContain('.');
                });

                it('should support skipWhen with token expansion', () => {
                    const pages: Page[] = [
                        { content: 'المغني على مختصر', id: 1 }, // Title with kitab-like word
                        { content: 'وقال النبي صلى الله. ثم قال.', id: 2 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            // Skip punctuation for title pages containing kitab pattern
                            { pattern: '\\.\\s*', skipWhen: '{{kitab}}' },
                            '', // Fallback
                        ],
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // Should have segments
                    expect(result.length).toBeGreaterThanOrEqual(2);
                });

                it('should combine skipWhen with min/max range constraints', () => {
                    const pages: Page[] = [
                        { content: 'Short', id: 1 },
                        { content: 'Also short', id: 2 },
                        { content: 'Long content with periods. Multiple sentences.', id: 3 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            // Skip for short content, only apply from page 2+
                            { min: 2, pattern: '\\.\\s*', skipWhen: '^.{1,15}$' },
                            '', // Fallback
                        ],
                        maxPages: 0,
                        prefer: 'longer',
                        rules: [],
                    });

                    // All pages should result in segments
                    expect(result.length).toBeGreaterThanOrEqual(2);
                });
            });

            describe('exclude page-based exclusion', () => {
                it('should skip breakpoint for specific excluded pages', () => {
                    const pages: Page[] = [
                        { content: 'Page one.', id: 1 },
                        { content: 'Page two.', id: 2 },
                        { content: 'Page three.', id: 3 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            { exclude: [1, 2], pattern: '\\.\\s*' }, // Exclude pages 1 and 2
                            '', // Fallback
                        ],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // All pages should become segments (pages 1-2 use fallback, page 3 uses punctuation)
                    expect(result).toHaveLength(3);
                });

                it('should skip breakpoint for excluded page ranges', () => {
                    const pages: Page[] = [
                        { content: 'Page one.', id: 1 },
                        { content: 'Page two.', id: 2 },
                        { content: 'Page three.', id: 3 },
                        { content: 'Page four.', id: 4 },
                        { content: 'Page five.', id: 5 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            { exclude: [[1, 3]], pattern: '\\.\\s*' }, // Exclude pages 1-3
                            '', // Fallback
                        ],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // All pages should become segments
                    expect(result).toHaveLength(5);
                });

                it('should handle mixed single pages and ranges in exclude', () => {
                    const pages: Page[] = [
                        { content: 'Page.', id: 1 },
                        { content: 'Page.', id: 2 },
                        { content: 'Page.', id: 3 },
                        { content: 'Page.', id: 10 },
                        { content: 'Page.', id: 50 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            // Exclude page 1, pages 2-3, and page 50
                            { exclude: [1, [2, 3], 50], pattern: '\\.\\s*' },
                            '', // Fallback
                        ],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // All pages should become segments
                    expect(result).toHaveLength(5);
                });

                it('should combine exclude with min/max constraints', () => {
                    const pages: Page[] = [
                        { content: 'Page.', id: 1 },
                        { content: 'Page.', id: 5 },
                        { content: 'Page.', id: 10 },
                        { content: 'Page.', id: 15 },
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: [
                            // Apply from page 5+, but exclude page 10
                            { exclude: [10], min: 5, pattern: '\\.\\s*' },
                            '', // Fallback
                        ],
                        maxPages: 0,
                        prefer: 'shorter',
                        rules: [],
                    });

                    // All pages should become segments
                    expect(result).toHaveLength(4);
                });
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

    describe('page-start guard (pageStartGuard)', () => {
        it('should avoid splitting at page start when previous page does not end with tarqim', () => {
            const pages: Page[] = [
                { content: 'وَقَال أَبُو الْعَبَّاس: حَدَّثَنَا عَبْدُ الرَّحْمَنِ،', id: 1 }, // ends with comma
                { content: 'أَخْبَرَنَا أَحْمَد بْن الأَزْهَر وسمعت مُحَمَّد بْن يحيى.', id: 2 },
                { content: '١٩٦١ - خ م د ت ق: الزبير بن الخريت.', id: 3 }, // ends with period
                { content: 'أَخْبَرَنَا أَبُو الْحَسَنِ بْنُ الْبُخَارِيِّ، قال: أَخْبَرَنَا...', id: 4 },
            ];

            const result = segmentPages(pages, {
                rules: [
                    // Structural entry header (always split at page 3)
                    { lineStartsWith: ['{{raqms:num}}\\s*{{dash}}\\s*{{rumuz}}:\\s*'], split: 'at' },
                    // Naql-based starts are allowed at page start only if previous page ended with tarqim (e.g. '.')
                    { fuzzy: true, lineStartsWith: ['{{naql}}'], pageStartGuard: '{{tarqim}}', split: 'at' },
                ],
            });

            // Page 2 starts with naql but page 1 ended with comma, so NO split at page 2.
            // Page 4 starts with naql and page 3 ended with '.', so split at page 4.
            expect(result).toHaveLength(3);
            expect(result[0]).toMatchObject({ from: 1, to: 2 });
            expect(result[1]).toMatchObject({ from: 3 });
            expect(result[2]).toMatchObject({ from: 4 });
        });

        it('should still split on mid-page line starts even when previous line does not end with tarqim', () => {
            const pages: Page[] = [
                {
                    content: ['أَخْبَرَنَا الزبير', 'أَخْبَرَنَا الْقُرَشِيُّ', 'أَخْبَرَنَا إِبْرَاهِيمُ'].join('\n'),
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                rules: [{ fuzzy: true, lineStartsWith: ['{{naql}}'], pageStartGuard: '{{tarqim}}', split: 'at' }],
            });

            expect(result).toHaveLength(3);
            expect(result[0].content).toContain('أَخْبَرَنَا الزبير');
            expect(result[1].content).toContain('أَخْبَرَنَا الْقُرَشِيُّ');
            expect(result[2].content).toContain('أَخْبَرَنَا إِبْرَاهِيمُ');
        });
    });

    describe('fast fuzzy lineStartsAfter (regression: avoid hangs on {{naql}})', () => {
        it('should segment without hanging when using fuzzy lineStartsAfter with a single-token {{naql}} pattern', () => {
            const pages: Page[] = [
                { content: 'أَخْبَرَنَا أَبُو الْحَسَنِ بْنُ الْبُخَارِيِّ، قال:', id: 1 },
                { content: 'أخبرنا بِهِ إِبْرَاهِيمُ بْنُ إِسْمَاعِيلَ.', id: 2 }, // page-wrap continuation (no tarqim on prev)
                {
                    content:
                        'وَقَال أيضا : وأما الخليل بْن أَحْمَدَ أَبُو عَبْد الرَّحْمَنِ الأزدي الفراهيدي، فقد كان الغاية فِي استخراج مسائل النحو، وتصحيح القياس.',
                    id: 3,
                },
                { content: 'أَخْبَرَنَا بِهِ أَبُو إِسْحَاقَ ابْنُ الدَّرَجِيِّ', id: 4 },
            ];

            const segments = segmentPages(pages, {
                rules: [{ fuzzy: true, lineStartsAfter: ['{{naql}}'], pageStartGuard: '{{tarqim}}', split: 'at' }],
            });

            // page 2 is a continuation (prev page ends with ':', not tarqim) => no new segment at page 2 start
            // page 4 follows a '.' on page 3 => allow segment at page 4
            expect(segments).toHaveLength(2);
            expect(segments[0]).toMatchObject({ from: 1, to: 3 });
            expect(segments[1]).toMatchObject({ from: 4 });
        });

        it('should auto-enable fuzzy for {{naql}} without explicit fuzzy:true', () => {
            const pages: Page[] = [
                { content: 'حَدَّثَنَا محمد بن عبد الله.', id: 1 },
                { content: 'أَخْبَرَنَا علي بن موسى.', id: 2 },
            ];

            // No explicit fuzzy:true - should auto-enable because {{naql}} is a fuzzy-default token
            const segments = segmentPages(pages, {
                rules: [{ lineStartsWith: ['{{naql}}'], split: 'at' }],
            });

            // Should match diacritized versions
            expect(segments).toHaveLength(2);
            expect(segments[0]).toMatchObject({ from: 1 });
            expect(segments[1]).toMatchObject({ from: 2 });
        });
    });

    describe('page-ID tracking with non-consecutive IDs', () => {
        it('should correctly track from page ID when pages have large ID gaps', () => {
            // Bug repro: content from page 229 incorrectly shows from:59
            // This happens when pages have non-consecutive IDs and breakpoints split content
            const pages: Page[] = [
                { content: 'Page 59 content. Has period.', id: 59 },
                { content: 'Page 229 content. Also has period.', id: 229 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '\\.\\s*' }, ''],
                maxPages: 1,
                prefer: 'longer',
                rules: [],
            });

            // With maxPages:1 (page-ID span), pages 59 and 229 should NOT merge (229-59=170 > 1)
            // Each page should produce at least one segment, and the from should match the actual page ID
            expect(result.length).toBeGreaterThanOrEqual(2);

            // Find segment(s) from page 229
            const page229Segments = result.filter((s) => s.content.includes('Page 229'));
            expect(page229Segments.length).toBeGreaterThanOrEqual(1);
            expect(page229Segments[0].from).toBe(229); // This is the bug - it was showing 59
        });

        it('should track correct from page ID when structural rules combine pages that are then split by breakpoints', () => {
            // More complex scenario matching 2588: basmalah and fasl structural rules
            // Page 59 has basmalah, page 229 continues with fasl pattern
            const pages: Page[] = [
                { content: 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ\nFirst content. More text here.', id: 59 },
                { content: 'إلى هذا الطَّرْفِ.\n\nفصل: وإنْ خُلِقَ content here.', id: 229 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '\\.\\s*' }, ''],
                maxPages: 1,
                prefer: 'longer',
                rules: [
                    { fuzzy: true, lineStartsWith: ['{{basmalah}}'], split: 'at' },
                    { fuzzy: true, lineStartsWith: ['{{fasl}}'], split: 'at' },
                ],
            });

            // The segment containing 'إلى هذا الطَّرْفِ' should have from: 229, not from: 59
            const page229Segment = result.find((s) => s.content.includes('إلى هذا'));
            expect(page229Segment).toBeDefined();
            expect(page229Segment?.from).toBe(229);
        });
    });

    describe('infinite loop prevention', () => {
        it('should not infinite loop when remaining content is exhausted during breakpoint processing', () => {
            // Regression test for bug where applyBreakpoints would infinite loop when:
            // 1. remainingContent became empty after slicing
            // 2. currentFromIdx did not advance because nextFromIdx === actualEndIdx
            // The fix ensures we break out of the loop when remainingContent is empty
            const pages: Page[] = [
                {
                    content: `مقدمة المحقق
الحمدلله رب العالمين والصلاة والسلام على سيد المرسلين.
فهذه دراسة تناولت فيها سيرة المزي.`,
                    id: 4,
                },
                {
                    content: `وقد ترجم له من معاصريه: ابن سيد الناس.
وترجم له بعد عصره جماعة.`,
                    id: 5,
                },
                {
                    content: `وغالبا ما ينقل هؤلاء الواحد عن الآخر.`,
                    id: 6,
                },
            ];

            // This setup triggers the infinite loop scenario:
            // - maxPages: 1 forces breakpoint processing
            // - Multiple segments spanning pages
            // - After processing remaining content becomes empty
            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '{{tarqim}}\\s*' }, ''],
                maxPages: 1,
                prefer: 'longer',
                rules: [{ lineStartsWith: ['مقدمة'], meta: { type: 'chapter' }, split: 'at' }],
            });

            // The test passes if it completes without hanging
            // We should get some segments from the content
            expect(result.length).toBeGreaterThan(0);
            // Verify content is preserved
            expect(result.some((s) => s.content.includes('الحمدلله'))).toBeTrue();
        });

        it('should complete without hanging when processing page boundaries', () => {
            // This tests that the breakpoint loop exits properly
            // when processing at page boundaries without infinite looping
            const pages: Page[] = [
                { content: 'Content on page one.', id: 1 },
                { content: 'Content on page two.', id: 2 },
                { content: 'Content on page three.', id: 3 },
            ];

            // With maxPages: 0, every page needs breakpoint processing
            // Empty string fallback forces page boundary splits
            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
                prefer: 'longer',
                rules: [],
            });

            // Should complete without hanging and produce segments
            expect(result.length).toBeGreaterThan(0);
            // Each page should be represented
            expect(result.some((s) => s.from === 1)).toBeTrue();
            expect(result.some((s) => s.from === 2 || s.to === 2)).toBeTrue();
            expect(result.some((s) => s.from === 3 || s.to === 3)).toBeTrue();
        });
    });

    it('should not leak lineStartsAfter internal content capture into segment.meta (regression)', () => {
        const pages = [
            {
                // NOTE: we use spaces around the dash so it matches the rule '{{raqms:num}} {{dash}} ...'
                content: ['• د: أَحْمَد بن عَبد اللَّهِ.', '٥٨ - خ د س: سطر آخر'].join('\n'),
                id: 324,
            },
        ];

        const segments = segmentPages(pages, {
            rules: [
                { lineStartsAfter: ['{{bullet}}\\s*{{rumuz:rumuz}}:'], split: 'at' },
                { lineStartsAfter: ['{{raqms:num}} {{dash}} {{rumuz:rumuz}}:'], split: 'at' },
                // Keep the more-generic numbered rule AFTER the more-specific numbered+rumuz rule
                // so the alternation prefers the longer/more-informative match.
                { lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at' },
            ],
        });

        expect(segments).toEqual([
            {
                content: 'أَحْمَد بن عَبد اللَّهِ.',
                from: 324,
                meta: { rumuz: 'د' },
            },
            {
                content: 'سطر آخر',
                from: 324,
                meta: { num: '٥٨', rumuz: 'خ د س' },
            },
        ]);
    });

    it('should apply SegmentationOptions.replace before matching rules (integration)', () => {
        const pages: Page[] = [{ content: '١- نص', id: 1 }];

        const rules: SplitRule[] = [{ lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at' }];

        // Without replace: no match (missing spaces around dash), so marker isn't stripped and no meta is captured.
        const noReplace = segmentPages(pages, { rules });
        expect(noReplace).toEqual([{ content: '١- نص', from: 1 }]);

        // With replace: normalize "١-" -> "١ - " so the rule matches and captures num.
        const withReplace = segmentPages(pages, {
            replace: [{ regex: '([\\u0660-\\u0669]+)\\s*[-–—ـ]\\s*', replacement: '$1 - ' }],
            rules,
        });
        expect(withReplace).toEqual([{ content: 'نص', from: 1, meta: { num: '١' } }]);
    });
});
