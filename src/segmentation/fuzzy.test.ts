import { describe, expect, it } from 'bun:test';
import { escapeRegex, makeDiacriticInsensitive } from './fuzzy.js';

describe('fuzzy', () => {
    describe('escapeRegex', () => {
        it('should escape dots', () => {
            expect(escapeRegex('hello.world')).toBe('hello\\.world');
        });

        it('should escape brackets', () => {
            expect(escapeRegex('[test]')).toBe('\\[test\\]');
        });

        it('should escape quantifiers', () => {
            expect(escapeRegex('a+b*c?')).toBe('a\\+b\\*c\\?');
        });

        it('should escape parentheses', () => {
            expect(escapeRegex('(group)')).toBe('\\(group\\)');
        });

        it('should escape caret and dollar', () => {
            expect(escapeRegex('^start$end')).toBe('\\^start\\$end');
        });

        it('should escape pipes', () => {
            expect(escapeRegex('a|b')).toBe('a\\|b');
        });

        it('should escape backslashes', () => {
            expect(escapeRegex('path\\to')).toBe('path\\\\to');
        });

        it('should handle empty string', () => {
            expect(escapeRegex('')).toBe('');
        });

        it('should not modify strings without metacharacters', () => {
            expect(escapeRegex('plain text')).toBe('plain text');
        });
    });

    describe('makeDiacriticInsensitive', () => {
        it('should create pattern that matches text with diacritics', () => {
            const pattern = makeDiacriticInsensitive('حدثنا');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('حَدَّثَنَا')).toBe(true);
        });

        it('should create pattern that matches text without diacritics', () => {
            const pattern = makeDiacriticInsensitive('حدثنا');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('حدثنا')).toBe(true);
        });

        it('should handle alef variants equivalence', () => {
            const pattern = makeDiacriticInsensitive('الإيمان');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('الايمان')).toBe(true);
        });

        it('should handle ta marbuta and ha equivalence', () => {
            const pattern = makeDiacriticInsensitive('صلاة');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('صلاه')).toBe(true);
        });

        it('should handle alef maqsura and ya equivalence', () => {
            const pattern = makeDiacriticInsensitive('موسى');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('موسي')).toBe(true);
        });

        it('should create pattern for باب that matches with diacritics', () => {
            const pattern = makeDiacriticInsensitive('باب');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('بَابٌ')).toBe(true);
            expect(regex.test('باب')).toBe(true);
        });

        it('should handle spaces correctly', () => {
            const pattern = makeDiacriticInsensitive('بسم الله');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('بسم الله')).toBe(true);
        });

        it('should collapse multiple spaces', () => {
            const pattern = makeDiacriticInsensitive('بسم  الله');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('بسم الله')).toBe(true);
        });

        it('should handle empty string', () => {
            const pattern = makeDiacriticInsensitive('');
            expect(pattern).toBe('');
        });

        it('should escape regex metacharacters in input', () => {
            const pattern = makeDiacriticInsensitive('test.text');
            expect(pattern).toContain('\\.');
        });
    });
});
