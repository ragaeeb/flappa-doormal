import { describe, expect, it } from 'bun:test';
import type { ArabicDictionaryProfile, Page } from '@/index.js';
import { loadDictionaryFixturePage, loadDictionaryFixturePages } from '../../testing/fixtures/dictionary-books.js';
import { segmentPages } from '../segmentation/segmenter.js';
import { diagnoseDictionaryProfile } from './runtime.js';

const loadBookPage = (filename: string, id: number): Promise<Page> =>
    loadDictionaryFixturePage(filename.replace('.json', '') as '1687' | '2553' | '7030' | '7031', id);

const loadBookPages = (filename: string, ids: number[]): Promise<Page[]> =>
    loadDictionaryFixturePages(filename.replace('.json', '') as '1687' | '2553' | '7030' | '7031', ids);

const lineEntryProfile = (blockers: NonNullable<ArabicDictionaryProfile['zones'][number]['blockers']>) => ({
    version: 2 as const,
    zones: [
        {
            blockers,
            families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' as const }],
            name: 'main',
        },
    ],
});

const entryLemmasFor = (pages: Page[], profile: ArabicDictionaryProfile) =>
    segmentPages(pages, { dictionary: profile, maxPages: 1 })
        .filter((segment) => segment.meta?.kind === 'entry')
        .map((segment) => segment.meta?.lemma);

describe('dictionary segmentation runtime', () => {
    it('rejects mid-page candidates via previousWord scope=samePage', () => {
        const pages: Page[] = [{ content: 'تمهيد.\nقال\nلع: جذر مرفوض.\nعك: جذر مقبول.', id: 1 }];
        const profile = lineEntryProfile([{ scope: 'samePage', use: 'previousWord', words: ['قال'] }]);

        expect(entryLemmasFor(pages, profile)).toEqual(['عك']);
    });

    it('does not cross the page boundary via previousWord scope=samePage', () => {
        const pages: Page[] = [
            { content: 'قال', id: 1 },
            { content: 'لع: جذر مسموح.\nعك: جذر آخر.', id: 2 },
        ];
        const profile = lineEntryProfile([{ scope: 'samePage', use: 'previousWord', words: ['قال'] }]);

        expect(entryLemmasFor(pages, profile)).toEqual(['لع', 'عك']);
    });

    it('rejects page-start candidates via previousWord scope=pageStart', () => {
        const pages: Page[] = [
            { content: 'قال', id: 1 },
            { content: 'لع: جذر مرفوض.\nعك: جذر مقبول.', id: 2 },
        ];
        const profile = lineEntryProfile([{ scope: 'pageStart', use: 'previousWord', words: ['قال'] }]);

        expect(entryLemmasFor(pages, profile)).toEqual(['عك']);
    });

    it('does not reject mid-page candidates via previousWord scope=pageStart', () => {
        const pages: Page[] = [{ content: 'قال\nلع: جذر مقبول.\nعك: جذر آخر.', id: 1 }];
        const profile = lineEntryProfile([{ scope: 'pageStart', use: 'previousWord', words: ['قال'] }]);

        expect(entryLemmasFor(pages, profile)).toEqual(['لع', 'عك']);
    });

    it('skips pageStart previousWord rejection when the previous page ends with a strong sentence terminator', () => {
        const pages: Page[] = [
            { content: 'قال.', id: 1 },
            { content: 'لع: جذر مقبول.\nعك: جذر آخر.', id: 2 },
        ];
        const profile = lineEntryProfile([{ scope: 'pageStart', use: 'previousWord', words: ['قال'] }]);

        expect(entryLemmasFor(pages, profile)).toEqual(['لع', 'عك']);
    });

    it('skips pageStart previousWord rejection for the first page candidate', () => {
        const pages: Page[] = [{ content: 'لع: جذر مقبول.\nعك: جذر آخر.', id: 1 }];
        const profile = lineEntryProfile([{ scope: 'pageStart', use: 'previousWord', words: ['قال'] }]);

        expect(entryLemmasFor(pages, profile)).toEqual(['لع', 'عك']);
    });

    it('rejects both page-start and mid-page candidates via previousWord scope=any', () => {
        const pages: Page[] = [
            { content: 'قال', id: 1 },
            { content: 'لع: جذر مرفوض.\nقال\nعك: جذر مرفوض.\nبكأ: جذر مقبول.', id: 2 },
        ];
        const profile = lineEntryProfile([{ scope: 'any', use: 'previousWord', words: ['قال'] }]);

        expect(entryLemmasFor(pages, profile)).toEqual(['بكأ']);
    });

    it('skips cross-page previousWord rejection via scope=any when the previous page ends with a strong sentence terminator', () => {
        const pages: Page[] = [
            { content: 'قال.', id: 1 },
            { content: 'لع: جذر مقبول.\nقال\nعك: جذر مرفوض.\nبكأ: جذر مقبول.', id: 2 },
        ];
        const profile = lineEntryProfile([{ scope: 'any', use: 'previousWord', words: ['قال'] }]);

        expect(entryLemmasFor(pages, profile)).toEqual(['لع', 'بكأ']);
    });

    it('treats zero-width prefix marks as page-start context for previousWord blockers', () => {
        const pages: Page[] = [
            { content: 'قال', id: 1 },
            { content: '\u200Bلع: جذر مرفوض.\nعك: جذر مقبول.', id: 2 },
        ];
        const profile = lineEntryProfile([{ scope: 'pageStart', use: 'previousWord', words: ['قال'] }]);

        expect(entryLemmasFor(pages, profile)).toEqual(['عك']);
    });

    it('rejects page-start continuation candidates with aggressive-only authority precision', () => {
        const pages: Page[] = [
            { content: 'شرح ممتد بلا فاصلة ختامية', id: 1 },
            { content: 'الليثي: تتمة تفسيرية.\nعك: جذر مقبول.', id: 2 },
        ];
        const defaultProfile = lineEntryProfile([{ appliesTo: ['lineEntry'], use: 'pageContinuation' }]);
        const aggressiveProfile = lineEntryProfile([
            { appliesTo: ['lineEntry'], authorityPrecision: 'aggressive', use: 'pageContinuation' },
        ]);

        expect(entryLemmasFor(pages, defaultProfile)).toEqual(['الليثي', 'عك']);
        expect(entryLemmasFor(pages, aggressiveProfile)).toEqual(['عك']);
    });

    it('reports previousWord scope=pageStart and aggressive pageContinuation rejections in diagnostics', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        { appliesTo: ['lineEntry'], scope: 'pageStart', use: 'previousWord', words: ['قال'] },
                        { appliesTo: ['lineEntry'], authorityPrecision: 'aggressive', use: 'pageContinuation' },
                    ],
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };
        const pages: Page[] = [
            { content: 'قال', id: 1 },
            { content: 'لع: جذر مرفوض.\nعك: جذر مقبول.', id: 2 },
            { content: 'شرح ممتد بلا فاصلة ختامية', id: 3 },
            { content: 'الليثي: تتمة تفسيرية.\nبكأ: جذر مقبول.', id: 4 },
        ];

        const diagnostics = diagnoseDictionaryProfile(pages, profile, { sampleLimit: 10 });

        expect(diagnostics.rejectionReasons.previousWord).toBe(1);
        expect(diagnostics.rejectionReasons.pageContinuation).toBe(1);
    });

    it('segments heading-driven pages with chapter and entry output kinds', async () => {
        const page = await loadBookPage('7030.json', 125);
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [
                        { classes: ['chapter'], emit: 'chapter', use: 'heading' },
                        { allowNextLineColon: true, classes: ['entry'], emit: 'entry', use: 'heading' },
                    ],
                    name: 'main',
                },
            ],
        };

        const segments = segmentPages([page], { dictionary: profile, maxPages: 1 });
        const summary = segments.map((segment) => ({
            kind: segment.meta?.kind,
            startsWith: segment.content.split('\n', 1)[0],
        }));

        expect(summary).toEqual([
            { kind: 'chapter', startsWith: '(بَاب الْهمزَة)' },
            { kind: 'chapter', startsWith: '(فصل الْهمزَة)' },
            { kind: 'entry', startsWith: 'أبأ' },
        ]);
    });

    it('keeps real inline subentries while blocking representative noise on 2553 page 66', async () => {
        const page = await loadBookPage('2553.json', 66);
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        { appliesTo: ['lineEntry', 'inlineSubentry'], use: 'pageContinuation' },
                        { appliesTo: ['lineEntry', 'inlineSubentry'], use: 'intro' },
                        { appliesTo: ['lineEntry', 'inlineSubentry'], precision: 'high', use: 'authorityIntro' },
                        { appliesTo: ['lineEntry', 'inlineSubentry'], use: 'stopLemma', words: ['أخاك', 'أي'] },
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

        const segments = segmentPages([page], { dictionary: profile, maxPages: 1 });
        const entries = segments.filter((segment) => segment.meta?.kind === 'entry');
        const heads = entries.map((segment) => segment.content.split(/\s+/u, 1)[0]);

        expect(heads).toEqual(['عز:', 'والعزَّاءُ:', 'والعَزُوزُ:', 'والمُعازَّةُ:']);
    });

    it('suppresses page-start continuation candidates when the previous page clearly continues prose', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        { appliesTo: ['lineEntry'], use: 'pageContinuation' },
                        { appliesTo: ['lineEntry'], use: 'intro' },
                    ],
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            { content: 'باب العين\nعز: المعنى الأول قال', id: 1 },
            { content: 'وقيل: تتمة الكلام هنا\nلع: جذر جديد', id: 2 },
        ];

        const segments = segmentPages(pages, { dictionary: profile, maxPages: 1 });
        const entryHeads = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.content.split(/\s+/u, 1)[0]);

        expect(entryHeads).toEqual(['عز:', 'لع:']);
    });

    it('blocks commentary-style non-lemmas like ومنهم and والجميع when they are in the stop list', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        { appliesTo: ['lineEntry', 'inlineSubentry'], use: 'intro' },
                        {
                            appliesTo: ['lineEntry', 'inlineSubentry'],
                            use: 'stopLemma',
                            words: ['ومنهم', 'والجميع', 'والجميعُ'],
                        },
                    ],
                    families: [
                        { emit: 'entry', use: 'lineEntry', wrappers: 'none' },
                        { emit: 'entry', prefixes: ['و'], stripPrefixesFromLemma: false, use: 'inlineSubentry' },
                    ],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content:
                    'ومنهم: أبو زكرياء يحيى بن زياد الفراء.\nوالجميعُ: الخُطا.\nعز: العزة لله.\nوالعزوز: الشاة الضيقة.',
                id: 13,
            },
        ];

        const segments = segmentPages(pages, { dictionary: profile, maxPages: 1 });
        const entryHeads = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.content.split(/\s+/u, 1)[0]);

        expect(entryHeads).toEqual(['عز:', 'والعزوز:']);
    });

    it('blocks line-entry candidates when the preceding local context ends in an intro phrase', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [{ appliesTo: ['lineEntry'], use: 'intro' }],
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content: 'السَّمارُ: اللَّبَنُ الَّذِي رُقِّقَ بِالْمَاءِ.\nوَفِي حَدِيثِ\nطاؤوس: مَن مَنَحَ مَنِيحةَ لَبَنٍ.\nبكأ: قلَّ لبنُها.',
                id: 35,
            },
        ];

        const segments = segmentPages(pages, { dictionary: profile, maxPages: 1 });
        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toEqual(['السَّمارُ', 'بكأ']);
    });

    it('blocks line-entry candidates when local context ends with citation tails and honorific fragments', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [{ appliesTo: ['lineEntry'], use: 'intro' }],
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content:
                    'قَالَ أَبو\nمَنْصُورٍ: تفسيرٌ منسوب.\nوَفِي حَدِيثِ عَلِيٍّ كَرَّمَ الله\nوجهه: خبر منسوب.\nقال الراجز يذكر امرأة\nوزوجها: بيت شعر.\nالنبي صلى الله عليه\nوسلم: تتمة الصيغة.\nعك: أصل صحيح.',
                id: 1,
            },
        ];

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toEqual(['عك']);
    });

    it('treats slash-separated citation tails and authority heads as intro noise', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        { appliesTo: ['lineEntry'], use: 'intro' },
                        { appliesTo: ['lineEntry'], precision: 'high', use: 'authorityIntro' },
                    ],
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content:
                    'العبارة الأولى بفتح /\nالهمزة: تتمة التركيب.\nوفي حديث الأقرع\nوالأبرص: تتمة الحديث.\nالشيباني: قال كذا.\nعك: أصل صحيح.',
                id: 1,
            },
        ];

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toEqual(['عك']);
    });

    it('treats page-start candidates after في التنزيل and من المجاز as continuation noise', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        { appliesTo: ['lineEntry'], use: 'pageContinuation' },
                        { appliesTo: ['lineEntry'], use: 'intro' },
                    ],
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content: 'دبب: أصل الكلام.\nوفي التنزيل',
                id: 1,
            },
            {
                content: 'العزيز: {وَاللَّهُ خَلَقَ كُلَّ دَآبَّةٍ}.\nومن المجاز',
                id: 2,
            },
            {
                content: 'المجاز: أمر اصطكت فيه الركب.\nدعب: جذر صحيح.',
                id: 3,
            },
        ];

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toEqual(['دبب', 'دعب']);
    });

    it('blocks repeated apparatus formulas and work-title labels via stopLemma', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        {
                            appliesTo: ['lineEntry', 'inlineSubentry'],
                            use: 'stopLemma',
                            words: ['ومعناه', 'ويقولون', 'وكذلك', 'التهذيب', 'يريد'],
                        },
                    ],
                    families: [
                        { emit: 'entry', use: 'lineEntry', wrappers: 'none' },
                        { emit: 'entry', prefixes: ['و'], stripPrefixesFromLemma: false, use: 'inlineSubentry' },
                    ],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content:
                    'ومعناه: شرحٌ لا ينبغي أن يكون رأس مدخل.\nويقولون: هذه حكاية قول.\nوكذلك: هذا استمرار في الشرح.\nالتهذيب: قول كتاب.\nيريد: أي يقصد.\nعول: الأصل الصحيح.',
                id: 1,
            },
        ];

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toEqual(['عول']);
    });

    it('treats stopLemma matching as punctuation-tolerant and rejects structurally leaky lemmas', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        {
                            appliesTo: ['lineEntry'],
                            use: 'stopLemma',
                            words: ['ومما يستدرك عليه', 'ونصه'],
                        },
                    ],
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content:
                    ': وممّا يُستدرك عَلَيْهِ: شرحٌ بنيويٌّ لا ينبغي أن يصير مدخلاً.\nونصُّه: هذا نقل من مصدر.\nعول: الأصل الصحيح.',
                id: 1,
            },
        ];

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toEqual(['عول']);
    });

    it('blocks qualifier-tail lemmas like شناح، أي and وحجل، قال before zone-specific stop lists run', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content: 'شناح، أي: طويل.\nوحَجَل، قال: يا رب بيضاء.\nخروقه، وجمعه: أخصة.\nعول: الأصل الصحيح.',
                id: 1,
            },
        ];

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toEqual(['عول']);
    });

    it('blocks structural heading leaks like جزء / آخر حرف / numeric code headings', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [
                        { emit: 'entry', separator: 'comma', use: 'pairedForms' },
                        { classes: ['entry'], emit: 'entry', use: 'heading' },
                        { emit: 'entry', use: 'lineEntry', wrappers: 'none' },
                    ],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content:
                    'لجزء الحادي عشر\nل\n(آخر حرف اللَّام) كتاب حرف النون\n٣ - (ف ط ر)\n## (المعجمة في المثناة الفوقية)\nعول: الأصل الصحيح.',
                id: 1,
            },
        ];

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toEqual(['عول']);
    });

    it('blocks metalinguistic ولل... label lemmas even without book-specific stop lists', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content: 'وللناقة: حَلْ.\nوللرجال: تعالَوْا.\nعول: الأصل الصحيح.',
                id: 1,
            },
        ];

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toEqual(['عول']);
    });

    it('treats status-tailed code and paired-form lines as markers instead of line entries', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [
                        { emit: 'marker', use: 'codeLine', wrappers: 'none' },
                        { emit: 'marker', requireStatusTail: true, separator: 'comma', use: 'pairedForms' },
                        { emit: 'entry', use: 'lineEntry', wrappers: 'none' },
                    ],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content: 'خ ش ط مهمل.\nخصف، فصخ: مستعملان.\nعول: الأصل الصحيح.',
                id: 1,
            },
        ];

        const segments = segmentPages(pages, { dictionary: profile, maxPages: 1 });
        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);
        const markerHeads = segments
            .filter((segment) => segment.meta?.kind === 'marker')
            .map((segment) => segment.content.split('\n', 1)[0]);

        expect(entryLemmas).toEqual(['عول']);
        expect(markerHeads).toContain('خ ش ط مهمل.');
        expect(markerHeads).toContain('خصف، فصخ: مستعملان.');
    });

    it('blocks scholar-name attribution lemmas on real 7031 pages', async () => {
        const pages = await loadBookPages('7031.json', [62, 63]);
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        {
                            appliesTo: ['lineEntry', 'inlineSubentry'],
                            use: 'stopLemma',
                            words: ['الأصمعي', 'والأصمعي', 'الكسائي', 'والكسائي'],
                        },
                    ],
                    families: [
                        { emit: 'entry', use: 'lineEntry', wrappers: 'none' },
                        { emit: 'entry', prefixes: ['و'], stripPrefixesFromLemma: false, use: 'inlineSubentry' },
                    ],
                    name: 'main',
                },
            ],
        };

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('والزَّعزاعة');
        expect(entryLemmas).not.toContain('والأصمعيّ');
        expect(entryLemmas).not.toContain('الأصمعيّ');
    });

    it('blocks connective formulas like ومنها on real 7031 pages', async () => {
        const pages = await loadBookPages('7031.json', [2911, 2912]);
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        {
                            appliesTo: ['lineEntry', 'inlineSubentry'],
                            use: 'stopLemma',
                            words: ['ومنها'],
                        },
                    ],
                    families: [
                        { emit: 'entry', use: 'lineEntry', wrappers: 'none' },
                        { emit: 'entry', prefixes: ['و'], stripPrefixesFromLemma: false, use: 'inlineSubentry' },
                    ],
                    name: 'main',
                },
            ],
        };

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('شنج');
        expect(entryLemmas).not.toContain('وَمِنْهَا');
    });

    it('blocks apparatus formulas like واحدها والجمع والاسم on real 2553 pages', async () => {
        const pages = await loadBookPages('2553.json', [119, 1833, 2406]);
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        {
                            appliesTo: ['lineEntry', 'inlineSubentry'],
                            use: 'stopLemma',
                            words: ['واحدها', 'والجمع', 'والاسم', 'والنعت', 'ومثله', 'ونحوهما'],
                        },
                    ],
                    families: [
                        { emit: 'entry', use: 'lineEntry', wrappers: 'none' },
                        { emit: 'entry', prefixes: ['و'], stripPrefixesFromLemma: false, use: 'inlineSubentry' },
                    ],
                    name: 'main',
                },
            ],
        };

        const entryLemmas = segmentPages(pages, { dictionary: profile, maxPages: 1 })
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('صقع');
        expect(entryLemmas).toContain('قندل');
        expect(entryLemmas).not.toContain('ونحوهما');
        expect(entryLemmas).not.toContain('والجمعُ');
        expect(entryLemmas).not.toContain('واحدها');
    });

    it('keeps leading content before the first dictionary split when rules are omitted', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [{ classes: ['chapter', 'entry'], emit: 'entry', use: 'heading' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content: 'مقدمة موجزة\n## جذر\nجذر\n: تفسير المدخل.',
                id: 1,
            },
        ];

        const segments = segmentPages(pages, { dictionary: profile, maxPages: 1 });

        expect(segments.map((segment) => ({ from: segment.from, kind: segment.meta?.kind ?? 'none' }))).toEqual([
            { from: 1, kind: 'none' },
            { from: 1, kind: 'entry' },
        ]);
        expect(segments[0]?.content).toBe('مقدمة موجزة');
    });

    it('normalizes CRLF pages before computing dictionary offsets', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [{ content: 'تمهيد\r\nجذر:\r\nشرح المدخل', id: 1 }];
        const segments = segmentPages(pages, { dictionary: profile, maxPages: 1 });

        expect(segments.map((segment) => segment.content)).toEqual(['تمهيد', 'جذر:\nشرح المدخل']);
        expect(segments[1]?.from).toBe(1);
    });

    it('attaches dictionary debug provenance when debug metadata is enabled', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [{ content: 'جذر: شرح المدخل', id: 1 }];
        const segments = segmentPages(pages, { debug: true, dictionary: profile, maxPages: 1 });

        expect((segments[0]?.meta as any)?._flappa?.dictionary).toEqual({
            family: 'lineEntry',
        });
    });

    it('honors allowNextLineColon for heading entries with a detached colon body line', () => {
        const pages: Page[] = [{ content: '## جذر\n: شرح المدخل', id: 1 }];

        const disabled = segmentPages(pages, {
            dictionary: {
                version: 2,
                zones: [
                    {
                        families: [{ classes: ['entry'], emit: 'entry', use: 'heading' }],
                        name: 'main',
                    },
                ],
            },
            maxPages: 1,
        });
        const enabled = segmentPages(pages, {
            dictionary: {
                version: 2,
                zones: [
                    {
                        families: [{ allowNextLineColon: true, classes: ['entry'], emit: 'entry', use: 'heading' }],
                        name: 'main',
                    },
                ],
            },
            maxPages: 1,
        });

        expect(disabled.map((segment) => segment.meta?.kind ?? 'none')).toEqual(['none']);
        expect(enabled.map((segment) => segment.meta?.kind ?? 'none')).toEqual(['entry']);
    });

    it('supports codeLine wrapper modes without accepting the wrong wrapper shape', () => {
        const pages: Page[] = [
            { content: '(خ ف د): مستعمل.\n[خ ف د]: مستعمل.\n(خ ف د]: مستعمل.\nخ ف د: مستعمل.', id: 1 },
        ];

        const collectMarkerLemmas = (wrappers: 'none' | 'paired' | 'mismatched' | 'either') =>
            segmentPages(pages, {
                dictionary: {
                    version: 2,
                    zones: [
                        {
                            families: [{ emit: 'marker', use: 'codeLine', wrappers }],
                            name: 'main',
                        },
                    ],
                },
                maxPages: 1,
            })
                .filter((segment) => segment.meta?.kind === 'marker')
                .map((segment) => segment.meta?.lemma);

        expect(collectMarkerLemmas('none')).toEqual(['خ ف د']);
        expect(collectMarkerLemmas('paired')).toEqual(['خ ف د', 'خ ف د']);
        expect(collectMarkerLemmas('mismatched')).toEqual(['خ ف د']);
        expect(collectMarkerLemmas('either')).toEqual(['خ ف د', 'خ ف د', 'خ ف د', 'خ ف د']);
    });

    it('merges rule and dictionary metadata when both split at the same offset', () => {
        const pages: Page[] = [{ content: '## جذر\nشرح المدخل', id: 1 }];
        const segments = segmentPages(pages, {
            debug: true,
            dictionary: {
                version: 2,
                zones: [
                    {
                        families: [{ classes: ['entry'], emit: 'entry', use: 'heading' }],
                        name: 'main',
                    },
                ],
            },
            maxPages: 1,
            rules: [{ lineStartsWith: ['## '], meta: { type: 'chapter' } }],
        });

        expect(segments[0]?.meta).toMatchObject({
            kind: 'entry',
            lemma: 'جذر',
            type: 'chapter',
        });
        expect((segments[0]?.meta as any)?._flappa?.dictionary?.family).toBe('heading');
        expect((segments[0]?.meta as any)?._flappa?.rule?.patternType).toBe('lineStartsWith');
    });

    it('produces diagnostics with rejection reason counts and rejected lemmas', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [
                        { appliesTo: ['lineEntry'], use: 'stopLemma', words: ['ومعناه'] },
                        { appliesTo: ['lineEntry'], use: 'intro' },
                    ],
                    families: [{ emit: 'entry', use: 'lineEntry', wrappers: 'none' }],
                    name: 'main',
                },
            ],
        };

        const pages: Page[] = [
            {
                content: 'ومعناه: شرح.\nوفي حديث\nطاؤوس: خبر.\nعول: أصل صحيح.',
                id: 1,
            },
        ];

        const diagnostics = diagnoseDictionaryProfile(pages, profile, { sampleLimit: 10 });

        expect(diagnostics.pageCount).toBe(1);
        expect(diagnostics.acceptedCount).toBe(1);
        expect(diagnostics.rejectedCount).toBe(2);
        expect(diagnostics.acceptedKinds.entry).toBe(1);
        expect(diagnostics.rejectionReasons.stopLemma).toBe(1);
        expect(diagnostics.rejectionReasons.intro).toBe(1);
        expect(diagnostics.rejectedLemmas).toEqual([
            { count: 1, lemma: 'طاؤوس' },
            { count: 1, lemma: 'ومعناه' },
        ]);
        expect(diagnostics.samples).toHaveLength(3);
        expect(diagnostics.samples[0]).toEqual(
            expect.objectContaining({
                absoluteIndex: expect.any(Number),
                line: expect.any(Number),
            }),
        );
    });

    it('includes qualifierTail and structuralLeak in rejectionReasons diagnostics', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [
                        { emit: 'entry', separator: 'comma', use: 'pairedForms' },
                        { classes: ['entry'], emit: 'entry', use: 'heading' },
                        { emit: 'entry', use: 'lineEntry', wrappers: 'none' },
                    ],
                    name: 'main',
                },
            ],
        };
        const pages: Page[] = [
            {
                content: 'شناح، أي: طويل.\n## (المعجمة في المثناة الفوقية)\nعول: الأصل الصحيح.',
                id: 1,
            },
        ];

        const diagnostics = diagnoseDictionaryProfile(pages, profile, { sampleLimit: 10 });

        expect(diagnostics.rejectionReasons.qualifierTail).toBeGreaterThan(0);
        expect(diagnostics.rejectionReasons.structuralLeak).toBeGreaterThan(0);
    });
});
