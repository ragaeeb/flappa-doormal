import { describe, expect, it } from 'bun:test';
import type { ArabicDictionaryProfile, Page } from '@/index.js';
import { segmentPages } from '../segmentation/segmenter.js';
import { diagnoseDictionaryProfile } from './runtime.js';

const perfDescribe = process.env.RUN_PERF === 'true' ? describe : describe.skip;
const CI_MULTIPLIER = process.env.CI ? 2 : 1;
const PAGE_COUNT = 5_000;

function mulberry32(seed: number): () => number {
    return () => {
        seed += 0x6d2b79f5;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const WORDS = ['العز', 'الشرح', 'القول', 'الشعر', 'الحديث', 'العرب', 'البيت', 'الليث', 'القوم'];
const rng = mulberry32(42);
const randomWord = () => WORDS[Math.floor(rng() * WORDS.length)] ?? WORDS[0]!;
const sentence = (count: number) => `${Array.from({ length: count }, randomWord).join(' ')}.`;

const profile: ArabicDictionaryProfile = {
    version: 2,
    zones: [
        {
            blockers: [
                { appliesTo: ['lineEntry', 'inlineSubentry'], use: 'intro' },
                { appliesTo: ['lineEntry', 'inlineSubentry'], use: 'stopLemma', words: ['ومعناه', 'ويقال', 'وقيل'] },
            ],
            families: [
                { classes: ['chapter'], emit: 'chapter', use: 'heading' },
                { emit: 'entry', use: 'lineEntry', wrappers: 'none' },
                { emit: 'entry', prefixes: ['و'], stripPrefixesFromLemma: false, use: 'inlineSubentry' },
            ],
            name: 'main',
        },
    ],
};

const generatePages = (count: number): Page[] =>
    Array.from({ length: count }, (_, index) => {
        const lines = [`## باب ${randomWord()}`];
        lines.push(`${randomWord()}: ${sentence(12)}`);
        lines.push(`${sentence(4)} والعزوز: ${sentence(6)}`);
        lines.push(`ومعناه: ${sentence(5)}`);
        lines.push(`وقيل: ${sentence(5)}`);
        lines.push(`${randomWord()}: ${sentence(10)}`);
        return { content: lines.join('\n'), id: index + 1 };
    });

perfDescribe('Dictionary Runtime Performance', () => {
    const pages = generatePages(PAGE_COUNT);

    it('segments 5k dictionary-style pages within the expected envelope', () => {
        const start = performance.now();
        const segments = segmentPages(pages, { dictionary: profile, maxPages: 1 });
        const elapsed = performance.now() - start;

        expect(segments.length).toBeGreaterThan(PAGE_COUNT);
        expect(elapsed).toBeLessThan(3500 * CI_MULTIPLIER);
    });

    it('collects diagnostics without a large runtime cliff', () => {
        const start = performance.now();
        const diagnostics = diagnoseDictionaryProfile(pages, profile, { sampleLimit: 25 });
        const elapsed = performance.now() - start;

        expect(diagnostics.acceptedCount).toBeGreaterThan(PAGE_COUNT);
        expect(diagnostics.rejectedCount).toBeGreaterThan(0);
        expect(diagnostics.samples.length).toBe(25);
        expect(elapsed).toBeLessThan(2500 * CI_MULTIPLIER);
    });
});
