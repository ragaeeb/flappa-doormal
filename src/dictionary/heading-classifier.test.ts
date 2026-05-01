import { describe, expect, it } from 'bun:test';
import { loadDictionaryFixturePage } from '../../testing/fixtures/dictionary-books.js';
import { segmentPages } from '../segmentation/segmenter.js';
import { createArabicDictionaryEntryRule } from './arabic-dictionary-rule.js';
import {
    analyzeDictionaryMarkdownPages,
    classifyDictionaryHeading,
    scanDictionaryMarkdownPage,
} from './heading-classifier.js';

const loadMarkdownPage = (filename: string, id: number) =>
    loadDictionaryFixturePage(filename.replace('.json', '') as '1687' | '2553' | '7030' | '7031', id);

describe('dictionary heading classifier', () => {
    describe('heading classification', () => {
        it('classifies representative heading surfaces', () => {
            expect(classifyDictionaryHeading('## (بَاب الْهمزَة)')).toBe('chapter');
            expect(classifyDictionaryHeading('## أبأ')).toBe('entry');
            expect(classifyDictionaryHeading('## (خَ غ)')).toBe('marker');
            expect(classifyDictionaryHeading('## خطا، خطىء، وَخط، خاط (خيط) ، طاخ، طخا: مستعملة.')).toBe('cluster');
            expect(classifyDictionaryHeading('## أَراد: فإِذا ذلكَ يَعْنِي شَبابَه ...')).toBe('noise');
            expect(classifyDictionaryHeading('## ض ز ل: مهمل.')).toBe('marker');
            expect(classifyDictionaryHeading('## خَ ش ط مهمل.')).toBe('marker');
            expect(classifyDictionaryHeading('## خَ ق (وَا يء)')).toBe('marker');
            expect(classifyDictionaryHeading('## بِسمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ')).toBe('marker');
            expect(classifyDictionaryHeading('## آخر كتاب الْخَاء')).toBe('marker');
            expect(classifyDictionaryHeading('## قال أبو زيد: معنى الباب')).toBe('noise');
            expect(classifyDictionaryHeading('## أبوابX')).toBe('chapter');
        });
    });

    describe('real corpus pages', () => {
        it('detects heading classes on 7030 page 125', async () => {
            const page = await loadMarkdownPage('7030.json', 125);
            const headingKinds = scanDictionaryMarkdownPage(page)
                .filter((match) => ['chapter', 'entry', 'marker', 'cluster', 'noise'].includes(match.kind))
                .map((match) => match.kind);

            expect(headingKinds).toEqual(['chapter', 'chapter', 'entry']);
        });

        it('detects marker and chapter headings on 7031 page 1664', async () => {
            const page = await loadMarkdownPage('7031.json', 1664);
            const headingKinds = scanDictionaryMarkdownPage(page)
                .filter((match) => ['chapter', 'entry', 'marker', 'cluster', 'noise'].includes(match.kind))
                .map((match) => match.kind);

            expect(headingKinds.slice(0, 2)).toEqual(['marker', 'chapter']);
        });

        it('detects mixed structural late headings on 1687 page 4673', async () => {
            const page = await loadMarkdownPage('1687.json', 4673);
            const headingKinds = scanDictionaryMarkdownPage(page)
                .filter((match) => ['chapter', 'entry', 'marker', 'cluster', 'noise'].includes(match.kind))
                .map((match) => match.kind);

            expect(headingKinds.slice(0, 3)).toEqual(['marker', 'chapter', 'chapter']);
        });

        it('classifies the noisy 1687 page 8097 heading as noise', async () => {
            const page = await loadMarkdownPage('1687.json', 8097);
            const headingMatch = scanDictionaryMarkdownPage(page).find((match) => match.kind === 'noise');

            expect(headingMatch).toBeDefined();
            expect(headingMatch?.text).toStartWith('## أَراد:');
        });

        it('detects paired forms and code lines on representative grouped pages', async () => {
            const codePage = await loadMarkdownPage('7031.json', 1354);
            const groupedPage = await loadMarkdownPage('7030.json', 6911);

            const codeMatches = scanDictionaryMarkdownPage(codePage);
            const groupedMatches = scanDictionaryMarkdownPage(groupedPage);

            expect(codeMatches.some((match) => match.kind === 'codeLine' && match.lemma?.includes('هـ'))).toBeTrue();
            expect(codeMatches.some((match) => match.kind === 'pairedForms' && match.lemma?.includes('هر'))).toBeTrue();
            expect(
                groupedMatches.some((match) => match.kind === 'codeLine' && match.lemma?.includes('ف ر س ك ر')),
            ).toBeTrue();
        });

        it('finds the main surface families across representative pages from all four corpora', async () => {
            const pages = await Promise.all([
                loadMarkdownPage('1687.json', 1208),
                loadMarkdownPage('1687.json', 4673),
                loadMarkdownPage('2553.json', 66),
                loadMarkdownPage('2553.json', 79),
                loadMarkdownPage('7030.json', 125),
                loadMarkdownPage('7030.json', 6911),
                loadMarkdownPage('7031.json', 1354),
                loadMarkdownPage('7031.json', 792),
                loadMarkdownPage('7031.json', 1664),
                loadMarkdownPage('7031.json', 1885),
            ]);

            const report = analyzeDictionaryMarkdownPages(pages);

            expect(report.counts.chapter).toBeGreaterThan(0);
            expect(report.counts.entry).toBeGreaterThan(0);
            expect(report.counts.marker).toBeGreaterThan(0);
            expect(report.counts.cluster).toBeGreaterThan(0);
            expect(report.counts.lineEntry).toBeGreaterThan(0);
            expect(report.counts.inlineSubentry).toBeGreaterThan(0);
            expect(report.counts.codeLine).toBeGreaterThan(0);
            expect(report.counts.pairedForms).toBeGreaterThan(0);
        });
    });

    describe('current-engine smoke checks', () => {
        it('avoids representative false positives while still splitting real inline subentries on 2553 page 66', async () => {
            const page = await loadMarkdownPage('2553.json', 66);
            const segments = segmentPages([page], {
                maxPages: 1,
                rules: [
                    createArabicDictionaryEntryRule({
                        pageStartPrevWordStoplist: ['قال', 'وقيل', 'ويقال'],
                        stopWords: ['قال', 'وقيل', 'ويقال', 'الفرزدق', 'العجاج', 'أخاك'],
                    }),
                ],
            });

            const heads = segments
                .filter((segment) => segment.meta?.lemma)
                .map((segment) => segment.content.split(/\s+/u, 1)[0]);

            expect(heads).toEqual(['عز:', 'والعزَّاءُ:', 'والعَزُوزُ:', 'والمُعازَّةُ:']);
        });
    });
});
