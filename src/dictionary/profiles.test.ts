import { describe, expect, it } from 'bun:test';
import type { Page } from '@/index.js';
import { loadDictionaryFixturePages, loadDictionaryFixturePagesUpTo } from '../../testing/fixtures/dictionary-books.js';
import { segmentPages } from '../segmentation/segmenter.js';
import { PROFILE_1687, PROFILE_2553, PROFILE_7030, PROFILE_7031 } from './profiles.js';

const loadBookPages = (filename: string, ids: number[]): Promise<Page[]> =>
    loadDictionaryFixturePages(filename.replace('.json', '') as '1687' | '2553' | '7030' | '7031', ids);

const loadBookPagesUpTo = (filename: string, maxId: number): Promise<Page[]> =>
    loadDictionaryFixturePagesUpTo(filename.replace('.json', '') as '1687' | '2553' | '7030' | '7031', maxId);

describe('dictionary book profiles', () => {
    it('1687 profile does not treat early commentary as dictionary entries', async () => {
        const pages = await loadBookPages('1687.json', [13, 17, 23]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('ومنهم');
        expect(entryLemmas).toContain('أَبَأَ');
    });

    it('1687 profile blocks hadith-intro carryover false positives like طاؤوس on page 35', async () => {
        const pages = await loadBookPagesUpTo('1687.json', 35);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('بكأ');
        expect(entryLemmas).not.toContain('طاؤوس');
    });

    it('1687 profile blocks page-start citation carry-over like أبو منصور / كرم الله وجهه', async () => {
        const pages = await loadBookPagesUpTo('1687.json', 42);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('بكأ');
        expect(entryLemmas).not.toContain('مَنْصُورٍ');
        expect(entryLemmas).not.toContain('وجهه');
    });

    it('1687 profile blocks repeated work-title and discourse-formula lemmas', async () => {
        const pages = await loadBookPagesUpTo('1687.json', 147);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('بكأ');
        expect(entryLemmas).not.toContain('التَّهْذِيبُ');
        expect(entryLemmas).not.toContain('يُرِيدُ');
    });

    it('1687 profile blocks citation scaffolding and apparatus labels in mid-book commentary pages', async () => {
        const pages = await loadBookPages('1687.json', [382, 440, 467, 5185]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('يُرْوَى');
        expect(entryLemmas).not.toContain('ويَرُوبُ');
        expect(entryLemmas).not.toContain('وقَبْلَه');
        expect(entryLemmas).not.toContain('لجزء الحادي عشر');
    });

    it('1687 profile blocks narrator names, quote verbs, and vocalization apparatus in later pages', async () => {
        const pages = await loadBookPages('1687.json', [904, 1313, 1998, 2483, 2859, 3133, 4548, 4975, 5023]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('ناعتُه');
        expect(entryLemmas).not.toContain('سَمِعْتُ');
        expect(entryLemmas).not.toContain('وأُنزلت');
        expect(entryLemmas).not.toContain('عَائِشَةُ');
        expect(entryLemmas).not.toContain('جَابِرٍ');
        expect(entryLemmas).not.toContain('الزُّبَيْرِ');
        expect(entryLemmas).not.toContain('عَنْهُ');
        expect(entryLemmas).not.toContain('بِالضَّمِّ');
    });

    it('1687 profile blocks authority carry-over, explanatory formulas, and source-title labels from r5', async () => {
        const pages = await loadBookPages('1687.json', [529, 759, 2123, 2848, 3118, 3132, 7961]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('عُمَرَ');
        expect(entryLemmas).not.toContain('وجهان');
        expect(entryLemmas).not.toContain('وَالرِّوَايَةُ');
        expect(entryLemmas).not.toContain('الْمُحْكَمِ');
        expect(entryLemmas).not.toContain('والقاموس');
        expect(entryLemmas).not.toContain('النِّهَايَةُ');
        expect(entryLemmas).not.toContain('النَّوَادِرِ');
    });

    it('1687 profile blocks quote-gloss carry-over, apparatus formulas, and late grammar headings from r6', async () => {
        const pages = await loadBookPages(
            '1687.json',
            [31, 34, 50, 125, 580, 595, 608, 701, 777, 943, 1610, 2789, 3271, 4546, 6566, 6891, 7127, 8059, 8074],
        );
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('ونظِيرهُ');
        expect(entryLemmas).not.toContain('وكسرِها');
        expect(entryLemmas).not.toContain('تُضايِقُه');
        expect(entryLemmas).not.toContain('وفُيُوءاً');
        expect(entryLemmas).not.toContain('ونحوَه');
        expect(entryLemmas).not.toContain('عِصابُنا');
        expect(entryLemmas).not.toContain('الوَفْراءُ');
        expect(entryLemmas).not.toContain('وَنَظِيرُهُ');
        expect(entryLemmas).not.toContain('المُبرياتُ');
        expect(entryLemmas).not.toContain('والعَوَارِفُ');
        expect(entryLemmas).not.toContain('المُغابِنَةُ');
        expect(entryLemmas).not.toContain('و- ي');
        expect(entryLemmas).not.toContain('كَقَوْلِكَ');
        expect(entryLemmas).not.toContain('تَفْسِيرُ ذَاكَ وَذَلِكَ');
        expect(entryLemmas).not.toContain('لَا الَّتِي تَكُونُ لِلتَّبْرِئَةِ');
        expect(entryLemmas).not.toContain('وَيَسَ');
        expect(entryLemmas).not.toContain('ن');
    });

    it('1687 profile blocks apparatus-only formula lemmas from r7 while keeping nearby lexical entries', async () => {
        const pages = await loadBookPages('1687.json', [17, 1834, 2406, 2505, 3750]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('ولَدَها');
        expect(entryLemmas).not.toContain('كأَنه');
        expect(entryLemmas).not.toContain('وَقُولَا');
        expect(entryLemmas).not.toContain('وقولٌ');
    });

    it('1687 profile blocks r8 apparatus fragments like والجراد and ولصوصها without suppressing nearby entries', async () => {
        const pages = await loadBookPages('1687.json', [336, 377, 637]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('والجَرادِ');
        expect(entryLemmas).not.toContain('ولُصُوصِها');
        expect(entryLemmas).not.toContain('والآخَرُ');
    });

    it('1687 profile blocks r9 page-wrap continuation fragments like والشعر والإزار وواِبصة', async () => {
        const pages = await loadBookPages('1687.json', [4199, 4330, 4495, 6393]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('والشّعْرِ');
        expect(entryLemmas).not.toContain('والإِزارِ');
        expect(entryLemmas).not.toContain('والصُّدُفانِ');
        expect(entryLemmas).not.toContain('وابِصة');
    });

    it('1687 profile blocks r10 authority-title and page-wrap carry-over without suppressing nearby roots', async () => {
        const pages = await loadBookPages('1687.json', [1514, 1515, 1575, 1576, 1872, 2856, 2857, 4504, 7490, 7555]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('والزَّايُ');
        expect(entryLemmas).toContain('والشَّرَى');
        expect(entryLemmas).not.toContain('الْهَمْزَةِ');
        expect(entryLemmas).not.toContain('والأَبرص');
        expect(entryLemmas).not.toContain('وإِبليس');
        expect(entryLemmas).not.toContain('الطِّرِمَّاحِ');
        expect(entryLemmas).not.toContain('الرِّياشِيُّ');
        expect(entryLemmas).not.toContain('الشَّيْبانيُّ');
        expect(entryLemmas).not.toContain('الأُمَويّ');
        expect(entryLemmas).not.toContain('الْمُبَرِّدُ');
    });

    it('2553 profile keeps the عز page shape clean', async () => {
        const pages = await loadBookPages('2553.json', [66, 67]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryHeads = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.content.split(/\s+/u, 1)[0]);

        expect(entryHeads).toEqual(['عز:', 'والعزَّاءُ:', 'والعَزُوزُ:', 'والمُعازَّةُ:', 'والعَزاز:', 'زع:']);
    });

    it('2553 profile blocks apparatus formulas and verse carry-over lemmas', async () => {
        const pages = await loadBookPages('2553.json', [56, 119, 1833, 2406]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('كع');
        expect(entryLemmas).toContain('صقع');
        expect(entryLemmas).toContain('قندل');
        expect(entryLemmas).not.toContain('وزوجها');
        expect(entryLemmas).not.toContain('ونحوهما');
        expect(entryLemmas).not.toContain('والجمعُ');
        expect(entryLemmas).not.toContain('واحدها');
    });

    it('2553 profile blocks comma-tail gloss fragments and formula lemmas', async () => {
        const pages = await loadBookPages('2553.json', [291, 778, 942, 1243, 2873]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('شناح، أي');
        expect(entryLemmas).not.toContain('وحَجَل، قال');
        expect(entryLemmas).not.toContain('والمعنى');
        expect(entryLemmas).not.toContain('خُرُوقه، وجمعه');
        expect(entryLemmas).not.toContain('وكقولهم');
    });

    it('2553 profile blocks apparatus formula lemmas and usage-note continuations', async () => {
        const pages = await loadBookPages('2553.json', [234, 252, 264, 299, 336, 409, 1653, 2043, 2732]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('وتعالى');
        expect(entryLemmas).not.toContain('وأقول');
        expect(entryLemmas).not.toContain('ونقول');
        expect(entryLemmas).not.toContain('وفعله');
        expect(entryLemmas).not.toContain('وصنعته');
        expect(entryLemmas).not.toContain('ويجوز');
        expect(entryLemmas).not.toContain('وبفلان');
        expect(entryLemmas).not.toContain('ووجهه');
    });

    it('2553 profile blocks repeated morphology and explanation formulas from r5 while keeping real lexemes', async () => {
        const pages = await loadBookPages('2553.json', [245, 265, 581, 1070, 1879, 1979, 2412, 2619, 3122]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('عظي');
        expect(entryLemmas).toContain('كلأ');
        expect(entryLemmas).not.toContain('واحدتها');
        expect(entryLemmas).not.toContain('وواحدتها');
        expect(entryLemmas).not.toContain('وتجمع');
        expect(entryLemmas).not.toContain('قولهم');
        expect(entryLemmas).not.toContain('والقياس');
        expect(entryLemmas).not.toContain('وجهين');
        expect(entryLemmas).not.toContain('وتفسيره');
        expect(entryLemmas).not.toContain('والمفعول');
        expect(entryLemmas).not.toContain('ومصدرها');
        expect(entryLemmas).not.toContain('والثاني');
        expect(entryLemmas).not.toContain('والآخر');
    });

    it('2553 profile blocks prepositional gloss labels, grammar formulas, and duplicate stubs from r6', async () => {
        const pages = await loadBookPages(
            '2553.json',
            [
                83, 86, 87, 95, 100, 760, 802, 988, 993, 1008, 1057, 1184, 1210, 1828, 1844, 1898, 1909, 1922, 1936,
                1994, 2042, 2261, 2368, 2636, 3051, 3194, 3212, 3213, 3214,
            ],
        );
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('هقع');
        expect(entryLemmas).not.toContain('أنْعَظَتْ');
        expect(entryLemmas).not.toContain('والغَين');
        expect(entryLemmas).not.toContain('ويُعَاُهِرها');
        expect(entryLemmas).not.toContain('والذَّكَرُ');
        expect(entryLemmas).not.toContain('وعَيْهَمَتُها');
        expect(entryLemmas).not.toContain('وبَعاعاً');
        expect(entryLemmas).not.toContain('وبالحصَىَ');
        expect(entryLemmas).not.toContain('وبالبصرة');
        expect(entryLemmas).not.toContain('وللمُجْتَنِب');
        expect(entryLemmas).not.toContain('وللنّاقة');
        expect(entryLemmas).not.toContain('وبالحِمْيَريّة');
        expect(entryLemmas).not.toContain('وبالمياط');
        expect(entryLemmas).not.toContain('وللرَّجُلَيْن');
        expect(entryLemmas).not.toContain('وللرِّجال');
        expect(entryLemmas).not.toContain('وللنِّساء');
        expect(entryLemmas).not.toContain('وبالبربرية');
        expect(entryLemmas).not.toContain('وللقطاة');
        expect(entryLemmas).not.toContain('وللجَوْنيّة');
        expect(entryLemmas).not.toContain('وبالبرنجِّ');
        expect(entryLemmas).not.toContain('وبالنبطية');
        expect(entryLemmas).not.toContain('وبالرديف');
        expect(entryLemmas).not.toContain('وأصله');
        expect(entryLemmas).not.toContain('الرجل، والشَّنَجُ');
        expect(entryLemmas).not.toContain('وبالثّمل');
        expect(entryLemmas).not.toContain('ونظيرهُ');
        expect(entryLemmas).not.toContain('ويس');
        expect(entryLemmas).not.toContain('والمستعمل');
        expect(entryLemmas).not.toContain('وبالشَّفْرة');
        expect(entryLemmas).not.toContain('ومستقبله');
        expect(entryLemmas).not.toContain('وأصلها');
        expect(entryLemmas).not.toContain('وتقديرها');
        expect(entryLemmas).not.toContain('وللاثنين');
        expect(entryLemmas).not.toContain('وللجماعة');
        expect(entryLemmas).not.toContain('وي');
        expect(entryLemmas).not.toContain('وا');
    });

    it('2553 profile blocks r7 page-wrap and formula lemmas without suppressing the surrounding entries', async () => {
        const pages = await loadBookPages('2553.json', [181, 264, 666, 1910, 2285, 2302, 3047, 3075, 3111]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('قولهم');
        expect(entryLemmas).not.toContain('مذاخرها');
        expect(entryLemmas).not.toContain('ولدها');
        expect(entryLemmas).not.toContain('هو');
        expect(entryLemmas).not.toContain('والفاعل');
        expect(entryLemmas).not.toContain('واشْتِقاقُهُ');
        expect(entryLemmas).not.toContain('مارنت، وممارنتها');
    });

    it('2553 profile blocks r8 grammatical label lemmas like والأنثى والمرأة والاثنان', async () => {
        const pages = await loadBookPages('2553.json', [310, 412, 558, 814, 1769, 1791, 2081]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('والأنثى');
        expect(entryLemmas).not.toContain('والمرأة');
        expect(entryLemmas).not.toContain('والجماعةُ');
        expect(entryLemmas).not.toContain('والرجال');
        expect(entryLemmas).not.toContain('والإبل');
        expect(entryLemmas).not.toContain('والاثنان');
        expect(entryLemmas).not.toContain('والجراد');
    });

    it('2553 profile blocks r9 prose-list and apparatus lemmas like والدروع ويصغر والمؤخر', async () => {
        const pages = await loadBookPages('2553.json', [1649, 1651, 1695, 1791, 2183, 2194]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('والدروع');
        expect(entryLemmas).not.toContain('ويصغر');
        expect(entryLemmas).not.toContain('والمؤخر');
        expect(entryLemmas).not.toContain('والفخذين');
        expect(entryLemmas).not.toContain('والعربُ');
    });

    it('2553 profile blocks r10 apparatus labels like متخذه وصاحبه والمخفف while keeping real headwords', async () => {
        const pages = await loadBookPages(
            '2553.json',
            [1823, 1885, 1903, 2194, 2273, 2281, 2307, 2445, 2598, 3060, 3100, 3169],
        );
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_2553,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('طشأ');
        expect(entryLemmas).toContain('نمل');
        expect(entryLemmas).not.toContain('وأسفله');
        expect(entryLemmas).not.toContain('ومتخذه');
        expect(entryLemmas).not.toContain('وصاحبه');
        expect(entryLemmas).not.toContain('ويمدُّ');
        expect(entryLemmas).not.toContain('واحدُه');
        expect(entryLemmas).not.toContain('ورأيه');
        expect(entryLemmas).not.toContain('وجماعته');
        expect(entryLemmas).not.toContain('ويدبِّره');
        expect(entryLemmas).not.toContain('وصاحِبُه');
        expect(entryLemmas).not.toContain('وفاعله');
        expect(entryLemmas).not.toContain('وصاحبها');
        expect(entryLemmas).not.toContain('والمُخَفَّف');
    });

    it('7030 profile keeps heading entries and blocks intro-like prose lemmas on page 125', async () => {
        const pages = await loadBookPages('7030.json', [125, 126]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('أبأ');
        expect(entryLemmas).not.toContain('واصطلاحا');
        expect(entryLemmas).not.toContain('وتفسيرها');
    });

    it('7030 profile blocks scholar and grammatical-note false positives', async () => {
        const pages = await loadBookPages('7030.json', [14158, 15926, 15927]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('والمَهارِقُ');
        expect(entryLemmas).not.toContain('بِالْكَسْرِ');
        expect(entryLemmas).not.toContain('ساعدَةَ');
        expect(entryLemmas).not.toContain('والصاغاني');
    });

    it('7030 profile blocks structural-heading leaks and formula labels while keeping real headings', async () => {
        const pages = await loadBookPages('7030.json', [137, 2222, 4568, 6916, 7174]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('والفصيح');
        expect(entryLemmas).not.toContain('(الْمُعْجَمَة فِي الْمُثَنَّاة الْفَوْقِيَّة)');
        expect(entryLemmas).not.toContain('(مَعَ الدَّال الْمُهْملَة)');
        expect(entryLemmas).not.toContain('٣ - (ف ط ر)');
        expect(entryLemmas).not.toContain('٣ - (فصل اللَّام مَعَ الرَّاء)');
    });

    it('7030 profile blocks remaining discourse-formula rows that are not real headwords', async () => {
        const pages = await loadBookPages('7030.json', [140, 8983]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('وعائِدتُه');
        expect(entryLemmas).not.toContain('وقالاَ');
    });

    it('7030 profile blocks source labels, structural leaks, and grammar apparatus from r5', async () => {
        const pages = await loadBookPages(
            '7030.json',
            [1572, 1742, 2142, 2643, 3262, 4025, 4079, 4680, 6733, 10950, 1389, 1531, 19059],
        );
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('فبب');
        expect(entryLemmas).not.toContain('والتَّكْمِلَة');
        expect(entryLemmas).not.toContain('والمُحْكَمِ');
        expect(entryLemmas).not.toContain(': وممّا يُستدرك عَلَيْهِ:');
        expect(entryLemmas).not.toContain('وتذنيب');
        expect(entryLemmas).not.toContain('وبالكسر');
        expect(entryLemmas).not.toContain('والآخرَ');
        expect(entryLemmas).not.toContain('واحدته');
        expect(entryLemmas).not.toContain('وبالفتح');
        expect(entryLemmas).not.toContain('شيخُنا');
        expect(entryLemmas).not.toContain('والمُحيط');
        expect(entryLemmas).not.toContain('والمَعْنَى');
        expect(entryLemmas).not.toContain('والثَّانِي');
        expect(entryLemmas).not.toContain('والثَّالِثُ');
        expect(entryLemmas).not.toContain('ويقُولانَ');
    });

    it('7030 profile blocks additional source-label and enumerative apparatus from the regenerated csv scan', async () => {
        const pages = await loadBookPages('7030.json', [7562, 11207, 12252, 12622, 13345, 19818, 21521]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('وبالتصغير');
        expect(entryLemmas).not.toContain('الأساس');
        expect(entryLemmas).not.toContain('والروايةُ');
        expect(entryLemmas).not.toContain('والقياسُ');
        expect(entryLemmas).not.toContain('والثَّانِيَةُ');
        expect(entryLemmas).not.toContain('والثالثةُ');
        expect(entryLemmas).not.toContain('والخامِسَةُ');
        expect(entryLemmas).not.toContain('والسَّادِسَةُ');
        expect(entryLemmas).not.toContain('الثالثُ');
        expect(entryLemmas).not.toContain('الأولى');
        expect(entryLemmas).not.toContain('فيقولُ');
    });

    it('7030 profile blocks concatenated apparatus leaks and malformed discourse lemmas from r6', async () => {
        const pages = await loadBookPages(
            '7030.json',
            [
                746, 836, 861, 1245, 1689, 1715, 1719, 2427, 2837, 3114, 3668, 4328, 4804, 5814, 8432, 9720, 12100,
                17837, 18737, 18963, 19069, 19139, 19802, 19864, 20703, 20829, 21259, 21327,
            ],
        );
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('ووقال');
        expect(entryLemmas).not.toContain('ونَظِيرُه');
        expect(entryLemmas).not.toContain('وأَصْلُهَا');
        expect(entryLemmas).not.toContain('ونَحْوَه');
        expect(entryLemmas).not.toContain('وأَوّلُهُ');
        expect(entryLemmas).not.toContain('وأَوَّلُهُ');
        expect(entryLemmas).not.toContain('وأَوّلُه');
        expect(entryLemmas).not.toContain('نِ');
        expect(entryLemmas).not.toContain('وبالمهملة');
        expect(entryLemmas).not.toContain('وكسْرها');
        expect(entryLemmas).not.toContain('ونَحْو');
        expect(entryLemmas).not.toContain('ونَحْوِه');
        expect(entryLemmas).not.toContain('ووقيل');
        expect(entryLemmas).not.toContain('ويذكُره');
        expect(entryLemmas).not.toContain('وغَبَشُه');
        expect(entryLemmas).not.toContain('وإغْماءْوقيلَ');
        expect(entryLemmas).not.toContain('وأهْضامِوقيلَ');
        expect(entryLemmas).not.toContain('وي');
        expect(entryLemmas).not.toContain('وتَقَزَّعَ السَّحَابُ، وتَقَشَّعَ، بمَعْنىً.');
        expect(entryLemmas).not.toContain('والسُّوبانِوقيلَ');
        expect(entryLemmas).not.toContain('وقَرَنْوقيلَ');
        expect(entryLemmas).not.toContain('ومحضروقيل');
        expect(entryLemmas).not.toContain('وارِمهْوقال');
        expect(entryLemmas).not.toContain('والعاصِرِوقيلَ');
        expect(entryLemmas).not.toContain('وأَمامَهايَعْني');
        expect(entryLemmas).not.toContain('والتَّقْلِيبُوقيلَ');
    });

    it('7030 profile blocks r7 apparatus formulas, source labels, and attribution carry-over', async () => {
        const pages = await loadBookPages(
            '7030.json',
            [1531, 1645, 5883, 7764, 8391, 8901, 10103, 11970, 13847, 18151],
        );
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('اللِّسَان');
        expect(entryLemmas).not.toContain('وأَيْضاً');
        expect(entryLemmas).not.toContain('ج');
        expect(entryLemmas).not.toContain('وفقال');
        expect(entryLemmas).not.toContain('يُونُس');
        expect(entryLemmas).not.toContain('والعُبَاب');
        expect(entryLemmas).not.toContain('النِّهاية');
        expect(entryLemmas).not.toContain('المِصْبَاحِ');
        expect(entryLemmas).not.toContain('الراجز');
        expect(entryLemmas).not.toContain('ولَدِها');
    });

    it('7030 profile blocks r8 formula heads and pattern-example cues like وكذا and وكمنبر', async () => {
        const pages = await loadBookPages('7030.json', [1619, 1766, 1800, 1906, 1949, 10263, 10760, 13373]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('وكَذَا');
        expect(entryLemmas).not.toContain('وكذالك');
        expect(entryLemmas).not.toContain('والتّقدير');
        expect(entryLemmas).not.toContain('وغيرِهما');
        expect(entryLemmas).not.toContain('ص وط');
        expect(entryLemmas).not.toContain('ض أَط');
        expect(entryLemmas).not.toContain('وعِبَارَتُه');
        expect(entryLemmas).not.toContain('وبضَمَّتيْنِ');
        expect(entryLemmas).not.toContain('وكَمِنْبَرٍ');
        expect(entryLemmas).not.toContain('والجَرادِ');
    });

    it('7030 profile blocks r9 metalinguistic and citation labels like وبالتحريك ووكقوله وفتقول', async () => {
        const pages = await loadBookPages('7030.json', [17231, 17900, 18623, 18888, 20274]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7030,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('وبالتَّحْرِيكِ');
        expect(entryLemmas).not.toContain('فتقولُ');
        expect(entryLemmas).not.toContain('وكقوْلِهِ');
        expect(entryLemmas).not.toContain('وأَجَلَّهايقولُ');
        expect(entryLemmas).not.toContain('ومُلَهْوَجَاقالَ');
    });

    it('7031 profile blocks scholar-name and connective-formula lemmas', async () => {
        const pages = await loadBookPages('7031.json', [62, 63, 2911, 2912]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('والزَّعزاعة');
        expect(entryLemmas).toContain('نشج');
        expect(entryLemmas).not.toContain('والأصمعيّ');
        expect(entryLemmas).not.toContain('الأصمعيّ');
        expect(entryLemmas).not.toContain('وَمِنْهَا');
    });

    it('7031 profile blocks marker-leak and scholar/apparatus lemmas in grouped pages', async () => {
        const pages = await loadBookPages('7031.json', [619, 979, 1354]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);
        const markerHeads = segments
            .filter((segment) => segment.meta?.kind === 'marker')
            .map((segment) => segment.content.split('\n', 1)[0]);

        expect(entryLemmas).toContain('عيس');
        expect(entryLemmas).toContain('هثّ');
        expect(entryLemmas).not.toContain('بالنُّون');
        expect(entryLemmas).not.toContain('واليزيدي');
        expect(entryLemmas).not.toContain('وجهيه');
        expect(markerHeads).toContain('(هـ ث)');
    });

    it('7031 profile blocks morphology labels and commentary formulas while keeping nearby real entries', async () => {
        const pages = await loadBookPages('7031.json', [1546, 1639, 1813, 2056, 2330, 3055, 3117]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('وللاثنين');
        expect(entryLemmas).not.toContain('وللجميع');
        expect(entryLemmas).not.toContain('وَمعنى');
        expect(entryLemmas).not.toContain('وشمّر');
        expect(entryLemmas).not.toContain('وَالْمعْنَى');
        expect(entryLemmas).not.toContain('واحدتها');
        expect(entryLemmas).not.toContain('وتفسيرُه');
        expect(entryLemmas).not.toContain('وقرئت');
        expect(entryLemmas).not.toContain('والأمَوِيّ');
        expect(entryLemmas).toContain('تغالت');
    });

    it('7031 profile blocks comparative, taxonomic, and verse-carryover apparatus rows', async () => {
        const pages = await loadBookPages('7031.json', [2731, 2936, 2980, 4270, 4459]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).not.toContain('وأجوَدُهما');
        expect(entryLemmas).not.toContain('وأقدِمْ');
        expect(entryLemmas).not.toContain('وَالْإِبِل');
        expect(entryLemmas).not.toContain('وَالْحَيَوَان');
        expect(entryLemmas).not.toContain('والشَّاءُ');
        expect(entryLemmas).not.toContain('وبُرُوكَها');
        expect(entryLemmas).not.toContain('وفَسره');
    });

    it('7031 profile blocks apparatus false positives on page 1885', async () => {
        const pages = await loadBookPages('7031.json', [1885]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);
        const markerPreviews = segments
            .filter((segment) => segment.meta?.kind === 'marker')
            .map((segment) => segment.content.split('\n', 1)[0]);

        expect(entryLemmas).toContain('خطا');
        expect(entryLemmas).not.toContain('أي');
        expect(entryLemmas).not.toContain('يُقَال');
        expect(entryLemmas).not.toContain('والجميعُ');
        expect(entryLemmas).not.toContain('وعزّ');
        expect(markerPreviews.some((preview) => preview.includes('خطا، خطىء'))).toBeTrue();
    });

    it('7031 profile blocks enumerative labels, apparatus formulas, and authority carry-over from r5', async () => {
        const pages = await loadBookPages('7031.json', [180, 1464, 1832, 2828, 2873, 4022, 4603, 4643, 4668]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('وعَقيبك');
        expect(entryLemmas).not.toContain('وأوله');
        expect(entryLemmas).not.toContain('قَالَه');
        expect(entryLemmas).not.toContain('مَعْنَاهُمَا');
        expect(entryLemmas).not.toContain('والثَّانيَةُ');
        expect(entryLemmas).not.toContain('والثالثُ');
        expect(entryLemmas).not.toContain('والأوَّلُ');
        expect(entryLemmas).not.toContain('الحَضْرمي');
        expect(entryLemmas).not.toContain('والخليل');
        expect(entryLemmas).not.toContain('وَالْأُخْرَى');
        expect(entryLemmas).not.toContain('يُريدون');
        expect(entryLemmas).not.toContain('مَعْنَاهَا');
    });

    it('7031 profile blocks remaining apparatus formulas and parenthesized structural leaks from the regenerated csv scan', async () => {
        const pages = await loadBookPages('7031.json', [308, 1126, 1642, 2374, 2578, 2642, 2827, 3946, 4091, 4451]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('والكشفُ');
        expect(entryLemmas).not.toContain('(أَبَوا الْعين وَالصَّاد)');
        expect(entryLemmas).not.toContain('تفسيرين');
        expect(entryLemmas).not.toContain('(بَاء الْهَاء وَالْخَاء)');
        expect(entryLemmas).not.toContain('وجهينِ');
        expect(entryLemmas).not.toContain('ومصدرهُ');
        expect(entryLemmas).not.toContain('والقياسُ');
        expect(entryLemmas).not.toContain('(من الثلاثي الصَّحِيح)');
        expect(entryLemmas).not.toContain('وتصغيره');
    });

    it('7031 profile blocks marker headings, quote carry-over, and apparatus formulas from r6', async () => {
        const pages = await loadBookPages(
            '7031.json',
            [
                1466, 1684, 1716, 1747, 1771, 1781, 1806, 1812, 1819, 1870, 1871, 1927, 1958, 2295, 2519, 2831, 2850,
                2920, 3264, 3315, 3728, 4294, 4355, 4496, 4523, 4639, 4665, 4671,
            ],
        );
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);
        const markerHeads = segments
            .filter((segment) => segment.meta?.kind === 'marker')
            .map((segment) => segment.content.split('\n', 1)[0]);

        expect(entryLemmas).not.toContain('نَ');
        expect(entryLemmas).not.toContain('بِسمِ اللَّهِ الرَّحْمَنِ الرَّحِيَمِ');
        expect(entryLemmas).not.toContain('توكلت على الله');
        expect(entryLemmas).not.toContain('وَاسْتَسْلَمُوا بَعْدَ الْخَطِيرِ فَأُخْمِدُوا)');
        expect(entryLemmas).not.toContain('وأبوها');
        expect(entryLemmas).not.toContain('وأَصْلُه');
        expect(entryLemmas).not.toContain('وأَصْلُها');
        expect(entryLemmas).not.toContain('وَالثَّانِي');
        expect(entryLemmas).not.toContain('كَقَوْلِك');
        expect(entryLemmas).not.toContain('فَقُلْتُمْ');
        expect(entryLemmas).not.toContain('فَأَما');
        expect(entryLemmas).not.toContain('واحدهما');
        expect(entryLemmas).not.toContain('أَرَادَت');
        expect(entryLemmas).not.toContain('ونظيرها');
        expect(entryLemmas).not.toContain('مهمل');
        expect(entryLemmas).not.toContain('وأوقاله');
        expect(entryLemmas).not.toContain('وأوقالُه');
        expect(entryLemmas).not.toContain('ومُستقبله');
        expect(entryLemmas).not.toContain('وَيس');
        expect(entryLemmas).not.toContain('وي');
        expect(entryLemmas).not.toContain('وَا');
        expect(entryLemmas).not.toContain('خصف، فصخ: مسْتَعْملان.');
        expect(entryLemmas).not.toContain('خفد، خدف: مُسْتعملان.');
        expect(entryLemmas).not.toContain('خَ ف ب: مُهْمَلٌ.');
        expect(entryLemmas).not.toContain('آخر كتاب الْخَاء');
        expect(markerHeads).toContain('خَ ش ط مهمل.');
        expect(markerHeads).toContain('خَ ق (وَا يء)');
        expect(markerHeads).toContain('ض ز ل: مهمل');
    });

    it('7031 profile blocks r7 explanatory formulas and structural باب rows', async () => {
        const pages = await loadBookPages('7031.json', [98, 1633, 1865, 1896, 1976, 3684, 4249, 4431, 4563, 4687]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas).toContain('عله');
        expect(entryLemmas).not.toContain('ولدَها');
        expect(entryLemmas).not.toContain('فَيَقُول');
        expect(entryLemmas).not.toContain('وَذَلِكَ');
        expect(entryLemmas).not.toContain('وتأويلُه');
        expect(entryLemmas).not.toContain('وتأويله');
        expect(entryLemmas).not.toContain('فَالْمَعْنى');
        expect(entryLemmas).not.toContain('وتأويلها');
        expect(entryLemmas).not.toContain('بَاب');
    });

    it('7031 profile blocks r8 metalinguistic labels like وقولك وللناقة وتثنيته', async () => {
        const pages = await loadBookPages('7031.json', [980, 2089, 2942, 4337, 4515, 4604, 4605]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('وقولك');
        expect(entryLemmas).not.toContain('والجاريةُ');
        expect(entryLemmas).not.toContain('وللناقة');
        expect(entryLemmas).not.toContain('وتَثْنِيتها');
        expect(entryLemmas).not.toContain('وتَثْنِيتهما');
        expect(entryLemmas).not.toContain('وتَثنيته');
        expect(entryLemmas).not.toContain('وأجودها');
    });

    it('7031 profile blocks r9 citation and apparatus labels like وكقوله وقولها والهمز', async () => {
        const pages = await loadBookPages('7031.json', [833, 2893, 4232]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const entryLemmas = segments
            .filter((segment) => segment.meta?.kind === 'entry')
            .map((segment) => segment.meta?.lemma);

        expect(entryLemmas.length).toBeGreaterThan(0);
        expect(entryLemmas).not.toContain('وَكَقَوْلِه');
        expect(entryLemmas).not.toContain('وقولُها');
        expect(entryLemmas).not.toContain('والهمز');
    });

    it('1687 late-heading zone emits chapter and entry shapes around page 4673', async () => {
        const pages = await loadBookPages('1687.json', [4673, 4674]);
        const segments = segmentPages(pages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_1687,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });

        const summary = segments.slice(0, 6).map((segment) => ({
            head: segment.content.split('\n', 1)[0],
            kind: segment.meta?.kind,
            lemma: segment.meta?.lemma,
        }));

        expect(summary[0]).toEqual({ head: 'حرف القاف', kind: 'chapter', lemma: undefined });
        expect(summary[1]?.kind).toBe('entry');
        expect(summary[1]?.lemma).toBe('ق');
        expect(summary[1]?.head.startsWith('ق:')).toBeTrue();
        expect(summary[2]).toEqual({ head: 'فصل الألف', kind: 'chapter', lemma: undefined });
        expect(summary[3]?.kind).toBe('entry');
        expect(summary[3]?.lemma).toBe('أبق');
        expect(summary[3]?.head.startsWith('أبق:')).toBeTrue();
        expect(summary[4]).toEqual({
            head: 'والأَبَقُ: الكتَّان؛ عَنْ ثَعْلَبٍ. وأَبَّاق: رَجُلٌ مِنْ رُجَّازهم، وَهُوَ يُكَنَّى أَبا قَرِيبَةَ.',
            kind: 'entry',
            lemma: 'والأَبَقُ',
        });
        expect(summary[5]?.kind).toBe('entry');
        expect(summary[5]?.lemma).toBe('أرق');
        expect(summary[5]?.head.startsWith('أرق:')).toBeTrue();
    });

    it('7031 grouped and appendix zones emit the expected structural shapes', async () => {
        const groupedPages = await loadBookPages('7031.json', [1664]);
        const groupedSegments = segmentPages(groupedPages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });
        const groupedSummary = groupedSegments.slice(0, 4).map((segment) => ({
            head: segment.content.split('\n', 1)[0],
            kind: segment.meta?.kind,
            lemma: segment.meta?.lemma,
        }));

        expect(groupedSummary).toEqual([
            { head: '(خَ غ)', kind: 'marker', lemma: undefined },
            { head: '(بَاب الْخَاء وَالْقَاف)', kind: 'chapter', lemma: undefined },
            { head: '(خَ ق)', kind: 'marker', lemma: 'خَ ق' },
            { head: 'والخدّ: الشَّقُّ فِي الأَرْض.', kind: 'entry', lemma: 'والخدّ' },
        ]);

        const appendixPages = await loadBookPages('7031.json', [4662, 4663]);
        const appendixSegments = segmentPages(appendixPages, {
            breakpoints: ['{{tarqim}}'],
            dictionary: PROFILE_7031,
            maxPages: 1,
            preprocess: ['removeZeroWidth'],
        });
        const appendixEntries = appendixSegments
            .filter((segment) => segment.meta?.kind === 'entry')
            .slice(0, 2)
            .map((segment) => segment.meta?.lemma);

        expect(appendixEntries).toEqual(['الْوَاو', 'أَوَى']);
    });
});
