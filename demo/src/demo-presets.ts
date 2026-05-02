import type { ArabicDictionaryProfile, Page, SegmentationOptions } from 'flappa-doormal';
import { DICTIONARY_BOOK_OPTIONS } from '../../testing/fixtures/dictionary-book-options.js';
import fixture1687 from '../../testing/fixtures/dictionary-books/1687.json';
import fixture2553 from '../../testing/fixtures/dictionary-books/2553.json';
import fixture7030 from '../../testing/fixtures/dictionary-books/7030.json';
import fixture7031 from '../../testing/fixtures/dictionary-books/7031.json';

type FixtureBook = { pages: Page[] };

export type DemoPresetGroup = 'Rule Examples' | 'Dictionary Profiles';

export interface DemoOptionCard {
    description: string;
    label: string;
    value: string;
}

export interface DemoPreset {
    group: DemoPresetGroup;
    id: string;
    optionCards: DemoOptionCard[];
    options: SegmentationOptions;
    pages: Page[];
    profileName?: string;
    sourceCase: string;
    sourceFile: string;
    summary: string;
    tags: string[];
    title: string;
}

const withDebug = (options: SegmentationOptions): SegmentationOptions => ({
    ...options,
    debug: true,
});

const pickPages = (book: FixtureBook, ids: number[]): Page[] =>
    ids.map((id) => {
        const page = book.pages.find((entry) => entry.id === id);
        if (!page) {
            throw new Error(`Missing fixture page ${id}`);
        }
        return { ...page };
    });

const dictionaryOptionCards = (profileName: string, profile: ArabicDictionaryProfile): DemoOptionCard[] => {
    const blockerCount = profile.zones.reduce((count, zone) => count + (zone.blockers?.length ?? 0), 0);
    const familyCount = profile.zones.reduce((count, zone) => count + zone.families.length, 0);

    return [
        {
            description: 'Uses one of the builtin dictionary profiles that the integration suite verifies against shipped fixtures.',
            label: 'dictionary',
            value: profileName,
        },
        {
            description: `This profile currently defines ${profile.zones.length} zone${profile.zones.length === 1 ? '' : 's'}, ${familyCount} family matcher${familyCount === 1 ? '' : 's'}, and ${blockerCount} blocker${blockerCount === 1 ? '' : 's'}.`,
            label: 'profile shape',
            value: `${profile.zones.length} zone${profile.zones.length === 1 ? '' : 's'}`,
        },
        {
            description: 'Keeps each segment bounded to a single source page, which matches the test fixture options.',
            label: 'maxPages',
            value: '1',
        },
        {
            description: 'Strips invisible Unicode marks before matching so dictionary markers are not lost at line starts.',
            label: 'preprocess',
            value: 'removeZeroWidth',
        },
        {
            description: 'Lets punctuation act as the fallback breakpoint whenever the profile needs a safe split.',
            label: 'breakpoints',
            value: '{{tarqim}}',
        },
    ];
};

const fixtureBook1687 = fixture1687 as FixtureBook;
const fixtureBook2553 = fixture2553 as FixtureBook;
const fixtureBook7030 = fixture7030 as FixtureBook;
const fixtureBook7031 = fixture7031 as FixtureBook;

export const DEMO_PRESET_GROUPS: DemoPresetGroup[] = ['Rule Examples', 'Dictionary Profiles'];

export const DEMO_PRESETS: DemoPreset[] = [
    {
        group: 'Rule Examples',
        id: 'named-capture-hadith',
        optionCards: [
            {
                description: 'Matches Arabic-Indic numbering plus a dash, captures the number as metadata, and removes that marker from the segment body.',
                label: 'lineStartsAfter',
                value: '{{raqms:num}} {{dash}} ',
            },
            {
                description: 'Starts the segment exactly at the match location, which is the default behavior for structural rules.',
                label: 'split',
                value: 'at',
            },
            {
                description: 'The demo keeps debug metadata enabled so you can see why each segment was emitted.',
                label: 'debug',
                value: 'true',
            },
        ],
        options: withDebug({
            rules: [{ lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at' }],
        }),
        pages: [
            {
                content: [
                    '٦٦٩٦ - حَدَّثَنَا أَبُو بَكْرٍ قَالَ حَدَّثَنَا وَكِيعٌ عَنْ سُفْيَانَ عَنْ مَنْصُورٍ عَنْ إِبْرَاهِيمَ قَالَ كَانُوا يَكْرَهُونَ أَنْ يُقْطَعَ الْحَدِيثُ حَتَّى يَفْرُغَ الرَّاوِي مِنْهُ.',
                    '٦٦٩٧ - أَخْبَرَنَا عُمَرُ بْنُ عَلِيٍّ قَالَ أَنْبَأَنَا يَحْيَى عَنْ عُبَيْدِ اللَّهِ عَنْ نَافِعٍ عَنِ ابْنِ عُمَرَ فِي ذِكْرِ السَّفَرِ وَآدَابِهِ.',
                    '٦٦٩٨ - حَدَّثَنِي مُحَمَّدٌ قَالَ سَمِعْتُ أَبَا حَاتِمٍ يَقُولُ إِنَّ طُولَ السَّنَدِ لَا يَضُرُّ إِذَا ثَبَتَتْ رِجَالُهُ وَاتَّصَلَ خَبَرُهُ.',
                ].join('\n'),
                id: 1,
            },
            {
                content: [
                    '٦٦٩٩ - وَحَدَّثَنَا عَبْدُ اللَّهِ قَالَ قَرَأْتُ عَلَى مَالِكٍ بَابَ مَا جَاءَ فِي الْعِلْمِ وَحِفْظِهِ وَإِكْرَامِ أَهْلِهِ.',
                    '٦٧٠٠ - أَخْبَرَنَا أَحْمَدُ بْنُ يُونُسَ قَالَ نَبَّأَنَا زُهَيْرٌ عَنْ أَبِي إِسْحَاقَ قَالَ كَانَ الشُّيُوخُ يَكْتُبُونَ أَوَّلَ الْحَدِيثِ وَآخِرَهُ.',
                    '٦٧٠١ - حَدَّثَنَا الْحَسَنُ قَالَ ذُكِرَ لَنَا أَنَّ الطَّالِبَ إِذَا ضَبَطَ رَقْمَ الْخَبَرِ وَمَتْنَهُ سَهُلَتْ مُرَاجَعَتُهُ.',
                ].join('\n'),
                id: 2,
            },
        ],
        sourceCase: 'should extract named capture and exclude marker from content',
        sourceFile: 'src/segmentation/segmenter.test.ts',
        summary: 'A minimal numbered-hadith example that shows token expansion, named capture extraction, and marker stripping.',
        tags: ['tokens', 'named capture', 'lineStartsAfter'],
        title: 'Named Capture Hadith Markers',
    },
    {
        group: 'Rule Examples',
        id: 'fuzzy-token-mix',
        optionCards: [
            {
                description: 'One rule accepts several phrase tokens, so the same configuration can split on book headings, chapter headings, and transmission phrases.',
                label: 'lineStartsWith',
                value: '{{kitab}}, {{bab}}, {{naql}}',
            },
            {
                description: 'Enables diacritic-insensitive and character-equivalent matching, which lets the same rule match forms like كتاب and كِتَابُ.',
                label: 'fuzzy',
                value: 'true',
            },
            {
                description: 'Each match keeps its marker because lineStartsWith includes the marker in the resulting segment.',
                label: 'marker handling',
                value: 'keep marker',
            },
        ],
        options: withDebug({
            rules: [{ fuzzy: true, lineStartsWith: ['{{kitab}}', '{{bab}}', '{{naql}}'], split: 'at' }],
        }),
        pages: [
            {
                content:
                    'كِتَابُ الإيمان\nوفيه أبواب كثيرة يذكر فيها المصنف اختلاف ألفاظ الرواة، وما يقع في النسخ من زيادة ونقصان، ثم يورد جملة من الآثار التي تبدأ بصيغ السماع والرواية.',
                id: 1,
            },
            {
                content:
                    'بَابُ أركان الإيمان\nهذا الباب مكتوب بالضبط في بعض النسخ، وبغير ضبط في غيرها، ولذلك يكون التطابق الحرفي وحده ضعيفا عند اختلاف الحركات أو صورة الهمزة.',
                id: 2,
            },
            {
                content:
                    'حَدَّثَنَا أبو هريرة قال أخبرنا بعض أصحابنا أن الطالب إذا عرف مواضع الأبواب والكتب وصيغ النقل استطاع أن يقسم النص الطويل إلى وحدات مفهومة.',
                id: 3,
            },
        ],
        sourceCase: 'should combine multiple phrase tokens in lineStartsWith',
        sourceFile: 'src/segmentation/segmenter.test.ts',
        summary: 'Shows how the token system can collapse several Arabic marker families into one fuzzy rule.',
        tags: ['fuzzy', 'phrase tokens', 'lineStartsWith'],
        title: 'Fuzzy Multi-Token Splitting',
    },
    {
        group: 'Rule Examples',
        id: 'cross-page-joiner',
        optionCards: [
            {
                description: 'A plain regex rule catches hadith numbering without using tokens.',
                label: 'regex',
                value: '^[٠-٩]+ - ',
            },
            {
                description: 'When a segment spans more than one page, pageJoiner decides how adjacent pages are glued together. This case uses a single space.',
                label: 'pageJoiner',
                value: 'space',
            },
            {
                description: 'The second segment intentionally spans pages 10 and 11 so you can see the cross-page attribution in the result table.',
                label: 'span behavior',
                value: 'multi-page',
            },
        ],
        options: withDebug({
            pageJoiner: 'space',
            rules: [{ regex: '^[٠-٩]+ - ', split: 'at' }],
        }),
        pages: [
            {
                content:
                    '١ - الحديث الأول كامل وفيه كلام طويل عن اختلاف النسخ وتعدد طرق الرواية، ثم يختم المصنف الكلام قبل أن يبدأ الخبر التالي.\r٢ - بداية الحديث الثاني وفيه جملة طويلة تتوقف عند آخر الصفحة',
                id: 10,
            },
            {
                content:
                    'وتستمر في الصفحة التالية قبل أن تنتهي بسطر جديد يوضح أن الصفحة وحدها ليست دائما وحدة منطقية.\r٣ - الحديث الثالث يبدأ هنا بعد اكتمال الخبر السابق، وفيه مثال مستقل لا يمتد إلى صفحة أخرى.',
                id: 11,
            },
        ],
        sourceCase: 'should handle content spanning across 2 pages with space joining',
        sourceFile: 'src/segmentation/segmenter.test.ts',
        summary: 'Demonstrates how a structural rule behaves when one logical segment crosses a page boundary.',
        tags: ['regex', 'pageJoiner', 'cross-page'],
        title: 'Cross-Page Joining',
    },
    {
        group: 'Rule Examples',
        id: 'length-breakpoints',
        optionCards: [
            {
                description: 'Caps any single segment at roughly 80 characters before the engine looks for a safer place to split.',
                label: 'maxContentLength',
                value: '80',
            },
            {
                description: 'Looks for sentence punctuation first, so the split stays readable instead of chopping at an arbitrary character boundary.',
                label: 'breakpoints',
                value: '\\. ',
            },
            {
                description: 'Debug output exposes whether a split came from the configured breakpoint or from a safety fallback.',
                label: 'debug',
                value: 'true',
            },
        ],
        options: withDebug({
            breakpoints: ['\\. '],
            maxContentLength: 80,
        }),
        pages: [
            {
                content:
                    'First sentence with enough length to be significant and to make the length limiter visible in the output table. Second sentence that also has significant length and should be preferred as a breakpoint when it fits inside the window. Third sentence continues with more ordinary prose so the processor has to decide between punctuation, whitespace, and a hard fallback. Fourth sentence keeps the example long enough that several result rows appear immediately.',
                id: 1,
            },
        ],
        sourceCase: 'should prioritize breakpoints over simple length splits',
        sourceFile: 'src/segmentation/max-content-length.test.ts',
        summary: 'A safety-focused preset that prefers semantic breakpoints before falling back to hard length-based splitting.',
        tags: ['maxContentLength', 'breakpoints', 'safety'],
        title: 'Length-Limited Fallback Splits',
    },
    {
        group: 'Dictionary Profiles',
        id: 'dictionary-1687',
        optionCards: dictionaryOptionCards('PROFILE_1687', DICTIONARY_BOOK_OPTIONS['1687'].dictionary),
        options: withDebug(DICTIONARY_BOOK_OPTIONS['1687']),
        pages: pickPages(fixtureBook1687, [4673, 4674]),
        profileName: 'PROFILE_1687',
        sourceCase: '1687 late-heading zone emits chapter and entry shapes around page 4673',
        sourceFile: 'src/dictionary/profiles.test.ts',
        summary: 'A late-book dictionary profile example with a clean chapter-to-entry transition on real fixture pages.',
        tags: ['dictionary', 'chapter', 'entry'],
        title: 'Builtin Profile 1687',
    },
    {
        group: 'Dictionary Profiles',
        id: 'dictionary-2553',
        optionCards: dictionaryOptionCards('PROFILE_2553', DICTIONARY_BOOK_OPTIONS['2553'].dictionary),
        options: withDebug(DICTIONARY_BOOK_OPTIONS['2553']),
        pages: pickPages(fixtureBook2553, [66, 67]),
        profileName: 'PROFILE_2553',
        sourceCase: '2553 profile keeps the عز page shape clean',
        sourceFile: 'src/dictionary/profiles.test.ts',
        summary: 'The shipped 2553 profile segments a dense lexicon page into the expected root entries without surfacing glossary noise.',
        tags: ['dictionary', 'fixtures', 'clean entries'],
        title: 'Builtin Profile 2553',
    },
    {
        group: 'Dictionary Profiles',
        id: 'dictionary-7030',
        optionCards: dictionaryOptionCards('PROFILE_7030', DICTIONARY_BOOK_OPTIONS['7030'].dictionary),
        options: withDebug(DICTIONARY_BOOK_OPTIONS['7030']),
        pages: pickPages(fixtureBook7030, [125, 126]),
        profileName: 'PROFILE_7030',
        sourceCase: '7030 profile keeps heading entries and blocks intro-like prose lemmas on page 125',
        sourceFile: 'src/dictionary/profiles.test.ts',
        summary: 'A heading-heavy profile that preserves structural entries while rejecting introductory prose that looks entry-like.',
        tags: ['dictionary', 'headings', 'markers'],
        title: 'Builtin Profile 7030',
    },
    {
        group: 'Dictionary Profiles',
        id: 'dictionary-7031',
        optionCards: dictionaryOptionCards('PROFILE_7031', DICTIONARY_BOOK_OPTIONS['7031'].dictionary),
        options: withDebug(DICTIONARY_BOOK_OPTIONS['7031']),
        pages: pickPages(fixtureBook7031, [1664]),
        profileName: 'PROFILE_7031',
        sourceCase: '7031 grouped and appendix zones emit the expected structural shapes',
        sourceFile: 'src/dictionary/profiles.test.ts',
        summary: 'Shows a grouped-page dictionary zone where markers, chapters, and entries all coexist on the same fixture page.',
        tags: ['dictionary', 'marker', 'grouped zone'],
        title: 'Builtin Profile 7031',
    },
];

export const DEFAULT_PRESET_ID = DEMO_PRESETS[0]?.id ?? '';
