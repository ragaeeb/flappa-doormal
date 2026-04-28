import { describe, expect, it } from 'bun:test';
import type { Page } from '@/types/index.js';
import { createArabicDictionaryEntryRule } from './arabic-dictionary-rule.js';
import { segmentPages } from './segmenter.js';

const getRegex = (rule: ReturnType<typeof createArabicDictionaryEntryRule>) => {
    if (!('regex' in rule)) {
        throw new Error('Expected dictionary rule to expose a regex pattern');
    }
    return rule.regex;
};

describe('arabic-dictionary-rule', () => {
    describe('createArabicDictionaryEntryRule', () => {
        it('should build a split rule with the expected defaults', () => {
            const rule = createArabicDictionaryEntryRule({
                stopWords: ['وقيل', 'ويقال', 'قال'],
            });

            expect(rule).toMatchObject({
                pageStartPrevWordStoplist: undefined,
                split: 'at',
            });
            expect('regex' in rule && rule.regex).toContain('(?<lemma>');
            expect('regex' in rule && rule.regex).toContain('(?:(?<=^)|(?<=\\n))');
        });

        it('should include custom metadata, capture names, and page-start stoplists', () => {
            const rule = createArabicDictionaryEntryRule({
                captureName: 'headword',
                meta: { type: 'entry' },
                pageStartPrevWordStoplist: ['قال', 'وقيل'],
                samePagePrevWordStoplist: ['جل'],
                stopWords: ['وقيل', 'ويقال'],
            });

            expect(rule).toMatchObject({
                meta: { type: 'entry' },
                pageStartPrevWordStoplist: ['قال', 'وقيل'],
                samePagePrevWordStoplist: ['جل'],
                split: 'at',
            });
            expect('regex' in rule && rule.regex).toContain('(?<headword>');
        });

        it('should respect minLetters and maxLetters in the generated lemma stem', () => {
            const rule = createArabicDictionaryEntryRule({
                maxLetters: 5,
                minLetters: 3,
                stopWords: ['وقيل'],
            });

            expect('regex' in rule && rule.regex).toContain('{2,4}');
        });

        it('should deduplicate stopwords that differ only by diacritics or equivalent letters', () => {
            const canonical = createArabicDictionaryEntryRule({
                stopWords: ['أي', 'أراد', 'العجاج'],
            });
            const duplicated = createArabicDictionaryEntryRule({
                stopWords: ['أي', 'أيْ', 'أراد', 'أَرَادَ', 'العجاج', 'العجّاج'],
            });

            expect('regex' in canonical && canonical.regex).toBe('regex' in duplicated && duplicated.regex);
        });

        it('should block stopwords across vocalized variants, not just the exact first-seen spelling', () => {
            const rule = createArabicDictionaryEntryRule({
                stopWords: ['الليثُ'],
            });
            const regex = new RegExp(getRegex(rule), 'u');

            expect(regex.test('الليثُ:')).toBeFalse();
            expect(regex.test('اللَّيْث:')).toBeFalse();
            expect(regex.test('العَزُوزُ:')).toBeTrue();
        });

        it('should block stopwords with optional leading waw but not require re-listing the prefixed form', () => {
            const rule = createArabicDictionaryEntryRule({
                stopWords: ['قال', 'العجاج'],
            });
            const regex = new RegExp(getRegex(rule), 'u');

            expect(regex.test('وقال:')).toBeFalse();
            expect(regex.test('والعجاج:')).toBeFalse();
            expect(regex.test('وعز:')).toBeTrue();
        });

        it('should support balanced parenthesized headwords with optional whitespace before the colon when enabled', () => {
            const rule = createArabicDictionaryEntryRule({
                allowParenthesized: true,
                allowWhitespaceBeforeColon: true,
                stopWords: [],
            });
            const regex = new RegExp(getRegex(rule), 'u');
            const match = regex.exec('(عنبر) :');

            expect(match?.groups?.lemma).toBe('عنبر');
        });

        it('should allow whitespace inside balanced parentheses when parenthesized markers are enabled', () => {
            const rule = createArabicDictionaryEntryRule({
                allowParenthesized: true,
                allowWhitespaceBeforeColon: true,
                stopWords: [],
            });
            const regex = new RegExp(getRegex(rule), 'u');

            expect(regex.exec('( عنبر ) :')?.groups?.lemma).toBe('عنبر');
        });

        it('should support comma-separated headword lists when enabled', () => {
            const rule = createArabicDictionaryEntryRule({
                allowCommaSeparated: true,
                stopWords: [],
            });
            const regex = new RegExp(getRegex(rule), 'u');

            expect(regex.exec('سبد، دبس:')?.groups?.lemma).toBe('سبد، دبس');
            expect(regex.exec('خزّ، زخّ:')?.groups?.lemma).toBe('خزّ، زخّ');
        });

        it('should allow optional whitespace around commas in comma-separated headword lists', () => {
            const rule = createArabicDictionaryEntryRule({
                allowCommaSeparated: true,
                stopWords: [],
            });
            const regex = new RegExp(getRegex(rule), 'u');

            expect(regex.exec('سبد ، دبس:')?.groups?.lemma).toBe('سبد ، دبس');
        });

        it('should block any comma-separated unit that is stoplisted', () => {
            const rule = createArabicDictionaryEntryRule({
                allowCommaSeparated: true,
                stopWords: ['قال'],
            });
            const regex = new RegExp(getRegex(rule), 'u');

            expect(regex.test('سبد، قال:')).toBeFalse();
            expect(regex.test('قال، سبد:')).toBeFalse();
            expect(regex.test('سبد، دبس:')).toBeTrue();
        });

        it('should not treat bare space-separated headword pairs as entry markers', () => {
            const rule = createArabicDictionaryEntryRule({
                allowCommaSeparated: true,
                stopWords: [],
            });
            const regex = new RegExp(getRegex(rule), 'u');

            expect(regex.exec('غر رغ: (مستعمان) .')).toBeNull();
        });

        it('should omit the negative lookahead when no stopwords are provided', () => {
            const rule = createArabicDictionaryEntryRule({
                stopWords: [],
            });

            expect('regex' in rule && rule.regex).not.toContain('(?!');
        });

        it('should reject invalid minLetters values', () => {
            expect(() =>
                createArabicDictionaryEntryRule({
                    minLetters: 0,
                    stopWords: ['وقيل'],
                }),
            ).toThrow(/minLetters must be an integer >= 1/);
        });

        it('should reject invalid maxLetters values', () => {
            expect(() =>
                createArabicDictionaryEntryRule({
                    maxLetters: 1,
                    minLetters: 2,
                    stopWords: ['وقيل'],
                }),
            ).toThrow(/maxLetters must be an integer >= minLetters/);
        });

        it('should reject invalid capture names', () => {
            expect(() =>
                createArabicDictionaryEntryRule({
                    captureName: 'not-valid',
                    stopWords: ['وقيل'],
                }),
            ).toThrow(/invalid captureName/);
        });

        it('should keep markers in content and capture lemma metadata when used with segmentPages', () => {
            const pages: Page[] = [
                {
                    content: 'عز: أصل الباب. وقيل: لا تُفصل. والعَزُوزُ: صفة معروفة.',
                    id: 1,
                },
            ];

            const rule = createArabicDictionaryEntryRule({
                pageStartPrevWordStoplist: ['قال', 'وقيل', 'ويقال'],
                stopWords: ['وقيل', 'ويقال', 'قال', 'العجاج', 'أخاك'],
            });

            const segments = segmentPages(pages, { rules: [rule] });

            expect(segments).toHaveLength(2);
            expect(segments[0].content).toStartWith('عز:');
            expect(segments[0].meta?.lemma).toBe('عز');
            expect(segments[1].content).toStartWith('والعَزُوزُ:');
            expect(segments[1].meta?.lemma).toBe('والعَزُوزُ');
        });

        it('should block vocalized stopword variants without listing each variant explicitly when used with segmentPages', () => {
            const pages: Page[] = [
                {
                    content: 'عز: أصل الباب. ويقالُ: لا تُفصل. قال العجّاجُ: شاهد. والعَزُوزُ: صفة معروفة.',
                    id: 1,
                },
            ];

            const rule = createArabicDictionaryEntryRule({
                stopWords: ['ويقال', 'العجاج'],
            });

            const segments = segmentPages(pages, { rules: [rule] });

            expect(segments.map((segment) => segment.content.split(/\s+/u, 1)[0])).toEqual(['عز:', 'والعَزُوزُ:']);
        });

        it('should segment parenthesized headwords with optional whitespace before the colon when enabled', () => {
            const pages: Page[] = [
                {
                    content:
                        '(بَاب الْعين وَالرَّاء وَمَا بعْدهَا من الْحُرُوف\n(عنبر) : قَالَ اللَّيْث: العَنْبَر من الطّيب، وَبِه سمّي الرجل.\nعَمْرو عَن أَبِيه: العنبر التُرْس.',
                    id: 1,
                },
            ];

            const segments = segmentPages(pages, {
                rules: [
                    createArabicDictionaryEntryRule({
                        allowParenthesized: true,
                        allowWhitespaceBeforeColon: true,
                        stopWords: ['الليث', 'قال'],
                    }),
                ],
            });
            const entrySegments = segments.filter((segment) => segment.meta?.lemma);

            expect(entrySegments).toHaveLength(1);
            expect(entrySegments[0].content).toStartWith('عنبر');
            expect(entrySegments[0].meta?.lemma).toBe('عنبر');
        });

        it('should segment comma-separated headword lists when enabled', () => {
            const pages: Page[] = [{ content: 'سبد، دبس: (مستعملان) .\nخزّ، زخّ: مستعملان.', id: 1 }];

            const segments = segmentPages(pages, {
                rules: [
                    createArabicDictionaryEntryRule({
                        allowCommaSeparated: true,
                        stopWords: [],
                    }),
                ],
            });

            expect(segments.map((segment) => segment.meta?.lemma)).toEqual(['سبد، دبس', 'خزّ، زخّ']);
            expect(segments.map((segment) => segment.content.split(/\s+/u, 1)[0])).toEqual(['سبد،', 'خزّ،']);
        });

        it('should segment mid-line entries with diacritized waw/al prefixes', () => {
            const pages: Page[] = [{ content: 'تمهيد وَالعَزُوزُ: تعريفٌ واضح.', id: 1 }];

            const segments = segmentPages(pages, {
                rules: [createArabicDictionaryEntryRule({ stopWords: ['قال'] })],
            });
            const entrySegments = segments.filter((segment) => segment.meta?.lemma);

            expect(entrySegments).toHaveLength(1);
            expect(entrySegments[0].meta?.lemma).toBe('وَالعَزُوزُ');
            expect(entrySegments[0].content).toStartWith('وَالعَزُوزُ:');
        });

        it('should segment parenthesized mid-line entries when enabled', () => {
            const pages: Page[] = [{ content: 'تمهيد (والعَزُوزُ) : تعريفٌ واضح.', id: 1 }];

            const segments = segmentPages(pages, {
                rules: [
                    createArabicDictionaryEntryRule({
                        allowParenthesized: true,
                        allowWhitespaceBeforeColon: true,
                        stopWords: [],
                    }),
                ],
            });
            const entrySegments = segments.filter((segment) => segment.meta?.lemma);

            expect(entrySegments).toHaveLength(1);
            expect(entrySegments[0].meta?.lemma).toBe('والعَزُوزُ');
            expect(entrySegments[0].content).toStartWith('والعَزُوزُ');
        });

        it('should tolerate tatweel in lemmas and stopwords', () => {
            const rule = createArabicDictionaryEntryRule({
                stopWords: ['قال'],
            });
            const regex = new RegExp(getRegex(rule), 'u');

            expect(regex.exec('عـز:')?.groups?.lemma).toBe('عـز');
            expect(regex.test('قـال:')).toBeFalse();
        });

        it('should tolerate zero-width characters at line starts like built-in line-start rules do', () => {
            const pages: Page[] = [{ content: 'تمهيد\n\u200fعز: تعريف.', id: 1 }];

            const segments = segmentPages(pages, {
                rules: [createArabicDictionaryEntryRule({ stopWords: [] })],
            });
            const entrySegments = segments.filter((segment) => segment.meta?.lemma);

            expect(entrySegments).toHaveLength(1);
            expect(entrySegments[0].meta?.lemma).toBe('عز');
        });
    });
});
