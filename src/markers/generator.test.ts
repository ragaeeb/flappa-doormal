import { describe, it, expect } from 'bun:test';
import { generateRegexFromMarker } from './generator.js';
import type { MarkerConfig } from '../types.js';

describe('generateRegexFromMarker', () => {
    describe('basic types', () => {
        it('should generate regex for numbered markers', () => {
            const config: MarkerConfig = { type: 'numbered' };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('٥ - نص الحديث');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص الحديث');
        });

        it('should generate regex for bullet markers', () => {
            const config: MarkerConfig = { type: 'bullet' };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('• نقطة');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نقطة');
        });

        it('should generate regex for pattern markers with template', () => {
            const config: MarkerConfig = {
                type: 'pattern',
                template: '{num} {dash}',
            };
            const regex = generateRegexFromMarker(config);
            
            const match = regex.exec('٥ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });
    });

    describe('preset types', () => {
        it('should generate regex for bab markers', () => {
            const config: MarkerConfig = { type: 'bab' };
            const regex = generateRegexFromMarker(config);
            
            const match = regex.exec('باب الصلاة');
            expect(match).not.toBeNull();
            // Preset types keep marker in full group
            expect(match!.groups!.full.trim()).toBe('باب الصلاة');
            expect(match!.groups!.marker.trim()).toBe('باب');
            expect(match!.groups!.content.trim()).toBe('الصلاة');
        });

        it('should handle diacritics in bab', () => {
            const config: MarkerConfig = { type: 'bab' };
            const regex = generateRegexFromMarker(config);
            
            const match = regex.exec('بَابُ الزكاة');
            expect(match).not.toBeNull();
            expect(match!.groups!.full.trim()).toBe('بَابُ الزكاة');
            expect(match!.groups!.marker.trim()).toBe('بَابُ');
            expect(match!.groups!.content.trim()).toBe('الزكاة');
        });

        it('should generate regex for hadith-chain', () => {
            const config: MarkerConfig = { type: 'hadith-chain' };
            const regex = generateRegexFromMarker(config);
            
            const match = regex.exec('حَدَّثَنَا أبوبكر');
            expect(match).not.toBeNull();
            expect(match!.groups!.full.trim()).toBe('حَدَّثَنَا أبوبكر');
            expect(match!.groups!.marker.trim()).toBe('حَدَّثَنَا');
            expect(match!.groups!.content.trim()).toBe('أبوبكر');
        });

        it('should generate regex for basmala', () => {
            const config: MarkerConfig = { type: 'basmala' };
            const regex = generateRegexFromMarker(config);
            
            const match = regex.exec('بسم الله الرحمن');
            expect(match).not.toBeNull();
            expect(match!.groups!.full.trim()).toBe('بسم الله الرحمن');
            expect(match!.groups!.marker).toContain('بسم الله');
            expect(match!.groups!.content.trim()).toBe('الرحمن');
        });

        it('should generate regex for square-bracket', () => {
            const config: MarkerConfig = { type: 'square-bracket' };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('[٦٥] نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });
    });

    describe('numbered variants', () => {
        it('should generate regex for num-letter', () => {
            const config: MarkerConfig = { type: 'num-letter' };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('٥ أ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should generate regex for num-paren', () => {
            const config: MarkerConfig = { type: 'num-paren' };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('٥ (أ) - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should generate regex for num-slash', () => {
            const config: MarkerConfig = { type: 'num-slash' };
            const regex = generateRegexFromMarker(config);

            let match = regex.exec('٥/٦ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');

            // Should also match single number
            match = regex.exec('٧ - نص آخر');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص آخر');
        });
    });

    describe('capture groups', () => {
        it('should provide full, marker, and content groups', () => {
            const config: MarkerConfig = { type: 'numbered' };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('١ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.full.trim()).toBe('١ - نص');
            expect(match!.groups!.marker).toContain('١');
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should allow extracting marker for metadata', () => {
            const config: MarkerConfig = { type: 'numbered' };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('٥ - نص');
            expect(match).not.toBeNull();
            // Can extract number from marker for indexing
            const markerText = match!.groups!.marker;
            expect(markerText).toContain('٥');
        });
    });

    describe('format templates', () => {
        it('should handle format templates', () => {
            const config: MarkerConfig = {
                type: 'numbered',
                format: '{bullet}+ {num} {dash}',
            };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('• ٥ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should handle with-letter format', () => {
            const config: MarkerConfig = {
                type: 'numbered',
                format: '{num} {letter} {dash}',
            };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('٥ أ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });

        it('should handle with-slash format', () => {
            const config: MarkerConfig = {
                type: 'numbered',
                format: '{num}(?:{s}/{s}{num})?{s}{dash}',
            };
            const regex = generateRegexFromMarker(config);

            let match = regex.exec('٥/٦ - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');

            match = regex.exec('٧ - نص آخر');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص آخر');
        });

        it('should handle with-parentheses format', () => {
            const config: MarkerConfig = {
                type: 'numbered',
                format: '{num}{s}\\({letter}\\){s}{dash}',
            };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('٥ (أ) - نص');
            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('نص');
        });
    });

    describe('raw pattern field', () => {
        it('should handle raw regex patterns with named groups', () => {
            const config: MarkerConfig = {
                type: 'pattern',
                pattern: '^(?<full>(?<marker>CUSTOM:)(?<content>.*))',
            };
            const regex = generateRegexFromMarker(config);

            const match = regex.exec('CUSTOM: Some text');
            expect(match).not.toBeNull();
            expect(match!.groups!.full).toBe('CUSTOM: Some text');
            expect(match!.groups!.marker).toBe('CUSTOM:');
            expect(match!.groups!.content.trim()).toBe('Some text');
        });
    });
});

