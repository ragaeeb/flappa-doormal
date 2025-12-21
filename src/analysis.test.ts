import { describe, expect, it } from 'bun:test';
import { analyzeCommonLineStarts } from './analysis.js';
import type { Page } from './segmentation/types.js';

describe('analysis', () => {
    it('should find common tokenized line-start patterns', () => {
        const pages: Page[] = [
            {
                content: [
                    'باب الصلاة',
                    'باب الصيام',
                    'كتاب الطهارة',
                    '١ - حدثنا فلان',
                    '٢ - حدثنا فلان',
                    '١١٢٨ ع: حجاج بن المنهال',
                    '١١٢٩ ع: رجل آخر',
                    '١٥٦ - س: إِبْرَاهِيم بن أَبي بكر (١) الأخنسي المكي.',
                    '١٥٧ - س: رَجُلٌ آخَر.',
                    'هذا سطر عادي',
                    'هذا سطر عادي',
                ].join('\n'),
                id: 1,
            },
            {
                content: ['كتاب الزكاة', '٣ - حدثنا فلان', 'هذا سطر عادي', 'هذا سطر عادي'].join('\n'),
                id: 2,
            },
        ];

        const result = analyzeCommonLineStarts(pages, { maxExamples: 2, minCount: 2, prefixChars: 40, topK: 10 });
        const patterns = result.map((r) => r.pattern);

        // We should see common structural prefixes
        expect(patterns.some((p) => p.startsWith('{{bab}}'))).toBe(true);
        expect(patterns.some((p) => p.startsWith('{{kitab}}'))).toBe(true);

        // Hadith numbering is common
        expect(patterns.some((p) => p.startsWith('{{numbered}}'))).toBe(true);

        // Rumuz + colon entry
        expect(patterns.some((p) => p.startsWith('{{raqms}}\\s*{{rumuz}}'))).toBe(true);

        // Numbered + rumuz + colon entry (e.g., "١٥٦ - س:")
        expect(patterns.some((p) => p.includes('{{numbered}}') && p.includes('{{rumuz}}') && p.includes(':'))).toBe(
            true,
        );

        // Each entry should have examples
        for (const r of result) {
            expect(r.count).toBeGreaterThanOrEqual(2);
            expect(r.examples.length).toBeGreaterThan(0);
            expect(r.examples.length).toBeLessThanOrEqual(2);
        }
    });

    it('should optionally include literal first-word fallback when no token match exists', () => {
        const pages: Page[] = [{ content: 'قال فلان\nقال علان\nحدثنا فلان', id: 1 }];
        const result = analyzeCommonLineStarts(pages, { includeFirstWordFallback: true, minCount: 2, topK: 5 });
        const patterns = result.map((r) => r.pattern);

        // "قال" isn't a token, so it should appear as a literal prefix.
        expect(patterns).toContain('قال');
    });

    it('should normalize Arabic diacritics by default when matching tokens', () => {
        const pages: Page[] = [
            {
                content: ['وأَخْبَرَنَا فلان', 'وأَخْبَرَنَا علان', 'وأَخْبَرَنَا زيد'].join('\n'),
                id: 1,
            },
        ];
        const result = analyzeCommonLineStarts(pages, { minCount: 2, topK: 10 });
        const patterns = result.map((r) => r.pattern);
        // naql token includes "وأخبرنا" without diacritics; default normalization should make it match.
        expect(patterns.some((p) => p.startsWith('{{naql}}'))).toBe(true);
    });

    it('should rank more specific patterns before less specific ones by default', () => {
        // Less-specific is more frequent, but the analyzer should still put the more-specific pattern first.
        const pages: Page[] = [
            {
                content: [
                    // 10x less specific
                    '١ - نص',
                    '٢ - نص',
                    '٣ - نص',
                    '٤ - نص',
                    '٥ - نص',
                    '٦ - نص',
                    '٧ - نص',
                    '٨ - نص',
                    '٩ - نص',
                    '١٠ - نص',
                    // 2x more specific (bracket after dash)
                    '١١ - [X] نص',
                    '١٢ - [X] نص',
                ].join('\n'),
                id: 1,
            },
        ];

        const result = analyzeCommonLineStarts(pages, { includeFirstWordFallback: false, minCount: 2, topK: 10 });
        // We expect both patterns to exist, but the more specific one should be first.
        // More specific will include a literal '[' after the numbered prefix.
        expect(result.length).toBeGreaterThan(1);
        expect(result[0].pattern).toContain('{{numbered}}');
        expect(result[0].pattern).toContain('\\[');
    });

    it('should support sorting by count (highest frequency first) before applying topK', () => {
        const pages: Page[] = [
            {
                content: [
                    // 10x less specific
                    '١ - نص',
                    '٢ - نص',
                    '٣ - نص',
                    '٤ - نص',
                    '٥ - نص',
                    '٦ - نص',
                    '٧ - نص',
                    '٨ - نص',
                    '٩ - نص',
                    '١٠ - نص',
                    // 2x more specific
                    '١١ - [X] نص',
                    '١٢ - [X] نص',
                ].join('\n'),
                id: 1,
            },
        ];

        const result = analyzeCommonLineStarts(pages, {
            includeFirstWordFallback: false,
            minCount: 2,
            sortBy: 'count',
            topK: 1,
        });

        // With sortBy=count, the frequent (less specific) numbered prefix should win.
        expect(result).toHaveLength(1);
        expect(result[0].pattern).toContain('{{numbered}}');
        expect(result[0].pattern).not.toContain('\\[');
        expect(result[0].count).toBe(10);
    });

    it('should support filtering to only analyze lines starting with ## (markdown headings)', () => {
        const pages: Page[] = [
            {
                content: [
                    '## باب الصلاة',
                    '## باب الصيام',
                    '### not included',
                    '١ - حدثنا فلان',
                    '## ١ - [X] عنوان',
                    'هذا سطر عادي',
                ].join('\n'),
                id: 1,
            },
        ];

        const result = analyzeCommonLineStarts(pages, {
            lineFilter: (line) => line.startsWith('## '),
            maxExamples: 5,
            minCount: 1,
            prefixChars: 80,
            sortBy: 'count',
            topK: 20,
        });

        // Every pattern should be a "## ..." variant because we filtered the input lines.
        expect(result.length).toBeGreaterThan(0);
        expect(result.every((r) => r.examples.every((e) => e.line.startsWith('## ')))).toBe(true);
        // We should see patterns that include what comes AFTER the heading marker (not just "##").
        const patterns = result.map((r) => r.pattern);
        expect(patterns).toContain('##\\s*{{bab}}');
        expect(patterns.some((p) => p.startsWith('##\\s*') && p.length > '##\\s*'.length)).toBe(true);
    });

    it('should allow callers to define custom prefixes via prefixMatchers', () => {
        const pages: Page[] = [
            {
                content: ['>> باب الصلاة', '>> باب الصيام', '>> ١ - نص'].join('\n'),
                id: 1,
            },
        ];

        const result = analyzeCommonLineStarts(pages, {
            lineFilter: (line) => line.startsWith('>>'),
            minCount: 1,
            prefixChars: 80,
            prefixMatchers: [/^>+/u], // consume ">>" as a prefix, then tokenize what comes after
            topK: 20,
        });

        const patterns = result.map((r) => r.pattern);
        expect(patterns.some((p) => p.startsWith('>>\\s*{{bab}}'))).toBe(true);
    });
});
