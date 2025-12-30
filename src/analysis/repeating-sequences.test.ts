import { describe, expect, it } from 'bun:test';
import { analyzeRepeatingSequences, tokenizeContent } from './repeating-sequences.js';

describe('tokenizeContent', () => {
    it('should identify a single token', () => {
        const text = 'حدثنا';
        const result = tokenizeContent(text, true);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            end: 5,
            raw: 'حدثنا',
            start: 0,
            text: '{{naql}}',
            type: 'token',
        });
    });

    it('should identify a single literal', () => {
        const text = 'مرحبا';
        const result = tokenizeContent(text, true);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            end: 5,
            raw: 'مرحبا',
            start: 0,
            text: 'مرحبا',
            type: 'literal',
        });
    });

    it('should handle attached punctuation', () => {
        const text = '(حدثنا)';
        const result = tokenizeContent(text, true);
        expect(result).toHaveLength(3);
        // 1. Literal '('
        expect(result[0]).toEqual({
            end: 1,
            raw: '(',
            start: 0,
            text: '(',
            type: 'literal',
        });
        // 2. Token 'naql'
        expect(result[1]).toEqual({
            end: 6,
            raw: 'حدثنا',
            start: 1,
            text: '{{naql}}',
            type: 'token',
        });
        // 3. Literal ')'
        expect(result[2]).toEqual({
            end: 7,
            raw: ')',
            start: 6,
            text: ')',
            type: 'literal',
        });
    });

    it('should normalize diacritics but preserve raw text', () => {
        const text = 'حَدَّثَنَا';
        const result = tokenizeContent(text, true);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('token');
        expect(result[0].text).toBe('{{naql}}');
        expect(result[0].raw).toBe('حَدَّثَنَا');
        expect(result[0].start).toBe(0);
        expect(result[0].end).toBe(10);
    });

    it('should handle mixed diacritics and literals', () => {
        const text = 'قَالَ: (حَدَّثَنَا)';
        const result = tokenizeContent(text, true);

        expect(result).toHaveLength(5);

        expect(result[0].text).toBe('قال');
        expect(result[0].raw).toBe('قَالَ');

        expect(result[1].text).toBe(':');

        expect(result[3].type).toBe('token');
        expect(result[3].text).toBe('{{naql}}');
        expect(result[3].raw).toBe('حَدَّثَنَا');
    });
});

describe('analyzeRepeatingSequences', () => {
    it('should detect single token patterns', () => {
        const pages = [
            {
                content: 'حدثنا أبو بكر أخبرنا محمد سمعت عمر',
                id: 1,
            },
        ];

        const result = analyzeRepeatingSequences(pages, { minCount: 1 });

        // Should find {{naql}} token (حدثنا, أخبرنا, سمعت are all naql)
        const naqlPattern = result.find((r) => r.pattern === '{{naql}}');
        expect(naqlPattern).toBeDefined();
        expect(naqlPattern!.count).toBe(3);
    });

    it('should detect multi-element patterns', () => {
        const pages = [
            {
                content: 'قال حدثنا فلان قال أخبرنا علان',
                id: 1,
            },
        ];

        const result = analyzeRepeatingSequences(pages, {
            maxElements: 2,
            minCount: 2,
            minElements: 2,
        });

        // Should find "قال {{naql}}"
        const pattern = result.find((r) => r.pattern.includes('قال') && r.pattern.includes('{{naql}}'));
        expect(pattern).toBeDefined();
        expect(pattern!.count).toBe(2);
    });

    it('should filter pure literals when requireToken is true', () => {
        const pages = [
            {
                content: 'كلمة عادية كلمة عادية كلمة عادية',
                id: 1,
            },
        ];

        const result = analyzeRepeatingSequences(pages, {
            minCount: 2,
            requireToken: true,
        });

        // Should be empty since no tokens
        expect(result).toHaveLength(0);
    });

    it('should include pure literals when requireToken is false', () => {
        const pages = [
            {
                content: 'كلمة عادية كلمة عادية كلمة عادية',
                id: 1,
            },
        ];

        const result = analyzeRepeatingSequences(pages, {
            minCount: 2,
            requireToken: false,
        });

        // Should find the "كلمة" pattern
        expect(result.length).toBeGreaterThan(0);
        expect(result.some((r) => r.pattern.includes('كلمة'))).toBe(true);
    });

    it('should handle empty pages array gracefully', () => {
        const result = analyzeRepeatingSequences([]);
        expect(result).toHaveLength(0);
    });

    it('should respect minCount filter', () => {
        const pages = [
            {
                content: 'حدثنا زيد حدثنا عمرو',
                id: 1,
            },
        ];

        // minCount: 3 should filter out the pattern with count 2
        const result = analyzeRepeatingSequences(pages, { minCount: 3 });
        expect(result).toHaveLength(0);

        // minCount: 2 should include it
        const result2 = analyzeRepeatingSequences(pages, { minCount: 2 });
        expect(result2.length).toBeGreaterThan(0);
    });

    it('should include context in examples', () => {
        const pages = [
            {
                content: 'نص قبل حدثنا نص بعد',
                id: 1,
            },
        ];

        const result = analyzeRepeatingSequences(pages, { contextChars: 10, minCount: 1 });

        const pattern = result.find((r) => r.pattern === '{{naql}}');
        expect(pattern).toBeDefined();
        expect(pattern!.examples.length).toBeGreaterThan(0);
        expect(pattern!.examples[0].context).toContain('نص قبل');
    });

    it('should work across multiple pages', () => {
        const pages = [
            { content: 'حدثنا فلان', id: 1 },
            { content: 'حدثنا آخر', id: 2 },
            { content: 'حدثنا ثالث', id: 3 },
        ];

        const result = analyzeRepeatingSequences(pages, { minCount: 1 });

        const naqlPattern = result.find((r) => r.pattern === '{{naql}}');
        expect(naqlPattern).toBeDefined();
        expect(naqlPattern!.count).toBe(3);

        // Check that examples span multiple pages
        const pageIds = naqlPattern!.examples.map((e) => e.pageId);
        expect(new Set(pageIds).size).toBeGreaterThan(1);
    });

    it('should sort by count descending', () => {
        const pages = [
            {
                content: 'حدثنا حدثنا حدثنا أخبرنا باب باب',
                id: 1,
            },
        ];

        const result = analyzeRepeatingSequences(pages, { minCount: 1 });

        // Results should be sorted by count
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].count).toBeGreaterThanOrEqual(result[i].count);
        }
    });

    it('should respect topK limit', () => {
        const pages = [
            {
                content: 'حدثنا أخبرنا سمعت باب كتاب فصل',
                id: 1,
            },
        ];

        const result = analyzeRepeatingSequences(pages, { minCount: 1, topK: 3 });

        expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should use space separator when whitespace option is "space"', () => {
        const pages = [
            {
                content: 'قال حدثنا قال أخبرنا',
                id: 1,
            },
        ];

        const result = analyzeRepeatingSequences(pages, {
            maxElements: 2,
            minCount: 2,
            minElements: 2,
            whitespace: 'space',
        });

        // Should use space instead of \\s*
        const pattern = result.find((r) => r.pattern.includes('قال'));
        expect(pattern).toBeDefined();
        expect(pattern!.pattern).not.toContain('\\s*');
        expect(pattern!.pattern).toContain(' ');
    });

    it('should preserve diacritics in examples', () => {
        const pages = [
            {
                content: 'حَدَّثَنَا محمد حَدَّثَنَا علي',
                id: 1,
            },
        ];

        const result = analyzeRepeatingSequences(pages, { minCount: 2 });

        const pattern = result.find((r) => r.pattern === '{{naql}}');
        expect(pattern).toBeDefined();
        // Examples should preserve original diacritics
        expect(pattern!.examples[0].text).toBe('حَدَّثَنَا');
    });

    it('should handle pages with undefined or empty content', () => {
        const pages = [
            { content: '', id: 1 },
            { content: undefined as unknown as string, id: 2 },
            { content: 'حدثنا فلان حدثنا آخر', id: 3 },
        ];

        const result = analyzeRepeatingSequences(pages, { minCount: 1 });

        // Should still work with valid pages
        expect(result.length).toBeGreaterThan(0);
    });
});
