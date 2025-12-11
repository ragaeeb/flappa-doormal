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
        it('should create pattern that matches text with and without diacritics', () => {
            const pattern = makeDiacriticInsensitive('حدثنا');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('حَدَّثَنَا')).toBeTrue();
            expect(regex.test('حدثنا')).toBeTrue();
        });

        it('should handle alif variants equivalence (ا, آ, أ, إ)', () => {
            // All alif variants should create the same character class
            const pattern1 = makeDiacriticInsensitive('ا');
            const pattern2 = makeDiacriticInsensitive('آ');
            const pattern3 = makeDiacriticInsensitive('أ');
            const pattern4 = makeDiacriticInsensitive('إ');

            const expectedClass = '[\u0627\u0622\u0623\u0625][\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*';
            expect(pattern1).toBe(expectedClass);
            expect(pattern2).toBe(expectedClass);
            expect(pattern3).toBe(expectedClass);
            expect(pattern4).toBe(expectedClass);

            // Also verify functional matching
            const testPattern = makeDiacriticInsensitive('الإيمان');
            const regex = new RegExp(testPattern, 'u');
            expect(regex.test('الايمان')).toBeTrue();
        });

        it('should handle ta marbuta and ha equivalence (ة ↔ ه)', () => {
            const pattern1 = makeDiacriticInsensitive('ة');
            const pattern2 = makeDiacriticInsensitive('ه');

            const expectedClass = '[\u0629\u0647][\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*';
            expect(pattern1).toBe(expectedClass);
            expect(pattern2).toBe(expectedClass);

            // Also verify functional matching
            const testPattern = makeDiacriticInsensitive('صلاة');
            const regex = new RegExp(testPattern, 'u');
            expect(regex.test('صلاه')).toBeTrue();
        });

        it('should handle ya variants equivalence (ى ↔ ي)', () => {
            const pattern1 = makeDiacriticInsensitive('ى');
            const pattern2 = makeDiacriticInsensitive('ي');

            const expectedClass = '[\u0649\u064A][\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*';
            expect(pattern1).toBe(expectedClass);
            expect(pattern2).toBe(expectedClass);

            // Also verify functional matching
            const testPattern = makeDiacriticInsensitive('موسى');
            const regex = new RegExp(testPattern, 'u');
            expect(regex.test('موسي')).toBeTrue();
        });

        it('should create pattern for باب that matches with diacritics', () => {
            const pattern = makeDiacriticInsensitive('باب');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('بَابٌ')).toBeTrue();
            expect(regex.test('باب')).toBeTrue();
        });

        it('should handle spaces and normalize whitespace', () => {
            const pattern = makeDiacriticInsensitive('بسم الله');
            const regex = new RegExp(pattern, 'u');
            expect(regex.test('بسم الله')).toBeTrue();

            // Multiple spaces should be collapsed to single space
            const result1 = makeDiacriticInsensitive('مرحبا   بكم');
            const result2 = makeDiacriticInsensitive('مرحبا بكم');
            expect(result1).toBe(result2);
        });

        it('should trim whitespace', () => {
            const result1 = makeDiacriticInsensitive('  مرحبا  ');
            const result2 = makeDiacriticInsensitive('مرحبا');
            expect(result1).toBe(result2);
        });

        it('should handle empty string', () => {
            const result = makeDiacriticInsensitive('');
            expect(result).toBe('');
        });

        it('should escape regex metacharacters in input', () => {
            const result = makeDiacriticInsensitive('test.+*?');
            expect(result).toContain('\\.');
            expect(result).toContain('\\+');
            expect(result).toContain('\\*');
            expect(result).toContain('\\?');
        });

        it('should handle basic Arabic text and generate correct pattern', () => {
            const result = makeDiacriticInsensitive('مرحبا');
            expect(result).toBe(
                'م[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*ر[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*ح[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*ب[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*[\u0627\u0622\u0623\u0625][\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*',
            );
        });

        it('should handle mixed equivalent characters', () => {
            const result = makeDiacriticInsensitive('مدرسة');
            expect(result).toContain('[\u0629\u0647][\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*');
        });

        it('should handle single character', () => {
            const result = makeDiacriticInsensitive('م');
            expect(result).toBe('م[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*');
        });

        it('should handle non-Arabic characters', () => {
            const result = makeDiacriticInsensitive('hello');
            expect(result).toBe(
                'h[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*e[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*l[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*l[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*o[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*',
            );
        });

        it('should handle mixed Arabic and English', () => {
            const result = makeDiacriticInsensitive('hello مرحبا');
            expect(result).toContain('h[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*');
            expect(result).toContain('[\u0627\u0622\u0623\u0625][\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652]*');
        });

        it('should handle ZWJ/ZWNJ characters', () => {
            const textWithZWJ = 'مر\u200Dحبا';
            const textWithZWNJ = 'مر\u200Cحبا';
            const normalText = 'مرحبا';

            const result1 = makeDiacriticInsensitive(textWithZWJ);
            const result2 = makeDiacriticInsensitive(textWithZWNJ);
            const result3 = makeDiacriticInsensitive(normalText);

            expect(result1).toBe(result3);
            expect(result2).toBe(result3);
        });

        it('should create functional regex pattern', () => {
            const pattern = makeDiacriticInsensitive('مرحبا');
            const regex = new RegExp(pattern);

            expect(regex.test('مرحبا')).toBeTrue();
            expect(regex.test('مرحبأ')).toBeTrue();
            expect(regex.test('مَرْحَبَا')).toBeTrue();
        });
    });
});
