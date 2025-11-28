import { describe, it, expect } from 'bun:test';
import { generateRegexFromMarker } from './generator.js';
import type { MarkerConfig } from '../types.js';

describe('Complex Musnad Ahmad Patterns', () => {
    describe('Pattern 1: Comma-separated numerals', () => {
        it('should match comma-separated Arabic numerals followed by dash', () => {
            // Pattern: ٩٩٣٦، ٩٩٣٧ - حَدَّثَنَا عَبْدُ الرَّحْمَنِ، قَالَ:
            const config: MarkerConfig = {
                type: 'pattern',
                template: '{num}(?:،{s}{num})*{s}{dash}',
                removeMarker: true, // Remove the numeral+comma pattern
            };
            const regex = generateRegexFromMarker(config);

            const text = '٩٩٣٦، ٩٩٣٧ - حَدَّثَنَا عَبْدُ الرَّحْمَنِ، قَالَ:';
            const match = regex.exec(text);

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('حَدَّثَنَا عَبْدُ الرَّحْمَنِ، قَالَ:');
        });

        it('should also match single numeral', () => {
            const config: MarkerConfig = {
                type: 'pattern',
                template: '{num}(?:،{s}{num})*{s}{dash}',
                removeMarker: true,
            };
            const regex = generateRegexFromMarker(config);

            const text = '٩٩٣٦ - حَدَّثَنَا';
            const match = regex.exec(text);

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('حَدَّثَنَا');
        });
    });

    describe('Pattern 2: Number slash letter', () => {
        it('should match number/letter followed by dash', () => {
            // Pattern: ١١٠٧٣/ أ - حَدَّثَنَا أَبُو مُعَاوِيَةَ
            const config: MarkerConfig = {
                type: 'pattern',
                template: '{num}{s}/{s}{letter}{s}{dash}',
                removeMarker: true,
            };
            const regex = generateRegexFromMarker(config);

            const text = '١١٠٧٣/ أ - حَدَّثَنَا أَبُو مُعَاوِيَةَ، حَدَّثَنَا الْأَعْمَشُ';
            const match = regex.exec(text);

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('حَدَّثَنَا أَبُو مُعَاوِيَةَ، حَدَّثَنَا الْأَعْمَشُ');
        });
    });

    describe('Pattern 3: Simple numbered', () => {
        it('should match basic numbered marker', () => {
            // Pattern: ٢١٠٣٥ - حَدَّثَنَا وَكِيعٌ
            const config: MarkerConfig = {
                type: 'numbered',
            };
            const regex = generateRegexFromMarker(config);

            const text = '٢١٠٣٥ - حَدَّثَنَا وَكِيعٌ';
            const match = regex.exec(text);

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('حَدَّثَنَا وَكِيعٌ');
        });
    });

    describe('Pattern 4 & 5: Number slash number', () => {
        it('should match number/number pattern', () => {
            // Pattern: ١٠٢٦٦ / ١ - "وَإِذَا صَنَعَ خَادِمُ
            const config: MarkerConfig = {
                type: 'num-slash',
            };
            const regex = generateRegexFromMarker(config);

            const text = '١٠٢٦٦ / ١ - "وَإِذَا صَنَعَ خَادِمُ';
            const match = regex.exec(text);

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('"وَإِذَا صَنَعَ خَادِمُ');
        });

        it('should match number/number with longer text', () => {
            const config: MarkerConfig = {
                type: 'num-slash',
            };
            const regex = generateRegexFromMarker(config);

            const text = '١٠٢٦٦ / ١ - "وَإِذَا صَنَعَ خَادِمُ أَحَدِكُمْ';
            const match = regex.exec(text);

            expect(match).not.toBeNull();
            expect(match!.groups!.content.trim()).toBe('"وَإِذَا صَنَعَ خَادِمُ أَحَدِكُمْ');
        });
    });

    describe('Pattern 6: Repeating dots', () => {
        it('should match repeating dot pattern', () => {
            // Pattern: . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
            const config: MarkerConfig = {
                type: 'pattern',
                template: '\\.(?:{s}\\.)+',
            };
            const regex = generateRegexFromMarker(config);

            const text = '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .';
            const match = regex.exec(text);

            expect(match).not.toBeNull();
            // This pattern should match the dots, content would be everything after
        });
    });

    describe('Pattern 7: Asterisk + dots + slash + number', () => {
        it('should match asterisk dots slash number pattern but capture from number', () => {
            // Pattern: *. . . / ٨٦ - حَدَّثَنَا عَبْدُ اللهِ بْنِ مُحَمَّدٍ
            // We want to detect from * but capture from the number
            const config: MarkerConfig = {
                type: 'pattern',
                template: '\\*\\.(?:{s}\\.)*{s}/{s}{num}{s}{dash}',
                removeMarker: false, // Keep everything including *
            };
            const regex = generateRegexFromMarker(config);

            const text = '*. . . / ٨٦ - حَدَّثَنَا عَبْدُ اللهِ بْنِ مُحَمَّدٍ';
            const match = regex.exec(text);

            expect(match).not.toBeNull();
            expect(match![1]).toContain('٨٦');
            expect(match![1]).toContain('حَدَّثَنَا');
        });

        it('should match and capture only from number when removeMarker is true', () => {
            // Alternative: capture only from the number
            const config: MarkerConfig = {
                type: 'pattern',
                pattern: '^\\*\\.(?:\\s?\\.)*\\s?/\\s?([\\u0660-\\u0669]+\\s?[-–—ـ].*)',
            };
            const regex = generateRegexFromMarker(config);

            const text = '*. . . / ٨٦ - حَدَّثَنَا عَبْدُ اللهِ بْنِ مُحَمَّدٍ';
            const match = regex.exec(text);

            expect(match).not.toBeNull();
            expect(match![1]).toBe('٨٦ - حَدَّثَنَا عَبْدُ اللهِ بْنِ مُحَمَّدٍ');
        });
    });
});
