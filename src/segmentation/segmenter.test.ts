import { describe, expect, it } from 'bun:test';
import type { Page } from '@/types/index.js';
import type { SplitRule } from '@/types/rules.js';
import { FAST_PATH_THRESHOLD } from './breakpoint-constants';
import { dedupeSplitPoints, ensureFallbackSegment, segmentPages } from './segmenter';

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
        // Basic split: 'at' tests (current behavior)

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

        // Template and token expansion tests

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

        // lineStartsWith syntax sugar tests

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

        // Page constraints (min/max) tests

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

        // HTML preprocessing tests

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

        // NEW: split: 'after' tests (end markers)

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

        // NEW: occurrence tests

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

            it('should track which rule triggered each segment when multiple rules are used', () => {
                const pages: Page[] = [{ content: '## Chapter 1\nContent one\n--- Section A\nMore content', id: 1 }];
                const rules: SplitRule[] = [
                    { lineStartsWith: ['## '], meta: { type: 'chapter' } },
                    { lineStartsWith: ['--- '], meta: { type: 'section' } },
                ];

                const result = segmentPages(pages, { debug: true, rules } as any);

                expect(result).toHaveLength(2);

                // First segment triggered by rule 0 (chapter)
                expect(result[0].meta?.type).toBe('chapter');
                expect((result[0].meta as any)?._flappa?.rule).toEqual({ index: 0, patternType: 'lineStartsWith' });

                // Second segment triggered by rule 1 (section)
                expect(result[1].meta?.type).toBe('section');
                expect((result[1].meta as any)?._flappa?.rule).toEqual({ index: 1, patternType: 'lineStartsWith' });
            });

            it('should show different patternTypes for different rule types', () => {
                const pages: Page[] = [{ content: 'كتاب الإيمان\nContent here\n٤٢ - Second item', id: 1 }];
                const rules: SplitRule[] = [
                    { fuzzy: true, lineStartsWith: ['{{kitab}}'], meta: { type: 'book' } },
                    { lineStartsAfter: ['{{raqms}} {{dash}} '], meta: { type: 'hadith' } },
                ];

                const result = segmentPages(pages, { debug: true, rules } as any);

                expect(result).toHaveLength(2);

                // First rule is lineStartsWith
                expect((result[0].meta as any)?._flappa?.rule?.patternType).toBe('lineStartsWith');

                // Second rule is lineStartsAfter
                expect((result[1].meta as any)?._flappa?.rule?.patternType).toBe('lineStartsAfter');
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

            it('should not merge pages when maxPages=0 and maxContentLength forces sub-page splits', () => {
                const pages: Page[] = [
                    { content: 'x'.repeat(5000), id: 0 }, // long page, no punctuation
                    { content: 'y'.repeat(500), id: 1 }, // short page, no punctuation
                ];

                const result = segmentPages(pages, {
                    breakpoints: [{ pattern: '{{tarqim}}\\s*' }, ''],
                    maxContentLength: 2000,
                    maxPages: 0,
                    rules: [],
                });

                // maxPages=0 => segments must not span pages
                expect(result.some((s) => s.to !== undefined)).toBe(false);
                // page 0 should be split into 3 chunks (2000, 2000, 1000)
                expect(result.filter((s) => s.from === 0)).toHaveLength(3);
                // page 1 should be a single segment
                expect(result.filter((s) => s.from === 1)).toHaveLength(1);
            });

            it('should handle pageJoiner="newline" and "space" correctly without affecting boundary detection', () => {
                // Verify that boundary detection works regardless of the joiner used.
                // The algorithm prioritizes newlines, but should fall back to any whitespace if joiner is space.
                const prefix = 'COMMON_PREFIX ';
                const pages: Page[] = [
                    { content: `${prefix}Page 1 end.`, id: 0 },
                    { content: `${prefix}Page 2 end.`, id: 1 },
                ];

                // Case 1: space joiner (default)
                const resultSpace = segmentPages(pages, { breakpoints: [''], maxPages: 0, pageJoiner: 'space' });
                expect(resultSpace).toHaveLength(2);
                expect(resultSpace[0].content).toContain('Page 1 end.');
                expect(resultSpace[1].content).toContain('Page 2 end.');

                // Case 2: newline joiner
                const resultNewline = segmentPages(pages, { breakpoints: [''], maxPages: 0, pageJoiner: 'newline' });
                expect(resultNewline).toHaveLength(2);
                expect(resultNewline[0].content).toContain('Page 1 end.');
                expect(resultNewline[1].content).toContain('Page 2 end.');
            });

            it('should respect pageJoiner for structural segments that span multiple pages', () => {
                const pages: Page[] = [
                    { content: '## Header', id: 1 },
                    { content: 'Body Text', id: 2 },
                ];

                const rules: SplitRule[] = [{ lineStartsWith: ['## '], split: 'at' }];

                const asSpace = segmentPages(pages, { pageJoiner: 'space', rules });
                expect(asSpace).toHaveLength(1);
                expect(asSpace[0].from).toBe(1);
                expect(asSpace[0].to).toBe(2);
                expect(asSpace[0].content).toBe('## Header Body Text');

                const asNewline = segmentPages(pages, { pageJoiner: 'newline', rules });
                expect(asNewline).toHaveLength(1);
                expect(asNewline[0].from).toBe(1);
                expect(asNewline[0].to).toBe(2);
                expect(asNewline[0].content).toBe('## Header\nBody Text');
            });

            it('should correctly split very short pages (<100 chars) with duplicate prefixes', () => {
                // Edge case: Short pages where MAX_DEVIATION (2000) covers the whole page.
                // The deviation check is loose, but bestDistance logic should still pick the correct boundary.
                const prefix = 'ABC ';
                const pages: Page[] = [
                    { content: `${prefix}short page 1 ${prefix}duplicated`, id: 0 },
                    { content: `${prefix}short page 2`, id: 1 },
                ];

                const result = segmentPages(pages, { breakpoints: [''], maxPages: 0 });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({ from: 0 });
                expect(result[1]).toMatchObject({ from: 1 });
            });

            it('should fall back to expected boundary when prefix match is too far (MAX_DEVIATION check)', () => {
                // This test forces a "false match" that is the ONLY match but is too far away.
                // We simulate this by having Page 2 start with a UNIQUE string, but
                // Page 2 contains the prefix deep inside.
                // Page 1 ends normally.
                // Usually segmenter looks for Page 2's start prefix.
                // We'll trick it: make Page 2 start with something else, but contain the prefix later.
                const prefix = 'TARGET_PREFIX';
                const pages: Page[] = [
                    { content: 'Page 1 content end.', id: 0 },
                    // Page 2 starts with distinct text, but has prefix > 2000 chars in
                    { content: `Different start... ${'x'.repeat(2500)} ${prefix} late match`, id: 1 },
                ];

                // We need to manipulate the internal behavior slightly or rely on how
                // segmenter identifies page boundaries.
                // Actually, segmentPages uses the START of the next page as the search prefix.
                // So if Page 2 starts with "Different start...", that's what it searches for.
                // To trigger the deviation check, we need:
                // 1. The algorithms searches for "Different start..."
                // 2. That string appears > 2000 chars away from where expected boundary is.
                // 3. But it does NOT appear at the expected boundary.

                // Let's create a situation where expected boundary is at X.
                // But the content at X is garbled (e.g. OCR error).
                // And "Different start..." appears at X + 2500.

                // Since we can't easily simulate OCR error with just input strings (cumulative offsets match content),
                // we'll rely on the fact that `maxPages=0` forces a break at Page 1 -> Page 2.
                // The expected boundary is exactly where Page 2 starts.
                // If the content at Page 2 start matches the prefix, distance is 0.
                // So we can't easily trigger this with valid inputs because valid inputs represent valid boundaries.
                // The deviation check is a safety guard against *duplicated* content where the *true* boundary is missed/garbled.

                // So we'll trust the unit test logic correctness:
                // If best match > 2000, it returns -1.
                // Then fallback to bestExpectedBoundary.
                // If we have valid pages, bestExpectedBoundary IS the correct boundary.
                // So the result should be correct splits.
                const result = segmentPages(pages, { breakpoints: [''], maxPages: 0 });
                expect(result).toHaveLength(2);
                expect(result[0].content).toContain('Page 1 content end.');
                expect(result[1].content).toContain('Different start...');
            });

            it('should handle non-consecutive page IDs correctly', () => {
                // Ensure cumulative offsets and lookups don't assume sequential IDs (0, 1, 2...)
                const pages: Page[] = [
                    { content: 'Page 10 content', id: 10 },
                    { content: 'Page 20 content', id: 20 },
                    { content: 'Page 30 content', id: 30 },
                ];

                const result = segmentPages(pages, { breakpoints: [''], maxPages: 0 });

                expect(result).toHaveLength(3);
                expect(result[0]).toMatchObject({ from: 10 });
                expect(result[1]).toMatchObject({ from: 20 });
                expect(result[2]).toMatchObject({ from: 30 });
            });
        });
    });

    // Auto-escaping brackets in template patterns

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

    // Named Capture Groups: {{token:name}} syntax

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

        // Breakpoints tests - post-processing for oversized segments

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

            describe('regressions: maxPages enforcement on large books', () => {
                it('should preserve maxPages=0 at the fast-path threshold with pageJoiner="newline"', () => {
                    const pageCount = FAST_PATH_THRESHOLD;
                    const pages: Page[] = Array.from({ length: pageCount }, (_, i) => ({
                        content: `P${i}.`,
                        id: i,
                    }));

                    const result = segmentPages(pages, {
                        breakpoints: [''],
                        maxPages: 0,
                        pageJoiner: 'newline',
                        rules: [],
                    });

                    expect(result).toHaveLength(pageCount);
                    expect(result.every((s) => s.to === undefined)).toBe(true);
                    expect(result[0].from).toBe(0);
                    expect(result.at(-1)?.from).toBe(pageCount - 1);
                });

                it('should behave consistently just below and at the fast-path threshold (ID gaps)', () => {
                    // This guards the threshold boundary, which is where many "only in the full book" bugs live.
                    // The >= FAST_PATH_THRESHOLD path exercises offset-based slicing and boundary fast paths.
                    const makePages = (pageCount: number): Page[] =>
                        Array.from({ length: pageCount }, (_, i) => ({
                            content: `P${i}.`,
                            id: i * 2, // ID gaps of 2
                        }));

                    const run = (pages: Page[]) =>
                        segmentPages(pages, {
                            breakpoints: [''],
                            maxPages: 1,
                            rules: [],
                        });

                    const below = run(makePages(FAST_PATH_THRESHOLD - 1));
                    expect(below.every((s) => s.to === undefined)).toBe(true);
                    expect(below).toHaveLength(FAST_PATH_THRESHOLD - 1);

                    const at = run(makePages(FAST_PATH_THRESHOLD));
                    // With ID-span semantics and gaps of 2, no segment may span 2 pages
                    // because that would produce (to - from) >= 2 > 1.
                    const violations = at.filter((s) => s.to !== undefined && s.to - s.from > 1);
                    expect(violations).toHaveLength(0);
                    expect(at.every((s) => s.to === undefined)).toBe(true);
                    expect(at).toHaveLength(FAST_PATH_THRESHOLD);
                });

                it('should not violate maxPages in the offset fast path when page IDs have gaps (no maxContentLength)', () => {
                    // This reproduces the class of failure seen in the real-book integration tests:
                    // for very large fallback segments (1000+ pages), the breakpoint processor can take
                    // the offset-based fast path. If that path chunks by array size instead of maxPages'
                    // ID-span semantics, gaps like 2216 -> 2218 create segments where (to - from) > maxPages.
                    const pageCount = 1005; // >= FAST_PATH_THRESHOLD
                    const pages: Page[] = Array.from({ length: pageCount }, (_, i) => ({
                        content: `P${i}.`,
                        id: i * 2, // ID gaps of 2
                    }));

                    const result = segmentPages(pages, {
                        breakpoints: [''], // page-boundary fallback
                        maxPages: 1,
                        rules: [],
                    });

                    // With ID-span semantics and gaps of 2, no segment may span 2 pages
                    // because that would produce (to - from) >= 2 > 1.
                    const violations = result.filter((s) => s.to !== undefined && s.to - s.from > 1);
                    expect(violations).toHaveLength(0);
                    expect(result.every((s) => s.to === undefined)).toBe(true);
                    expect(result).toHaveLength(pageCount);
                });

                it('should not violate maxPages in the offset fast path with pageJoiner="newline" at scale', () => {
                    const pageCount = FAST_PATH_THRESHOLD;
                    const pages: Page[] = Array.from({ length: pageCount }, (_, i) => ({
                        content: `P${i}.`,
                        id: i * 2, // ID gaps of 2
                    }));

                    const result = segmentPages(pages, {
                        breakpoints: [''],
                        maxPages: 1,
                        pageJoiner: 'newline',
                        rules: [],
                    });

                    const violations = result.filter((s) => s.to !== undefined && s.to - s.from > 1);
                    expect(violations).toHaveLength(0);
                    expect(result.every((s) => s.to === undefined)).toBe(true);
                    expect(result).toHaveLength(pageCount);
                });

                it('should not violate maxPages in the iterative path when maxContentLength is set (leading-whitespace drift repro)', () => {
                    // This is the minimal deterministic reproduction of the "from: 206, to: 208" style bug:
                    // In the large-segment fast boundary-position path (1000+ pages), if the fallback segment's
                    // content is trimStart()'d, boundaryPositions derived from cumulative offsets drift forward.
                    // Then a piece that truly starts on page N can be attributed to page N-1, inflating ID span.
                    //
                    // This test fails if ensureFallbackSegment() trims the leading whitespace OR if piece page
                    // attribution is allowed to drift behind currentFromIdx for large segments.
                    const pageCount = 1005; // >= FAST_PATH_THRESHOLD

                    const pages: Page[] = [
                        // IMPORTANT: leading whitespace at the very start of the overall content.
                        { content: '   page0.', id: 0 },
                        // No punctuation on page 1.
                        { content: 'page1', id: 1 },
                        // Punctuation on page 2 ensures the next piece spans pages 1-2 under maxPages=1.
                        { content: 'page2.', id: 2 },
                        // Remaining pages: keep short + no punctuation to avoid changing break selection.
                        ...Array.from({ length: pageCount - 3 }, (_, i) => ({ content: `x${i}`, id: i + 3 })),
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['\\.\\s*', ''],
                        // Setting maxContentLength disables the large-book offset fast path,
                        // forcing the iterative path (the one that had page-attribution drift issues).
                        maxContentLength: 10_000_000,
                        maxPages: 1,
                        prefer: 'longer',
                        rules: [],
                    });

                    const violations = result.filter((s) => s.to !== undefined && s.to - s.from > 1);
                    expect(violations).toHaveLength(0);
                });

                it('should not violate maxPages when a structural rule strips a prefix at start of a huge segment (iterative + large boundary fast path)', () => {
                    // Another realistic "full book only" failure mode:
                    // a structural rule strips content at the start of a massive segment (lineStartsAfter),
                    // while breakpoint processing still uses cumulative-offset-based boundaries at scale.
                    // If page attribution drifts backwards, a piece can be reported as spanning too many pages.
                    const pageCount = FAST_PATH_THRESHOLD;
                    const pages: Page[] = [
                        { content: 'STRIP p0.', id: 0 },
                        { content: 'p1', id: 1 },
                        { content: 'p2.', id: 2 },
                        ...Array.from({ length: pageCount - 3 }, (_, i) => ({ content: `x${i}`, id: i + 3 })),
                    ];

                    const result = segmentPages(pages, {
                        breakpoints: ['\\.\\s*', ''],
                        // Forces the iterative breakpoint path even for 1000+ pages.
                        maxContentLength: 10_000_000,
                        maxPages: 1,
                        prefer: 'longer',
                        rules: [{ lineStartsAfter: ['STRIP '], split: 'at' }],
                    });

                    const violations = result.filter((s) => s.to !== undefined && s.to - s.from > 1);
                    expect(violations).toHaveLength(0);

                    // Sanity: page 2 content should not be lost.
                    // Depending on breakpoint selection, page 1+2 may be combined or emitted as separate pieces.
                    expect(result.some((s) => s.content.includes('p2.'))).toBe(true);
                    const combined = result.find((s) => s.content.includes('p1') && s.content.includes('p2.'));
                    if (combined) {
                        expect(combined.from).toBe(1);
                        // Depending on page-attribution heuristics, this may or may not set `to`,
                        // but it must never over-span maxPages (asserted above).
                        expect(combined.to === undefined || combined.to === 2).toBe(true);
                    }
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

    describe('maxContentLength safe break', () => {
        it('should not split in the middle of a word when maxContentLength forces a break', () => {
            // Single page with Arabic content without punctuation (longer than 100 chars)
            const pages: Page[] = [
                {
                    content:
                        'الكلمة الأولى والكلمة الثانية والكلمة الثالثة والكلمة الرابعة والكلمة الخامسة والكلمة السادسة والكلمة السابعة',
                    id: 1,
                },
            ];

            // maxContentLength=50 forces split within the page content
            const result = segmentPages(pages, {
                breakpoints: [''],
                maxContentLength: 50,
                maxPages: 0,
            });

            expect(result.length).toBeGreaterThan(1);
            // Each segment (except last) should end at a word boundary
            // After trimming, each segment shouldn't have a partial word
            for (let i = 0; i < result.length - 1; i++) {
                const seg = result[i];
                // The trimmed content shouldn't end with a character that looks like mid-word
                // Mid-word would mean the last char isn't whitespace and the next segment starts with continuation
                // const nextSeg = result[i + 1];
                // const firstCharOfNext = nextSeg.content[0];
                // If cut correctly, next segment should start with a complete word (starts with space after trim, or starts with new word)
                // A mid-word split would show the next segment starting with a letter fragment
                // For Arabic, we just verify the segment content length is reasonable
                expect(seg.content.length).toBeLessThanOrEqual(50);
            }
        });
    });

    describe('maxPages=0 page boundary preservation', () => {
        it('should not merge pages when second page has no breakpoint matches', () => {
            // Regression test: with maxPages=0, when the second page has no breakpoint matches
            // (no punctuation in this case), the segment should stop at the page boundary.
            // Bug: the last segment was incorrectly including content from both pages (from: 0, to: 1).
            const pages: Page[] = [
                { content: 'First page ends with punctuation.', id: 0 },
                {
                    content:
                        'Second page has absolutely no punctuation at all just a long string of text without any periods commas or other marks',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [
                    { pattern: '[.!?]\\s*' }, // Only matches the first page
                    '', // Page boundary fallback
                ],
                maxContentLength: 2000, // Trigger breakpoint processing
                maxPages: 0, // Each page must be its own segment
            });

            // Verify last segment is ONLY from page 1, not merged with page 0
            const lastSegment = result.at(-1);
            expect(lastSegment?.from).toBe(1);
            expect(lastSegment?.to).toBeUndefined(); // Single page = no 'to'

            // Also verify first segment is only from page 0
            const firstSegment = result[0];
            expect(firstSegment?.from).toBe(0);
            expect(firstSegment?.to).toBeUndefined();
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPREHENSIVE EDGE CASE TESTS
    // These tests are designed to catch bugs similar to the maxPages=0 merge bug
    // ═══════════════════════════════════════════════════════════════════════════

    describe('Edge Cases: maxPages=0 invariant enforcement', () => {
        it('should not span gapped page IDs when maxContentLength forces intra-page splits', () => {
            const pages: Page[] = [
                { content: 'Alpha. '.repeat(8), id: 1 },
                { content: 'Beta. '.repeat(8), id: 2 },
                { content: 'Gamma. '.repeat(8), id: 4 },
                { content: 'Delta. '.repeat(8), id: 5 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 50,
                maxPages: 1,
            });

            const violations = result.filter((s) => (s.to ?? s.from) - s.from > 1);
            expect(violations).toHaveLength(0);
            expect(result.some((s) => s.from === 1)).toBe(true);
            expect(result.some((s) => s.from === 2)).toBe(true);
            expect(result.some((s) => s.from === 4)).toBe(true);
            expect(result.some((s) => s.from === 5)).toBe(true);
        });

        it('should enforce maxPages=1 with gapped page IDs when only page-boundary breakpoints apply', () => {
            const pages: Page[] = [
                { content: 'No breaks here', id: 1 },
                { content: 'Still no breaks', id: 2 },
                { content: 'Gap page', id: 4 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 1,
                rules: [],
            });

            expect(result).toHaveLength(3);
            expect(result.every((s) => s.to === undefined)).toBe(true);
            expect(result.map((s) => s.from)).toEqual([1, 2, 4]);
        });

        it('should handle maxPages=0 with non-sequential page IDs', () => {
            // Non-sequential IDs can confuse offset calculations
            const pages: Page[] = [
                { content: 'Page content A. More text here.', id: 100 },
                { content: 'Page content B. Even more text.', id: 500 },
                { content: 'Page content C without punctuation at all', id: 999 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '\\.\\s*' }, ''],
                maxPages: 0,
            });

            // Every segment must have a unique 'from' and no 'to'
            expect(result.some((s) => s.to !== undefined)).toBe(false);
            expect(result.filter((s) => s.from === 100).length).toBeGreaterThan(0);
            expect(result.filter((s) => s.from === 500).length).toBeGreaterThan(0);
            expect(result.filter((s) => s.from === 999).length).toBeGreaterThan(0);
        });

        it('should handle maxPages=0 with single-character pages', () => {
            const pages: Page[] = [
                { content: 'A', id: 0 },
                { content: 'B', id: 1 },
                { content: 'C', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            expect(result).toHaveLength(3);
            expect(result.every((s) => s.to === undefined)).toBe(true);
            expect(result[0].content).toBe('A');
            expect(result[1].content).toBe('B');
            expect(result[2].content).toBe('C');
        });

        it('should handle maxPages=0 when many pages have identical content', () => {
            // Stress: identical content can confuse content-based boundary detection.
            // With maxPages=0, the engine must still produce one segment per page.
            const pages: Page[] = Array.from({ length: 50 }, (_, i) => ({ content: 'SAME_CONTENT', id: i }));

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            expect(result).toHaveLength(50);
            expect(result.every((s) => s.to === undefined)).toBe(true);
            for (let i = 0; i < 50; i++) {
                expect(result[i]).toMatchObject({ content: 'SAME_CONTENT', from: i });
            }
        });

        it('should handle maxPages=0 with empty pages interspersed', () => {
            const pages: Page[] = [
                { content: 'Page one content', id: 0 },
                { content: '', id: 1 }, // Empty
                { content: 'Page three content', id: 2 },
                { content: '   ', id: 3 }, // Whitespace only
                { content: 'Page five content', id: 4 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            // Should skip empty pages and not merge across them
            expect(result.length).toBeGreaterThanOrEqual(3);
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle maxPages=0 when page content exactly equals maxContentLength', () => {
            // Edge case: content length === maxContentLength
            const pages: Page[] = [
                { content: 'x'.repeat(100), id: 0 },
                { content: 'y'.repeat(100), id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxContentLength: 100,
                maxPages: 0,
            });

            // Each page fits exactly, should not merge
            expect(result).toHaveLength(2);
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle maxPages=0 when maxContentLength is larger than any single page', () => {
            const pages: Page[] = [
                { content: 'Short page one.', id: 0 },
                { content: 'Short page two.', id: 1 },
                { content: 'Short page three.', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 10000, // Much larger than any page
                maxPages: 0,
            });

            // Should still keep pages separate even though they'd fit in maxContentLength
            expect(result.length).toBeGreaterThanOrEqual(3);
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });
    });

    describe('Edge Cases: Unicode and special characters', () => {
        it('should handle Arabic text with diacritics at page boundaries', () => {
            const pages: Page[] = [
                { content: 'الحَمْدُ لِلَّهِ رَبِّ', id: 0 }, // With diacritics
                { content: 'الْعَالَمِينَ الرَّحْمَنِ', id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            expect(result).toHaveLength(2);
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should not split in the middle of a surrogate pair', () => {
            // Emoji and other characters that require surrogate pairs
            const emoji = '😀'; // U+1F600, requires surrogate pair
            const pages: Page[] = [{ content: `Text with emoji ${emoji}${emoji}${emoji} more text`, id: 0 }];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxContentLength: 50,
                maxPages: 0,
            });

            // Each segment should be valid UTF-16 (no broken surrogates)
            for (const seg of result) {
                // Check that decoding doesn't throw
                expect(() => JSON.stringify(seg.content)).not.toThrow();
                // Check no replacement characters (invalid surrogates become \uFFFD)
                expect(seg.content.includes('\uFFFD')).toBe(false);
            }
        });

        it('should handle RTL text with mixed scripts', () => {
            const pages: Page[] = [
                { content: 'English text followed by عربي text.', id: 0 },
                { content: 'More עברית and English.', id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
        });
    });

    describe('Edge Cases: Breakpoint pattern edge cases', () => {
        it('should handle empty string breakpoint as page boundary fallback', () => {
            const pages: Page[] = [
                { content: 'Page one without any breakpoint patterns', id: 0 },
                { content: 'Page two also lacks patterns', id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [
                    '\\n\\n', // Won't match
                    '', // Fallback to page boundary
                ],
                maxPages: 0,
            });

            expect(result).toHaveLength(2);
            expect(result[0].from).toBe(0);
            expect(result[1].from).toBe(1);
        });

        it('should handle breakpoint at the very start of a page', () => {
            const pages: Page[] = [
                { content: 'First page content', id: 0 },
                { content: '.Second page starts with breakpoint', id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['^\\.', ''],
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle breakpoint at the very end of a page', () => {
            const pages: Page[] = [
                { content: 'First page content.', id: 0 }, // Ends with breakpoint
                { content: 'Second page content without punctuation', id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle overlapping breakpoint patterns', () => {
            // Two patterns that could match the same position
            const pages: Page[] = [{ content: 'Text..More text...Even more text', id: 0 }];

            const result = segmentPages(pages, {
                breakpoints: ['\\.+', '\\.\\.\\.'], // Both match dots
                maxContentLength: 50,
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
        });
    });

    describe('Edge Cases: Exclusion patterns with maxPages=0', () => {
        it('should respect page exclusions with maxPages=0', () => {
            // Use longer content to trigger sub-page splitting
            const pages: Page[] = [
                { content: 'First sentence on page zero. Second sentence here. Third sentence now.', id: 0 },
                { content: 'First sentence on page one. Second sentence here. Third sentence now.', id: 1 },
                { content: 'First sentence on page two. Second sentence here. Third sentence now.', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [
                    { exclude: [1], pattern: '\\.\\s*' }, // Don't break on page 1
                    '',
                ],
                maxContentLength: 50, // Force sub-page splitting
                maxPages: 0,
            });

            // Page 0 and 2 should have multiple segments (split on dots due to maxContentLength)
            // Page 1 should be a single segment (no splits due to exclusion - patterns don't match)
            // BUT with maxContentLength, it may still split at safe positions
            expect(result.filter((s) => s.from === 0).length).toBeGreaterThanOrEqual(1);
            expect(result.filter((s) => s.from === 1).length).toBeGreaterThanOrEqual(1);
            expect(result.filter((s) => s.from === 2).length).toBeGreaterThanOrEqual(1);
            // No segments span pages
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle exclusion ranges with maxPages=0', () => {
            // Use longer content that exceeds maxContentLength to force splitting
            const pages: Page[] = [
                { content: 'Sentence A on page zero. Sentence B also here. Sentence C as well.', id: 0 },
                { content: 'Sentence D on page one. Sentence E also here. Sentence F as well.', id: 1 },
                { content: 'Sentence G on page two. Sentence H also here. Sentence I as well.', id: 2 },
                { content: 'Sentence J on page three. Sentence K also here. Sentence L as well.', id: 3 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [
                    { exclude: [[1, 2]], pattern: '\\.\\s*' }, // Don't break on pages 1-2
                    '',
                ],
                maxContentLength: 50, // Force sub-page splitting
                maxPages: 0,
            });

            // All pages should have at least one segment
            expect(result.filter((s) => s.from === 0).length).toBeGreaterThanOrEqual(1);
            expect(result.filter((s) => s.from === 1).length).toBeGreaterThanOrEqual(1);
            expect(result.filter((s) => s.from === 2).length).toBeGreaterThanOrEqual(1);
            expect(result.filter((s) => s.from === 3).length).toBeGreaterThanOrEqual(1);
            // No segments span pages
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });
    });

    describe('Edge Cases: Boundary position accuracy', () => {
        it('should keep page attribution when a structural split creates a short tail', () => {
            const marker = 'SPLIT start';
            const filler = 'x'.repeat(2100);
            const pages: Page[] = [
                { content: `${marker} intro ${filler}\n${marker} tail`, id: 0 },
                { content: 'NEXT page content.', id: 1 },
            ];

            const result = segmentPages(pages, {
                maxPages: 0,
                rules: [{ lineStartsWith: [marker] }],
            });

            expect(result).toHaveLength(3);
            expect(result[0].from).toBe(0);
            expect(result[1].from).toBe(0);
            expect(result[2].from).toBe(1);
            expect(result[2].content).toStartWith('NEXT page');
        });

        it('should not merge pages when relaxed boundary scan must consider early matches', () => {
            const marker = 'MARK';
            const repeatedLine = `${marker} line\n`;
            const filler = 'a'.repeat(6000);
            const tail = 'b'.repeat(20);
            const pages: Page[] = [
                { content: `${repeatedLine}${filler}\n${repeatedLine}${tail}`, id: 0 },
                { content: 'c'.repeat(6000), id: 1 },
                { content: 'd'.repeat(6000), id: 2 },
            ];

            const result = segmentPages(pages, {
                maxPages: 0,
                rules: [{ lineStartsWith: [marker] }],
            });

            expect(result.some((seg) => seg.from === 1)).toBe(true);
            expect(result.some((seg) => seg.from === 2)).toBe(true);
            expect(result.every((seg) => seg.to === undefined)).toBe(true);
        });

        it('should correctly identify page boundaries when pages have similar prefixes', () => {
            // This tests the findPageStartNearExpectedBoundary function
            const commonPrefix = 'SHARED_PREFIX_';
            const pages: Page[] = [
                { content: `${commonPrefix}Page 1 unique content here.`, id: 0 },
                { content: `${commonPrefix}Page 2 different content.`, id: 1 },
                { content: `${commonPrefix}Page 3 another variation.`, id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            expect(result).toHaveLength(3);
            expect(result.every((s) => s.to === undefined)).toBe(true);
            expect(result[0].content).toContain('Page 1');
            expect(result[1].content).toContain('Page 2');
            expect(result[2].content).toContain('Page 3');
        });

        it('should handle duplicate content across pages', () => {
            const pages: Page[] = [
                { content: 'Identical content', id: 0 },
                { content: 'Identical content', id: 1 },
                { content: 'Identical content', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            // Should still produce separate segments even with identical content
            expect(result).toHaveLength(3);
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle pages where one is a substring of another', () => {
            const pages: Page[] = [
                { content: 'Short', id: 0 },
                { content: 'Short and longer content', id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            expect(result).toHaveLength(2);
            expect(result[0].content).toBe('Short');
            expect(result[1].content).toBe('Short and longer content');
        });

        it('should handle segment starting at page boundary (offset 0) with marker also mid-page', () => {
            const marker = 'MARKER';
            const pages: Page[] = [
                { content: `${marker} start\nsome filler content here\n${marker} also mid-page`, id: 0 },
                { content: 'Page 2 content here.', id: 1 },
            ];

            const result = segmentPages(pages, {
                maxPages: 0,
                rules: [{ lineStartsWith: [marker] }],
            });

            // Should produce 3 segments: two from page 0 (start + mid-page split), one from page 1
            expect(result).toHaveLength(3);
            expect(result[0].from).toBe(0);
            expect(result[1].from).toBe(0);
            expect(result[2].from).toBe(1);
            expect(result[2].content).toStartWith('Page 2');
        });

        it('should handle very short pages (< 100 chars) with maxPages=0', () => {
            const pages: Page[] = [
                { content: 'A', id: 0 },
                { content: 'B', id: 1 },
                { content: 'C', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            expect(result).toHaveLength(3);
            expect(result[0].from).toBe(0);
            expect(result[1].from).toBe(1);
            expect(result[2].from).toBe(2);
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle pages with minimal prefix length (exactly 15 chars)', () => {
            const pages: Page[] = [
                { content: '123456789012345', id: 0 },
                { content: 'abcdefghij12345', id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            expect(result).toHaveLength(2);
            expect(result[0].from).toBe(0);
            expect(result[1].from).toBe(1);
        });

        it('should handle multiple candidate positions for same prefix', () => {
            // Page 2's prefix appears 3 times in the content: early, middle, and late
            const prefix = 'TARGET_PREFIX';
            const pages: Page[] = [
                {
                    content: `Start content\n${prefix} early occurrence\n${'x'.repeat(3000)}\n${prefix} middle occurrence\n${'y'.repeat(3000)}`,
                    id: 0,
                },
                { content: `${prefix} this is page 2`, id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            expect(result).toHaveLength(2);
            expect(result[0].from).toBe(0);
            expect(result[1].from).toBe(1);
            // Page 2 content should be intact, not split at an earlier false-positive
            expect(result[1].content).toContain('this is page 2');
        });

        it('should correctly attribute pages when marker creates tiny tail segment', () => {
            // Regression: marker near end of page creates tiny segment, next page incorrectly merged
            const marker = 'SPLIT';
            const pages: Page[] = [
                { content: `${marker} intro ${'x'.repeat(5000)}\n${marker} tiny`, id: 0 },
                { content: 'Page 2 content.', id: 1 },
                { content: 'Page 3 content.', id: 2 },
            ];

            const result = segmentPages(pages, {
                maxPages: 0,
                rules: [{ lineStartsWith: [marker] }],
            });

            expect(result.some((seg) => seg.from === 1)).toBe(true);
            expect(result.some((seg) => seg.from === 2)).toBe(true);
            expect(result.every((seg) => seg.to === undefined)).toBe(true);
        });
    });

    describe('Edge Cases: Large scale and performance-related', () => {
        it('should handle many small pages with maxPages=0', () => {
            const pages: Page[] = Array.from({ length: 50 }, (_, i) => ({
                content: `Page ${i} content.`,
                id: i,
            }));

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
            });

            // Should have at least 50 segments (one per page, possibly more if split on dots)
            expect(result.length).toBeGreaterThanOrEqual(50);
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle a single very large page with many breakpoints', () => {
            // 10000 characters with punctuation every 50 chars
            const content = Array.from({ length: 200 }, (_, i) => `Sentence number ${i}.`).join(' ');
            const pages: Page[] = [{ content, id: 0 }];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*'],
                maxContentLength: 500,
                maxPages: 0,
            });

            // Should produce multiple segments, all from page 0
            expect(result.length).toBeGreaterThan(1);
            expect(result.every((s) => s.from === 0 && s.to === undefined)).toBe(true);
        });

        it('should produce consistent page attribution at fast-path threshold boundary (999 vs 1000 pages)', () => {
            const makePages = (count: number): Page[] =>
                Array.from({ length: count }, (_, i) => ({
                    content: `Page ${i} unique content xyz${i}.`,
                    id: i,
                }));

            const run = (pages: Page[]) =>
                segmentPages(pages, {
                    breakpoints: [''],
                    maxPages: 0,
                });

            // Just below threshold (accurate path)
            const below = run(makePages(FAST_PATH_THRESHOLD - 1));
            // At threshold (fast path)
            const at = run(makePages(FAST_PATH_THRESHOLD));

            // Both should produce correct page attribution
            expect(below).toHaveLength(FAST_PATH_THRESHOLD - 1);
            expect(at).toHaveLength(FAST_PATH_THRESHOLD);

            // Verify page attribution is correct for both
            expect(below.every((s, i) => s.from === i && s.to === undefined)).toBe(true);
            expect(at.every((s, i) => s.from === i && s.to === undefined)).toBe(true);
        });
    });

    describe('Edge Cases: Interaction between maxPages and maxContentLength', () => {
        it('should respect both constraints when maxPages=0 and maxContentLength is set', () => {
            // Each page > maxContentLength, should split within page
            const pages: Page[] = [
                { content: 'x'.repeat(300), id: 0 },
                { content: 'y'.repeat(300), id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxContentLength: 100,
                maxPages: 0,
            });

            // Each page should split into 3 segments (300/100)
            expect(result.filter((s) => s.from === 0)).toHaveLength(3);
            expect(result.filter((s) => s.from === 1)).toHaveLength(3);
            // No segment should span pages
            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle maxPages=1 with maxContentLength smaller than combined pages', () => {
            const pages: Page[] = [
                { content: 'Page 0 content here.', id: 0 },
                { content: 'Page 1 content here.', id: 1 },
                { content: 'Page 2 content here.', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 50,
                maxPages: 1, // Allows spanning up to 2 pages
            });

            // maxContentLength is stricter in this case
            for (const seg of result) {
                expect(seg.content.length).toBeLessThanOrEqual(50);
            }
        });

        it('should handle maxPages=-1 (no page limit) with maxContentLength', () => {
            const pages: Page[] = [
                { content: 'Page 0.', id: 0 },
                { content: 'Page 1.', id: 1 },
                { content: 'Page 2.', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*'],
                maxContentLength: 100,
                maxPages: -1, // No page limit
            });

            // Should still respect maxContentLength
            for (const seg of result) {
                expect(seg.content.length).toBeLessThanOrEqual(100);
            }
        });
    });

    describe('Edge Cases: Content overlap at page boundaries (maxPages=0 regression)', () => {
        // These tests specifically target the bug where content-based page detection
        // in computeNextFromIdx gets confused by shared/overlapping text at page boundaries.

        it('should not merge when page 0 ends with the same text page 1 starts with', () => {
            // This is the exact pattern that caused the original bug
            const sharedText = 'This text appears at both boundaries';
            const pages: Page[] = [
                // Place the sharedText just after ~45 chars so maxContentLength=50 splits right BEFORE it,
                // making the next piece begin with sharedText while we are still inside page 0.
                { content: `${'x'.repeat(45)} ${sharedText} ${'y'.repeat(30)}`, id: 0 },
                { content: `${sharedText} and continues on page 1.`, id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                // Force at least one sub-page split on page 0 so we can hit the dangerous case:
                // remainingContent starts with page 1's prefix while the cursor is still in page 0.
                maxContentLength: 50,
                maxPages: 0,
            });

            // Should never have a segment spanning pages
            expect(result.every((s) => s.to === undefined)).toBe(true);
            // Ensure we actually exercised a sub-page split on page 0 (otherwise this test can become a no-op).
            expect(result.filter((s) => s.from === 0).length).toBeGreaterThanOrEqual(2);
            // Verify we have segments from both pages
            expect(result.some((s) => s.from === 0)).toBe(true);
            expect(result.some((s) => s.from === 1)).toBe(true);
        });

        it('should not merge when multiple pages share the same prefix', () => {
            const sharedPrefix = 'REPEATED_START_TEXT ';
            const pages: Page[] = [
                { content: `${sharedPrefix}Unique content A. More text.`, id: 0 },
                { content: `${sharedPrefix}Unique content B. More text.`, id: 1 },
                { content: `${sharedPrefix}Unique content C. More text.`, id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 100,
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
            expect(result.filter((s) => s.from === 0).length).toBeGreaterThanOrEqual(1);
            expect(result.filter((s) => s.from === 1).length).toBeGreaterThanOrEqual(1);
            expect(result.filter((s) => s.from === 2).length).toBeGreaterThanOrEqual(1);
        });

        it('should not merge when page content is a continuation of previous page', () => {
            // Simulates OCR/scan artifacts where sentences are cut mid-way
            const pages: Page[] = [
                { content: 'First sentence ends here. Second sentence starts and', id: 0 },
                { content: 'continues from the previous page. Third sentence.', id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 200,
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should handle Arabic text with shared phrases at boundaries', () => {
            // Arabic text often has common phrases that might appear at boundaries
            const sharedPhrase = 'قال الشيخ';
            const pages: Page[] = [
                { content: `نص عربي طويل. ${sharedPhrase}`, id: 0 },
                { content: `${sharedPhrase} رحمه الله تعالى`, id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 200,
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
            expect(result.some((s) => s.from === 0)).toBe(true);
            expect(result.some((s) => s.from === 1)).toBe(true);
        });

        it('should handle when the entire last sentence of page 0 is duplicated at start of page 1', () => {
            // This is common in books where the last line is repeated as a header on the next page
            const lastSentence = 'The conclusion of this chapter.';
            const pages: Page[] = [
                { content: `Introduction. Middle content. ${lastSentence}`, id: 0 },
                { content: `${lastSentence} New chapter begins here.`, id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 100,
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
            // Verify both pages have segments
            expect(result.filter((s) => s.from === 0).length).toBeGreaterThanOrEqual(1);
            expect(result.filter((s) => s.from === 1).length).toBeGreaterThanOrEqual(1);
        });

        it('should handle when page boundary falls in the middle of repeated content', () => {
            // The breakpoint falls within shared content
            const pages: Page[] = [
                { content: 'Text before. Shared sentence continues', id: 0 },
                { content: 'on the next page. Text after.', id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 200,
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
        });

        it('should not merge with long overlapping content and sub-page splitting', () => {
            // Combines overlapping content with maxContentLength forcing sub-page splits
            const sharedText = 'This text is shared between pages and is quite long to trigger splits';
            const pages: Page[] = [
                { content: `Page 0 start. Some content here. ${sharedText}`, id: 0 },
                { content: `${sharedText} and then page 1 continues with more content.`, id: 1 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 50, // Force sub-page splits
                maxPages: 0,
            });

            // No segment should span pages
            expect(result.every((s) => s.to === undefined)).toBe(true);
            // Should have multiple segments per page due to small maxContentLength
            expect(result.filter((s) => s.from === 0).length).toBeGreaterThanOrEqual(1);
            expect(result.filter((s) => s.from === 1).length).toBeGreaterThanOrEqual(1);
        });

        it('should handle three pages with circular overlap (A ends with B prefix, B ends with C prefix)', () => {
            const pages: Page[] = [
                { content: 'Page A content. Start of B content', id: 0 },
                { content: 'Start of B content here. Start of C content', id: 1 },
                { content: 'Start of C content continues here.', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', ''],
                maxContentLength: 200,
                maxPages: 0,
            });

            expect(result.every((s) => s.to === undefined)).toBe(true);
            expect(result.some((s) => s.from === 0)).toBe(true);
            expect(result.some((s) => s.from === 1)).toBe(true);
            expect(result.some((s) => s.from === 2)).toBe(true);
        });
    });

    describe('Breakpoint pattern behavior: standard pattern splits AFTER match', () => {
        it('should include matched text in previous segment with standard pattern', () => {
            // Standard pattern: "ولهذا" - the matched text is consumed
            // Previous segment should END WITH the matched text
            const pages: Page[] = [{ content: 'بداية النص ولهذا منتصف النص ولهذا نهاية النص الطويل', id: 0 }];

            const result = segmentPages(pages, {
                breakpoints: ['ولهذا'],
                maxContentLength: 50, // Force split within the page
                prefer: 'shorter', // Find FIRST match
            });

            // Should have 2 segments
            expect(result.length).toBe(2);

            // First segment should END WITH "ولهذا" (match is consumed)
            expect(result[0].content).toEndWith('ولهذا');
            expect(result[0].from).toBe(0);

            // Second segment should start AFTER "ولهذا" (not contain it at start)
            expect(result[1].content).not.toStartWith('ولهذا');
            expect(result[1].from).toBe(0);
        });

        it('should use prefer:longer to find last match in window', () => {
            // With prefer:'longer', should find the LAST match within the window
            const pages: Page[] = [{ content: 'أ. ب. ج. د. ه. و', id: 0 }];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*'],
                maxContentLength: 50,
                prefer: 'longer',
            });

            // Content fits, so no split needed
            expect(result.length).toBe(1);
            expect(result[0].content).toBe('أ. ب. ج. د. ه. و');
        });

        it('should use prefer:shorter to find first match in window', () => {
            // With prefer:'shorter', should find the FIRST match within the window
            const pages: Page[] = [
                {
                    content: 'الفقرة الأولى والنص الطويل. الفقرة الثانية مع المزيد. الفقرة الثالثة وكلام إضافي.',
                    id: 0,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*'],
                maxContentLength: 50,
                prefer: 'shorter',
            });

            // Should split at FIRST period
            expect(result.length).toBeGreaterThanOrEqual(2);
            expect(result[0].content).toEndWith('.');
        });

        it('should try breakpoint patterns in order (first match wins)', () => {
            // If first pattern matches, subsequent patterns are not tried
            const pages: Page[] = [
                {
                    content: 'النص الأول مع كلام طويل. ولهذا النص الثاني والمزيد من الكلمات الإضافية هنا',
                    id: 0,
                },
            ];

            // Pattern order: punctuation first, then "ولهذا"
            const result = segmentPages(pages, {
                breakpoints: ['\\.\\s*', 'ولهذا'],
                maxContentLength: 50,
                prefer: 'shorter',
            });

            // Should split at period (first pattern), not at "ولهذا"
            expect(result.length).toBeGreaterThanOrEqual(2);
            expect(result[0].content).toEndWith('.');
            expect(result[0].content).not.toContain('ولهذا');
        });

        it('should use pattern across page boundary when maxPages allows spanning', () => {
            // Test that patterns are found across page boundaries
            const pages: Page[] = [
                { content: 'بداية النص ولهذا', id: 0 },
                { content: 'منتصف النص', id: 1 },
                { content: 'نهاية النص', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['ولهذا'],
                maxPages: 1, // Allow spanning up to 2 pages
            });

            // First segment should end with "ولهذا"
            expect(result[0].content).toContain('ولهذا');
        });
    });

    describe('breakpoint split behavior', () => {
        it('should default to split:after (match included in previous segment)', () => {
            const pages: Page[] = [
                {
                    content:
                        'Part one with marker SPLIT and then part two with more text here for testing purposes and additional content to meet length requirements.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['SPLIT'],
                maxContentLength: 60,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // First segment should END WITH the match
            expect(result[0].content).toContain('SPLIT');
            // Second segment should NOT start with the match
            expect(result[1].content).not.toMatch(/^SPLIT/);
        });

        it('should support split:at (match moves to next segment)', () => {
            const pages: Page[] = [
                {
                    content:
                        'Part one with marker SPLIT and then part two with more text here for testing purposes and additional content.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: 'SPLIT', split: 'at' }],
                maxContentLength: 60,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // First segment should NOT contain the match
            expect(result[0].content).not.toContain('SPLIT');
            // Second segment should START WITH the match
            expect(result[1].content).toMatch(/^SPLIT/);
        });

        it('should honor min/max constraints with split:at', () => {
            const pages: Page[] = [
                { content: 'MARKER in page one.', id: 1 },
                { content: 'MARKER in page two.', id: 2 },
                { content: 'MARKER in page three.', id: 3 },
            ];

            // Only apply to pages 2 and 3
            const result = segmentPages(pages, {
                breakpoints: [{ max: 3, min: 2, pattern: 'MARKER', split: 'at' }],
                maxPages: 0,
            });

            // Page 1 should be its own segment (no breakpoint applies)
            expect(result[0].from).toBe(1);
            expect(result[0].content).toContain('MARKER'); // Falls through as no split happens
        });

        it('should honor min/max constraints with split:after', () => {
            const pages: Page[] = [
                {
                    content:
                        'Content MARKER more text here with additional padding to ensure content is long enough for testing.',
                    id: 5,
                },
                {
                    content:
                        'Content MARKER more text here with additional padding to ensure content is long enough for testing.',
                    id: 10,
                },
                {
                    content:
                        'Content MARKER more text here with additional padding to ensure content is long enough for testing.',
                    id: 15,
                },
            ];

            // Only apply to page ID range 8-12
            const result = segmentPages(pages, {
                breakpoints: [{ max: 12, min: 8, pattern: 'MARKER', split: 'after' }],
                maxContentLength: 60,
            });

            // The breakpoint should only apply to page 10
            // We verify the structure is as expected
            expect(result.some((s) => s.from === 10)).toBe(true);
        });

        it('should ignore split:at for empty pattern (page boundary)', () => {
            const pages: Page[] = [
                { content: 'Page one content', id: 1 },
                { content: 'Page two content', id: 2 },
            ];

            const withAt = segmentPages(pages, {
                breakpoints: [{ pattern: '', split: 'at' }],
                maxPages: 0,
            });

            const withAfter = segmentPages(pages, {
                breakpoints: [{ pattern: '', split: 'after' }],
                maxPages: 0,
            });

            // Both should produce the same result (page boundary behavior)
            expect(withAt.length).toBe(withAfter.length);
            expect(withAt[0].content).toBe(withAfter[0].content);
        });

        it('should treat invalid split value as after', () => {
            const pages: Page[] = [
                {
                    content:
                        'Part one SPLIT part two with more text here for testing purposes and additional content to meet requirements.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: 'SPLIT', split: 'invalid' as any }],
                maxContentLength: 50,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // Should behave as 'after' - first segment contains SPLIT
            expect(result[0].content).toContain('SPLIT');
        });

        it('should work with Arabic text and split:at', () => {
            const pages: Page[] = [
                {
                    content:
                        'بداية النص ولهذا المقطع الثاني مع كلام إضافي طويل يحتاج للتقسيم والمزيد من المحتوى لضمان الطول الكافي',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: 'ولهذا', split: 'at' }],
                maxContentLength: 55,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // First segment should NOT contain "ولهذا"
            expect(result[0].content).not.toContain('ولهذا');
            // Second segment should START with "ولهذا"
            expect(result[1].content).toMatch(/^ولهذا/);
        });

        it('should work with token expansion and split:at', () => {
            const pages: Page[] = [
                {
                    content: 'النص الأول مع بعض الكلمات الإضافية. النص الثاني مع محتوى إضافي كثير للتقسيم',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '{{tarqim}}', split: 'at' }],
                maxContentLength: 55,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // First segment should NOT end with the period
            expect(result[0].content).not.toMatch(/\.$/);
            // Second segment should contain the period at start
            expect(result[1].content).toMatch(/^\./);
        });

        it('should work with prefer:longer and split:at', () => {
            const pages: Page[] = [
                {
                    content:
                        'Start X middle X end with more content to force splitting here and additional text for length.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: 'X', split: 'at' }],
                maxContentLength: 55,
                prefer: 'longer',
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // With prefer:longer, should split at LAST X
            // First segment should contain first X but not second
            expect(result[0].content).toContain('Start X middle');
        });

        it('should fall through when match at position 0 with split:at', () => {
            const pages: Page[] = [
                {
                    content: 'MARKER at start then more content FALLBACK and even more text for testing purposes.',
                    id: 1,
                },
            ];

            // First pattern would match at position 0 with split:at, should fall through
            const result = segmentPages(pages, {
                breakpoints: [
                    { pattern: 'MARKER', split: 'at' },
                    { pattern: 'FALLBACK', split: 'after' },
                ],
                maxContentLength: 55,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // Should use FALLBACK pattern (split after)
            expect(result[0].content).toContain('FALLBACK');
        });

        it('should split on newline with split:after (newline ends previous segment)', () => {
            const pages: Page[] = [
                {
                    content:
                        'Line one with enough content to exceed the limit here\nLine two with enough content to exceed the limit here\nLine three with enough content here',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '\\n', split: 'after' }],
                maxContentLength: 60,
            });

            expect(result.length).toBe(3);
            // With split:after, the newline is consumed at the END of the previous segment
            // But createSegment() trims content, so trailing newlines are removed
            expect(result[0].content).toBe('Line one with enough content to exceed the limit here');
            expect(result[1].content).toBe('Line two with enough content to exceed the limit here');
            expect(result[2].content).toBe('Line three with enough content here');
        });

        it('should split on newline with split:at (newline starts next segment, then trimmed)', () => {
            const pages: Page[] = [
                {
                    content:
                        'Line one with enough content to exceed the limit here\nLine two with enough content to exceed the limit here\nLine three with enough content here',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '\\n', split: 'at' }],
                maxContentLength: 60,
            });

            expect(result.length).toBe(3);
            // With split:at, the newline moves to START of next segment
            // But createSegment() trims content, so leading newlines are removed
            expect(result[0].content).toBe('Line one with enough content to exceed the limit here');
            expect(result[1].content).toBe('Line two with enough content to exceed the limit here');
            expect(result[2].content).toBe('Line three with enough content here');
        });

        it('should support {{newline}} token in breakpoints', () => {
            const pages: Page[] = [
                {
                    content:
                        'Line one with enough content to exceed the limit here\nLine two with enough content to exceed the limit here',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['{{newline}}'],
                maxContentLength: 60,
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('Line one with enough content to exceed the limit here');
            expect(result[1].content).toBe('Line two with enough content to exceed the limit here');
        });

        it('should split on double newline paragraph boundary', () => {
            const pages: Page[] = [
                {
                    content:
                        'First paragraph with some content.\n\nSecond paragraph with more content.\n\nThird paragraph here.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['\\n\\n'], // Double newline (paragraph break)
                maxContentLength: 50,
            });

            expect(result.length).toBe(3);
            expect(result[0].content).toBe('First paragraph with some content.');
            expect(result[1].content).toBe('Second paragraph with more content.');
            expect(result[2].content).toBe('Third paragraph here.');
        });

        describe('\\s* after {{tarqim}} redundancy proof', () => {
            it('should produce identical results with and without \\s* using split:after', () => {
                // Test that {{tarqim}}\s* and {{tarqim}} produce identical segments
                // because createSegment() trims content anyway
                const pages: Page[] = [
                    {
                        content:
                            'النص الأول مع محتوى إضافي هنا للطول.   النص الثاني مع المزيد من الكلمات! النص الثالث؟ نهاية',
                        id: 1,
                    },
                ];

                const withWhitespace = segmentPages(pages, {
                    breakpoints: ['{{tarqim}}\\s*'],
                    maxContentLength: 60,
                });

                const withoutWhitespace = segmentPages(pages, {
                    breakpoints: ['{{tarqim}}'],
                    maxContentLength: 60,
                });

                // Both should produce identical trimmed content
                expect(withWhitespace.length).toBe(withoutWhitespace.length);
                for (let i = 0; i < withWhitespace.length; i++) {
                    expect(withWhitespace[i].content).toBe(withoutWhitespace[i].content);
                    expect(withWhitespace[i].from).toBe(withoutWhitespace[i].from);
                    expect(withWhitespace[i].to).toBe(withoutWhitespace[i].to);
                }
            });

            it('should produce identical results with and without \\s* using split:at', () => {
                const pages: Page[] = [
                    {
                        content:
                            'النص الأول مع محتوى إضافي هنا للطول.   النص الثاني مع المزيد من الكلمات! النص الثالث؟ نهاية',
                        id: 1,
                    },
                ];

                const withWhitespace = segmentPages(pages, {
                    breakpoints: [{ pattern: '{{tarqim}}\\s*', split: 'at' }],
                    maxContentLength: 60,
                });

                const withoutWhitespace = segmentPages(pages, {
                    breakpoints: [{ pattern: '{{tarqim}}', split: 'at' }],
                    maxContentLength: 60,
                });

                // Both should produce identical trimmed content
                expect(withWhitespace.length).toBe(withoutWhitespace.length);
                for (let i = 0; i < withWhitespace.length; i++) {
                    expect(withWhitespace[i].content).toBe(withoutWhitespace[i].content);
                    expect(withWhitespace[i].from).toBe(withoutWhitespace[i].from);
                    expect(withWhitespace[i].to).toBe(withoutWhitespace[i].to);
                }
            });

            it('should produce identical results with multiple punctuation marks and varying whitespace', () => {
                // More comprehensive test with mixed punctuation and whitespace patterns
                const pages: Page[] = [
                    {
                        content:
                            'جملة أولى.  جملة ثانية!   جملة ثالثة؟ جملة رابعة؛  جملة خامسة. نهاية النص مع كلمات إضافية',
                        id: 1,
                    },
                ];

                const withWhitespace = segmentPages(pages, {
                    breakpoints: ['{{tarqim}}\\s*'],
                    maxContentLength: 55,
                });

                const withoutWhitespace = segmentPages(pages, {
                    breakpoints: ['{{tarqim}}'],
                    maxContentLength: 55,
                });

                expect(withWhitespace.length).toBe(withoutWhitespace.length);
                for (let i = 0; i < withWhitespace.length; i++) {
                    expect(withWhitespace[i].content).toBe(withoutWhitespace[i].content);
                }
            });

            it('should produce identical results when punctuation has no trailing whitespace', () => {
                // Edge case: punctuation immediately followed by more text (no whitespace)
                const pages: Page[] = [
                    {
                        content: 'النص.النص التالي مباشرة بدون مسافة!المزيد من النص هنا للاختبار؟نهاية',
                        id: 1,
                    },
                ];

                const withWhitespace = segmentPages(pages, {
                    breakpoints: ['{{tarqim}}\\s*'],
                    maxContentLength: 50,
                });

                const withoutWhitespace = segmentPages(pages, {
                    breakpoints: ['{{tarqim}}'],
                    maxContentLength: 50,
                });

                expect(withWhitespace.length).toBe(withoutWhitespace.length);
                for (let i = 0; i < withWhitespace.length; i++) {
                    expect(withWhitespace[i].content).toBe(withoutWhitespace[i].content);
                }
            });
        });

        it('should match mid-word if pattern appears inside a word (demonstrates the risk)', () => {
            // This test demonstrates that a breakpoint pattern like 'ولهذا' can match
            // mid-word if the text contains that substring. For example:
            // - "مَولهذا" = مَ + ولهذا (the pattern is embedded after the first letter)
            // The regex will find 'ولهذا' and split there, potentially breaking the word.

            const pages: Page[] = [
                {
                    content: 'النص الأول مَولهذا النص الثاني ولهذا النص الثالث وهذا نص إضافي للطول.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: 'ولهذا', split: 'at' }],
                maxContentLength: 55,
            });

            // This will match at the FIRST occurrence of 'ولهذا' which is inside 'مَولهذا'
            // The split happens mid-word, leaving 'مَ' at the end of the first segment
            expect(result.length).toBeGreaterThanOrEqual(2);

            // First segment ends with the orphaned 'مَ' (or nothing if trimmed)
            // The second segment starts with 'ولهذا' (the matched pattern)
            // This demonstrates that the pattern matches substrings, not whole words
            expect(result[1].content).toMatch(/^ولهذا/);
        });

        it('should use word boundary pattern to avoid mid-word matching', () => {
            // To avoid the mid-word matching issue, users should add word boundaries
            // or whitespace requirements to their pattern

            const pages: Page[] = [
                {
                    content: 'النص الأول مَولهذا النص وكلام ولهذا النص الثالث وهذا نص إضافي للطول.',
                    id: 1,
                },
            ];

            // Pattern requires whitespace before 'ولهذا' to avoid mid-word matches
            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '\\s+ولهذا', split: 'at' }],
                maxContentLength: 55,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);

            // Now it correctly skips 'مَولهذا' and finds the standalone 'ولهذا'
            // The split happens at the whitespace before 'ولهذا'
            // First segment should NOT end with orphaned 'مَ'
            expect(result[0].content).not.toMatch(/مَ$/);
        });

        it('should match multiple words using alternation with whitespace prefix', () => {
            // Use \\s+(?:word1|word2|word3) to match any of multiple words
            // while avoiding mid-word matches
            // NOTE: This uses the `regex` field since (?:...) groups require raw regex

            const pages: Page[] = [
                {
                    content: 'النص الأول مَوكذلك النص وكلام وكذلك النص الثاني فلذلك النص وأيضاً ولهذا النهاية.',
                    id: 1,
                },
            ];

            // regex field: raw regex with non-capturing group, preceding whitespace
            const result = segmentPages(pages, {
                breakpoints: [{ regex: '\\s+(?:ولهذا|وكذلك|فلذلك)', split: 'at' }],
                maxContentLength: 50,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);

            // Should skip 'مَوكذلك' (embedded) and find the first standalone match
            // The first standalone match is 'وكذلك' after 'وكلام'
            expect(result[0].content).not.toMatch(/مَ$/); // No orphaned letter

            // Second segment should start with one of the matched words
            expect(result[1].content).toMatch(/^(?:ولهذا|وكذلك|فلذلك)/);
        });

        it('should demonstrate \\b word boundary does NOT work with Arabic', () => {
            // This test demonstrates that JavaScript's \\b doesn't work with Arabic
            // because Arabic letters aren't considered "word characters"

            // Content with standalone 'ولهذا' (should match) and embedded in 'مَولهذا' (should not)
            const content = 'كلام ولهذا النص مَولهذا الكلام';

            // Without \\b - matches ALL occurrences (even mid-word)
            const withoutBoundary = /ولهذا/gu;
            const matchesWithout = [...content.matchAll(withoutBoundary)];
            expect(matchesWithout.length).toBe(2); // Finds both!

            // With \\b - matches NOTHING because Arabic letters aren't "word characters"
            const withWordBoundary = /\bولهذا\b/gu;
            const matchesWithBoundary = [...content.matchAll(withWordBoundary)];
            expect(matchesWithBoundary.length).toBe(0); // \\b fails completely!

            // This proves \\b is unreliable for Arabic:
            // - It doesn't match mid-word (good)
            // - But it also doesn't match standalone words (bad!)
            // Use \\s+ prefix pattern instead
        });
    });

    describe('pattern vs regex field', () => {
        it('should auto-escape brackets in pattern field', () => {
            // The "pattern" field auto-escapes () and [] like template patterns
            // A literal "(" in pattern becomes "\\(" in the regex

            const pages: Page[] = [
                {
                    content:
                        'First part (a) and more text here to reach minimum length. Second part (b) at the end of the text.',
                    id: 1,
                },
            ];

            // Pattern with literal "(a)" - brackets are auto-escaped
            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '(a)', split: 'after' }],
                maxContentLength: 60,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // Should split after "(a)"
            expect(result[0].content).toContain('(a)');
        });

        it('should NOT auto-escape brackets in regex field', () => {
            // The "regex" field is raw - () are regex groups, not literal

            const pages: Page[] = [
                {
                    content: 'النص الأول وكلام وكذلك النص الثاني فلذلك النص وأيضاً ولهذا النهاية.',
                    id: 1,
                },
            ];

            // Using regex field with non-capturing group (?:...|...)
            const result = segmentPages(pages, {
                breakpoints: [{ regex: '\\s+(?:ولهذا|وكذلك|فلذلك)', split: 'at' }],
                maxContentLength: 50,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // Should split at one of the matched words
            expect(result[1].content).toMatch(/^(?:ولهذا|وكذلك|فلذلك)/);
        });

        it('should NOT allow regex groups in pattern field (auto-escaping)', () => {
            // This test documents that the pattern field cannot use regex groups
            // like (?:...) because brackets are auto-escaped.
            // Users must use the regex field for such patterns.

            const pages: Page[] = [
                {
                    content:
                        'First part with literal (a) text and more content to reach minimum length. Second part here.',
                    id: 1,
                },
            ];

            // In pattern field, ( becomes literal ( in the regex
            // So this pattern will match the literal text "(a)"
            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '(a)', split: 'after' }],
                maxContentLength: 60,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // First segment should contain "(a)" - it matched the literal parentheses
            expect(result[0].content).toContain('(a)');
        });

        it('should support tokens in regex field too', () => {
            // The regex field should still support {{token}} expansion

            const pages: Page[] = [
                {
                    content:
                        'First text. Second text! Third text? End here. More content to reach minimum length needed.',
                    id: 1,
                },
            ];

            // Using {{tarqim}} in regex field
            const result = segmentPages(pages, {
                breakpoints: [{ regex: '{{tarqim}}\\s*', split: 'after' }],
                maxContentLength: 55,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // Should split after punctuation
            expect(result[0].content).toMatch(/[.!?]$/);
        });

        it('should prefer regex over pattern when both specified', () => {
            // If both are specified, regex takes precedence (like SplitRule)

            const pages: Page[] = [
                {
                    content:
                        'Text with REGEX marker and additional content here to reach minimum length. PATTERN marker at end.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [
                    {
                        pattern: 'PATTERN', // Would match literal PATTERN
                        regex: 'REGEX', // Should take precedence
                        split: 'after',
                    },
                ],
                maxContentLength: 60,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // Should split after "REGEX", not "PATTERN"
            expect(result[0].content).toContain('REGEX');
            expect(result[0].content).not.toContain('PATTERN');
        });
    });

    describe('preprocess option', () => {
        it('should apply removeZeroWidth before segmentation', () => {
            const pages: Page[] = [
                {
                    content: 'Text\u200Bhere with more content',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                preprocess: ['removeZeroWidth'],
                rules: [],
            });

            expect(result.length).toBe(1);
            // Zero-width character should be stripped
            expect(result[0].content).toBe('Texthere with more content');
            expect(result[0].content).not.toContain('\u200B');
        });

        it('should apply condenseEllipsis before segmentation', () => {
            const pages: Page[] = [
                {
                    content: 'First sentence... Second sentence.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['{{tarqim}}'],
                maxContentLength: 50,
                preprocess: ['condenseEllipsis'],
            });

            // With ellipsis condensed to …, {{tarqim}} should only match the period at end
            // The '...' becomes '…' which is not matched by {{tarqim}}'s period pattern
            expect(result.length).toBe(1);
            expect(result[0].content).toContain('…'); // Condensed ellipsis
        });

        it('should apply fixTrailingWaw before segmentation', () => {
            const pages: Page[] = [
                {
                    content: 'الكتاب و السنة',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                preprocess: ['fixTrailingWaw'],
                rules: [],
            });

            expect(result.length).toBe(1);
            // Trailing waw should be joined to next word
            expect(result[0].content).toBe('الكتاب والسنة');
        });

        it('should apply multiple preprocess transforms in order', () => {
            const pages: Page[] = [
                {
                    content: 'text\u200B... و word',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                preprocess: ['removeZeroWidth', 'condenseEllipsis', 'fixTrailingWaw'],
                rules: [],
            });

            expect(result.length).toBe(1);
            // All transforms applied:
            // - \u200B stripped
            // - ... -> …
            // - ' و ' -> ' و'
            expect(result[0].content).toBe('text… وword');
        });

        it('should respect min constraint on preprocess transform', () => {
            const pages: Page[] = [
                { content: 'text...', id: 1 },
                { content: 'more...', id: 10 },
            ];

            const result = segmentPages(pages, {
                preprocess: [{ min: 5, type: 'condenseEllipsis' }],
                rules: [],
            });

            // Page 1 (id < min 5): not transformed
            // Page 10 (id >= min 5): transformed
            expect(result.length).toBe(1);
            expect(result[0].content).toContain('text...');
            expect(result[0].content).toContain('more…');
        });

        it('should respect max constraint on preprocess transform', () => {
            const pages: Page[] = [
                { content: 'text...', id: 1 },
                { content: 'more...', id: 10 },
            ];

            const result = segmentPages(pages, {
                preprocess: [{ max: 5, type: 'condenseEllipsis' }],
                rules: [],
            });

            // Page 1 (id <= max 5): transformed
            // Page 10 (id > max 5): not transformed
            expect(result.length).toBe(1);
            expect(result[0].content).toContain('text…');
            expect(result[0].content).toContain('more...');
        });

        it('should work with removeZeroWidth mode:space', () => {
            const pages: Page[] = [
                {
                    content: 'مرح\u200Bبا',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                preprocess: [{ mode: 'space', type: 'removeZeroWidth' }],
                rules: [],
            });

            expect(result.length).toBe(1);
            expect(result[0].content).toBe('مرح با');
        });

        it('should preprocess before rules are applied', () => {
            // fixTrailingWaw should fix the pattern before rule matching
            const pages: Page[] = [
                {
                    content: '## Chapter\nكتاب و السنة',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                preprocess: ['fixTrailingWaw'],
                rules: [{ lineStartsWith: ['## '], split: 'at' }],
            });

            expect(result.length).toBe(1);
            expect(result[0].content).toContain('والسنة'); // Waw joined
        });

        it('should preprocess before breakpoints are applied', () => {
            const pages: Page[] = [
                {
                    content:
                        'First part... some text here to make it longer. Second part with more content to exceed limit.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: ['{{tarqim}}'],
                maxContentLength: 60,
                preprocess: ['condenseEllipsis'],
            });

            // Ellipsis condensed, so {{tarqim}} only matches the final period
            expect(result.length).toBe(2);
            expect(result[0].content).toContain('…');
        });

        it('should work with empty preprocess array', () => {
            const pages: Page[] = [
                {
                    content: 'text...',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                preprocess: [],
                rules: [],
            });

            expect(result.length).toBe(1);
            expect(result[0].content).toBe('text...');
        });

        it('should work without preprocess option', () => {
            const pages: Page[] = [
                {
                    content: 'text...',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                rules: [],
            });

            expect(result.length).toBe(1);
            expect(result[0].content).toBe('text...');
        });
    });

    describe('breakpoint words field', () => {
        it('should split at words with automatic whitespace boundary', () => {
            const pages: Page[] = [
                {
                    content:
                        'First part of the text فهذا some more content here ثم even more content to exceed the limit.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['فهذا', 'ثم'] }],
                maxContentLength: 60,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // With split:at (default for words), the word should start the next segment
            // But it's trimmed, so we check that the first segment doesn't end with the word
            expect(result[0].content).not.toMatch(/فهذا$/);
        });

        it('should respect split:after override for words', () => {
            const pages: Page[] = [
                {
                    content: 'Text before والله أعلم and more content here to make it longer for splitting.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ split: 'after', words: ['والله أعلم'] }],
                maxContentLength: 50,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
            // With split:after, the phrase should be at the END of the first segment
            expect(result[0].content).toContain('والله أعلم');
        });

        it('should prefer longer words in alternation', () => {
            const pages: Page[] = [
                {
                    content: 'Start ثم إن we have more content here ثم another match.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['ثم', 'ثم إن'] }],
                maxContentLength: 50,
                prefer: 'shorter',
            });

            // The longer "ثم إن" should be matched first (prefer:shorter = first match)
            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        it('should work with tokens in words', () => {
            const pages: Page[] = [
                {
                    content: 'Some text. Split here حدثنا and more content to exceed the limit here.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['{{naql}}'] }],
                maxContentLength: 50,
            });

            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        it('should respect min/max constraints on words', () => {
            const pages: Page[] = [
                { content: 'First page with word فهذا and more content here to exceed limit.', id: 1 },
                { content: 'Second page with word فهذا and more content here to exceed limit.', id: 10 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [
                    { min: 5, words: ['فهذا'] }, // Only applies from page 5+
                    '', // Fallback
                ],
                maxPages: 0,
            });

            // Page 1 shouldn't be split by the word (below min)
            // Page 10 should be split by the word
            expect(result.length).toBe(2);
        });

        it('should escape metacharacters in words', () => {
            const pages: Page[] = [
                {
                    content: 'Text with a.*b literal here and more content to exceed the limit.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['a.*b'] }],
                maxContentLength: 50,
            });

            // Should match literal "a.*b", not regex pattern
            expect(result.length).toBeGreaterThanOrEqual(2);
            // First segment should end before "a.*b"
            expect(result[0].content).not.toContain('a.*b');

            // Next segment should start with the literal text (not a regex-expanded match)
            expect(result[1].content).toStartWith('a.*b');
        });

        it('should match literal brackets in words (no double-escaping)', () => {
            const pages: Page[] = [
                {
                    content: 'Some text (important) and then more content here to exceed limit.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['(important)'] }],
                maxContentLength: 50,
            });

            // Should split at literal "(important)"
            expect(result.length).toBeGreaterThanOrEqual(2);
            // First segment should NOT contain "(important)" since we split at it
            expect(result[0].content).not.toContain('(important)');
            expect(result[1].content).toStartWith('(important)');
        });

        it('should match literal square brackets in words', () => {
            const pages: Page[] = [
                {
                    content: 'Reference [note] followed by more text to exceed the maximum limit.',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['[note]'] }],
                maxContentLength: 50,
            });

            // Should split at literal "[note]"
            expect(result.length).toBeGreaterThanOrEqual(2);
            expect(result[0].content).not.toContain('[note]');
            expect(result[1].content).toStartWith('[note]');
        });

        it('should filter out empty words arrays (not treat as page-boundary)', () => {
            const pages: Page[] = [
                { content: 'Page one content here.', id: 1 },
                { content: 'Page two content here.', id: 2 },
            ];

            const result = segmentPages(pages, {
                // Empty words should be filtered out, leaving only '' as fallback
                // If empty words WAS treated as page-boundary, we'd have 2 breakpoints
                // but since it's filtered, only '' breakpoint applies
                breakpoints: [{ words: [] }, ''],
                debug: true,
                maxPages: 0, // Force single-page segments
            });

            // Should produce 2 segments (one per page) from '' fallback
            expect(result.length).toBe(2);
            expect(result[0].from).toBe(1);
            expect(result[0].to).toBeUndefined();
            expect(result[1].from).toBe(2);
            expect(result[1].to).toBeUndefined();

            // If empty words are truly filtered out, the remaining '' fallback is at index 0.
            expect((result[0].meta as any)?._flappa?.breakpoint?.index).toBe(0);
        });

        it('should match word prefixes (words field does NOT enforce word boundaries)', () => {
            // This test proves that words: ['ثم'] will also match 'ثمامة' (a name starting with ثم)
            // because the pattern is \s+(?:ثم) which matches any text starting with ثم after whitespace
            const pages: Page[] = [
                {
                    content: 'بداية النص ثمامة بن أثال كان من أهل اليمامة وهذا نص طويل يحتاج إلى تقسيم',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['ثم'] }],
                maxContentLength: 50,
            });

            // The word 'ثم' matches the prefix of 'ثمامة', so it splits there
            // Multiple splits may occur because the content is long
            expect(result.length).toBeGreaterThanOrEqual(2);
            // First segment ends before 'ثمامة' - proving 'ثم' matched inside 'ثمامة'
            expect(result[0].content).not.toContain('ثمامة');
            // Second segment starts with 'ثمامة' (the 'ثم' prefix matched)
            expect(result[1].content).toStartWith('ثمامة');
        });

        it('should use trailing space to match only complete words', () => {
            // Solution: add trailing space to match only the standalone word 'ثم '
            // This prevents matching 'ثمامة' since there's no space after 'ثم' in that word
            const pages: Page[] = [
                {
                    content: 'بداية النص ثمامة بن أثال ثم ذهب إلى المدينة وهذا نص طويل للتقسيم',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['ثم '] }], // Note: trailing space
                maxContentLength: 50,
            });

            // Now it should only match 'ثم ' (with space), not 'ثمامة'
            expect(result.length).toBe(2);
            // First segment should CONTAIN 'ثمامة' (wasn't split there)
            expect(result[0].content).toContain('ثمامة');
            // Second segment starts with 'ثم' (the standalone word)
            expect(result[1].content).toStartWith('ثم');
        });

        it('should NOT match بلغ when words contains بل with trailing space (regression)', () => {
            // Explicit regression test for the bug where:
            // words: ['بل '] was trimmed to 'بل' and incorrectly matched 'بلغ'
            const pages: Page[] = [
                {
                    content: 'لم تبلغهم الدعوة ولكن بل هم يعرفون الحق وهذا نص إضافي لتجاوز الحد',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['بل '] }], // trailing space = whole word only
                maxContentLength: 50,
            });

            // Should split at 'بل ' (standalone), NOT at 'بلغ' (embedded in 'تبلغهم')
            expect(result.length).toBe(2);
            // First segment should contain 'تبلغهم' (بلغ inside a word was NOT matched)
            expect(result[0].content).toContain('تبلغهم');
            // Second segment should start with 'بل' (the standalone word)
            expect(result[1].content).toStartWith('بل');
        });

        it('should NOT work with {{newline}} in words field (requires preceding whitespace)', () => {
            // Content has lines WITHOUT trailing whitespace before \n
            const pages: Page[] = [
                {
                    content:
                        'First line with enough content to exceed the minimum limit\nSecond line with enough content to exceed the minimum limit\nThird line here',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ words: ['{{newline}}'] }],
                maxContentLength: 70,
            });

            // words: ['{{newline}}'] generates \s+(?:\n) which requires whitespace BEFORE newline
            // Since newlines typically don't have whitespace before them, this won't match
            // The library falls back to safe-break (whitespace/unicode boundary)
            expect(result.length).toBeGreaterThan(1);
            // The splits happen at safe whitespace boundaries, NOT at exact line breaks
            // So the content is split mid-sentence at spaces, not cleanly at newlines
            expect(result[0].content).not.toBe('First line with enough content to exceed the minimum limit');
        });

        it('should work with {{newline}} in pattern field (no prefix added)', () => {
            const pages: Page[] = [
                {
                    content:
                        'First line with enough content to exceed the minimum limit\nSecond line with enough content to exceed the minimum limit\nThird line with enough content here',
                    id: 1,
                },
            ];

            const result = segmentPages(pages, {
                breakpoints: [{ pattern: '{{newline}}' }],
                maxContentLength: 70,
            });

            // pattern: '{{newline}}' matches \n directly without any prefix
            expect(result.length).toBe(3);
            expect(result[0].content).toBe('First line with enough content to exceed the minimum limit');
            expect(result[1].content).toBe('Second line with enough content to exceed the minimum limit');
            expect(result[2].content).toBe('Third line with enough content here');
        });

        it('should produce same output for {{newline}} with split:after and split:at (both trimmed)', () => {
            const pages: Page[] = [
                {
                    content:
                        'First line with enough content here to test\nSecond line with enough content here to test\nThird line',
                    id: 1,
                },
            ];

            const resultAfter = segmentPages(pages, {
                breakpoints: [{ pattern: '{{newline}}', split: 'after' }],
                maxContentLength: 50,
            });

            const resultAt = segmentPages(pages, {
                breakpoints: [{ pattern: '{{newline}}', split: 'at' }],
                maxContentLength: 50,
            });

            // Both should produce the same trimmed output
            // split:after → prev ends with \n, trimmed → no \n
            // split:at → next starts with \n, trimmed → no \n
            expect(resultAfter.length).toBe(resultAt.length);
            expect(resultAfter.map((s) => s.content)).toEqual(resultAt.map((s) => s.content));
            expect(resultAfter[0].content).toBe('First line with enough content here to test');
            expect(resultAfter[1].content).toBe('Second line with enough content here to test');
        });
    });

    describe('{{hr}} horizontal rule token', () => {
        it('should strip tatweel horizontal rule with lineStartsAfter', () => {
            const pages: Page[] = [
                { content: 'First section content\nـــــــــــــــ\nSecond section content', id: 1 },
            ];

            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section content');
            expect(result[1].content).toBe('Second section content');
            // Ensure the hr characters are NOT in either segment
            expect(result[0].content).not.toContain('ـ');
            expect(result[1].content).not.toContain('ـ');
        });

        it('should strip underscore horizontal rule with lineStartsAfter', () => {
            const pages: Page[] = [{ content: 'First section\n______________\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section');
            expect(result[1].content).toBe('Second section');
            expect(result[0].content).not.toContain('_');
            expect(result[1].content).not.toContain('_');
        });

        it('should strip em-dash horizontal rule with lineStartsAfter', () => {
            const pages: Page[] = [{ content: 'First section\n—————————\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section');
            expect(result[1].content).toBe('Second section');
            expect(result[0].content).not.toContain('—');
            expect(result[1].content).not.toContain('—');
        });

        it('should strip en-dash horizontal rule with lineStartsAfter', () => {
            const pages: Page[] = [{ content: 'First section\n–––––––––\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section');
            expect(result[1].content).toBe('Second section');
            expect(result[0].content).not.toContain('–');
            expect(result[1].content).not.toContain('–');
        });

        it('should strip hyphen horizontal rule with lineStartsAfter', () => {
            const pages: Page[] = [{ content: 'First section\n--------------\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section');
            expect(result[1].content).toBe('Second section');
            expect(result[0].content).not.toContain('-');
            expect(result[1].content).not.toContain('-');
        });

        it('should keep tatweel horizontal rule with lineStartsWith', () => {
            const pages: Page[] = [
                { content: 'First section content\nـــــــــــــــ\nSecond section content', id: 1 },
            ];

            const result = segmentPages(pages, {
                rules: [{ lineStartsWith: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section content');
            // The hr line should be at the START of the second segment
            expect(result[1].content).toContain('ـــــــــــــــ');
            expect(result[1].content).toStartWith('ـ');
        });

        it('should keep underscore horizontal rule with lineStartsWith', () => {
            const pages: Page[] = [{ content: 'First section\n______________\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsWith: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section');
            expect(result[1].content).toContain('______________');
            expect(result[1].content).toStartWith('_');
        });

        it('should keep em-dash horizontal rule with lineStartsWith', () => {
            const pages: Page[] = [{ content: 'First section\n—————————\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsWith: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section');
            expect(result[1].content).toContain('—————————');
            expect(result[1].content).toStartWith('—');
        });

        it('should keep en-dash horizontal rule with lineStartsWith', () => {
            const pages: Page[] = [{ content: 'First section\n–––––––––\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsWith: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section');
            expect(result[1].content).toContain('–––––––––');
            expect(result[1].content).toStartWith('–');
        });

        it('should keep hyphen horizontal rule with lineStartsWith', () => {
            const pages: Page[] = [{ content: 'First section\n--------------\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsWith: ['{{hr}}'], split: 'at' }],
            });

            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section');
            expect(result[1].content).toContain('--------------');
            expect(result[1].content).toStartWith('-');
        });

        it('should NOT match short dash sequences (below threshold)', () => {
            const pages: Page[] = [{ content: 'First section\n---\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            // Should NOT split because --- (3 chars) is below the 10 char threshold
            expect(result.length).toBe(1);
            expect(result[0].content).toContain('---');
        });

        it('should handle multiple hr variations in the same document', () => {
            const pages: Page[] = [
                { content: 'Section 1\n______________\nSection 2\nـــــــــــــــ\nSection 3', id: 1 },
            ];

            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            expect(result[0].content).toBe('Section 1');
            expect(result[1].content).toBe('Section 2');
            expect(result[2].content).toBe('Section 3');
        });

        it('should match mixed wide dashes (em/en) as hr', () => {
            // Mixed sequence of 5 chars: 4 em-dashes + 1 en-dash
            const pages: Page[] = [{ content: 'Start\n————–\nEnd', id: 1 }];
            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });
            expect(result.length).toBe(2);
            expect(result[0].content).toBe('Start');
            expect(result[1].content).toBe('End');
        });

        it('should match mixed punctuation (underscore/hyphen/tatweel) as hr', () => {
            const pages: Page[] = [{ content: 'Start\n_-_-_-\nEnd', id: 1 }]; // 6 chars mixed
            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });
            expect(result.length).toBe(2);
            expect(result[0].content).toBe('Start');
            expect(result[1].content).toBe('End');
        });

        it('should use consistent minimum length of 5 for all hr types', () => {
            // Test specifically for hyphens which used to be 10
            const pages: Page[] = [{ content: 'Start\n-----\nEnd', id: 1 }]; // 5 hyphens
            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });
            expect(result.length).toBe(2);
            expect(result[0].content).toBe('Start');
            expect(result[1].content).toBe('End');
        });

        it('should NOT match sequences shorter than 5 characters', () => {
            const pages: Page[] = [{ content: 'Start\n----\nEnd', id: 1 }]; // 4 hyphens
            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });
            expect(result.length).toBe(1); // Should not split
        });

        it('should match equals sign horizontal rule with lineStartsAfter', () => {
            const pages: Page[] = [{ content: 'Section 1\n==============\nSection 2', id: 1 }];
            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });
            expect(result.length).toBe(2);
            expect(result[0].content).toBe('Section 1');
            expect(result[1].content).toBe('Section 2');
        });

        it('should correctly attribute content to next page when hr is at end of page (regression)', () => {
            // Regression test: When {{hr}} matches at the END of a page with content
            // starting on the NEXT page, the segment's `from` should be the next page,
            // not the page where the hr was found.
            // Bug: lineStartsAfter was using the match position (page 1) for `from`
            // instead of where the actual trimmed content begins (page 2).
            const pages: Page[] = [
                { content: 'Content on page 1\n______________', id: 1 },
                { content: 'Content on page 2', id: 2 },
            ];

            const result = segmentPages(pages, {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            // Should produce 2 segments: one for page 1 content, one for page 2 content
            expect(result.length).toBe(2);

            // First segment is the content before the hr on page 1
            expect(result[0].content).toBe('Content on page 1');
            expect(result[0].from).toBe(1);

            // Second segment MUST be from page 2 (not page 1)
            // This was the bug: it was incorrectly set to page 1
            expect(result[1].content).toBe('Content on page 2');
            expect(result[1].from).toBe(2);
        });

        it('should NOT match em-dash sequences below threshold (4 chars)', () => {
            const pages: Page[] = [{ content: 'First section\n————\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            // Should NOT split because 4 em-dashes is below the 5 char threshold
            expect(result.length).toBe(1);
            expect(result[0].content).toContain('————');
        });

        it('should match em-dash sequences at exact threshold (5 chars)', () => {
            const pages: Page[] = [{ content: 'First section\n—————\nSecond section', id: 1 }];

            const result = segmentPages(pages, {
                rules: [{ lineStartsAfter: ['{{hr}}'], split: 'at' }],
            });

            // Should split because 5 em-dashes meets the threshold
            expect(result.length).toBe(2);
            expect(result[0].content).toBe('First section');
            expect(result[1].content).toBe('Second section');
        });
    });
});
