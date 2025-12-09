import { beforeAll, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { type Page, type SplitRule, segmentPages } from './index';

const htmlToMarkdown = (html: string): string => {
    return (
        html
            // Convert title spans to markdown headers (no extra newlines - content already has them)
            .replace(/<span[^>]*data-type=["']title["'][^>]*>(.*?)<\/span>/gi, '## $1')
            // Strip narrator links but keep text
            .replace(/<a[^>]*href=["']inr:\/\/[^"']*["'][^>]*>(.*?)<\/a>/gi, '$1')
            // Strip all remaining HTML tags
            .replace(/<[^>]*>/g, '')
            .replace(/舄/g, '')
    );
};

describe('index', () => {
    let data: { pages: Page[]; rules: SplitRule[] };

    const loadBook = async (id: string) => {
        data = await Bun.file(path.join('test', `${id}.json`)).json();
        data.pages = data.pages.map((p) => ({ content: htmlToMarkdown(p.content), id: p.id }));

        const segments = segmentPages(data.pages, { rules: data.rules });
    };

    describe('2576', () => {
        beforeAll(async () => {
            await loadBook('2576');
        });

        it('should segment the pages', () => {
            const segments = segmentPages(data.pages, { rules: data.rules });

            expect(segments).toHaveLength(18);
            expect(segments[0]).toMatchObject({
                content: '(هذا نص التقرير)',
                from: 1,
                meta: {
                    type: 'chapter',
                },
            });

            expect(segments[1].content).toStartWith('﷽');
            expect(segments[1].content).toEndWith('رحبة وأفئدة فرحة؛');
            expect(segments[1]).toMatchObject({
                from: 2,
            });

            expect(segments[2]).toMatchObject({
                from: 2,
                to: 3,
            });
            expect(segments[2].content).toStartWith('لعلمهم أنها خدمة من أجل');
            expect(segments[2].content).toEndWith('بعلم الحديث.');

            expect(segments[3]).toMatchObject({
                from: 4,
            });
            expect(segments[3].content).toStartWith('هذا وقد احتفلنا بيوم ختام');
            expect(segments[3].content).toEndWith('والفقراء بالأزهر.');

            expect(segments[4]).toMatchObject({
                from: 4,
            });
            expect(segments[4].content).toStartWith('وقد أنشأ هذه');
            expect(segments[4].content).toEndWith('سنة ١٣١٣');

            expect(segments[5]).toMatchObject({
                content: 'مقدمة',
                from: 5,
                meta: {
                    type: 'chapter',
                },
            });

            expect(segments[6]).toMatchObject({
                from: 5,
                to: 6,
            });
            expect(segments[6].content).toStartWith('﷽');
            expect(segments[6].content).toEndWith('حامدًا للَّه تعالى. اهـ.');

            expect(segments[9]).toMatchObject({
                from: 9,
            });
            expect(segments[9].content).toStartWith('﷽');
            expect(segments[9].content).toEndWith('وَالنَّبِيِّينَ مِنْ بَعْدِهِ﴾.');

            expect(segments[10]).toMatchObject({
                from: 10,
                meta: {
                    num: '١',
                },
            });
            expect(segments[10].content).toStartWith('حَدَّثَنَا الْحُمَيْدِيُّ عَبْدُ اللهِ');
            expect(segments[10].content).toEndWith('هَاجَرَ إِلَيْهِ».');

            expect(segments[11]).toMatchObject({
                from: 66,
                meta: {
                    type: 'chapter',
                },
            });
            expect(segments[11].content).toBe('بَابُ عَلَامَةِ الْمُنَافِقِ');

            expect(segments[12]).toMatchObject({
                from: 67,
                meta: {
                    num: '٣٣',
                },
            });
            expect(segments[12].content).toStartWith('حَدَّثَنَا سُلَيْمَانُ أَبُو الرَّبِيعِ');
            expect(segments[12].content).toEndWith('اؤْتُمِنَ خَانَ».');

            expect(segments[14]).toMatchObject({
                from: 69,
                meta: {
                    type: 'chapter',
                },
            });
            expect(segments[14].content).toBe('بَابٌ: قِيَامُ لَيْلَةِ الْقَدْرِ مِنَ الْإِيمَانِ');

            expect(segments[15]).toMatchObject({
                from: 70,
                meta: {
                    num: '٣٥',
                },
            });
            expect(segments[15].content).toStartWith('حَدَّثَنَا أَبُو الْيَمَانِ قَالَ: أَخْبَرَنَا');
            expect(segments[15].content).toEndWith('ذَنْبِهِ».');

            expect(segments[16]).toMatchObject({
                from: 115,
                meta: {
                    type: 'chapter',
                },
            });
            expect(segments[16].content).toStartWith('بَابُ قَوْلِ الْمُحَدِّثِ');
            expect(segments[16].content).toEndWith('عَنْ رَبِّكُمْ ﷿');

            expect(segments[17]).toMatchObject({
                from: 11208,
                meta: {
                    num: '٧٥٦٣',
                },
            });
            expect(segments[17].content).toStartWith('حَدَّثَنِي أَحْمَدُ بْنُ إِشْكَابٍ');
            expect(segments[17].content).toEndWith('الْعَظِيمِ.»');
        });
    });

    describe('2588', () => {
        beforeAll(async () => {
            await loadBook('2576');
        });

        it('should segment the pages', () => {
            console.log()
        })
    });
});
