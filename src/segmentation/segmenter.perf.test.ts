import { describe, expect, it } from 'bun:test';

import { segmentPages } from './segmenter.js';
import type { Page, SegmentationOptions, SplitRule } from './types.js';

// Test Configuration

const perfDescribe = process.env.RUN_PERF === 'true' ? describe : describe.skip;
const CI_MULTIPLIER = process.env.CI ? 2 : 1;

const PAGE_COUNT = 10_000;

// Seeded PRNG for Deterministic Tests

// Mulberry32 PRNG - deterministic random number generator
function mulberry32(seed: number): () => number {
    return () => {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SEED = 42;
let rng = mulberry32(SEED);

// Reset RNG before each test suite run for reproducibility
function resetRng(): void {
    rng = mulberry32(SEED);
}

// Synthetic Arabic Data Generation

const ARABIC_WORDS = [
    'الحمد',
    'لله',
    'رب',
    'العالمين',
    'الرحمن',
    'الرحيم',
    'مالك',
    'يوم',
    'الدين',
    'إياك',
    'نعبد',
    'وإياك',
    'نستعين',
    'اهدنا',
    'الصراط',
    'المستقيم',
];

const DIACRITIC_WORDS = ['حَدَّثَنَا', 'أَخْبَرَنَا', 'عَبْدُ اللَّهِ', 'رَضِيَ اللَّهُ عَنْهُ', 'صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ'];

const STRUCTURAL_MARKERS = ['باب', 'كتاب', 'فصل'];
const HADITH_MARKERS = ['حدثنا', 'أخبرنا'];
const PUNCTUATION = ['.', '،', '؛', ':', '؟'];
const ARABIC_NUMERALS = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '١٠'];

function generateArabicSentence(wordCount: number): string {
    const words: string[] = [];
    for (let i = 0; i < wordCount; i++) {
        const pool = rng() < 0.2 ? DIACRITIC_WORDS : ARABIC_WORDS;
        words.push(pool[Math.floor(rng() * pool.length)]);
    }
    const punct = PUNCTUATION[Math.floor(rng() * PUNCTUATION.length)];
    return words.join(' ') + punct;
}

function generateArabicPages(count: number): Page[] {
    resetRng(); // Reset for deterministic generation
    const pages: Page[] = [];

    for (let i = 0; i < count; i++) {
        const lines: string[] = [];
        const lineCount = 5 + Math.floor(rng() * 10);

        // Add structural marker every ~50 pages
        if (i % 50 === 0 && i > 0) {
            const marker = STRUCTURAL_MARKERS[Math.floor(rng() * STRUCTURAL_MARKERS.length)];
            const num = ARABIC_NUMERALS[Math.floor(rng() * ARABIC_NUMERALS.length)];
            lines.push(`${marker} ${num} - ${generateArabicSentence(3)}`);
        }

        // Add hadith marker every ~20 pages
        if (i % 20 === 0) {
            const marker = HADITH_MARKERS[Math.floor(rng() * HADITH_MARKERS.length)];
            lines.push(`${marker} ${generateArabicSentence(5)}`);
        }

        // Fill with regular content
        for (let j = 0; j < lineCount; j++) {
            lines.push(generateArabicSentence(8 + Math.floor(rng() * 8)));
        }

        pages.push({
            content: lines.join('\n'),
            id: i + 1,
        });
    }

    return pages;
}

// Performance Test Suite

perfDescribe('Performance Tests', () => {
    // Generate pages once for all tests
    const pages = generateArabicPages(PAGE_COUNT);

    const runPerfTest = (name: string, options: SegmentationOptions, thresholdMs: number) => {
        it(name, () => {
            const start = performance.now();
            const result = segmentPages(pages, options);
            const elapsed = performance.now() - start;

            const adjustedThreshold = thresholdMs * CI_MULTIPLIER;
            expect(elapsed).toBeLessThan(adjustedThreshold);
            expect(result.length).toBeGreaterThan(0);
        });
    };

    // Basic maxPages Variations

    describe('maxPages variations', () => {
        runPerfTest('maxPages=0', { breakpoints: [''], maxPages: 0, rules: [] }, 500);
        runPerfTest('maxPages=1', { breakpoints: [''], maxPages: 1, rules: [] }, 500);
        runPerfTest('maxPages=2', { breakpoints: [''], maxPages: 2, rules: [] }, 500);
        runPerfTest('maxPages=20', { breakpoints: [''], maxPages: 20, rules: [] }, 500);

        // Regression test for slow segmentation with maxPages=0 and small maxContentLength
        // This forces iterative processing on a large combined segment
        runPerfTest(
            'maxPages=0 with maxContentLength=2000 (force iterative)',
            {
                breakpoints: [''],
                maxContentLength: 2000,
                maxPages: 0,
                rules: [],
            },
            5000, // Give it some time initially, but it should be faster than "lock up"
        );
    });

    // Single Rule Types

    describe('single rule types', () => {
        runPerfTest(
            'lineStartsWith (single pattern)',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ lineStartsWith: ['باب'] }],
            },
            1000,
        );

        runPerfTest(
            'lineStartsWith (large array - 20 patterns)',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [
                    {
                        lineStartsWith: [
                            'باب',
                            'كتاب',
                            'فصل',
                            'حدثنا',
                            'أخبرنا',
                            'قال',
                            'وقال',
                            'الحمد',
                            'بسم',
                            'إن',
                            'كان',
                            'ومن',
                            'وإن',
                            'فإن',
                            'لما',
                            'ثم',
                            'وكان',
                            'فكان',
                            'وقد',
                            'ولما',
                        ],
                    },
                ],
            },
            2000,
        );

        runPerfTest(
            'lineEndsWith',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ lineEndsWith: ['.', '؛'] }],
            },
            1000,
        );

        runPerfTest(
            'lineStartsAfter',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ lineStartsAfter: ['{{naql}}'] }],
            },
            1000,
        );

        runPerfTest(
            'regex rule',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ regex: '^[١٢٣٤٥٦٧٨٩٠]+' }],
            },
            1000,
        );

        runPerfTest(
            'template rule',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ template: '{{raqms}} {{dash}}' }],
            },
            1000,
        );

        runPerfTest(
            'fuzzy lineStartsWith',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ fuzzy: true, lineStartsWith: ['{{bab}}'] }],
            },
            1000,
        );
    });

    // Large Rule Sets

    describe('large rule sets', () => {
        const generateRegexRules = (count: number): SplitRule[] =>
            Array.from({ length: count }, (_, i) => ({ regex: `^pattern${i}` }));

        const generateTemplateRules = (count: number): SplitRule[] =>
            Array.from({ length: count }, (_, i) => ({ template: `template${i} {{raqms}}` }));

        const generateMixedRules = (count: number): SplitRule[] => {
            const rules: SplitRule[] = [];
            for (let i = 0; i < count; i++) {
                if (i % 3 === 0) {
                    rules.push({ regex: `^regex${i}` });
                } else if (i % 3 === 1) {
                    rules.push({ lineStartsWith: [`pattern${i}`] });
                } else {
                    rules.push({ template: `tmpl${i} {{raqms}}` });
                }
            }
            return rules;
        };

        runPerfTest(
            '50 regex rules',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: generateRegexRules(50),
            },
            3000,
        );

        runPerfTest(
            '50 template rules',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: generateTemplateRules(50),
            },
            3000,
        );

        runPerfTest(
            '50 mixed rules',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: generateMixedRules(50),
            },
            3000,
        );
    });

    // maxContentLength

    describe('maxContentLength', () => {
        runPerfTest(
            'small maxContentLength (500)',
            {
                breakpoints: ['{{tarqim}}', '\\n', ''],
                maxContentLength: 500,
                rules: [],
            },
            2000,
        );

        runPerfTest(
            'medium maxContentLength (2000)',
            {
                breakpoints: ['{{tarqim}}', '\\n', ''],
                maxContentLength: 2000,
                rules: [],
            },
            2000,
        );
    });

    // Breakpoints

    describe('breakpoints', () => {
        runPerfTest(
            'many breakpoint patterns (10)',
            {
                breakpoints: ['{{tarqim}}', '\\n\\n', '\\n', '\\. ', '، ', '؛ ', ': ', '\\? ', '! ', ''],
                maxPages: 2,
                rules: [],
            },
            2000,
        );

        runPerfTest(
            'prefer=shorter',
            {
                breakpoints: [''],
                maxPages: 1,
                prefer: 'shorter',
                rules: [],
            },
            1000,
        );
    });

    // Exclusions

    describe('exclusions', () => {
        const excludePageIds = Array.from({ length: 5000 }, (_, i) => i * 2 + 1);

        runPerfTest(
            'large exclude set (5000 pages)',
            {
                breakpoints: [{ exclude: excludePageIds, pattern: '' }],
                maxPages: 2,
                rules: [],
            },
            2000,
        );
    });

    // Split Behavior Variations

    describe('split behavior', () => {
        runPerfTest(
            'occurrence=all',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ lineStartsWith: ['باب'], occurrence: 'all' }],
            },
            1000,
        );

        runPerfTest(
            'occurrence=first',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ lineStartsWith: ['باب'], occurrence: 'first' }],
            },
            1000,
        );

        runPerfTest(
            'occurrence=last',
            {
                breakpoints: [''],
                maxPages: 0,
                rules: [{ lineStartsWith: ['باب'], occurrence: 'last' }],
            },
            1000,
        );
    });

    // Edge Case Stress Tests

    describe('edge case stress tests', () => {
        it('should handle empty pages efficiently', () => {
            const pagesWithEmpty: Page[] = Array.from({ length: 5000 }, (_, i) => ({
                content: i % 10 === 0 ? '' : 'محتوى الصفحة',
                id: i + 1,
            }));
            const start = performance.now();
            const result = segmentPages(pagesWithEmpty, { breakpoints: [''], maxPages: 0, rules: [] });
            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(1000 * CI_MULTIPLIER);
            expect(result.length).toBeGreaterThan(0);
        });

        it('should handle identical pages efficiently', () => {
            const identicalPages: Page[] = Array.from({ length: 5000 }, (_, i) => ({
                content: 'نفس المحتوى بالضبط في كل صفحة',
                id: i + 1,
            }));
            const start = performance.now();
            const result = segmentPages(identicalPages, { breakpoints: [''], maxPages: 1, rules: [] });
            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(1000 * CI_MULTIPLIER);
            expect(result.length).toBeGreaterThan(0);
        });

        it('should handle single-character pages', () => {
            const tinyPages: Page[] = Array.from({ length: 10000 }, (_, i) => ({
                content: 'ا',
                id: i + 1,
            }));
            const start = performance.now();
            const result = segmentPages(tinyPages, { breakpoints: [''], maxPages: 0, rules: [] });
            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(500 * CI_MULTIPLIER);
            expect(result.length).toBe(10000);
        });
    });
});
