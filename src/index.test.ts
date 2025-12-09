import { beforeAll, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { type Page, type Segment, type SplitRule, segmentPages } from './index';

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

const mapPageToMarkdown = (p: Page) => ({ content: htmlToMarkdown(p.content), id: p.id });

const testSegment = (
    segment: Segment,
    { startsWith, endsWith, ...expected }: Partial<Segment> & { startsWith?: string; endsWith?: string },
) => {
    expect(segment).toMatchObject(expected);

    if (startsWith) {
        expect(segment.content).toStartWith(startsWith);
    }

    if (endsWith) {
        expect(segment.content).toEndWith(endsWith);
    }
};

describe('index', () => {
    let data: { pages: Page[]; rules: SplitRule[] };

    const loadBook = async (id: string) => {
        data = await Bun.file(path.join('test', `${id}.json`)).json();
        data.pages = data.pages.map(mapPageToMarkdown);
    };

    describe('2576', () => {
        beforeAll(async () => {
            await loadBook('2576');
        });

        it('should segment the pages', () => {
            const segments = segmentPages(data.pages, { rules: data.rules });

            // With sliding window maxSpan behavior, pages get merged more aggressively
            expect(segments).toHaveLength(17);

            testSegment(segments[0], {
                endsWith: 'حفظه الله',
                from: 1,
                meta: {
                    type: 'chapter',
                },
                startsWith: '(هذا نص التقرير)',
            });

            testSegment(segments[1], {
                endsWith: 'رحبة وأفئدة فرحة؛',
                from: 2,
                startsWith: '﷽',
            });

            testSegment(segments[2], {
                // With sliding window maxSpan=1, pages 2-4 merge into one segment
                endsWith: 'والفقراء بالأزهر.',
                from: 2,
                startsWith: 'لعلمهم أنها خدمة من أجل',
                to: 4,
            });

            testSegment(segments[3], {
                endsWith: 'سنة ١٣١٣',
                from: 4,
                startsWith: 'وقد أنشأ هذه',
            });

            // lineStartsAfter for '## ' excludes marker but extends content to next split
            testSegment(segments[4], {
                from: 5,
                meta: {
                    type: 'chapter',
                },
                startsWith: 'مقدمة',
            });

            testSegment(segments[5], {
                endsWith: 'حامدًا للَّه تعالى. اهـ.',
                from: 5,
                startsWith: '﷽',
                to: 6,
            });

            testSegment(segments[8], {
                endsWith: 'وَالنَّبِيِّينَ مِنْ بَعْدِهِ﴾.',
                from: 9,
                startsWith: '﷽',
            });

            testSegment(segments[9], {
                endsWith: 'هَاجَرَ إِلَيْهِ».',
                from: 10,
                meta: {
                    num: '١',
                },
                startsWith: 'حَدَّثَنَا الْحُمَيْدِيُّ عَبْدُ اللهِ بْنُ الزُّبَيْرِ',
            });

            testSegment(segments[10], {
                content: 'بَابُ عَلَامَةِ الْمُنَافِقِ',
                from: 66,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[11], {
                endsWith: 'اؤْتُمِنَ خَانَ».',
                from: 67,
                meta: {
                    num: '٣٣',
                },
                startsWith: 'حَدَّثَنَا سُلَيْمَانُ أَبُو الرَّبِيعِ',
            });

            testSegment(segments[13], {
                content: 'بَابٌ: قِيَامُ لَيْلَةِ الْقَدْرِ مِنَ الْإِيمَانِ',
                from: 69,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[14], {
                endsWith: 'ذَنْبِهِ».',
                from: 70,
                meta: {
                    num: '٣٥',
                },
                startsWith: 'حَدَّثَنَا أَبُو الْيَمَانِ قَالَ: أَخْبَرَنَا',
            });

            testSegment(segments[15], {
                endsWith: 'عَنْ رَبِّكُمْ ﷿',
                from: 115,
                meta: {
                    type: 'chapter',
                },
                startsWith: 'بَابُ قَوْلِ الْمُحَدِّثِ',
            });

            testSegment(segments[16], {
                endsWith: 'الْعَظِيمِ.»',
                from: 11208,
                meta: {
                    num: '٧٥٦٣',
                },
                startsWith: 'حَدَّثَنِي أَحْمَدُ بْنُ إِشْكَابٍ',
            });
        });
    });

    describe('2588', () => {
        beforeAll(async () => {
            await loadBook('2588');
        });

        it('should segment the pages', () => {
            const segments = segmentPages(data.pages.map(mapPageToMarkdown), { rules: data.rules });

            testSegment(segments[0], {
                endsWith: 'الرياض',
                from: 1,
                startsWith: 'المغْني',
            });

            testSegment(segments[1], {
                content: 'المغْني',
                from: 2,
            });

            testSegment(segments[2], {
                content: 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ',
                from: 5,
            });

            testSegment(segments[3], {
                endsWith: 'وإحكاما لمسائله.',
                from: 5,
                meta: {
                    type: 'chapter',
                },
                startsWith: 'مقدمة التحقيق',
            });

            testSegment(segments[4], {
                endsWith: 'يهدى السبيل.',
                from: 5,
                startsWith: 'وكان أبو القاسم عمر',
                to: 56,
            });

            testSegment(segments[5], {
                endsWith: 'محمد الحلو',
                from: 56,
                startsWith: 'غرة ربيع الأول',
            });

            testSegment(segments[6], {
                endsWith: 'الجزء الأول',
                from: 57,
                startsWith: 'المغْني',
            });

            testSegment(segments[7], {
                content: 'المغْني',
                from: 58,
            });

            testSegment(segments[8], { endsWith: 'هذا الطَّرْفِ.', from: 59, startsWith: 'بِسْمِ اللَّهِ الرَّحْمَنِ', to: 229 });

            testSegment(segments[9], { endsWith: 'ولم يَعْلَمْ عَيْنَها.', from: 229, startsWith: 'فصل: وإنْ خُلِقَ له' });

            testSegment(segments[10], {
                endsWith: 'مَحَلِّ الفَرْضِ.',
                from: 229,
                startsWith: 'فصل: وإن انْقَلَعَتْ',
            });

            testSegment(segments[11], {
                // With sliding window maxSpan=1, page 7954 is too far from 229 to be in same segment
                // The fasl rule creates a split at this فصل, and fallback creates page boundary at 7954
                endsWith: 'طَرَفُ العَضُدِ؛',
                from: 229,
                startsWith: 'فصل: وإن قُطِعَت',
            });

            testSegment(segments[12], {
                endsWith: 'فإنَّها كامِلَةٌ.',
                from: 229,
                startsWith: 'لأنَّ غَسْلَ',
                to: 7954,
            });

            testSegment(segments[13], {
                endsWith: 'كالمُدَبَّرَةِ.',
                from: 7954,
                startsWith: 'فصل: ولا يَجِبُ',
            });

            testSegment(segments[14], {
                endsWith: ' كان عليه.',
                from: 7954,
                meta: { num: '٢٠٢٦', type: 'chapter' },
                startsWith: 'مسألة؛ قال', // Prefix ## ٢٠٢٦ - stripped
            });

            testSegment(segments[15], {
                endsWith: 'دِيَتُه (٢).',
                from: 7954,
                meta: { num: '٢٠٢٧', type: 'chapter' },
                startsWith: 'مسألة؛ قال', // Prefix ## ٢٠٢٧ - str ped
                to: 7955,
            });

            console.log(segments[16]);

            testSegment(segments[16], {
                endsWith: 'في اسْتِجْمارهِ.',
                from: 7957,
                meta: { type: 'chapter' },
                startsWith: 'بابُ الاسْتِطابةِ والحَدَثِ',
            });
        });
    });
});
