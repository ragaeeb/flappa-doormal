import { describe, expect, it } from 'bun:test';
import { buildWordsRegex } from './breakpoint-utils.js';
import { segmentPages } from './segmenter.js';

describe('Debug Metadata Tracking', () => {
    describe('breakpoint wordIndex bug', () => {
        it('should assign correct index when empty words are filtered out', () => {
            const words = [' ', 'valid'];
            // Index 0: ' ' matches nothing useful or is trimmed to empty
            // Index 1: 'valid'

            const processor = (p: string) => p;
            const regexSource = buildWordsRegex(words, processor);

            // Assert the regex uses _w1, not _w0
            // Correct behavior: _w1 corresponds to index 1 ('valid')
            // Buggy behavior: _w0 would be assigned because it's the "0-th" item in processed array
            expect(regexSource).toContain('(?<_w1>valid)');
        });
    });

    describe('Rule array indexing', () => {
        it('should track index in lineStartsWith array', () => {
            const pages = [{ content: 'B content', id: 1 }];
            const segments = segmentPages(pages, {
                debug: true,
                rules: [{ lineStartsWith: ['A', 'B'], split: 'at' }],
            });

            const debug = segments[0].meta?._flappa?.rule;
            expect(debug).toBeDefined();
            expect(debug?.wordIndex).toBe(1); // Index of 'B'
            expect(debug?.word).toBe('B');
            expect(debug?.patternType).toBe('lineStartsWith');
        });

        it('should track index in lineStartsAfter array', () => {
            const pages = [{ content: 'Marker2 content', id: 1 }];
            const segments = segmentPages(pages, {
                debug: true,
                rules: [{ lineStartsAfter: ['Marker1 ', 'Marker2 '], split: 'at' }],
            });

            const debug = segments[0].meta?._flappa?.rule;
            expect(debug).toBeDefined();
            expect(debug?.wordIndex).toBe(1); // Index of 'Marker2 '
            expect(debug?.word).toBe('Marker2 ');
        });
    });
});
