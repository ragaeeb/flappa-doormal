import { beforeAll, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { type Page, type Segment, type SegmentationOptions, segmentPages } from './index';

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

const htmlToMarkdown2 = (html: string): string => {
    return (
        html
            // Move content after line break but before title span INTO the span
            .replace(/\r([^\r]*?)<span[^>]*data-type=["']title["'][^>]*>/gi, '\r<span data-type="title">$1')
            // Convert title spans to markdown headers
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
    { beginsWith, endsWith, ...expected }: Partial<Segment> & { beginsWith?: string; endsWith?: string },
) => {
    expect(segment).toMatchObject(expected);

    if (beginsWith) {
        expect(segment.content).toStartWith(beginsWith);
    }

    if (endsWith) {
        expect(segment.content).toEndWith(endsWith);
    }
};

describe('index', () => {
    let data: SegmentationOptions & {
        pages: Page[];
    };

    const loadBook = async (id: string) => {
        data = await Bun.file(path.join('test', `${id}.json`)).json();
        data.pages = data.pages.map(mapPageToMarkdown);
    };

    describe('2576', () => {
        beforeAll(async () => {
            await loadBook('2576');
        });

        it('should segment the pages', () => {
            const segments = segmentPages(data.pages, data);

            // With page-ID-based span calculation, pages get split more accurately
            expect(segments).toHaveLength(16);

            testSegment(segments[0], {
                beginsWith: '(هذا نص التقرير)',
                endsWith: 'حفظه الله',
                from: 1,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[1], {
                beginsWith: '﷽',
                endsWith: 'بعلم الحديث.',
                from: 2,
                to: 3,
            });

            testSegment(segments[2], {
                beginsWith: 'هذا وقد',
                endsWith: 'سنة ١٣١٣',
                from: 4,
            });

            testSegment(segments[3], {
                beginsWith: 'مقدمة',
                from: 5,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[4], {
                beginsWith: '﷽',
                endsWith: 'تعالى. اهـ.',
                from: 5,
                to: 6,
            });

            // New segment from page-ID-based split
            testSegment(segments[5], {
                beginsWith: 'وكتب الحافظ',
                from: 6,
            });

            // Second tarqim split from page 6
            testSegment(segments[6], {
                beginsWith: '(طبع)',
                from: 6,
            });

            testSegment(segments[7], {
                beginsWith: '﷽',
                from: 9,
            });

            testSegment(segments[8], {
                beginsWith: 'حَدَّثَنَا الْحُمَيْدِيُّ عَبْدُ اللهِ بْنُ الزُّبَيْرِ',
                endsWith: 'هَاجَرَ إِلَيْهِ».',
                from: 10,
                meta: {
                    num: '١',
                },
            });

            testSegment(segments[9], {
                content: 'بَابُ عَلَامَةِ الْمُنَافِقِ',
                from: 66,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[10], {
                beginsWith: 'حَدَّثَنَا سُلَيْمَانُ أَبُو الرَّبِيعِ',
                endsWith: 'اؤْتُمِنَ خَانَ».',
                from: 67,
                meta: {
                    num: '٣٣',
                },
            });

            testSegment(segments[12], {
                content: 'بَابٌ: قِيَامُ لَيْلَةِ الْقَدْرِ مِنَ الْإِيمَانِ',
                from: 69,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[13], {
                beginsWith: 'حَدَّثَنَا أَبُو الْيَمَانِ قَالَ: أَخْبَرَنَا',
                endsWith: 'ذَنْبِهِ».',
                from: 70,
                meta: {
                    num: '٣٥',
                },
            });

            testSegment(segments[14], {
                beginsWith: 'بَابُ قَوْلِ الْمُحَدِّثِ',
                endsWith: 'عَنْ رَبِّكُمْ ﷿',
                from: 115,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[15], {
                beginsWith: 'حَدَّثَنِي أَحْمَدُ بْنُ إِشْكَابٍ',
                endsWith: 'الْعَظِيمِ.»',
                from: 11208,
                meta: {
                    num: '٧٥٦٣',
                },
            });
        });
    });

    describe('2588', () => {
        beforeAll(async () => {
            await loadBook('2588');
        });

        it('should segment the pages', () => {
            const segments = segmentPages(data.pages, data);

            expect(segments).toHaveLength(19);

            testSegment(segments[0], {
                beginsWith: 'المغْني',
                endsWith: 'الرياض',
                from: 1,
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
                beginsWith: 'مقدمة التحقيق',
                endsWith: 'لمسائله.',
                from: 5,
                meta: { type: 'chapter' },
            });

            // Remaining page 5 content after tarqim split (no tarqim in this part)
            testSegment(segments[4], {
                beginsWith: 'وكان أبو القاسم',
                endsWith: 'سنة ٣٣٤ هـ،',
                from: 5,
            });

            testSegment(segments[5], {
                beginsWith: 'السابق لها',
                endsWith: 'يهدى السبيل.',
                from: 56,
            });

            // Remaining page 56 content after tarqim split
            testSegment(segments[6], {
                beginsWith: 'غرة ربيع',
                endsWith: 'محمد الحلو',
                from: 56,
            });

            testSegment(segments[7], {
                beginsWith: 'المغْني',
                endsWith: 'الجزء الأول',
                from: 57,
            });

            testSegment(segments[8], {
                content: 'المغْني',
                from: 58,
            });

            testSegment(segments[9], {
                beginsWith: 'بِسْمِ اللَّهِ الرَّحْمَنِ',
                endsWith: 'أمَر سائِرَ الناسِ',
                from: 59,
            });

            testSegment(segments[10], {
                content: 'إلى هذا الطَّرْفِ.',
                from: 229,
            });

            testSegment(segments[11], {
                beginsWith: 'فصل: وإنْ خُلِقَ',
                endsWith: 'عَيْنَها.',
                from: 229,
            });

            testSegment(segments[12], {
                beginsWith: 'فصل: وإن انْقَلَعَتْ',
                endsWith: 'مَحَلِّ الفَرْضِ.',
                from: 229,
            });

            testSegment(segments[13], {
                beginsWith: 'فصل: وإن قُطِعَت',
                endsWith: 'فإنَّها كامِلَةٌ.',
                from: 229,
            });

            testSegment(segments[14], {
                beginsWith: 'فصل: ولا يَجِبُ',
                endsWith: 'كالمُدَبَّرَةِ.',
                from: 7954,
            });

            testSegment(segments[15], {
                beginsWith: 'مسألة؛ قال: (وإِنْ',
                endsWith: 'ما كان عليه.',
                from: 7954,
            });

            testSegment(segments[16], {
                beginsWith: 'مسألة؛ قال: (وَإِذَا قَتلَتْ',
                endsWith: 'بقَتلِ الحُرِّ دِيَتُه (٢).',
                from: 7954,
                to: 7955,
            });

            testSegment(segments[17], {
                beginsWith: 'بابُ الاسْتِطابةِ',
                endsWith: ' في اسْتِجْمارهِ.',
                from: 7957,
                meta: { type: 'chapter' },
            });

            testSegment(segments[18], {
                beginsWith: 'مسألة؛ قال: (وليس',
                endsWith: 'إذَا قُمْتُمْ',
                from: 7957,
                meta: { type: 'chapter' },
            });
        });
    });

    describe('misc', () => {
        it.only('should segment the text', () => {
            data = {
                pages: [
                    {
                        content:
                            'أربعا وتسعين سنة (١) .\r٢٩- خ سي:<span data-type="title" id=toc-70> أَحْمَد بن حميد الطريثيثي، أَبُو الْحَسَن الكوفي، ختن عُبَيد اللَّهِ بْن مُوسَى، ويعرف بدار أم </span>سَلَمَة (٢) .\rوكان من حفاظ الكوفة.\rرَوَى عَن: حَفْص بْن غِيَاث (٣) النخعي، وأبي أسامة حَمَّاد بْن أسامة، وعبد الله بْن إدريس، وعبد الله بْن المبارك، وعبد الله بْن نمير، وعبد الرحيم بْن سُلَيْمان (عخ) ، وعُبَيد الله بْن عُبَيد الرحمن الأشجعي (خ سي) ، والقاسم بْن معن المسعودي، ومحمد بْن بشر العبدي، ومحمد ابن جَعْفَر، غندر، ومحمد بْن فضيل بْن غزوان (بخ) ، ومعاوية بْن هشام القصار، ويحيى بْن زكريا بْن أَبي زائدة، وأبي بَكْر بْن عياش.\rرَوَى عَنه: البخاري (٤) ، وأحمد بن محمد ابن الاصفر، وأحمد بن محمد ابن المعلى الآدمي (٥) ، وأَبُو علي حنبل بْن إسحاق بْن حنبل، ابْن عم أَحْمَد بْن مُحَمَّد بْن حنبل، وعباس بْن مُحَمَّد الدوري، وأَبُو سَعِيد عَبْد اللَّهِ بْن سَعِيد الأشج، وعبد الله بْن عَبْد الرَّحْمَنِ الدارمي، وأَبُو إِسْمَاعِيل مُحَمَّد بْن إِسْمَاعِيل بْن يُوسُف السلمي التِّرْمِذِيّ، ومحمد بْن أَبي خالد الصومعي، ومحمد بْن يحيى بْن كثير الحراني، ومحمد بْن يزيد الأَدَمِيّ (٦) (سي) ، ويحيى بْن عبد الحميد الحماني، وهو من أقرانه، وأَبُو',
                        id: 257,
                    },
                ],
            };
            data.pages = data.pages.map((p) => ({ content: htmlToMarkdown2(p.content), id: p.id }));
            console.log('data.pages', data.pages);

            const segments = segmentPages(data.pages, {
                breakpoints: [
                    {
                        pattern: '{{tarqim}}\\s*',
                    },
                    '',
                ],
                maxPages: 1,
                rules: [
                    {
                        fuzzy: true,
                        lineStartsWith: ['{{basmalah}}'],
                    },
                    {
                        fuzzy: true,
                        lineStartsWith: ['{{fasl}}'],
                    },
                    {
                        fuzzy: true,
                        lineStartsWith: ['{{bab}}'],
                        meta: {
                            type: 'chapter',
                        },
                    },
                    {
                        fuzzy: true,
                        lineStartsWith: ['{{naql}}'],
                    },
                    {
                        lineStartsAfter: ['## {{raqms:num}}\\s*{{dash}}'],
                        meta: { type: 'chapter' },
                    },
                    {
                        lineStartsAfter: ['##'],
                        meta: {
                            type: 'chapter',
                        },
                        split: 'at',
                    },
                    {
                        lineStartsAfter: ['({{harf}}):'],
                    },
                    {
                        fuzzy: true,
                        lineStartsWith: ['{{kitab}}'],
                        meta: {
                            type: 'book',
                        },
                    },
                    {
                        lineStartsAfter: ['{{raqms:num}}\\s*{{dash}}'],
                    },
                ],
            });

            console.log(segments);
        });
    });
});
