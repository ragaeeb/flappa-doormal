import { describe, expect, it } from 'bun:test';
import type { ArabicDictionaryProfile, Page } from '@/index.js';
import { loadDictionaryFixturePage, loadDictionaryFixturePages } from '../../testing/fixtures/dictionary-books.js';
import { segmentPages } from '../segmentation/segmenter.js';
import { diagnoseDictionaryProfile } from './runtime.js';

const loadBookPage = (filename: string, id: number): Promise<Page> =>
    loadDictionaryFixturePage(filename.replace('.json', '') as '1687' | '2553' | '7030' | '7031', id);

const loadBookPages = (filename: string, ids: number[]): Promise<Page[]> =>
    loadDictionaryFixturePages(filename.replace('.json', '') as '1687' | '2553' | '7030' | '7031', ids);

describe('dictionary segmentation runtime', () => {
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

    it('produces diagnostics with blocker hit counts and rejected lemmas', () => {
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
        expect(diagnostics.blockerHits.stopLemma).toBe(1);
        expect(diagnostics.blockerHits.intro).toBe(1);
        expect(diagnostics.rejectedLemmas).toEqual([
            { count: 1, lemma: 'طاؤوس' },
            { count: 1, lemma: 'ومعناه' },
        ]);
        expect(diagnostics.samples).toHaveLength(3);
    });
});
