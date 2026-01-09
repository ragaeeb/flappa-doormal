import { describe, expect, it } from 'bun:test';
import type { Page } from '@/types/index.js';
import { applyReplacements } from './replace.js';

describe('Replacements', () => {
    it('should apply simple string replacements', () => {
        const pages: Page[] = [{ content: 'Hello World', id: 1 }];
        const replacements = [{ regex: 'World', replacement: 'Universe' }];
        const result = applyReplacements(pages, replacements);
        expect(result[0].content).toBe('Hello Universe');
    });

    it('should apply multiple replacements', () => {
        const pages: Page[] = [{ content: 'Hello World', id: 1 }];
        const replacements = [
            { regex: 'Hello', replacement: 'Hi' },
            { regex: 'World', replacement: 'Universe' },
        ];
        const result = applyReplacements(pages, replacements);
        expect(result[0].content).toBe('Hi Universe');
    });

    it('should apply replacements across all pages by default', () => {
        const pages: Page[] = [
            { content: 'Marker here', id: 1 },
            { content: 'Another marker', id: 2 },
        ];
        const replacements = [{ regex: 'marker', replacement: 'found' }];
        const result = applyReplacements(pages, replacements);
        expect(result[0].content).toBe('Marker here'); // Case sensitive default
        expect(result[1].content).toBe('Another found');
    });

    it('should respect case-insensitive flag', () => {
        const pages: Page[] = [{ content: 'Marker marker', id: 1 }];
        const replacements = [{ flags: 'i', regex: 'marker', replacement: 'found' }];
        const result = applyReplacements(pages, replacements);
        expect(result[0].content).toBe('found found');
    });

    it('should filter by pageIdSet', () => {
        const pages: Page[] = [
            { content: 'Replace me', id: 1 },
            { content: 'Replace me', id: 2 },
        ];
        const replacements = [{ pageIds: [1], regex: 'Replace me', replacement: 'Done' }];
        const result = applyReplacements(pages, replacements);
        expect(result[0].content).toBe('Done');
        expect(result[1].content).toBe('Replace me');
    });

    it('should handle empty pageId list (skip rule)', () => {
        const pages: Page[] = [{ content: 'Replace me', id: 1 }];
        const replacements = [{ pageIds: [], regex: 'Replace me', replacement: 'Done' }];
        const result = applyReplacements(pages, replacements);
        expect(result[0].content).toBe('Replace me');
    });
});
