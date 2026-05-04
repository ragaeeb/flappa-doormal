import { describe, expect, it } from 'bun:test';
import type { NormalizedDictionaryFamily } from '@/types/dictionary.js';
import { familyMayMatchLine } from './dictionary-candidates.js';

describe('dictionary candidate family pre-checks', () => {
    it('skips obviously incompatible lines before family-specific regex work', () => {
        const headingFamily: NormalizedDictionaryFamily = {
            allowNextLineColon: false,
            allowSingleLetter: false,
            classes: ['entry'],
            emit: 'entry',
            use: 'heading',
        };
        const lineEntryFamily: NormalizedDictionaryFamily = {
            allowMultiWord: false,
            allowWhitespaceBeforeColon: false,
            emit: 'entry',
            use: 'lineEntry',
            wrappers: 'none',
        };
        const inlineSubentryFamily: NormalizedDictionaryFamily = {
            emit: 'entry',
            prefixes: ['و'],
            stripPrefixesFromLemma: false,
            use: 'inlineSubentry',
        };
        const pairedFormsFamily: NormalizedDictionaryFamily = {
            emit: 'marker',
            requireStatusTail: true,
            separator: 'comma',
            use: 'pairedForms',
        };

        expect(familyMayMatchLine(headingFamily, 'عول: شرح')).toBe(false);
        expect(familyMayMatchLine(headingFamily, '## عول')).toBe(true);
        expect(familyMayMatchLine(lineEntryFamily, 'شرح بلا فاصلة رأسية')).toBe(false);
        expect(familyMayMatchLine(lineEntryFamily, 'عول: شرح')).toBe(true);
        expect(familyMayMatchLine(inlineSubentryFamily, 'شرح بلا فاصلة رأسية')).toBe(false);
        expect(familyMayMatchLine(inlineSubentryFamily, 'قالوا والعز: شرح')).toBe(true);
        expect(familyMayMatchLine(pairedFormsFamily, 'خصف، فصخ مستعملان')).toBe(false);
        expect(familyMayMatchLine(pairedFormsFamily, 'خصف، فصخ: مستعملان')).toBe(true);
    });
});
