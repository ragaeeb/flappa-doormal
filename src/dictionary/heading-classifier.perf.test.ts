import { describe, expect, it } from 'bun:test';
import { analyzeDictionaryMarkdownPages } from './heading-classifier.js';

const perfDescribe = process.env.RUN_PERF === 'true' ? describe : describe.skip;
const CI_MULTIPLIER = process.env.CI ? 2 : 1;
const PAGE_COUNT = 10_000;

function mulberry32(seed: number): () => number {
    return () => {
        seed += 0x6d2b79f5;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const WORDS = ['العز', 'العزوز', 'الحديث', 'الليث', 'البيت', 'القول', 'الشرح', 'العرب', 'القوم', 'الشعر'];
const rng = mulberry32(42);

const randomWord = () => WORDS[Math.floor(rng() * WORDS.length)] ?? WORDS[0]!;

const randomSentence = (wordCount: number) => {
    const words: string[] = [];
    for (let i = 0; i < wordCount; i++) {
        words.push(randomWord());
    }
    return `${words.join(' ')}.`;
};

const generatePages = (count: number) =>
    Array.from({ length: count }, (_, index) => {
        const lines: string[] = [];

        if (index % 40 === 0) {
            lines.push(`## باب ${randomWord()}`);
        }
        if (index % 55 === 0) {
            lines.push(`## ${randomWord()}`);
        }
        if (index % 65 === 0) {
            lines.push('## (خَ غ)');
        }
        if (index % 70 === 0) {
            lines.push('## خطا، خطىء، وَخط، خاط (خيط) ، طاخ، طخا: مستعملة.');
        }

        lines.push(`${randomWord()}: ${randomSentence(12)}`);
        lines.push(`وقيل: ${randomSentence(8)}`);
        lines.push(`${randomSentence(4)} والعزوز: ${randomSentence(8)}`);

        if (index % 25 === 0) {
            lines.push('(هـ ث)');
        }
        if (index % 30 === 0) {
            lines.push('خزّ، زخّ: مستعملان.');
        }

        lines.push(randomSentence(14));

        return {
            content: lines.join('\n'),
            id: index + 1,
        };
    });

perfDescribe('Dictionary Heading Classifier Performance', () => {
    const pages = generatePages(PAGE_COUNT);

    it('analyzes 10k dictionary-like markdown pages within the expected runtime envelope', () => {
        const start = performance.now();
        const report = analyzeDictionaryMarkdownPages(pages);
        const elapsed = performance.now() - start;

        expect(report.matches.length).toBeGreaterThan(0);
        expect(report.counts.lineEntry).toBeGreaterThanOrEqual(PAGE_COUNT);
        expect(report.counts.inlineSubentry).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(2500 * CI_MULTIPLIER);
    });

    it('stays linear on heading-heavy pages', () => {
        const headingHeavyPages = Array.from({ length: 2_000 }, (_, index) => ({
            content: [
                '## باب العين والزاي',
                '## (خَ غ)',
                '## خطا، خطىء، وَخط، خاط (خيط) ، طاخ، طخا: مستعملة.',
                '## أبأ',
                '## أَراد: فإِذا ذلكَ يَعْنِي شَبابَه ...',
                'عز: العزة لله.',
                'وقيل: هي الشدة.',
                'والعزوز: الشاة الضيقة.',
                '(هـ ث)',
                'خزّ، زخّ: مستعملان.',
            ].join('\n'),
            id: index + 1,
        }));

        const start = performance.now();
        const report = analyzeDictionaryMarkdownPages(headingHeavyPages);
        const elapsed = performance.now() - start;

        expect(report.counts.chapter).toBe(2_000);
        expect(report.counts.entry).toBe(2_000);
        expect(report.counts.marker).toBe(2_000);
        expect(report.counts.cluster).toBe(2_000);
        expect(report.counts.noise).toBe(2_000);
        expect(elapsed).toBeLessThan(2000 * CI_MULTIPLIER);
    });
});
