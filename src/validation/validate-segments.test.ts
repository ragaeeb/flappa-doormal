import { describe, expect, it } from 'bun:test';
import { type Page, type Segment, validateSegments } from '@/index';

describe('validateSegments', () => {
    it('should return ok for valid single-page attribution', () => {
        const pages: Page[] = [
            { content: 'Alpha content here.', id: 0 },
            { content: 'Beta content here.', id: 1 },
        ];
        const segments: Segment[] = [
            { content: 'Alpha content', from: 0 },
            { content: 'Beta content', from: 1 },
        ];

        const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

        expect(report.ok).toBe(true);
        expect(report.issues).toHaveLength(0);
        expect(report.summary.segmentCount).toBe(2);
        expect(report.summary.pageCount).toBe(2);
    });

    it('should report maxPages violations when a segment spans pages', () => {
        const pages: Page[] = [
            { content: 'Alpha content here.', id: 0 },
            { content: 'Beta content here.', id: 1 },
        ];
        const segments: Segment[] = [{ content: 'Alpha content here.\nBeta content here.', from: 0, to: 1 }];

        const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

        expect(report.ok).toBe(false);
        expect(report.issues[0]?.type).toBe('max_pages_violation');
        expect(report.issues[0]?.severity).toBe('error');
    });

    it('should report page attribution mismatch when content is on a different page', () => {
        const pages: Page[] = [
            { content: 'Alpha content here.', id: 0 },
            { content: 'Beta content here.', id: 1 },
        ];
        const segments: Segment[] = [{ content: 'Beta content', from: 0 }];

        const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

        expect(report.ok).toBe(false);
        expect(report.issues[0]?.type).toBe('page_attribution_mismatch');
        expect(report.issues[0]?.expected?.from).toBe(1);
        expect(report.issues[0]?.actual?.from).toBe(0);
    });

    it('should report content not found when segment content is missing', () => {
        const pages: Page[] = [
            { content: 'Alpha content here.', id: 0 },
            { content: 'Beta content here.', id: 1 },
        ];
        const segments: Segment[] = [{ content: 'Gamma content', from: 0 }];

        const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

        expect(report.ok).toBe(false);
        expect(report.issues[0]?.type).toBe('content_not_found');
    });

    it('should warn on ambiguous attribution when content appears on multiple pages', () => {
        const pages: Page[] = [
            { content: 'Same content here.', id: 0 },
            { content: 'Same content here.', id: 1 },
        ];
        const segments: Segment[] = [{ content: 'Same content', from: 0 }];

        const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

        expect(report.ok).toBe(false);
        expect(report.issues[0]?.type).toBe('ambiguous_attribution');
        expect(report.issues[0]?.severity).toBe('warn');
    });

    it('should detect maxPages violation when content only matches joined pages', () => {
        const pages: Page[] = [
            { content: 'Alpha', id: 0 },
            { content: 'Beta', id: 1 },
        ];
        const segments: Segment[] = [{ content: 'Alpha Beta', from: 0 }];

        const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

        expect(report.ok).toBe(false);
        expect(report.issues[0]?.type).toBe('max_pages_violation');
    });
});
