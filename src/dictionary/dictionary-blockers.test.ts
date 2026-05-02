import { describe, expect, it } from 'bun:test';
import { normalizeStopLemma } from './dictionary-blockers.js';

describe('dictionary blockers', () => {
    describe('normalizeStopLemma', () => {
        it('should strip surrounding punctuation and Arabic diacritics', () => {
            expect(normalizeStopLemma(' «وَقِيلُ»: ')).toBe('وقيل');
        });

        it('should return an empty string for punctuation-only input', () => {
            expect(normalizeStopLemma(' :؛،!? ')).toBe('');
        });
    });
});
