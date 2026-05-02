import { describe, expect, it } from 'bun:test';
import type { ArabicDictionaryProfile } from '@/types/dictionary.js';
import { DictionaryProfileValidationError, normalizeDictionaryProfile, validateDictionaryProfile } from './profile.js';
import { PROFILE_1687, PROFILE_2553, PROFILE_7030, PROFILE_7031 } from './profiles.js';

describe('dictionary profile normalization', () => {
    const minimalProfile = (): ArabicDictionaryProfile => ({
        version: 2,
        zones: [
            {
                families: [{ classes: ['chapter'], emit: 'chapter', use: 'heading' }],
                name: 'main',
            },
        ],
    });

    it('applies defaults for the draft dictionary families', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    blockers: [{ use: 'authorityIntro' }, { chars: ['،'], use: 'previousChar' }],
                    families: [
                        { classes: ['chapter', 'entry'], emit: 'chapter', use: 'heading' },
                        { emit: 'entry', use: 'lineEntry' },
                        { emit: 'entry', use: 'inlineSubentry' },
                        { emit: 'marker', use: 'codeLine' },
                        { emit: 'marker', use: 'pairedForms' },
                    ],
                    name: 'main',
                },
            ],
        };

        const normalized = normalizeDictionaryProfile(profile);
        const families = normalized.zones[0]?.families ?? [];
        const blockers = normalized.zones[0]?.blockers ?? [];
        const heading = families.find((family) => family.use === 'heading');
        const lineEntry = families.find((family) => family.use === 'lineEntry');
        const inlineSubentry = families.find((family) => family.use === 'inlineSubentry');
        const codeLine = families.find((family) => family.use === 'codeLine');
        const pairedForms = families.find((family) => family.use === 'pairedForms');
        const authorityIntro = blockers.find((blocker) => blocker.use === 'authorityIntro');

        expect(heading).toMatchObject({ allowNextLineColon: false, allowSingleLetter: false });
        expect(lineEntry).toMatchObject({
            allowMultiWord: false,
            allowWhitespaceBeforeColon: false,
            wrappers: 'none',
        });
        expect(inlineSubentry).toMatchObject({
            prefixes: ['و'],
            stripPrefixesFromLemma: true,
        });
        expect(codeLine).toMatchObject({ wrappers: 'either' });
        expect(pairedForms).toMatchObject({ requireStatusTail: false, separator: 'comma' });
        expect(authorityIntro).toMatchObject({ precision: 'high' });
    });

    it('preserves explicit values', () => {
        const normalized = normalizeDictionaryProfile({
            version: 2,
            zones: [
                {
                    blockers: [{ precision: 'aggressive', use: 'authorityIntro' }],
                    families: [
                        {
                            allowNextLineColon: true,
                            allowSingleLetter: true,
                            classes: ['entry'],
                            emit: 'entry',
                            use: 'heading',
                        },
                        {
                            allowMultiWord: true,
                            allowWhitespaceBeforeColon: true,
                            emit: 'entry',
                            use: 'lineEntry',
                            wrappers: 'any',
                        },
                        {
                            emit: 'entry',
                            prefixes: ['و', 'ف'],
                            stripPrefixesFromLemma: false,
                            use: 'inlineSubentry',
                        },
                        {
                            emit: 'marker',
                            use: 'codeLine',
                            wrappers: 'paired',
                        },
                        {
                            emit: 'entry',
                            requireStatusTail: true,
                            separator: 'space',
                            use: 'pairedForms',
                        },
                    ],
                    name: 'late-zone',
                    when: {
                        activateAfter: [{ match: 'باب', use: 'headingText' }],
                        maxPageId: 100,
                        minPageId: 50,
                    },
                },
            ],
        });

        expect(normalized.zones[0]).toMatchObject({
            blockers: [{ precision: 'aggressive', use: 'authorityIntro' }],
            when: {
                activateAfter: [{ match: 'باب', use: 'headingText' }],
                maxPageId: 100,
                minPageId: 50,
            },
        });
        expect(normalized.zones[0]?.families.find((family) => family.use === 'heading')).toMatchObject({
            allowNextLineColon: true,
            allowSingleLetter: true,
        });
        expect(normalized.zones[0]?.families.find((family) => family.use === 'lineEntry')).toMatchObject({
            allowMultiWord: true,
            allowWhitespaceBeforeColon: true,
            wrappers: 'any',
        });
        expect(normalized.zones[0]?.families.find((family) => family.use === 'inlineSubentry')).toMatchObject({
            prefixes: ['و', 'ف'],
            stripPrefixesFromLemma: false,
        });
        expect(normalized.zones[0]?.families.find((family) => family.use === 'codeLine')).toMatchObject({
            wrappers: 'paired',
        });
        expect(normalized.zones[0]?.families.find((family) => family.use === 'pairedForms')).toMatchObject({
            requireStatusTail: true,
            separator: 'space',
        });
    });

    it('rejects an empty zone list', () => {
        expect(() => normalizeDictionaryProfile({ version: 2, zones: [] })).toThrow(
            'dictionary profile must contain at least one zone',
        );
    });

    it('rejects unsupported versions', () => {
        expect(() => normalizeDictionaryProfile({ version: 3 as 2, zones: minimalProfile().zones })).toThrow(
            'dictionary profile version must be 2, got 3',
        );
    });

    it('rejects duplicate zone names', () => {
        expect(() =>
            normalizeDictionaryProfile({
                version: 2,
                zones: [
                    minimalProfile().zones[0]!,
                    {
                        families: [{ emit: 'entry', use: 'lineEntry' }],
                        name: 'main',
                    },
                ],
            }),
        ).toThrow('dictionary zone names must be unique; duplicated "main"');
    });

    it('rejects zones with no families', () => {
        expect(() =>
            normalizeDictionaryProfile({
                version: 2,
                zones: [{ families: [], name: 'main' }],
            }),
        ).toThrow('dictionary zone "main" must declare at least one family');
    });

    it('rejects invalid page ranges', () => {
        expect(() =>
            normalizeDictionaryProfile({
                version: 2,
                zones: [
                    {
                        families: [{ emit: 'entry', use: 'lineEntry' }],
                        name: 'main',
                        when: { maxPageId: 10, minPageId: 20 },
                    },
                ],
            }),
        ).toThrow('dictionary zone "main" has minPageId greater than maxPageId');
    });

    it('rejects empty stopLemma and previousWord lists', () => {
        expect(() =>
            normalizeDictionaryProfile({
                version: 2,
                zones: [
                    {
                        blockers: [{ use: 'stopLemma', words: [] }],
                        families: [{ emit: 'entry', use: 'lineEntry' }],
                        name: 'main',
                    },
                ],
            }),
        ).toThrow('stopLemma blocker in zone "main" must include non-empty words');

        expect(() =>
            normalizeDictionaryProfile({
                version: 2,
                zones: [
                    {
                        blockers: [{ use: 'previousWord', words: [] }],
                        families: [{ emit: 'entry', use: 'lineEntry' }],
                        name: 'main',
                    },
                ],
            }),
        ).toThrow('previousWord blocker in zone "main" must include non-empty words');
    });

    it('rejects empty previousChar lists', () => {
        expect(() =>
            normalizeDictionaryProfile({
                version: 2,
                zones: [
                    {
                        blockers: [{ chars: [], use: 'previousChar' }],
                        families: [{ emit: 'entry', use: 'lineEntry' }],
                        name: 'main',
                    },
                ],
            }),
        ).toThrow('previousChar blocker in zone "main" must include chars');
    });

    it('defaults previousWord scope to samePage and pageContinuation authorityPrecision to high', () => {
        const normalized = normalizeDictionaryProfile({
            version: 2,
            zones: [
                {
                    blockers: [{ use: 'previousWord', words: ['قال'] }, { use: 'pageContinuation' }],
                    families: [{ emit: 'entry', use: 'lineEntry' }],
                    name: 'main',
                },
            ],
        });

        expect(normalized.zones[0]?.blockers).toMatchObject([
            { normalizedWords: expect.any(Set), scope: 'samePage', use: 'previousWord' },
            { authorityPrecision: 'high', use: 'pageContinuation' },
        ]);
    });

    it('preserves explicit previousWord scope and pageContinuation authorityPrecision values', () => {
        const normalized = normalizeDictionaryProfile({
            version: 2,
            zones: [
                {
                    blockers: [
                        { scope: 'pageStart', use: 'previousWord', words: ['قال'] },
                        { authorityPrecision: 'aggressive', use: 'pageContinuation' },
                    ],
                    families: [{ emit: 'entry', use: 'lineEntry' }],
                    name: 'main',
                },
            ],
        });

        expect(normalized.zones[0]?.blockers).toMatchObject([
            { normalizedWords: expect.any(Set), scope: 'pageStart', use: 'previousWord' },
            { authorityPrecision: 'aggressive', use: 'pageContinuation' },
        ]);
    });

    it('returns validation issues for invalid previousWord scope values', () => {
        const issues = validateDictionaryProfile({
            version: 2,
            zones: [
                {
                    blockers: [{ scope: 'everywhere' as never, use: 'previousWord', words: ['قال'] }],
                    families: [{ emit: 'entry', use: 'lineEntry' }],
                    name: 'main',
                },
            ],
        });

        expect(issues).toContainEqual(
            expect.objectContaining({
                code: 'invalid_previous_word_scope',
                path: 'zones[main].blockers[0].scope',
            }),
        );
    });

    it('returns validation issues for invalid authorityIntro precision values', () => {
        const issues = validateDictionaryProfile({
            version: 2,
            zones: [
                {
                    blockers: [{ precision: 'medium' as never, use: 'authorityIntro' }],
                    families: [{ emit: 'entry', use: 'lineEntry' }],
                    name: 'main',
                },
            ],
        });

        expect(issues).toContainEqual(
            expect.objectContaining({
                code: 'invalid_authority_intro_precision',
                path: 'zones[main].blockers[0].precision',
            }),
        );
    });

    it('returns validation issues for invalid pageContinuation authorityPrecision values', () => {
        const issues = validateDictionaryProfile({
            version: 2,
            zones: [
                {
                    blockers: [{ authorityPrecision: 'medium' as never, use: 'pageContinuation' }],
                    families: [{ emit: 'entry', use: 'lineEntry' }],
                    name: 'main',
                },
            ],
        });

        expect(issues).toContainEqual(
            expect.objectContaining({
                code: 'invalid_continuation_precision',
                path: 'zones[main].blockers[0].authorityPrecision',
            }),
        );
    });

    it('normalizes all shipped profiles without validation errors', () => {
        expect(() => normalizeDictionaryProfile(PROFILE_1687)).not.toThrow();
        expect(() => normalizeDictionaryProfile(PROFILE_2553)).not.toThrow();
        expect(() => normalizeDictionaryProfile(PROFILE_7030)).not.toThrow();
        expect(() => normalizeDictionaryProfile(PROFILE_7031)).not.toThrow();
    });

    it('returns structured validation issues for invalid gates and inert heading families', () => {
        const issues = validateDictionaryProfile({
            version: 2,
            zones: [
                {
                    families: [{ classes: [], emit: 'entry', use: 'heading' }],
                    name: 'main',
                    when: {
                        activateAfter: [
                            { fuzzy: true, match: '', use: 'headingText' },
                            { fuzzy: true, match: '', use: 'headingText' },
                        ],
                    },
                },
            ],
        });

        expect(issues.map((issue) => issue.code)).toEqual([
            'invalid_gate_match',
            'invalid_gate_match',
            'duplicate_activate_after_gate',
            'empty_heading_classes',
            'inert_heading_family',
        ]);
    });

    it('throws a structured validation error when normalization fails', () => {
        try {
            normalizeDictionaryProfile({
                version: 2,
                zones: [{ families: [{ classes: [], emit: 'entry', use: 'heading' }], name: 'main' }],
            });
            throw new Error('expected normalizeDictionaryProfile to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(DictionaryProfileValidationError);
            expect((error as DictionaryProfileValidationError).issues[0]?.code).toBe('empty_heading_classes');
        }
    });
});
