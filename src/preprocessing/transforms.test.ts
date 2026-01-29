import { describe, expect, it } from 'bun:test';
import { applyPreprocessToPage, condenseEllipsis, fixTrailingWaw, isZeroWidth, removeZeroWidth } from './transforms.js';

describe('isZeroWidth', () => {
    it('should return true for U+200B (Zero Width Space)', () => {
        expect(isZeroWidth(0x200b)).toBe(true);
    });

    it('should return true for U+200F (Right-to-Left Mark)', () => {
        expect(isZeroWidth(0x200f)).toBe(true);
    });

    it('should return true for U+202A (Left-to-Right Embedding)', () => {
        expect(isZeroWidth(0x202a)).toBe(true);
    });

    it('should return true for U+202E (Right-to-Left Override)', () => {
        expect(isZeroWidth(0x202e)).toBe(true);
    });

    it('should return true for U+2060 (Word Joiner)', () => {
        expect(isZeroWidth(0x2060)).toBe(true);
    });

    it('should return true for U+2064 (Invisible Plus)', () => {
        expect(isZeroWidth(0x2064)).toBe(true);
    });

    it('should return true for U+FEFF (BOM / Zero Width No-Break Space)', () => {
        expect(isZeroWidth(0xfeff)).toBe(true);
    });

    it('should return false for regular ASCII character', () => {
        expect(isZeroWidth(0x0041)).toBe(false); // 'A'
    });

    it('should return false for Arabic character', () => {
        expect(isZeroWidth(0x0627)).toBe(false); // 'ا'
    });

    it('should return false for space character', () => {
        expect(isZeroWidth(0x0020)).toBe(false);
    });
});

describe('removeZeroWidth', () => {
    it('should strip U+200B from text', () => {
        expect(removeZeroWidth('مرح\u200Bبا')).toBe('مرحبا');
    });

    it('should strip multiple zero-width characters', () => {
        expect(removeZeroWidth('a\u200Bb\u200Fc\u202Ad')).toBe('abcd');
    });

    it('should strip U+FEFF (BOM)', () => {
        expect(removeZeroWidth('\uFEFFhello')).toBe('hello');
    });

    it('should handle empty string', () => {
        expect(removeZeroWidth('')).toBe('');
    });

    it('should handle text with no zero-width characters', () => {
        expect(removeZeroWidth('السلام عليكم')).toBe('السلام عليكم');
    });

    it('should strip all characters in U+200B-U+200F range', () => {
        const input = 'a\u200Bb\u200Cc\u200Dd\u200Ee\u200Ff';
        expect(removeZeroWidth(input)).toBe('abcdef');
    });

    it('should strip all characters in U+202A-U+202E range', () => {
        const input = 'a\u202Ab\u202Bc\u202Cd\u202De\u202Ef';
        expect(removeZeroWidth(input)).toBe('abcdef');
    });

    it('should strip all characters in U+2060-U+2064 range', () => {
        const input = 'a\u2060b\u2061c\u2062d\u2063e\u2064f';
        expect(removeZeroWidth(input)).toBe('abcdef');
    });

    describe('space mode', () => {
        it('should replace zero-width character with space', () => {
            expect(removeZeroWidth('مرح\u200Bبا', 'space')).toBe('مرح با');
        });

        it('should not add multiple spaces for consecutive zero-width chars', () => {
            expect(removeZeroWidth('a\u200B\u200Bb', 'space')).toBe('a b');
        });

        it('should not add space at start of string', () => {
            expect(removeZeroWidth('\u200Bhello', 'space')).toBe('hello');
        });

        it('should not add space after existing space', () => {
            expect(removeZeroWidth('hello \u200Bworld', 'space')).toBe('hello world');
        });

        it('should not add space after newline', () => {
            expect(removeZeroWidth('hello\n\u200Bworld', 'space')).toBe('hello\nworld');
        });

        it('should not add space after tab', () => {
            expect(removeZeroWidth('hello\t\u200Bworld', 'space')).toBe('hello\tworld');
        });

        it('should handle text with no zero-width characters', () => {
            expect(removeZeroWidth('السلام عليكم', 'space')).toBe('السلام عليكم');
        });
    });
});

describe('condenseEllipsis', () => {
    it('should condense three periods to ellipsis', () => {
        expect(condenseEllipsis('text...')).toBe('text…');
    });

    it('should condense four periods to ellipsis', () => {
        expect(condenseEllipsis('text....')).toBe('text…');
    });

    it('should condense multiple ellipsis occurrences', () => {
        expect(condenseEllipsis('a...b....c')).toBe('a…b…c');
    });

    it('should not change single period', () => {
        expect(condenseEllipsis('a.b')).toBe('a.b');
    });

    it('should condense two periods to ellipsis', () => {
        expect(condenseEllipsis('a..b')).toBe('a…b');
    });

    it('should handle empty string', () => {
        expect(condenseEllipsis('')).toBe('');
    });

    it('should handle string with no periods', () => {
        expect(condenseEllipsis('السلام عليكم')).toBe('السلام عليكم');
    });

    it('should preserve Arabic punctuation', () => {
        expect(condenseEllipsis('قال... وكذلك...')).toBe('قال… وكذلك…');
    });
});

describe('fixTrailingWaw', () => {
    it('should join trailing waw to next word', () => {
        expect(fixTrailingWaw('كتاب و السنة')).toBe('كتاب والسنة');
    });

    it('should fix multiple occurrences', () => {
        expect(fixTrailingWaw('أ و ب و ج')).toBe('أ وب وج');
    });

    it('should not change text without trailing waw', () => {
        expect(fixTrailingWaw('والله')).toBe('والله');
    });

    it('should not change waw at end of string', () => {
        expect(fixTrailingWaw('كتاب و')).toBe('كتاب و');
    });

    it('should not change waw at start of string followed by space', () => {
        expect(fixTrailingWaw('و أيضا')).toBe('و أيضا');
    });

    it('should handle empty string', () => {
        expect(fixTrailingWaw('')).toBe('');
    });

    it('should handle complex case with multiple trailing waws', () => {
        expect(fixTrailingWaw('الأشاعرة لكنهما ما قصدوا مخالفة الكتاب و السنة و إنما وهموا و ظنوا')).toBe(
            'الأشاعرة لكنهما ما قصدوا مخالفة الكتاب والسنة وإنما وهموا وظنوا',
        );
    });

    it('should not change waw with diacritics', () => {
        // The pattern only matches plain waw ' و ', not diacritized 'وَ'
        expect(fixTrailingWaw('الْكِتَابُ وَ السُّنَّةُ')).toBe('الْكِتَابُ وَ السُّنَّةُ');
    });
});

describe('applyPreprocessToPage', () => {
    it('should apply string shorthand transforms', () => {
        const content = 'مرح\u200Bبا';
        const result = applyPreprocessToPage(content, 1, ['removeZeroWidth']);
        expect(result).toBe('مرحبا');
    });

    it('should apply object form transforms', () => {
        const content = 'text...';
        const result = applyPreprocessToPage(content, 1, [{ type: 'condenseEllipsis' }]);
        expect(result).toBe('text…');
    });

    it('should apply multiple transforms in order', () => {
        const content = '\u200Btext... و word';
        const result = applyPreprocessToPage(content, 1, ['removeZeroWidth', 'condenseEllipsis', 'fixTrailingWaw']);
        expect(result).toBe('text… وword');
    });

    it('should respect min constraint', () => {
        const content = 'text...';
        const result = applyPreprocessToPage(content, 5, [{ min: 10, type: 'condenseEllipsis' }]);
        // Page 5 < min 10, so transform should not apply
        expect(result).toBe('text...');
    });

    it('should respect max constraint', () => {
        const content = 'text...';
        const result = applyPreprocessToPage(content, 15, [{ max: 10, type: 'condenseEllipsis' }]);
        // Page 15 > max 10, so transform should not apply
        expect(result).toBe('text...');
    });

    it('should apply transform when page is within min/max range', () => {
        const content = 'text...';
        const result = applyPreprocessToPage(content, 50, [{ max: 100, min: 10, type: 'condenseEllipsis' }]);
        expect(result).toBe('text…');
    });

    it('should apply transform at exact min boundary', () => {
        const content = 'text...';
        const result = applyPreprocessToPage(content, 10, [{ min: 10, type: 'condenseEllipsis' }]);
        expect(result).toBe('text…');
    });

    it('should apply transform at exact max boundary', () => {
        const content = 'text...';
        const result = applyPreprocessToPage(content, 100, [{ max: 100, type: 'condenseEllipsis' }]);
        expect(result).toBe('text…');
    });

    it('should handle empty transforms array', () => {
        const content = 'text...';
        const result = applyPreprocessToPage(content, 1, []);
        expect(result).toBe('text...');
    });

    it('should handle removeZeroWidth with mode option', () => {
        const content = 'a\u200Bb';
        const result = applyPreprocessToPage(content, 1, [{ mode: 'space', type: 'removeZeroWidth' }]);
        expect(result).toBe('a b');
    });

    it('should apply transforms in array order', () => {
        // If we apply fixTrailingWaw before condenseEllipsis, the order matters
        const content = 'و ... test';
        // Order: fixTrailingWaw first won't affect ' و ' at start
        // Then condenseEllipsis converts '...'
        const result = applyPreprocessToPage(content, 1, ['fixTrailingWaw', 'condenseEllipsis']);
        expect(result).toBe('و … test');
    });

    it('should skip transforms that do not match constraints', () => {
        const content = 'text... و word';
        // condenseEllipsis: page 1 is within range (no constraints)
        // fixTrailingWaw: page 1 < min 10, so skip
        const result = applyPreprocessToPage(content, 1, ['condenseEllipsis', { min: 10, type: 'fixTrailingWaw' }]);
        expect(result).toBe('text… و word');
    });

    it('should throw for unknown transform types', () => {
        const content = 'test';
        // @ts-expect-error - Testing runtime validation for invalid type
        expect(() => applyPreprocessToPage(content, 1, [{ type: 'unknownTransform' }])).toThrow(
            'Unknown preprocess transform type',
        );
    });
});
