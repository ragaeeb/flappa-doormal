import { describe, expect, it } from 'bun:test';
import { segmentPages } from '@/segmentation/segmenter.js';
import type { Page, Segment } from '@/types/index.js';
import type { SegmentationOptions } from '@/types/options.js';
import { validateSegments } from './validate-segments.js';

// Test Configuration

const perfDescribe = process.env.RUN_PERF === 'true' ? describe : describe.skip;
const CI_MULTIPLIER = process.env.CI ? 2 : 1;

const PAGE_COUNT = 10_000;

// Seeded PRNG for Deterministic Tests

// Mulberry32 PRNG - deterministic random number generator
function mulberry32(seed: number): () => number {
    return () => {
        seed += 0x6d2b79f5;
        let t = seed;
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

perfDescribe('Validation Performance Tests', () => {
    // Generate pages once for all tests
    console.log(`Generating ${PAGE_COUNT} pages of Arabic text...`);
    const pages = generateArabicPages(PAGE_COUNT);

    // Pre-calculate segments for validation
    // We use a standard segmentation strategy to get a realistic set of segments
    console.log('Generating reference segments...');
    const defaultOptions: SegmentationOptions = {
        breakpoints: [''],
        maxPages: 1,
        rules: [{ lineStartsWith: ['باب', 'كتاب', 'حدثنا', 'أخبرنا'] }],
    };
    const referenceSegments = segmentPages(pages, defaultOptions);
    console.log(`Generated ${referenceSegments.length} segments.`);

    const runPerfTest = (name: string, options: SegmentationOptions, segments: Segment[], thresholdMs: number) => {
        it(name, () => {
            const start = performance.now();
            const report = validateSegments(pages, options, segments);
            const elapsed = performance.now() - start;

            const adjustedThreshold = thresholdMs * CI_MULTIPLIER;
            console.log(
                `[Perf] ${name}: ${elapsed.toFixed(2)}ms (Limit: ${adjustedThreshold}ms) - Issues: ${report.issues.length}`,
            );
            expect(elapsed).toBeLessThan(adjustedThreshold);
            // We generally expect success in this synthetic harness, but some edge cases might trigger issues.
            // We just ensure it runs and returns a report.
            expect(report).toBeDefined();
        });
    };

    // Baseline Performance

    runPerfTest(
        'Baseline Validation (10k pages)',
        defaultOptions,
        referenceSegments,
        2000, // Should be fast (linear scan)
    );

    // Variation: Max Pages 0 (Strict)

    describe('maxPages constraints', () => {
        // Validation might be slower if it has to check strict page boundaries intensively?
        // Actually it's mostly the same cost.
        const strictOptions: SegmentationOptions = { ...defaultOptions, maxPages: 0 };
        runPerfTest('maxPages=0 (Strict)', strictOptions, referenceSegments, 2000);
    });

    // Variation: Full Search Fallback Stress Test
    // To trigger fallback search, we need segments that match but are maybe disjointed or offset?
    // We can simulate this by slightly modifying segments to be missing 'from' or passing disjoint options?
    // Or we can construct a test where we modify segments to trigger full search.

    describe('Stress Tests', () => {
        it('should validate duplicate content efficiently', () => {
            // Create highly duplicated pages
            const dupContent = 'نص متكرر جداً في كل مكان';
            const dupPages: Page[] = Array.from({ length: 5000 }, (_, i) => ({
                content: dupContent,
                id: i + 1,
            }));
            const dupSegments: Segment[] = Array.from({ length: 5000 }, (_, i) => ({
                content: dupContent,
                from: i + 1,
                to: i + 1,
            }));

            const start = performance.now();
            const report = validateSegments(dupPages, { maxPages: 0, rules: [] }, dupSegments);
            const elapsed = performance.now() - start;

            console.log(`[Perf] Duplicate Content (5k pages): ${elapsed.toFixed(2)}ms`);
            expect(elapsed).toBeLessThan(3000 * CI_MULTIPLIER);
            expect(report.ok).toBe(true);
        });

        it('should validate single huge joined document efficently', () => {
            // 100 pages of very long content
            const largePages: Page[] = Array.from({ length: 100 }, (_, i) => ({
                content: 'word '.repeat(1000), // 5000 chars per page
                id: i,
            }));
            const largeSegments = segmentPages(largePages, { maxPages: 0, rules: [] });

            const start = performance.now();
            const _report = validateSegments(largePages, { maxPages: 0, rules: [] }, largeSegments);
            const elapsed = performance.now() - start;

            console.log(`[Perf] Huge Content (100 x 5k chars): ${elapsed.toFixed(2)}ms`);
            expect(elapsed).toBeLessThan(2000 * CI_MULTIPLIER);
        });
    });
});
