import { describe, expect, it } from 'bun:test';
import type { Page } from './types.js';
import { applyReplacements } from './replace.js';

describe('replace', () => {
    it('should do nothing when rules are undefined', () => {
        const pages: Page[] = [{ content: 'abc', id: 1 }];
        expect(applyReplacements(pages, undefined)).toEqual(pages);
    });

    it('should do nothing when rules are empty', () => {
        const pages: Page[] = [{ content: 'abc', id: 1 }];
        expect(applyReplacements(pages, [])).toEqual(pages);
    });

    it('should apply defaults (gu) and replace globally', () => {
        const pages: Page[] = [{ content: 'aba', id: 1 }];
        const out = applyReplacements(pages, [{ regex: 'a', replacement: 'X' }]);
        expect(out).toEqual([{ content: 'XbX', id: 1 }]);
    });

    it('should treat unescaped "." as regex-any-char and escaped "\\\\." as a literal dot', () => {
        const pages: Page[] = [{ content: 'a.c', id: 1 }];
        const out1 = applyReplacements(pages, [{ regex: '.', replacement: 'x' }]);
        expect(out1).toEqual([{ content: 'xxx', id: 1 }]);

        // Note: in JS/TS source this is written as '\\.' (JSON would require \"\\\\.\").
        const out2 = applyReplacements(pages, [{ regex: '\\.', replacement: 'x' }]);
        expect(out2).toEqual([{ content: 'axc', id: 1 }]);
    });

    it('should allow optional flags and still enforce g+u', () => {
        const pages: Page[] = [{ content: 'AaA', id: 1 }];
        const out = applyReplacements(pages, [{ flags: 'i', regex: 'a', replacement: 'x' }]);
        expect(out).toEqual([{ content: 'xxx', id: 1 }]);
    });

    it('should support m flag for per-line anchors', () => {
        const pages: Page[] = [{ content: 'a\nb\na', id: 1 }];
        const out = applyReplacements(pages, [{ flags: 'm', regex: '^a', replacement: 'X' }]);
        expect(out).toEqual([{ content: 'X\nb\nX', id: 1 }]);
    });

    it('should throw for invalid flags', () => {
        const pages: Page[] = [{ content: 'abc', id: 1 }];
        expect(() => applyReplacements(pages, [{ flags: 'q', regex: 'a', replacement: 'x' }])).toThrow(
            /Invalid replace regex flag/,
        );
    });

    it('should apply to all pages when pageIds is omitted', () => {
        const pages: Page[] = [
            { content: 'a', id: 1 },
            { content: 'a', id: 2 },
        ];
        const out = applyReplacements(pages, [{ regex: 'a', replacement: 'x' }]);
        expect(out).toEqual([
            { content: 'x', id: 1 },
            { content: 'x', id: 2 },
        ]);
    });

    it('should apply to no pages when pageIds is empty', () => {
        const pages: Page[] = [
            { content: 'a', id: 1 },
            { content: 'a', id: 2 },
        ];
        const out = applyReplacements(pages, [{ pageIds: [], regex: 'a', replacement: 'x' }]);
        expect(out).toEqual(pages);
    });

    it('should apply to a single page id when pageIds has one value', () => {
        const pages: Page[] = [
            { content: 'a', id: 1 },
            { content: 'a', id: 2 },
        ];
        const out = applyReplacements(pages, [{ pageIds: [2], regex: 'a', replacement: 'x' }]);
        expect(out).toEqual([
            { content: 'a', id: 1 },
            { content: 'x', id: 2 },
        ]);
    });

    it('should apply to multiple page ids when pageIds has multiple values', () => {
        const pages: Page[] = [
            { content: 'a', id: 1 },
            { content: 'a', id: 2 },
            { content: 'a', id: 3 },
        ];
        const out = applyReplacements(pages, [{ pageIds: [1, 3], regex: 'a', replacement: 'x' }]);
        expect(out).toEqual([
            { content: 'x', id: 1 },
            { content: 'a', id: 2 },
            { content: 'x', id: 3 },
        ]);
    });

    it('should apply rules in order', () => {
        const pages: Page[] = [{ content: 'ab', id: 1 }];
        const out = applyReplacements(pages, [
            { regex: 'ab', replacement: 'cd' },
            { regex: 'cd', replacement: 'EF' },
        ]);
        expect(out).toEqual([{ content: 'EF', id: 1 }]);
    });
});


