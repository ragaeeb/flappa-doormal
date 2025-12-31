import { describe, expect, it } from 'bun:test';
import {
    containsTokens,
    escapeTemplateBrackets,
    expandCompositeTokensInTemplate,
    expandTokens,
    expandTokensWithCaptures,
    getAvailableTokens,
    getTokenPattern,
    TOKEN_PATTERNS,
    templateToRegex,
} from './tokens.js';

describe('tokens', () => {
    describe('escapeTemplateBrackets', () => {
        it('should escape parentheses outside tokens', () => {
            expect(escapeTemplateBrackets('({{harf}}): ')).toBe('\\({{harf}}\\): ');
        });

        it('should escape square brackets outside tokens', () => {
            expect(escapeTemplateBrackets('[{{raqm}}] ')).toBe('\\[{{raqm}}\\] ');
        });

        it('should escape mixed brackets', () => {
            expect(escapeTemplateBrackets('({{raqm}}) [{{harf}}]')).toBe('\\({{raqm}}\\) \\[{{harf}}\\]');
        });

        it('should NOT escape brackets inside tokens', () => {
            // The token content should be preserved as-is
            expect(escapeTemplateBrackets('{{harf}}')).toBe('{{harf}}');
        });

        it('should preserve plain text without brackets', () => {
            expect(escapeTemplateBrackets('{{raqms}} {{dash}}')).toBe('{{raqms}} {{dash}}');
        });

        it('should handle pattern with no tokens', () => {
            expect(escapeTemplateBrackets('(test) [value]')).toBe('\\(test\\) \\[value\\]');
        });

        it('should handle nested looking patterns correctly', () => {
            // This is {{harf:name}} with named capture syntax
            expect(escapeTemplateBrackets('({{harf:name}})')).toBe('\\({{harf:name}}\\)');
        });

        it('should preserve empty pattern', () => {
            expect(escapeTemplateBrackets('')).toBe('');
        });

        it('should escape only brackets, not other regex metacharacters', () => {
            // . * + ? are not escaped
            expect(escapeTemplateBrackets('test.*')).toBe('test.*');
            expect(escapeTemplateBrackets('^start$')).toBe('^start$');
        });
    });

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

        it('should detect template patterns', () => {
            expect(containsTokens('{{raqm}}')).toBeTrue();
            expect(containsTokens('، {{raqms}}')).toBeTrue();
            expect(containsTokens('{{harf}}{{dash}}')).toBeTrue();
        });

        it('should reject non-template strings', () => {
            expect(containsTokens('hello')).toBeFalse();
            expect(containsTokens('/regex/')).toBeFalse();
            expect(containsTokens('{incomplete}')).toBeFalse();
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

        it('should handle repeating tokens without captures', () => {
            const result = expandTokensWithCaptures('{{raqms:num}} {{harf}} {{harf}}');
            expect(result.pattern).toBe('(?<num>[\\u0660-\\u0669]+) [أ-ي] [أ-ي]');
            expect(result.captureNames).toEqual(['num']);
            expect(result.hasCaptures).toBeTrue();
        });

        it('should handle repeating tokens with different capture names', () => {
            const result = expandTokensWithCaptures('{{raqms:number}} {{harf:firstLetter}} {{harf:secondLetter}}');
            expect(result.pattern).toBe('(?<number>[\\u0660-\\u0669]+) (?<firstLetter>[أ-ي]) (?<secondLetter>[أ-ي])');
            expect(result.captureNames).toEqual(['number', 'firstLetter', 'secondLetter']);
            expect(result.hasCaptures).toBeTrue();
        });

        it('should auto-rename duplicate capture names to prevent regex errors', () => {
            // Using the same capture name twice would create invalid regex without renaming
            const result = expandTokensWithCaptures('{{harf:letter}} {{harf:letter}}');
            expect(result.captureNames).toContain('letter');
            expect(result.captureNames).toContain('letter_2');
            expect(result.pattern).toBe('(?<letter>[أ-ي]) (?<letter_2>[أ-ي])');
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
            expect(tokens).toContain('rumuz');
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

        it('should return a pattern for rumuz', () => {
            const pat = getTokenPattern('rumuz');
            expect(pat).toBeDefined();
            // A couple of representative codes
            expect(templateToRegex(`^${pat}$`)?.test('خت')).toBeTrue();
            expect(templateToRegex(`^${pat}$`)?.test('مد')).toBeTrue();
            expect(templateToRegex(`^${pat}$`)?.test('٤')).toBeTrue();
        });

        it('should match standalone single-letter rumuz codes', () => {
            const pat = getTokenPattern('rumuz');
            const regex = templateToRegex(`^${pat}$`);
            expect(regex?.test('ع')).toBeTrue(); // standalone ع is valid rumuz
            expect(regex?.test('خ')).toBeTrue();
            expect(regex?.test('م')).toBeTrue();
        });

        it('should NOT match single-letter rumuz when followed by diacritics', () => {
            const pat = getTokenPattern('rumuz');
            // Using start anchor but not end anchor to simulate real matching
            const regex = templateToRegex(`^${pat}`);
            // عَن has ع followed by fatha diacritic - should NOT match as rumuz
            expect(regex?.test('عَن')).toBeFalse();
            // مَ has م followed by fatha - should NOT match
            expect(regex?.test('مَعروف')).toBeFalse();
        });

        it('should still match multi-letter rumuz codes', () => {
            const pat = getTokenPattern('rumuz');
            const regex = templateToRegex(`^${pat}$`);
            expect(regex?.test('عس')).toBeTrue();
            expect(regex?.test('خت')).toBeTrue();
            expect(regex?.test('سي')).toBeTrue();
        });

        it('should match تمييز as a rumuz code (jarh wa tadil)', () => {
            const pat = getTokenPattern('rumuz');
            const regex = templateToRegex(`^${pat}$`);
            expect(regex?.test('تمييز')).toBeTrue();
        });

        it('should NOT match partial تمييز', () => {
            const pat = getTokenPattern('rumuz');
            const regex = templateToRegex(`^${pat}$`);
            expect(regex?.test('تميي')).toBeFalse();
            expect(regex?.test('مييز')).toBeFalse();
            expect(regex?.test('تميز')).toBeFalse();
        });

        it('should NOT match تمييز with diacritics', () => {
            const pat = getTokenPattern('rumuz');
            const regex = templateToRegex(`^${pat}$`);
            expect(regex?.test('تَمييز')).toBeFalse();
            expect(regex?.test('تمِييز')).toBeFalse();
            expect(regex?.test('تَمْيِيزٌ')).toBeFalse();
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

    describe('expandCompositeTokensInTemplate', () => {
        it('should expand the numbered composite token into base token template', () => {
            expect(expandCompositeTokensInTemplate('{{numbered}}')).toBe('{{raqms}} {{dash}} ');
        });

        it('should leave non-composite tokens unchanged', () => {
            expect(expandCompositeTokensInTemplate('{{raqms}} {{dash}} ')).toBe('{{raqms}} {{dash}} ');
        });

        it('should not expand capture syntax like {{numbered:num}}', () => {
            expect(expandCompositeTokensInTemplate('{{numbered:num}}')).toBe('{{numbered:num}}');
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

    describe('shouldDefaultToFuzzy', () => {
        // Import at runtime to avoid circular deps during test setup
        const { shouldDefaultToFuzzy } = require('./tokens.js');

        it('should return true for patterns containing {{bab}}', () => {
            expect(shouldDefaultToFuzzy('{{bab}} الإيمان')).toBeTrue();
        });

        it('should return true for patterns containing {{basmalah}}', () => {
            expect(shouldDefaultToFuzzy('{{basmalah}}')).toBeTrue();
        });

        it('should return true for patterns containing {{fasl}}', () => {
            expect(shouldDefaultToFuzzy('{{fasl}}')).toBeTrue();
        });

        it('should return true for patterns containing {{kitab}}', () => {
            expect(shouldDefaultToFuzzy('{{kitab}} الصلاة')).toBeTrue();
        });

        it('should return true for patterns containing {{naql}}', () => {
            expect(shouldDefaultToFuzzy('{{naql}}')).toBeTrue();
        });

        it('should return false for patterns without fuzzy-default tokens', () => {
            expect(shouldDefaultToFuzzy('{{raqms}} {{dash}}')).toBeFalse();
            expect(shouldDefaultToFuzzy('{{numbered}}')).toBeFalse();
            expect(shouldDefaultToFuzzy('plain text')).toBeFalse();
        });

        it('should return true if any pattern in array contains fuzzy-default token', () => {
            expect(shouldDefaultToFuzzy(['{{raqms}}', '{{bab}}'])).toBeTrue();
            expect(shouldDefaultToFuzzy(['{{numbered}}', '{{kitab}} '])).toBeTrue();
        });

        it('should return false if no patterns contain fuzzy-default tokens', () => {
            expect(shouldDefaultToFuzzy(['{{raqms}}', '{{dash}}'])).toBeFalse();
        });
    });

    describe('applyTokenMappings', () => {
        // Import at runtime
        const { applyTokenMappings } = require('./tokens.js');

        it('should transform {{token}} to {{token:name}}', () => {
            const t = '{{raqms}} {{dash}}';
            const m = [{ name: 'num', token: 'raqms' }];
            expect(applyTokenMappings(t, m)).toBe('{{raqms:num}} {{dash}}');
        });

        it('should handle multiple mappings', () => {
            const t = '{{raqms}} {{harf}}';
            const m = [
                { name: 'num', token: 'raqms' },
                { name: 'char', token: 'harf' },
            ];
            expect(applyTokenMappings(t, m)).toBe('{{raqms:num}} {{harf:char}}');
        });

        it('should not touch tokens that already have captures', () => {
            const t = '{{raqms:existing}} {{dash}}';
            const m = [{ name: 'new', token: 'raqms' }];
            expect(applyTokenMappings(t, m)).toBe('{{raqms:existing}} {{dash}}');
        });

        it('should ignore empty mappings', () => {
            const t = '{{raqms}}';
            const m = [
                { name: 'num', token: '' },
                { name: '', token: 'raqms' },
            ];
            expect(applyTokenMappings(t, m)).toBe('{{raqms}}');
        });
    });

    describe('stripTokenMappings', () => {
        const { stripTokenMappings } = require('./tokens.js');

        it('should transform {{token:name}} to {{token}}', () => {
            expect(stripTokenMappings('{{raqms:num}}')).toBe('{{raqms}}');
        });

        it('should handle multiple captures', () => {
            expect(stripTokenMappings('{{raqms:num}} {{harf:char}}')).toBe('{{raqms}} {{harf}}');
        });

        it('should preserve tokens without captures', () => {
            expect(stripTokenMappings('{{raqms}} {{dash}}')).toBe('{{raqms}} {{dash}}');
        });
    });
});
