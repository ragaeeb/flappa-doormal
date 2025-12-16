import { beforeAll, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { type Page, type Segment, type SegmentationOptions, segmentPages } from './index';

const htmlToMarkdown = (html: string): string => {
    return (
        html
            // Move content after line break (or at start) but before title span INTO the span
            .replace(/(^|\r)([^\r]*?)<span[^>]*data-type=["']title["'][^>]*>/gi, '$1<span data-type="title">$2')
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
            expect(segments).toHaveLength(17);

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

            testSegment(segments[5], {
                beginsWith: 'وكتب الحافظ',
                from: 6,
            });

            testSegment(segments[6], {
                beginsWith: '(الجزء الأول)',
                from: 8,
            });

            testSegment(segments[7], {
                beginsWith: '(طبع)',
                from: 8,
            });

            testSegment(segments[8], {
                beginsWith: '﷽',
                from: 9,
            });

            testSegment(segments[9], {
                beginsWith: 'حَدَّثَنَا الْحُمَيْدِيُّ عَبْدُ اللهِ بْنُ الزُّبَيْرِ',
                endsWith: 'هَاجَرَ إِلَيْهِ».',
                from: 10,
                meta: {
                    num: '١',
                },
            });

            testSegment(segments[10], {
                content: 'بَابُ عَلَامَةِ الْمُنَافِقِ',
                from: 66,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[11], {
                beginsWith: 'حَدَّثَنَا سُلَيْمَانُ أَبُو الرَّبِيعِ',
                endsWith: 'اؤْتُمِنَ خَانَ».',
                from: 67,
                meta: {
                    num: '٣٣',
                },
            });

            testSegment(segments[13], {
                content: 'بَابٌ: قِيَامُ لَيْلَةِ الْقَدْرِ مِنَ الْإِيمَانِ',
                from: 69,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[14], {
                beginsWith: 'حَدَّثَنَا أَبُو الْيَمَانِ قَالَ: أَخْبَرَنَا',
                endsWith: 'ذَنْبِهِ».',
                from: 70,
                meta: {
                    num: '٣٥',
                },
            });

            testSegment(segments[15], {
                beginsWith: 'بَابُ قَوْلِ الْمُحَدِّثِ',
                endsWith: 'عَنْ رَبِّكُمْ ﷿',
                from: 115,
                meta: {
                    type: 'chapter',
                },
            });

            testSegment(segments[16], {
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

            expect(segments).toHaveLength(21);

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
                endsWith: 'طَرَفُ العَضُدِ؛',
                from: 229,
            });

            testSegment(segments[14], {
                content: 'لأنَّ غَسْلَ العَظْمَيْنِ',
                from: 229,
            });

            testSegment(segments[15], {
                beginsWith: 'بالموتِ',
                endsWith: 'فإنَّها كامِلَةٌ.',
                from: 7954,
            });

            testSegment(segments[16], {
                beginsWith: 'فصل: ولا يَجِبُ',
                endsWith: 'كالمُدَبَّرَةِ.',
                from: 7954,
            });

            testSegment(segments[17], {
                beginsWith: 'مسألة؛ قال: (وإِنْ',
                endsWith: 'ما كان عليه.',
                from: 7954,
            });

            testSegment(segments[18], {
                beginsWith: 'مسألة؛ قال: (وَإِذَا قَتلَتْ',
                endsWith: 'بقَتلِ الحُرِّ دِيَتُه (٢).',
                from: 7954,
                to: 7955,
            });

            testSegment(segments[19], {
                beginsWith: 'بابُ الاسْتِطابةِ',
                endsWith: ' في اسْتِجْمارهِ.',
                from: 7957,
                meta: { type: 'chapter' },
            });

            testSegment(segments[20], {
                beginsWith: 'مسألة؛ قال: (وليس',
                endsWith: 'إذَا قُمْتُمْ',
                from: 7957,
                meta: { type: 'chapter' },
            });
        });
    });

    describe('misc', () => {
        it('should segment the text', () => {
            data = {
                pages: [
                    {
                        content:
                            'أربعا وتسعين سنة (١) .\r٢٩- خ سي:<span data-type="title" id=toc-70> أَحْمَد بن حميد الطريثيثي، أَبُو الْحَسَن الكوفي، ختن عُبَيد اللَّهِ بْن مُوسَى، ويعرف بدار أم </span>سَلَمَة (٢) .\rوكان من حفاظ الكوفة.',
                        id: 257,
                    },
                    {
                        content:
                            '١٠٢-<span data-type="title" id=toc-145> تمييز ولهم شيخ آخر يقَالَ له: أَحْمَد بْن مُحَمَّد بْن يحيى بن نيزك بن صَالِح بن عَبْد الرَّحْمَنِ </span>بن عَمْرو بن مرة الهمداني، أَبُو الْعَبَّاس القومسي النيزكي.',
                        id: 435,
                    },
                ],
            };
            data.pages = data.pages.map((p) => ({ content: htmlToMarkdown(p.content), id: p.id }));

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
                        lineStartsAfter: ['{{raqms:num}}\\s*{{dash}}\\s*{{harf}}:'],
                    },
                    {
                        lineStartsAfter: ['{{raqms:num}}\\s*{{dash}}'],
                    },
                    {
                        lineStartsAfter: ['{{raqms:num}} {{harf}} {{harf}}:'],
                    },
                ],
            });

            expect(segments).toHaveLength(3);

            testSegment(segments[0], {
                content: 'أربعا وتسعين سنة (١) .',
                from: 257,
            });

            testSegment(segments[1], {
                beginsWith: 'خ سي: أَحْمَد بن حميد',
                endsWith: 'من حفاظ الكوفة.',
                meta: {
                    num: '٢٩',
                    type: 'chapter',
                },
            });

            testSegment(segments[2], {
                beginsWith: 'تمييز ولهم',
                endsWith: 'القومسي النيزكي.',
                meta: {
                    num: '١٠٢',
                },
            });
        });

        it('should split into 3 segments', () => {
            const pages = [
                {
                    content:
                        'بعضهم إحدى هاتين الترجمتين بالأخرى (١) ، والصواب التفريق كما ذكرنا، والله أعلم (٢) .\r١٠٦- ق:<span data-type="title" id=toc-149> أَحْمَد بن مُحَمَّد بن يحيى بن سَعِيد بن فروخ القطان أَبُو سَعِيد البَصْرِيّ، نزيل بغداد، أخو صَالِح </span>بْن مُحَمَّد.\rرَوَى عَن: بهلول بْن المورق، وحجين (٣) بن المثنى، وحسين ابن علي الجعفي، وأبي أسامة حَمَّاد بْن أسامة، وزيد بْن الحباب، وسَعِيد بْن عامر الضبعي، وأبي داود سُلَيْمان بْن داود الطيالسي، وسويد بْن عَمْرو الكلبي، وصفوان بن عيسى الزُّهْرِيّ، وعبد الله بْن نمير، وعبد الرحمن بْن غزوان المعروف بقراد أَبِي نوح، وعبد الرحمن بْن مهدي، وأبي عامر عَبد المَلِك بْن عَمْرو العقدي، وعُبَيد ابن أَبي قرة، وعثمان بْن عُمَر بْن فارس، وعفان بْن مسلم، وعَمْرو بْن مُحَمَّد العنقزي (ق) ، وعَمْرو بْن النعمان، وقريش بْن أنس، ومحاضر',
                    id: 442,
                },
                {
                    content:
                        'ابن المورع، ومحمد بْن بشر العبدي، ومحمد بْن عُمَر الواقدي، وأبيه: مُحَمَّد بن يحيى بن سَعِيد القطان، ومنصور بْن عكرمة، وأبي النَّضْر هاشم بْن الْقَاسِم (ق) ، ويحيى بْن آدم، ويحيى بْن حَمَّاد، وجده يحيى بْن سَعِيد القطان، ويحيى بْن عُمَر الفراء، ويحيى بْن عيسى الرملي، ويزيد بْن هارون، ويونس بْن بُكَيْر الشَّيْبَانِيّ.\rرَوَى عَنه: ابْن ماجه، وأَبُو الْحَسَن أَحْمَد بْن مُحَمَّد بْن عُبَيد الطوابيقي، وأَبُو على أَحْمَد بْن مُحَمَّد بْن مصقلة الأصبهاني، وحاجب ابْن أركين الفرغاني، والحسن بْن علي بْن نصر الطوسي، والحسين بْن إِسْمَاعِيل المحاملي، والحسين بْن يحيى بْن عياش القطان، والخضر ابن مُحَمَّد بْن المرزبان الْبَغْدَادِيّ، وعبد الله بْن أَحْمَد بْن مُوسَى عبدان الأهوازي، وعبد الله بْن جَعْفَر بْن خشيش، وعبد الله بْن مُحَمَّد بْن أَبي الدنيا، وعبد الله بْن مُحَمَّد بْن عَبْد الْعَزِيزِ البغوي، وعبد الله بن محمد ابن ناجية، وعبد الرحمن بْن أَبي حَاتِم الرازي، وعُمَر بْن إِبْرَاهِيم بْن سُلَيْمان المعروف بأبي الآذان، وعُمَر بْن مُحَمَّد بْن بجير البجيري، والقاسم بْن مُوسَى بْن الْحَسَن بْن مُوسَى الأشيب، ومحمد بْن أَحْمَد بْن صَالِح بْن علي الأزدي، ومحمد بْن حامد بْن السري الْبَغْدَادِيّ المعروف بخال ولد السني، ومحمد بْن الحسين بن شهريار، ومحمد ابن الْعَبَّاس بْن أيوب الأصبهاني الأخرم، ومحمد بْن مخلد بْن حَفْص الدوري، ومحمد بْن نوح الجنديسابوري، ويحيى بْن مُحَمَّد بْن صاعد، ويعقوب بْن إِبْرَاهِيم بْن أَحْمَد بْن عيسى الْبَغْدَادِيّ.\rقال عَبد الرَّحْمَنِ بْن أَبي حَاتِم: كَانَ صدوقا (١)\rوَقَال مُحَمَّد بْن مخلد: مات بالعسكر (٢) سنة ثمان وخمسين',
                    id: 443,
                },
                {
                    content: 'ومئتين (١) .',
                    id: 444,
                },
            ].map((p) => ({ content: htmlToMarkdown(p.content), id: p.id }));

            const segments = segmentPages(pages, {
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
                        lineStartsAfter: ['{{raqms:num}}\\s*{{dash}}\\s*{{harf}}:'],
                    },
                    {
                        lineStartsAfter: ['{{raqms:num}}\\s*{{dash}}'],
                    },
                    {
                        lineStartsAfter: ['{{raqms:num}} {{harf}} {{harf}}:'],
                    },
                ],
            });

            testSegment(segments[0], {
                beginsWith: 'بعضهم إحدى',
                endsWith: 'والله أعلم (٢) .',
                from: 442,
            });

            testSegment(segments[1], {
                beginsWith: 'ق: أَحْمَد',
                endsWith: 'عيسى الْبَغْدَادِيّ.',
                from: 442,
                to: 443,
            });

            testSegment(segments[2], {
                beginsWith: 'قال عَبد الرَّحْمَنِ',
                endsWith: 'ومئتين (١) .',
                from: 443,
                to: 444,
            });
        });

        it('should retain the right from page number', () => {
            const pages = [
                {
                    content: 'وَقَال إبراهيم بْن مُحَمَّدِ بْن سفيان النيسابوري: سمعت أبا',
                    id: 2533,
                },
                {
                    content: 'وقَال البُخارِيُّ: قال أحمد: مات سنة ست ومئتين.',
                    id: 2534,
                },
                {
                    content:
                        'روى له الجماعة (١) .\r١١٢٨ ع: حجاج بن المنهال الأنماطي أَبُو مُحَمَّد السلمي (٢) وقيل: البرساني، مولاهم، البَصْرِيّ.\rرَوَى عَن: جرير بْن حازم (خ فق) ، وجويرية بْن أسماء (خ) ، وحماد بْن زيد (خ) ، وحماد بن سلمة (خت ٤) ، وداود بْن أَبي الفرات (س) ، وربيعة بْن كلثوم (س) ، وسفيان بْن عُيَيْنَة (خ) ، وشعبة بْن الحجاج (خ س) ، وعبد الله بْن عُمَر النميري (خ) ، وعبد العزيز بن عَبد اللَّهِ بن أَبي سلمة الماجشون (خ) ،',
                    id: 2535,
                },
            ];

            const segments = segmentPages(pages, {
                breakpoints: [
                    {
                        pattern: '{{tarqim}}\\s*',
                    },
                    '',
                ],
                maxPages: 1,
                rules: [
                    {
                        lineStartsAfter: ['{{raqms:num}} {{harfs}}:'],
                    },
                ],
            });

            expect(segments).toHaveLength(3);

            testSegment(segments[0], {
                beginsWith: 'وَقَال إبراهيم',
                endsWith: 'ومئتين.',
                from: 2533,
                to: 2534,
            });

            testSegment(segments[1], {
                content: 'روى له الجماعة (١) .',
                from: 2535,
            });

            testSegment(segments[2], {
                beginsWith: 'حجاج بن المنهال',
                endsWith: 'سلمة الماجشون (خ) ،',
                from: 2535,
                meta: {
                    num: '١١٢٨',
                },
            });
        });
    });
});
