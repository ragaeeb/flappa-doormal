import { describe, expect, it } from 'bun:test';
import { analyzeTextForRule, detectTokenPatterns, generateTemplateFromText, suggestPatternConfig } from './detection';

describe('detection', () => {
    describe('detectTokenPatterns', () => {
        it('should return empty array for empty input', () => {
            expect(detectTokenPatterns('')).toEqual([]);
        });

        it('should detect Arabic-Indic digits as raqms', () => {
            expect(detectTokenPatterns('٣٤')).toEqual([{ endIndex: 2, index: 0, match: '٣٤', token: 'raqms' }]);
        });

        it('should detect single Arabic-Indic digit', () => {
            expect(detectTokenPatterns('٣')).toEqual([{ endIndex: 1, index: 0, match: '٣', token: 'raqms' }]);
        });

        it('should detect dash character', () => {
            expect(detectTokenPatterns(' - ')).toEqual([{ endIndex: 2, index: 1, match: '-', token: 'dash' }]);
        });

        it('should detect numbered pattern with digits and dash', () => {
            expect(detectTokenPatterns('٣٤ - ')).toEqual([
                { endIndex: 5, index: 0, match: '٣٤ - ', token: 'numbered' },
            ]);
        });

        it('should detect basmalah', () => {
            expect(detectTokenPatterns('بسم الله')).toEqual([
                { endIndex: 8, index: 0, match: 'بسم الله', token: 'basmalah' },
            ]);
        });

        it('should detect bab (chapter)', () => {
            expect(detectTokenPatterns('باب')).toEqual([{ endIndex: 3, index: 0, match: 'باب', token: 'bab' }]);
        });

        it('should detect rumuz (source abbreviations)', () => {
            expect(detectTokenPatterns('خت ٤:')).toEqual([{ endIndex: 4, index: 0, match: 'خت ٤', token: 'rumuz' }]);
        });

        it('should detect "دت" as a single rumuz atom (common combined code)', () => {
            expect(detectTokenPatterns('دت عس ق:')).toEqual([
                { endIndex: 7, index: 0, match: 'دت عس ق', token: 'rumuz' },
            ]);
        });

        it('should detect "سن" as a single rumuz atom', () => {
            expect(detectTokenPatterns('سن:')).toEqual([{ endIndex: 2, index: 0, match: 'سن', token: 'rumuz' }]);
        });

        it('should treat "دس" as a rumuz atom within a rumuz block (e.g. "بخ دس ق:")', () => {
            expect(detectTokenPatterns('بخ دس ق:')).toEqual([
                { endIndex: 7, index: 0, match: 'بخ دس ق', token: 'rumuz' },
            ]);
        });

        it('should detect single-letter rumuz like س in "١٥٦ - س:"', () => {
            expect(detectTokenPatterns('١٥٦ - س:')).toEqual([
                { endIndex: 6, index: 0, match: '١٥٦ - ', token: 'numbered' },
                { endIndex: 7, index: 6, match: 'س', token: 'rumuz' },
            ]);
        });

        it('should not detect rumuz letters inside normal Arabic words', () => {
            // Without boundary filtering, rumuz would match common letters inside names.
            const text = 'إِبْرَاهِيم';
            expect(detectTokenPatterns(text)).toEqual([
                { endIndex: 1, index: 0, match: 'إ', token: 'harf' },
                { endIndex: 3, index: 2, match: 'ب', token: 'harf' },
                { endIndex: 5, index: 4, match: 'ر', token: 'harf' },
                { endIndex: 7, index: 6, match: 'ا', token: 'harf' },
                { endIndex: 8, index: 7, match: 'ه', token: 'harf' },
                { endIndex: 10, index: 9, match: 'ي', token: 'harf' },
                { endIndex: 11, index: 10, match: 'م', token: 'harf' },
            ]);
        });

        it('should not overlap detected patterns', () => {
            const result = detectTokenPatterns('٣٤ - حدثنا');
            expect(result).toEqual([
                { endIndex: 5, index: 0, match: '٣٤ - ', token: 'numbered' },
                { endIndex: 10, index: 5, match: 'حدثنا', token: 'naql' },
            ]);
            // Each position should only be covered by one pattern
            const coveredPositions = new Set<number>();
            for (const pattern of result) {
                for (let i = pattern.index; i < pattern.endIndex; i++) {
                    expect(coveredPositions.has(i)).toBe(false);
                    coveredPositions.add(i);
                }
            }
        });

        it('should sort results by position', () => {
            expect(detectTokenPatterns('٣٤ - باب')).toEqual([
                { endIndex: 5, index: 0, match: '٣٤ - ', token: 'numbered' },
                { endIndex: 8, index: 5, match: 'باب', token: 'bab' },
            ]);
        });
    });

    describe('generateTemplateFromText', () => {
        it('should return original text when no patterns detected', () => {
            expect(generateTemplateFromText('hello', [])).toBe('hello');
        });

        it('should return original text for empty input', () => {
            expect(generateTemplateFromText('', [])).toBe('');
        });

        it('should replace detected patterns with tokens', () => {
            const detected = detectTokenPatterns('٣٤');
            const template = generateTemplateFromText('٣٤', detected);
            expect(template).toBe('{{raqms}}');
        });

        it('should preserve non-matched text', () => {
            const text = '٣٤ - hello';
            const detected = detectTokenPatterns(text);
            expect(detected).toEqual([{ endIndex: 5, index: 0, match: '٣٤ - ', token: 'numbered' }]);
            expect(generateTemplateFromText(text, detected)).toBe('{{numbered}}hello');
        });

        it('should generate template using rumuz when present', () => {
            const text = 'خت ٤:';
            const detected = detectTokenPatterns(text);
            expect(detected).toEqual([{ endIndex: 4, index: 0, match: 'خت ٤', token: 'rumuz' }]);
            expect(generateTemplateFromText(text, detected)).toBe('{{rumuz}}:');
        });

        it('should generate a template that includes numbered + rumuz for "١٥٦ - س:"', () => {
            const text = '١٥٦ - س:';
            const detected = detectTokenPatterns(text);
            expect(detected).toEqual([
                { endIndex: 6, index: 0, match: '١٥٦ - ', token: 'numbered' },
                { endIndex: 7, index: 6, match: 'س', token: 'rumuz' },
            ]);
            expect(generateTemplateFromText(text, detected)).toBe('{{numbered}}{{rumuz}}:');
        });
    });

    describe('suggestPatternConfig', () => {
        it('should suggest lineStartsWith with fuzzy for structural tokens', () => {
            const detected = detectTokenPatterns('باب');
            expect(detected).toEqual([{ endIndex: 3, index: 0, match: 'باب', token: 'bab' }]);
            const config = suggestPatternConfig(detected);
            expect(config.patternType).toBe('lineStartsWith');
            expect(config.fuzzy).toBe(true);
        });

        it('should suggest lineStartsAfter for numbered patterns', () => {
            const detected = detectTokenPatterns('٣٤ - ');
            expect(detected).toEqual([{ endIndex: 5, index: 0, match: '٣٤ - ', token: 'numbered' }]);
            const config = suggestPatternConfig(detected);
            expect(config.patternType).toBe('lineStartsAfter');
            expect(config.fuzzy).toBe(false);
        });

        it('should suggest hadith metaType for numbered patterns', () => {
            const detected = detectTokenPatterns('٣٤ - ');
            expect(detected).toEqual([{ endIndex: 5, index: 0, match: '٣٤ - ', token: 'numbered' }]);
            const config = suggestPatternConfig(detected);
            expect(config.metaType).toBe('hadith');
        });

        it('should suggest chapter metaType for bab', () => {
            const detected = detectTokenPatterns('باب');
            expect(detected).toEqual([{ endIndex: 3, index: 0, match: 'باب', token: 'bab' }]);
            const config = suggestPatternConfig(detected);
            expect(config.metaType).toBeDefined();
            expect(['bab', 'chapter']).toContain(config.metaType as string);
        });

        it('should default to lineStartsAfter without fuzzy for unknown patterns', () => {
            const config = suggestPatternConfig([]);
            expect(config.patternType).toBe('lineStartsAfter');
            expect(config.fuzzy).toBe(false);
        });
    });

    describe('analyzeTextForRule', () => {
        it('should return null for text with no detectable patterns', () => {
            // Simple Latin text unlikely to match Arabic patterns
            const result = analyzeTextForRule('hello world');
            expect(result).toBeNull();
        });

        it('should return complete rule config for numbered pattern', () => {
            const result = analyzeTextForRule('٣٤ - ');
            expect(result).not.toBeNull();
            expect(result?.template).toBe('{{numbered}}');
            expect(result?.patternType).toBe('lineStartsAfter');
            expect(result?.detected.length).toBeGreaterThan(0);
        });

        it('should return complete rule config for basmalah', () => {
            const result = analyzeTextForRule('بسم الله');
            expect(result).not.toBeNull();
            expect(result?.template).toBe('{{basmalah}}');
            expect(result?.patternType).toBe('lineStartsWith');
            expect(result?.fuzzy).toBe(true);
        });

        it('should return detected patterns array', () => {
            const result = analyzeTextForRule('٣٤ - ');
            expect(result?.detected).toBeInstanceOf(Array);
            expect(result?.detected).toEqual([{ endIndex: 5, index: 0, match: '٣٤ - ', token: 'numbered' }]);
        });
    });
});
