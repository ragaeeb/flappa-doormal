import { describe, expect, it } from 'bun:test';

import {
    buildLineEndsWithRegexSource,
    buildLineStartsAfterRegexSource,
    buildLineStartsWithRegexSource,
    buildRuleRegex,
    buildTemplateRegexSource,
    compileRuleRegex,
    hasCapturingGroup,
    processPattern,
} from './rule-regex.js';

describe('rule-regex', () => {
    describe('hasCapturingGroup', () => {
        it('should detect anonymous capture groups', () => {
            expect(hasCapturingGroup('^(.*)$')).toBe(true);
        });

        it('should not count non-capturing or named groups', () => {
            expect(hasCapturingGroup('^(?:a|b)$')).toBe(false);
            expect(hasCapturingGroup('^(?<name>abc)$')).toBe(false);
        });
    });

    describe('compileRuleRegex', () => {
        it('should throw helpful error for invalid regex', () => {
            expect(() => compileRuleRegex('(unclosed')).toThrow(/Invalid regex pattern/);
        });
    });

    describe('processPattern', () => {
        it('should auto-escape brackets outside tokens', () => {
            const { pattern } = processPattern('({{raqm}})', false);
            // raqm expands to a character class; parentheses should be escaped
            expect(pattern).toContain('\\(');
            expect(pattern).toContain('\\)');
        });
    });

    describe('buildLineStartsAfterRegexSource', () => {
        it('should include trailing capture and captureNames', () => {
            const { regex, captureNames } = buildLineStartsAfterRegexSource(['{{raqms:num}} {{dash}}'], false);
            expect(regex).toContain('(.*)');
            expect(captureNames).toEqual(['num']);
        });

        it('should use internal __content group when capturePrefix is provided (without leaking into captureNames)', () => {
            const { regex, captureNames } = buildLineStartsAfterRegexSource(['{{raqms:num}} {{dash}}'], false, '__p__');
            expect(regex).toContain('(?<__p____content>.*)');
            expect(captureNames).toEqual(['__p__num']);
        });
    });

    describe('buildLineStartsWithRegexSource', () => {
        it('should build ^[zeroWidthPrefix](?:...) source', () => {
            const { regex } = buildLineStartsWithRegexSource(['## '], false);
            // Should start with zero-width prefix followed by pattern group
            expect(regex).toMatch(/^\^\[.*\]\*\(\?:/);
        });
    });

    describe('buildLineEndsWithRegexSource', () => {
        it('should build (?:...)$ source', () => {
            const { regex } = buildLineEndsWithRegexSource(['\\.$'], false);
            expect(regex.endsWith('$')).toBe(true);
        });
    });

    describe('buildTemplateRegexSource', () => {
        it('should escape brackets and expand tokens', () => {
            const { regex } = buildTemplateRegexSource('^({{raqm}}) ');
            const r = compileRuleRegex(regex);
            r.lastIndex = 0;
            expect(r.test('(١) x')).toBe(true);
        });
    });

    describe('buildRuleRegex', () => {
        it('should build lineStartsAfter rule correctly', () => {
            const rr = buildRuleRegex({ lineStartsAfter: ['{{raqms:num}} {{dash}}'], split: 'at' } as never);
            expect(rr.usesLineStartsAfter).toBe(true);
            expect(rr.usesCapture).toBe(true);
            expect(rr.captureNames).toEqual(['num']);
            expect(rr.regex.flags).toBe('gmu');
        });

        it('should build fuzzy lineStartsWith that matches diacritics variants', () => {
            const rr = buildRuleRegex({ fuzzy: true, lineStartsWith: ['{{bab}}'], split: 'at' } as never);
            rr.regex.lastIndex = 0;
            expect(rr.regex.test('بَابُ الصلاة')).toBe(true);
        });

        it('should auto-enable fuzzy for tokens that default to fuzzy (bab)', () => {
            // When {{bab}} is used without explicit fuzzy, it should match diacritics
            const rr = buildRuleRegex({ lineStartsWith: ['{{bab}}'], split: 'at' } as never);
            rr.regex.lastIndex = 0;
            expect(rr.regex.test('بَابُ الصلاة')).toBe(true);
        });

        it('should auto-enable fuzzy for tokens that default to fuzzy (kitab)', () => {
            const rr = buildRuleRegex({ lineStartsWith: ['{{kitab}}'], split: 'at' } as never);
            rr.regex.lastIndex = 0;
            expect(rr.regex.test('كِتَابُ الإيمان')).toBe(true);
        });

        it('should allow explicit fuzzy: false to override default', () => {
            // Explicit fuzzy: false should prevent fuzzy matching
            const rr = buildRuleRegex({ fuzzy: false, lineStartsWith: ['{{bab}}'], split: 'at' } as never);
            rr.regex.lastIndex = 0;
            // Should NOT match with diacritics when fuzzy is explicitly false
            expect(rr.regex.test('بَابُ الصلاة')).toBe(false);
            // Should match plain version
            rr.regex.lastIndex = 0;
            expect(rr.regex.test('باب الصلاة')).toBe(true);
        });

        it('should not auto-enable fuzzy for non-fuzzy-default tokens', () => {
            // {{raqms}} is not a fuzzy-default token
            const rr = buildRuleRegex({ lineStartsWith: ['{{raqms}}'], split: 'at' } as never);
            // Pattern should be exact Unicode range, not fuzzy-expanded (with zero-width prefix)
            expect(rr.regex.source).toBe('^[\\u200E\\u200F\\u061C\\u200B\\u200C\\u200D\\uFEFF]*(?:[\\u0660-\\u0669]+)');
        });
    });

    describe('zero-width prefix matching (ZWJ/ZWNJ)', () => {
        it('should match lineStartsWith when the line begins with ZWNJ/ZWJ', () => {
            const rr = buildRuleRegex({ lineStartsWith: ['## '], split: 'at' } as never);

            const zwnj = '\u200C';
            const zwj = '\u200D';
            rr.regex.lastIndex = 0;
            expect(rr.regex.test(`${zwnj}## Title`)).toBe(true);
            rr.regex.lastIndex = 0;
            expect(rr.regex.test(`${zwj}## Title`)).toBe(true);
        });

        it('should match lineStartsAfter when the line begins with ZWNJ/ZWJ', () => {
            const rr = buildRuleRegex({ lineStartsAfter: ['## '], split: 'at' } as never);

            const zwnj = '\u200C';
            const zwj = '\u200D';
            rr.regex.lastIndex = 0;
            expect(rr.regex.test(`${zwnj}## Title`)).toBe(true);
            rr.regex.lastIndex = 0;
            expect(rr.regex.test(`${zwj}## Title`)).toBe(true);
        });
    });
});
