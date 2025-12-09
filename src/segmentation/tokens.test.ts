import { describe, expect, it } from 'bun:test';
import {
    containsTokens,
    expandTokens,
    expandTokensWithCaptures,
    getAvailableTokens,
    getTokenPattern,
    TOKEN_PATTERNS,
    templateToRegex,
} from './tokens.js';

describe('tokens', () => {
    describe('containsTokens', () => {
        it('should return true when string contains token pattern', () => {
            expect(containsTokens('{{raqms}} {{dash}}')).toBeTrue();
        });

        it('should return true for single token', () => {
            expect(containsTokens('{{bab}}')).toBeTrue();
        });

        it('should return false for plain text', () => {
            expect(containsTokens('plain text')).toBeFalse();
        });

        it('should return false for raw regex patterns', () => {
            expect(containsTokens('[٠-٩]+ - ')).toBeFalse();
        });

        it('should return false for partial token syntax', () => {
            expect(containsTokens('{raqms}')).toBeFalse();
            expect(containsTokens('{{raqms')).toBeFalse();
        });
    });

    describe('expandTokens', () => {
        it('should expand simple tokens to regex patterns', () => {
            expect(expandTokens('{{raqm}}')).toBe('[\\u0660-\\u0669]');
        });

        it('should expand multiple tokens', () => {
            const result = expandTokens('{{raqms}} {{dash}}');
            expect(result).toBe('[\\u0660-\\u0669]+ [-–—ـ]');
        });

        it('should leave unknown tokens as-is', () => {
            expect(expandTokens('{{unknown}}')).toBe('{{unknown}}');
        });

        it('should handle mixed tokens and text', () => {
            const result = expandTokens('باب {{raqms}}');
            expect(result).toBe('باب [\\u0660-\\u0669]+');
        });
    });

    describe('expandTokensWithCaptures', () => {
        it('should return pattern without captures for simple tokens', () => {
            const result = expandTokensWithCaptures('{{raqms}} {{dash}}');
            expect(result.pattern).toBe('[\\u0660-\\u0669]+ [-–—ـ]');
            expect(result.captureNames).toEqual([]);
            expect(result.hasCaptures).toBeFalse();
        });

        it('should create named capture group for {{token:name}}', () => {
            const result = expandTokensWithCaptures('{{raqms:num}} {{dash}}');
            expect(result.pattern).toBe('(?<num>[\\u0660-\\u0669]+) [-–—ـ]');
            expect(result.captureNames).toEqual(['num']);
            expect(result.hasCaptures).toBeTrue();
        });

        it('should handle {{:name}} capture-only syntax', () => {
            const result = expandTokensWithCaptures('{{:content}}');
            expect(result.pattern).toBe('(?<content>.+)');
            expect(result.captureNames).toEqual(['content']);
            expect(result.hasCaptures).toBeTrue();
        });

        it('should handle multiple named captures', () => {
            const result = expandTokensWithCaptures('{{raqms:vol}}/{{raqms:page}}');
            expect(result.captureNames).toEqual(['vol', 'page']);
            expect(result.hasCaptures).toBeTrue();
        });

        it('should apply fuzzy transform when provided', () => {
            const mockFuzzy = (text: string) => text.replace(/ب/g, '[ب]');
            const result = expandTokensWithCaptures('{{bab}}', mockFuzzy);
            expect(result.pattern).toContain('[ب]');
        });
    });

    describe('templateToRegex', () => {
        it('should return compiled regex for valid template', () => {
            const regex = templateToRegex('{{raqms}}');
            expect(regex).toBeInstanceOf(RegExp);
            expect(regex?.flags).toContain('u');
        });

        it('should return null for invalid regex pattern', () => {
            const regex = templateToRegex('(((');
            expect(regex).toBeNull();
        });

        it('should create working regex for Arabic patterns', () => {
            const regex = templateToRegex('{{dash}}');
            expect(regex?.test('-')).toBeTrue();
            expect(regex?.test('–')).toBeTrue();
        });
    });

    describe('getAvailableTokens', () => {
        it('should return array of token names', () => {
            const tokens = getAvailableTokens();
            expect(Array.isArray(tokens)).toBeTrue();
            expect(tokens.length).toBeGreaterThan(0);
        });

        it('should include known tokens', () => {
            const tokens = getAvailableTokens();
            expect(tokens).toContain('raqms');
            expect(tokens).toContain('dash');
            expect(tokens).toContain('bab');
            expect(tokens).toContain('naql');
        });
    });

    describe('getTokenPattern', () => {
        it('should return pattern for known token', () => {
            expect(getTokenPattern('raqms')).toBe('[\\u0660-\\u0669]+');
        });

        it('should return undefined for unknown token', () => {
            expect(getTokenPattern('unknown')).toBeUndefined();
        });

        it('should return correct pattern for Arabic phrase tokens', () => {
            expect(getTokenPattern('bab')).toBe('باب');
            expect(getTokenPattern('kitab')).toBe('كتاب');
        });
    });

    describe('TOKEN_PATTERNS', () => {
        it('should be an object with string values', () => {
            expect(typeof TOKEN_PATTERNS).toBe('object');
            for (const key of Object.keys(TOKEN_PATTERNS)) {
                expect(typeof TOKEN_PATTERNS[key]).toBe('string');
            }
        });

        it('should include the numbered composite token', () => {
            expect(TOKEN_PATTERNS.numbered).toBeDefined();
        });

        it('should expand numbered token to raqms + dash pattern', () => {
            // numbered is defined as '{{raqms}} {{dash}} ' which should expand to the raw patterns
            expect(TOKEN_PATTERNS.numbered).toBe('[\\u0660-\\u0669]+ [-–—ـ] ');
        });
    });

    describe('numbered token usage', () => {
        it('should create regex that matches Arabic-Indic numbered pattern', () => {
            const regex = templateToRegex('^{{numbered}}');
            expect(regex).toBeInstanceOf(RegExp);
            expect(regex?.test('٢٢ - حدثنا')).toBeTrue();
            expect(regex?.test('٦٦٩٦ – أخبرنا')).toBeTrue(); // en-dash
        });

        it('should not match lines without proper number prefix', () => {
            const regex = templateToRegex('^{{numbered}}');
            expect(regex?.test('حدثنا')).toBeFalse();
            expect(regex?.test('باب الصلاة')).toBeFalse();
        });

        it('should work in lineStartsAfter pattern expansion', () => {
            // This simulates what happens in segmenter.ts when using lineStartsAfter
            const pattern = expandTokens('^(?:{{numbered}})(.*)');
            expect(pattern).toBe('^(?:[\\u0660-\\u0669]+ [-–—ـ] )(.*)');
        });
    });
});
