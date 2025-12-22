import { describe, expect, it } from 'bun:test';
import { analyzeCommonLineStarts } from './analysis.js';
import type { Page } from './segmentation/types.js';

describe('analysis', () => {
    it('should find common tokenized line-start patterns', () => {
        const pages: Page[] = [
            {
                content: [
                    // 5x
                    '١١٢٨ ع: حجاج بن المنهال',
                    '١١٢٩ ع: رجل آخر',
                    '١١٣٠ ع: ثالث',
                    '١١٣١ ع: رابع',
                    '١١٣٢ ع: خامس',
                    // 4x
                    '١ - نص',
                    '٢ - نص',
                    '٣ - نص',
                    '٤ - نص',
                    // 3x
                    'كتاب الطهارة',
                    'كتاب الطهارة',
                    'كتاب الطهارة',
                    // 2x
                    'باب الصلاة',
                    'باب الصلاة',
                ].join('\n'),
                id: 1,
            },
        ];

        const result = analyzeCommonLineStarts(pages, {
            maxExamples: 1,
            minCount: 2,
            prefixChars: 40,
            sortBy: 'count',
            topK: 10,
        });

        expect(result).toEqual([
            {
                count: 5,
                examples: [{ line: '١١٢٨ ع: حجاج بن المنهال', pageId: 1 }],
                pattern: '{{raqms}}\\s*{{rumuz}}:',
            },
            {
                count: 4,
                examples: [{ line: '١ - نص', pageId: 1 }],
                pattern: '{{numbered}}',
            },
            {
                count: 3,
                examples: [{ line: 'كتاب الطهارة', pageId: 1 }],
                pattern: '{{kitab}}',
            },
            {
                count: 2,
                examples: [{ line: 'باب الصلاة', pageId: 1 }],
                pattern: '{{bab}}',
            },
        ]);
    });

    it('should optionally include literal first-word fallback when no token match exists', () => {
        const pages: Page[] = [{ content: 'قال فلان\nقال علان\nحدثنا فلان', id: 1 }];
        const result = analyzeCommonLineStarts(pages, { includeFirstWordFallback: true, minCount: 2, topK: 5 });
        expect(result).toEqual([{ count: 2, examples: [{ line: 'قال فلان', pageId: 1 }], pattern: 'قال' }]);
    });

    it('should normalize Arabic diacritics by default when matching tokens', () => {
        const pages: Page[] = [
            {
                content: ['وأَخْبَرَنَا فلان', 'وأَخْبَرَنَا علان', 'وأَخْبَرَنَا زيد'].join('\n'),
                id: 1,
            },
        ];
        const result = analyzeCommonLineStarts(pages, { minCount: 2, topK: 10 });
        expect(result).toEqual([{ count: 3, examples: [{ line: 'وأَخْبَرَنَا فلان', pageId: 1 }], pattern: '{{naql}}' }]);
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

        const result = analyzeCommonLineStarts(pages, { includeFirstWordFallback: false, maxExamples: 1, minCount: 2, topK: 10 });
        expect(result).toEqual([
            { count: 2, examples: [{ line: '١١ - [X] نص', pageId: 1 }], pattern: '{{numbered}}[' },
            { count: 10, examples: [{ line: '١ - نص', pageId: 1 }], pattern: '{{numbered}}' },
        ]);
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
            maxExamples: 1,
            minCount: 2,
            sortBy: 'count',
            topK: 1,
        });

        expect(result).toEqual([{ count: 10, examples: [{ line: '١ - نص', pageId: 1 }], pattern: '{{numbered}}' }]);
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
            maxExamples: 1,
            minCount: 1,
            prefixChars: 80,
            sortBy: 'count',
            topK: 2,
        });

        expect(result).toEqual([
            { count: 2, examples: [{ line: '## باب الصلاة', pageId: 1 }], pattern: '##\\s*{{bab}}' },
            { count: 1, examples: [{ line: '## ١ - [X] عنوان', pageId: 1 }], pattern: '##\\s*{{numbered}}[' },
        ]);
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
            maxExamples: 1,
            minCount: 1,
            prefixChars: 80,
            prefixMatchers: [/^>+/u], // consume ">>" as a prefix, then tokenize what comes after
            sortBy: 'count',
            topK: 20,
        });

        expect(result).toEqual([
            { count: 2, examples: [{ line: '>> باب الصلاة', pageId: 1 }], pattern: '>>\\s*{{bab}}' },
            { count: 1, examples: [{ line: '>> ١ - نص', pageId: 1 }], pattern: '>>\\s*{{numbered}}' },
        ]);
    });

    it('should allow callers to prefer literal spaces instead of \\\\s* in patterns', () => {
        const pages: Page[] = [
            {
                content: ['١١٢٨ ع: حجاج بن المنهال', '١١٢٩ ع: رجل آخر'].join('\n'),
                id: 1,
            },
        ];

        const result = analyzeCommonLineStarts(pages, {
            maxExamples: 2,
            minCount: 1,
            prefixChars: 40,
            topK: 10,
            whitespace: 'space',
        });

        expect(result).toEqual([
            {
                count: 2,
                examples: [
                    { line: '١١٢٨ ع: حجاج بن المنهال', pageId: 1 },
                    { line: '١١٢٩ ع: رجل آخر', pageId: 1 },
                ],
                pattern: '{{raqms}} {{rumuz}}:',
            },
        ]);
    });

    it('should pick up numbered + combined rumuz atom like "دت" in "٦٧٧ - دت عس ق:"', () => {
        const pages: Page[] = [
            {
                content: ['٦٧٧ - دت عس ق: بشر', '٦٧٨ - دت عس ق: آخر'].join('\n'),
                id: 1,
            },
        ];

        const result = analyzeCommonLineStarts(pages, {
            maxExamples: 1,
            minCount: 2,
            prefixChars: 40,
            sortBy: 'count',
            topK: 10,
        });

        expect(result).toEqual([
            {
                count: 2,
                examples: [{ line: '٦٧٧ - دت عس ق: بشر', pageId: 1 }],
                pattern: '{{numbered}}{{rumuz}}:',
            },
        ]);
    });

    it('should not escape parentheses/brackets in returned signatures (they are auto-escaped later in templates)', () => {
        const pages: Page[] = [
            {
                content: ['(ح) وأَخْبَرَنَا أَبُو إِسْحَاقَ', '(ح) وأَخْبَرَنَا أَبُو إِسْحَاقَ'].join('\n'),
                id: 1,
            },
        ];

        const result = analyzeCommonLineStarts(pages, { maxExamples: 1, minCount: 2, prefixChars: 60, sortBy: 'count', topK: 5 });
        expect(result).toEqual([{ count: 2, examples: [{ line: '(ح) وأَخْبَرَنَا أَبُو إِسْحَاقَ', pageId: 1 }], pattern: '(ح)' }]);
    });
});
