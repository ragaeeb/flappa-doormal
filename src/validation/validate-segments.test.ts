import { describe, expect, it } from 'bun:test';
import { type Page, type Segment, validateSegments } from '@/index';

describe('validateSegments', () => {
    describe('Basic Validation', () => {
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
        });

        it('should return ok when no pages or segments are provided', () => {
            const report = validateSegments([], { maxPages: 0, rules: [] }, []);
            expect(report.ok).toBe(true);
            expect(report.issues).toHaveLength(0);
        });
    });

    describe('Page Existence (page_not_found)', () => {
        it('should report error when segment.from does not exist in input pages', () => {
            const pages: Page[] = [{ content: 'Content', id: 0 }];
            const segments: Segment[] = [{ content: 'Content', from: 999 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            expect(report.issues).toHaveLength(2); // page_not_found + content_not_found
            expect(report.issues.find((i) => i.type === 'page_not_found')).toBeDefined();
            expect(report.issues.find((i) => i.type === 'page_not_found')?.severity).toBe('error');
        });
    });

    describe('Max Pages Violation (max_pages_violation)', () => {
        const pages: Page[] = [
            { content: 'P0', id: 0 },
            { content: 'P1', id: 1 },
            { content: 'P2', id: 2 },
        ];

        it('should enforce maxPages=0 (single page constraint)', () => {
            const segments: Segment[] = [{ content: 'P0\nP1', from: 0, to: 1 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            const issue = report.issues.find((i) => i.type === 'max_pages_violation');
            expect(issue).toBeDefined();
            expect(issue!.evidence).toContain('maxPages=0 requires all segments to stay within one page');
        });

        it('should enforce maxPages > 0', () => {
            const segments: Segment[] = [{ content: 'P0\nP1\nP2', from: 0, to: 2 }];
            const report = validateSegments(pages, { maxPages: 1, rules: [] }, segments);

            expect(report.ok).toBe(false);
            const issue = report.issues.find((i) => i.type === 'max_pages_violation');
            expect(issue).toBeDefined();
            expect(issue!.evidence).toContain('Segment spans 2 pages (maxPages=1)');
        });

        it('should allow segments within maxPages limit', () => {
            const segments: Segment[] = [{ content: 'P0 P1', from: 0, to: 1 }];
            const report = validateSegments(pages, { maxPages: 1, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should handle undefined maxPages (no limit)', () => {
            // Ensure segment content matches joined content (default space joiner)
            const segments: Segment[] = [{ content: 'P0 P1 P2', from: 0, to: 2 }];
            const report = validateSegments(pages, { maxPages: undefined, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should ignore maxPages check if segment.to is undefined', () => {
            const segments: Segment[] = [{ content: 'P0', from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });
    });

    describe('Attribution Mismatch (page_attribution_mismatch)', () => {
        const pages: Page[] = [
            { content: 'Unique content A', id: 10 },
            { content: 'Unique content B', id: 20 },
            { content: 'Unique content C', id: 30 },
        ];

        it('should report mismatch when content belongs to a different single page', () => {
            const segments: Segment[] = [{ content: 'Unique content B', from: 10 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            const issue = report.issues.find((i) => i.type === 'page_attribution_mismatch');
            expect(issue).toBeDefined();
            expect(issue!.expected?.from).toBe(20);
            expect(issue!.actual.from).toBe(10);
        });

        it('should report mismatch when content belongs to multiple pages but none include segment.from', () => {
            const dupPages = [
                { content: 'Duplicated', id: 10 },
                { content: 'Duplicated', id: 20 },
                { content: 'Other', id: 30 },
            ];
            const segments: Segment[] = [{ content: 'Duplicated', from: 30 }];
            const report = validateSegments(dupPages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            const issue = report.issues.find((i) => i.type === 'page_attribution_mismatch');
            expect(issue).toBeDefined();
            // New logic reports the first found location
            expect(issue!.evidence).toContain('Content found in joined content at page 10');
        });

        it('should allow valid attribution when content is duplicated but one match corresponds to segment.from', () => {
            const dupPages = [
                { content: 'Duplicated', id: 10 },
                { content: 'Duplicated', id: 20 },
            ];
            const segments: Segment[] = [{ content: 'Duplicated', from: 20 }];
            const report = validateSegments(dupPages, { maxPages: 0, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });
    });

    describe('Content Not Found (content_not_found)', () => {
        const pages: Page[] = [{ content: 'Some text', id: 0 }];

        it('should report error when content matches nowhere', () => {
            const segments: Segment[] = [{ content: 'Missing text', from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            expect(report.issues[0].type).toBe('content_not_found');
        });

        it('should fallback to joined content search if per-page search fails', () => {
            // This tests the path where findContentMatches returns empty, so it goes to getJoinedAttributionIssues
            const splitPages = [
                { content: 'Hel', id: 0 },
                { content: 'lo', id: 1 },
            ];
            const segments: Segment[] = [{ content: 'Hel lo', from: 0, to: 1 }];
            const report = validateSegments(splitPages, { maxPages: 1, rules: [] }, segments);

            // MaxPages=1 with span 1 is valid, and content matches joined string.
            expect(report.ok).toBe(true);
        });

        it('should fail joined search if content is truly missing', () => {
            const segments: Segment[] = [{ content: 'Bye', from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            expect(report.issues[0].type).toBe('content_not_found');
        });
    });

    describe('Joined Content Attribution Issues', () => {
        it('should report page_attribution_mismatch for joined content', () => {
            const pages = [
                { content: 'He', id: 0 },
                { content: 'llo', id: 1 },
                { content: 'Wo', id: 2 },
                { content: 'rld', id: 3 },
            ];
            // "He llo" is at 0-1 (space joiner). Segment claims from=2.
            const segments: Segment[] = [{ content: 'He llo', from: 2, to: 3 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            const issue = report.issues.find((i) => i.type === 'page_attribution_mismatch');
            expect(issue).toBeDefined();
            expect(issue!.expected?.from).toBe(0);
        });

        it('should report max_pages_violation for joined content when maxPages=0', () => {
            const pages = [
                { content: 'He', id: 0 },
                { content: 'llo', id: 1 },
            ];
            const segments: Segment[] = [{ content: 'He llo', from: 0, to: 1 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            // maxPages=0 violation check: getJoinedAttributionIssues should flag it if static check passes?
            // But static check runs first.
            // We can bypass static check by setting segment.to = segment.from but content implies spanning?
            // No, if segment.to == segment.from, maxPages check passes.
            // Then we find it spans in content. getJoinedAttributionIssues flags it.

            const segmentsTrick = [{ content: 'He llo', from: 0 }]; // Implicitly to=0
            const report2 = validateSegments(pages, { maxPages: 0, rules: [] }, segmentsTrick);

            const issue = report2.issues.find((i) => i.type === 'max_pages_violation');
            expect(issue).toBeDefined();
            expect(issue!.evidence).toContain('Segment spans pages 0-1');
        });
    });

    describe('Normalization & Preprocessing', () => {
        it('should handle newline normalization', () => {
            const pages = [{ content: 'Line\r\nBreak', id: 0 }];
            const segments = [{ content: 'Line\nBreak', from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should apply preprocessing options', () => {
            const pages = [{ content: 'ZeroWidth\u200BSpace', id: 0 }];
            // validation applies preprocessing before check.
            // If we preprocess removeZeroWidth, content becomes 'ZeroWidthSpace'.
            // If segment has 'ZeroWidthSpace', it matches.
            const segments = [{ content: 'ZeroWidthSpace', from: 0 }];
            const report = validateSegments(
                pages,
                {
                    maxPages: 0,
                    preprocess: ['removeZeroWidth'],
                    rules: [],
                },
                segments,
            );
            expect(report.ok).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty segment content as not found', () => {
            const pages: Page[] = [{ content: 'Some content', id: 0 }];
            const segments: Segment[] = [{ content: '', from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            // Empty content returns no matches, so it's treated as not found
            expect(report.ok).toBe(false);
            expect(report.issues[0]?.type).toBe('content_not_found');
        });

        it('should handle single character segments', () => {
            const pages: Page[] = [{ content: 'ABC', id: 0 }];
            const segments: Segment[] = [{ content: 'B', from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should handle very long segment content', () => {
            const longContent = 'A'.repeat(1000);
            const pages: Page[] = [{ content: longContent, id: 0 }];
            const segments: Segment[] = [{ content: longContent, from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should handle segment content at page boundaries', () => {
            const pages: Page[] = [
                { content: 'End', id: 0 },
                { content: 'Start', id: 1 },
            ];
            // Content spans across boundary (default space joiner)
            const segments: Segment[] = [{ content: 'End Start', from: 0, to: 1 }];
            const report = validateSegments(pages, { maxPages: 1, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should handle non-sequential page IDs', () => {
            const pages: Page[] = [
                { content: 'First', id: 100 },
                { content: 'Second', id: 500 },
                { content: 'Third', id: 1000 },
            ];
            const segments: Segment[] = [{ content: 'Second', from: 500 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should handle newline joiner option', () => {
            const pages: Page[] = [
                { content: 'Line1', id: 0 },
                { content: 'Line2', id: 1 },
            ];
            const segments: Segment[] = [{ content: 'Line1\nLine2', from: 0, to: 1 }];
            const report = validateSegments(pages, { maxPages: 1, pageJoiner: 'newline', rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should validate many segments efficiently', () => {
            const pages: Page[] = Array.from({ length: 100 }, (_, i) => ({
                content: `Page ${i} content here`,
                id: i,
            }));
            const segments: Segment[] = Array.from({ length: 100 }, (_, i) => ({
                content: `Page ${i} content`,
                from: i,
            }));

            const start = performance.now();
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            const elapsed = performance.now() - start;

            expect(report.ok).toBe(true);
            expect(elapsed).toBeLessThan(100); // Should complete in under 100ms
        });

        it('should correctly count errors and warnings in summary', () => {
            const pages: Page[] = [
                { content: 'Content A', id: 0 },
                { content: 'Content B', id: 1 },
            ];
            const segments: Segment[] = [
                { content: 'Missing', from: 0 }, // content_not_found (error)
                { content: 'Content A', from: 1 }, // page_attribution_mismatch (error)
            ];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            expect(report.summary.errors).toBe(2);
            expect(report.summary.segmentCount).toBe(2);
            expect(report.summary.pageCount).toBe(2);
        });
    });
});
