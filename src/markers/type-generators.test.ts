import { describe, it, expect } from 'bun:test';
import type { MarkerConfig } from '../types.js';
import {
    generatePatternRegex,
    generateBabRegex,
    generateHadithChainRegex,
    generateBasmalaRegex,
    generatePhraseRegex,
    generateSquareBracketRegex,
    generateNumLetterRegex,
    generateNumParenRegex,
    generateNumSlashRegex,
    generateNumberedRegex,
    generateBulletRegex,
    generateHeadingRegex,
} from './type-generators.js';

describe('type-generators', () => {
    describe('generatePatternRegex', () => {
        it('should generate regex from template', () => {
            const config: MarkerConfig = {
                type: 'pattern',
                template: '{num} {dash}',
            };
            const regex = generatePatternRegex(config);

            expect(regex).toBeInstanceOf(RegExp);
            const match = regex.exec('٥ - نص');
            expect(match).not.toBeNull();
        });

        it('should generate regex from pattern when no template provided', () => {
            const config: MarkerConfig = {
                type: 'pattern',
                pattern: '^test',
            };
            const regex = generatePatternRegex(config);

            expect(regex).toBeInstanceOf(RegExp);
            const match = regex.exec('test content');
            expect(match).not.toBeNull();
        });

        it('should use custom tokens when provided', () => {
            const config: MarkerConfig = {
                type: 'pattern',
                template: '{custom}',
                tokens: {
                    custom: 'TEST',
                },
            };
            const regex = generatePatternRegex(config);

            const match = regex.exec('TEST content');
            expect(match).not.toBeNull();
        });

        it('should throw error when neither template nor pattern provided', () => {
            const config: MarkerConfig = {
                type: 'pattern',
            };

            expect(() => generatePatternRegex(config)).toThrow(
                'pattern marker must provide either a template or pattern'
            );
        });
    });

    describe('generateBabRegex', () => {
        it('should match باب without diacritics', () => {
            const regex = generateBabRegex();
            const match = regex.exec('باب الصلاة');

            expect(match).not.toBeNull();
            expect(match!.groups!.marker.trim()).toBe('باب');
            expect(match!.groups!.content.trim()).toBe('الصلاة');
        });

        it('should match بَابُ with diacritics', () => {
            const regex = generateBabRegex();
            const match = regex.exec('بَابُ الزكاة');

            expect(match).not.toBeNull();
            expect(match!.groups!.marker.trim()).toBe('بَابُ');
            expect(match!.groups!.content.trim()).toBe('الزكاة');
        });

        it('should match بَابٌ with tanween', () => {
            const regex = generateBabRegex();
            const match = regex.exec('بَابٌ في الحج');

            expect(match).not.toBeNull();
            expect(match!.groups!.marker.trim()).toBe('بَابٌ');
            expect(match!.groups!.content.trim()).toBe('في الحج');
        });

        it('should be diacritic-insensitive', () => {
            const regex = generateBabRegex();
            const match1 = regex.exec('باب');
            const match2 = regex.exec('بَابُ');

            expect(match1).not.toBeNull();
            expect(match2).not.toBeNull();
        });
    });

    describe('generateHadithChainRegex', () => {
        it('should use default hadith phrases when none provided', () => {
            const config: MarkerConfig = { type: 'hadith-chain' };
            const regex = generateHadithChainRegex(config);

            const match = regex.exec('حَدَّثَنَا أبو بكر');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('أبو بكر');
        });

        it('should use custom phrases when provided', () => {
            const config: MarkerConfig = {
                type: 'hadith-chain',
                phrases: ['قَالَ', 'رَوَى'],
            };
            const regex = generateHadithChainRegex(config);

            const match = regex.exec('قَالَ الإمام');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('الإمام');
        });

        it('should be diacritic-insensitive for phrases', () => {
            const config: MarkerConfig = {
                type: 'hadith-chain',
                phrases: ['حدثنا'],
            };
            const regex = generateHadithChainRegex(config);

            const match = regex.exec('حَدَّثَنَا test');
            expect(match).not.toBeNull();
        });

        it('should match multiple phrase options', () => {
            const config: MarkerConfig = {
                type: 'hadith-chain',
                phrases: ['حَدَّثَنَا', 'أَخْبَرَنَا'],
            };
            const regex = generateHadithChainRegex(config);

            const match1 = regex.exec('حَدَّثَنَا محمد');
            const match2 = regex.exec('أَخْبَرَنَا علي');

            expect(match1).not.toBeNull();
            expect(match2).not.toBeNull();
        });
    });

    describe('generateBasmalaRegex', () => {
        it('should match بسم الله', () => {
            const regex = generateBasmalaRegex();
            const match = regex.exec('بسم الله الرحمن الرحيم');

            expect(match).not.toBeNull();
            expect(match!.groups!.marker).toContain('بسم الله');
        });

        it('should match بِسْمِ اللَّهِ with diacritics', () => {
            const regex = generateBasmalaRegex();
            const match = regex.exec('بِسْمِ اللَّهِ الرَّحْمَٰنِ');

            expect(match).not.toBeNull();
        });

        it('should be diacritic-insensitive', () => {
            const regex = generateBasmalaRegex();
            const match1 = regex.exec('بسم الله');
            const match2 = regex.exec('بِسْمِ اللَّهِ');

            expect(match1).not.toBeNull();
            expect(match2).not.toBeNull();
        });
    });

    describe('generatePhraseRegex', () => {
        it('should generate regex with custom phrases', () => {
            const config: MarkerConfig = {
                type: 'phrase',
                phrases: ['قَالَ', 'ذَكَرَ'],
            };
            const regex = generatePhraseRegex(config);

            const match = regex.exec('قَالَ المفسر');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('المفسر');
        });

        it('should match multiple phrase options', () => {
            const config: MarkerConfig = {
                type: 'phrase',
                phrases: ['فَائِدَةٌ', 'مَسْأَلَةٌ'],
            };
            const regex = generatePhraseRegex(config);

            const match1 = regex.exec('فَائِدَةٌ مهمة');
            const match2 = regex.exec('مَسْأَلَةٌ عقدية');

            expect(match1).not.toBeNull();
            expect(match2).not.toBeNull();
        });

        it('should throw error when phrases array is empty', () => {
            const config: MarkerConfig = {
                type: 'phrase',
                phrases: [],
            };

            expect(() => generatePhraseRegex(config)).toThrow(
                'phrase marker requires phrases array'
            );
        });

        it('should throw error when phrases is undefined', () => {
            const config: MarkerConfig = {
                type: 'phrase',
            };

            expect(() => generatePhraseRegex(config)).toThrow(
                'phrase marker requires phrases array'
            );
        });

        it('should be diacritic-insensitive', () => {
            const config: MarkerConfig = {
                type: 'phrase',
                phrases: ['قال'],
            };
            const regex = generatePhraseRegex(config);

            const match = regex.exec('قَالَ test');
            expect(match).not.toBeNull();
        });
    });

    describe('generateSquareBracketRegex', () => {
        it('should match [٦٥] pattern', () => {
            const regex = generateSquareBracketRegex();
            const match = regex.exec('[٦٥] نص الحديث');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص الحديث');
        });

        it('should match • [٦٥] pattern with bullet', () => {
            const regex = generateSquareBracketRegex();
            const match = regex.exec('• [٦٥] نص');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match ° [٦٥] pattern with degree bullet', () => {
            const regex = generateSquareBracketRegex();
            const match = regex.exec('° [٦٥] نص');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match with spaces', () => {
            const regex = generateSquareBracketRegex();
            const match = regex.exec('• [٦٥]  نص مع مسافات');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص مع مسافات');
        });
    });

    describe('generateNumLetterRegex', () => {
        it('should match with arabic-indic numbering and dash separator', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumLetterRegex(config);

            const match = regex.exec('٥ أ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match with latin numbering', () => {
            const config = {
                numbering: 'latin' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumLetterRegex(config);

            const match = regex.exec('5 أ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match with dot separator', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dot' as const,
            };
            const regex = generateNumLetterRegex(config);

            const match = regex.exec('٥ أ. نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match different Arabic letters', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumLetterRegex(config);

            const match1 = regex.exec('٥ أ - نص');
            const match2 = regex.exec('٦ ب - نص آخر');

            expect(match1).not.toBeNull();
            expect(match2).not.toBeNull();
        });
    });

    describe('generateNumParenRegex', () => {
        it('should match with arabic-indic numbering and dash separator', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumParenRegex(config);

            const match = regex.exec('٥ (أ) - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match with latin numbering', () => {
            const config = {
                numbering: 'latin' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumParenRegex(config);

            const match = regex.exec('5 (أ) - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match with multiple characters in parentheses', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumParenRegex(config);

            const match = regex.exec('٥ (أبج) - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match with numbers in parentheses', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumParenRegex(config);

            const match = regex.exec('٥ (٦) - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });
    });

    describe('generateNumSlashRegex', () => {
        it('should match number/number pattern', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumSlashRegex(config);

            const match = regex.exec('٥/٦ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match single number without slash', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumSlashRegex(config);

            const match = regex.exec('٥ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match with latin numbering', () => {
            const config = {
                numbering: 'latin' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumSlashRegex(config);

            const match = regex.exec('5/6 - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should match with spaces around slash', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumSlashRegex(config);

            const match = regex.exec('٥ / ٦ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });
    });

    describe('generateNumberedRegex', () => {
        it('should generate regex with format template', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
                format: '{bullet}+ {num} {dash}',
            };
            const regex = generateNumberedRegex(config);

            const match = regex.exec('• ٥ - نص');
            expect(match).not.toBeNull();
        });

        it('should use custom tokens with format', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
                format: '{custom} {num}',
                tokens: {
                    custom: 'TEST',
                },
            };
            const regex = generateNumberedRegex(config);

            const match = regex.exec('TEST ٥ content');
            expect(match).not.toBeNull();
        });

        it('should generate default numbered pattern with dash separator', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumberedRegex(config);

            const match = regex.exec('٥ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should generate pattern with dot separator', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'dot' as const,
            };
            const regex = generateNumberedRegex(config);

            const match = regex.exec('٥. نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should generate pattern with colon separator', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'colon' as const,
            };
            const regex = generateNumberedRegex(config);

            const match = regex.exec('٥: نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should generate pattern with paren separator', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'paren' as const,
            };
            const regex = generateNumberedRegex(config);

            const match = regex.exec('٥) نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should handle none separator', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: 'none' as const,
            };
            const regex = generateNumberedRegex(config);

            const match = regex.exec('٥ نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should handle custom separator string', () => {
            const config = {
                numbering: 'arabic-indic' as const,
                separator: '\\|',
            };
            const regex = generateNumberedRegex(config);

            const match = regex.exec('٥ | نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should work with latin numbering', () => {
            const config = {
                numbering: 'latin' as const,
                separator: 'dash' as const,
            };
            const regex = generateNumberedRegex(config);

            const match = regex.exec('5 - text');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('text');
        });
    });

    describe('generateBulletRegex', () => {
        it('should match • bullet', () => {
            const regex = generateBulletRegex();
            const match = regex.exec('• نقطة');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نقطة');
        });

        it('should match * asterisk', () => {
            const regex = generateBulletRegex();
            const match = regex.exec('* نقطة');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نقطة');
        });

        it('should match ° degree bullet', () => {
            const regex = generateBulletRegex();
            const match = regex.exec('° نقطة');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نقطة');
        });

        it('should match - dash bullet', () => {
            const regex = generateBulletRegex();
            const match = regex.exec('- نقطة');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نقطة');
        });

        it('should match with space after bullet', () => {
            const regex = generateBulletRegex();
            const match = regex.exec('•  نقطة مع مسافات');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نقطة مع مسافات');
        });
    });

    describe('generateHeadingRegex', () => {
        it('should match # single heading', () => {
            const regex = generateHeadingRegex();
            const match = regex.exec('# عنوان');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('عنوان');
        });

        it('should match ## double heading', () => {
            const regex = generateHeadingRegex();
            const match = regex.exec('## عنوان فرعي');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('عنوان فرعي');
        });

        it('should match ### triple heading', () => {
            const regex = generateHeadingRegex();
            const match = regex.exec('### عنوان فرعي فرعي');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('عنوان فرعي فرعي');
        });

        it('should match with space after hashes', () => {
            const regex = generateHeadingRegex();
            const match = regex.exec('##  عنوان مع مسافات');

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('عنوان مع مسافات');
        });
    });
});
