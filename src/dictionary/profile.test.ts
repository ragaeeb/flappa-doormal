import { describe, expect, it } from 'bun:test';
import type { ArabicDictionaryProfile } from '@/types/dictionary.js';
import { normalizeDictionaryProfile } from './profile.js';

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
        const [heading, lineEntry, inlineSubentry, codeLine, pairedForms] = normalized.zones[0]?.families ?? [];
        const [authorityIntro] = normalized.zones[0]?.blockers ?? [];

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
            families: [
                { allowNextLineColon: true, allowSingleLetter: true },
                { allowMultiWord: true, allowWhitespaceBeforeColon: true, wrappers: 'any' },
                { prefixes: ['و', 'ف'], stripPrefixesFromLemma: false },
                { wrappers: 'paired' },
                { requireStatusTail: true, separator: 'space' },
            ],
            when: {
                activateAfter: [{ match: 'باب', use: 'headingText' }],
                maxPageId: 100,
                minPageId: 50,
            },
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
        ).toThrow('dictionary blocker "stopLemma" in zone "main" must include words');

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
        ).toThrow('dictionary blocker "previousWord" in zone "main" must include words');
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
        ).toThrow('dictionary blocker "previousChar" in zone "main" must include chars');
    });
});
