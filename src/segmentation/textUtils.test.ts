import { describe, expect, it } from 'bun:test';
import { normalizeLineEndings, normalizeTitleSpans, stripHtmlTags } from './textUtils.js';

describe('textUtils', () => {
    describe('stripHtmlTags', () => {
        it('should remove simple HTML tags', () => {
            expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello');
        });

        it('should remove self-closing tags', () => {
            expect(stripHtmlTags('Line 1<br/>Line 2')).toBe('Line 1Line 2');
        });

        it('should remove tags with attributes', () => {
            expect(stripHtmlTags('<div class="test">Content</div>')).toBe('Content');
        });

        it('should remove nested tags', () => {
            expect(stripHtmlTags('<div><span>Nested</span></div>')).toBe('Nested');
        });

        it('should handle multiple tags', () => {
            expect(stripHtmlTags('<h1>Title</h1><p>Paragraph</p>')).toBe('TitleParagraph');
        });

        it('should preserve text without tags', () => {
            expect(stripHtmlTags('Plain text')).toBe('Plain text');
        });

        it('should handle empty string', () => {
            expect(stripHtmlTags('')).toBe('');
        });

        it('should handle Arabic text with HTML', () => {
            expect(stripHtmlTags('<p>بسم الله</p>')).toBe('بسم الله');
        });

        it('should remove anchor tags', () => {
            expect(stripHtmlTags('<a href="test">Link</a>')).toBe('Link');
        });
    });

    describe('normalizeLineEndings', () => {
        it('should convert Windows line endings (\\r\\n) to Unix (\\n)', () => {
            expect(normalizeLineEndings('line1\r\nline2')).toBe('line1\nline2');
        });

        it('should convert old Mac line endings (\\r) to Unix (\\n)', () => {
            expect(normalizeLineEndings('line1\rline2')).toBe('line1\nline2');
        });

        it('should preserve Unix line endings (\\n)', () => {
            expect(normalizeLineEndings('line1\nline2')).toBe('line1\nline2');
        });

        it('should handle mixed line endings', () => {
            expect(normalizeLineEndings('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
        });

        it('should handle empty string', () => {
            expect(normalizeLineEndings('')).toBe('');
        });

        it('should handle string without line endings', () => {
            expect(normalizeLineEndings('no line breaks')).toBe('no line breaks');
        });

        it('should handle multiple consecutive Windows line endings', () => {
            expect(normalizeLineEndings('a\r\n\r\nb')).toBe('a\n\nb');
        });

        it('should handle Arabic text with line endings', () => {
            expect(normalizeLineEndings('بسم الله\r\nالرحمن الرحيم')).toBe('بسم الله\nالرحمن الرحيم');
        });
    });

    describe('normalizeTitleSpans', () => {
        const html =
            '<span data-type="title" id=toc-5424>باب الميم </span><span data-type="title" id=toc-5425>من اسمه مُحَمَّد</span>';

        it('should split adjacent title spans onto separate lines', () => {
            const out = normalizeTitleSpans(html, { strategy: 'splitLines' });
            expect(out).toContain('\n');
            expect(out).toContain('toc-5424');
            expect(out).toContain('toc-5425');
        });

        it('should merge adjacent title spans into one title span', () => {
            const out = normalizeTitleSpans(html, { separator: ' — ', strategy: 'merge' });
            expect(out).toContain('data-type="title"');
            // should only have one title span after merge
            expect((out.match(/data-type="title"/g) ?? []).length).toBe(1);
            expect(out).toContain('باب الميم');
            expect(out).toContain('من اسمه مُحَمَّد');
            expect(out).toContain('—');
        });

        it('should convert subsequent adjacent title spans to subtitle for hierarchy', () => {
            const out = normalizeTitleSpans(html, { strategy: 'hierarchy' });
            expect((out.match(/data-type="title"/g) ?? []).length).toBe(1);
            expect((out.match(/data-type="subtitle"/g) ?? []).length).toBe(1);
            expect(out).toContain('\n');
        });
    });
});
