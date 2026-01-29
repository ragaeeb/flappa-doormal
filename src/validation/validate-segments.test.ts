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
            expect(report.issues).toHaveLength(1); // page_not_found only (content check skipped)
            expect(report.issues.find((i) => i.type === 'page_not_found')).toBeDefined();
            expect(report.issues.find((i) => i.type === 'page_not_found')?.severity).toBe('error');
        });

        it('should report error when segment.to does not exist in input pages', () => {
            const pages: Page[] = [{ content: 'Content', id: 0 }];
            const segments: Segment[] = [{ content: 'Content', from: 0, to: 999 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            const issue = report.issues.find((i) => i.type === 'page_not_found' && i.evidence?.includes('to=999'));
            expect(issue).toBeDefined();
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
            expect(issue!.actual?.from).toBe(10);
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
            const _report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

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

        it('should detect max_pages_violation when segment.to is set but content physically spans more pages', () => {
            // He (Page 0) llo (Page 1) matches joined "He llo".
            // User claims explicit range [0, 0] (single page).
            // But content physically spans 0 and 1.
            // This should be a violation of maxPages=0 AND a validity check failure.
            const pages = [
                { content: 'He', id: 0 },
                { content: 'llo', id: 1 },
            ];
            const segments: Segment[] = [{ content: 'He llo', from: 0, to: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            const issue = report.issues.find((i) => i.type === 'max_pages_violation');
            expect(issue).toBeDefined();
            expect(issue!.evidence).toContain('spans pages 0-1');
        });
    });

    describe('Duplicate Content Attribution', () => {
        it('should attribute segment to the correct page when content is duplicated', () => {
            const content = 'Repeated Content Section';
            const pages: Page[] = [
                { content: `Prefix A\n${content}\nSuffix A`, id: 0 },
                { content: `Prefix B\n${content}\nSuffix B`, id: 1 }, // Expected page
                { content: `Prefix C\n${content}\nSuffix C`, id: 2 },
            ];

            const segments: Segment[] = [
                { content, from: 1 }, // Claims it is on page 1
            ];

            // With the bug, it would find the match on page 0 first and fail.
            // With the fix, it should find the match on page 1 and pass.
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(true);
            expect(report.issues).toHaveLength(0);
        });

        it('should report mismatch if segment claims a page where content does NOT exist, even if it exists elsewhere', () => {
            const content = 'Unique Repeated Content';
            const pages: Page[] = [
                { content: `Prefix A\n${content}\nSuffix A`, id: 0 },
                { content: `Prefix B\nDifferent Content\nSuffix B`, id: 1 }, // Correct page 1 has NO match
            ];

            const segments: Segment[] = [
                { content, from: 1 }, // Claims page 1, but content is only on page 0
            ];

            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            const issue = report.issues.find((i) => i.type === 'page_attribution_mismatch');
            expect(issue).toBeDefined();
            expect(issue!.actual?.from).toBe(1);
            expect(issue!.expected?.from).toBe(0); // Should point to where it actually found it
        });
    });

    describe('Validation Options', () => {
        it('should respect fullSearchThreshold option', () => {
            const shortContent = 'Short match';
            // Page 0 does not have content.
            // Page 1 has content, but is far away (> 1000 chars buffer).
            const padding = 'x'.repeat(2000);
            const pages: Page[] = [
                { content: 'Page 0 Content', id: 0 },
                { content: `${padding}${shortContent}`, id: 1 },
            ];

            // Segment claims to be on Page 0 only.
            // This restricts fast path search to Page 0.
            const segments: Segment[] = [{ content: shortContent, from: 0, to: 0 }];

            // Case 1: Default threshold (500) -> Should find it via full search (mismatch)
            // 11 chars < 500 -> Full search runs -> Finds it on Page 1 -> Attribution Mismatch
            const reportDefault = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            expect(reportDefault.ok).toBe(false);
            expect(reportDefault.issues[0].type).toBe('page_attribution_mismatch');

            // Case 2: Lower threshold (5) -> Should NOT find it (content_not_found)
            // 11 chars > 5 -> Full search skipped -> Content not found in window
            const reportLower = validateSegments(pages, { maxPages: 0, rules: [] }, segments, {
                fullSearchThreshold: 5,
            });
            expect(reportLower.ok).toBe(false);
            expect(reportLower.issues[0].type).toBe('content_not_found');
        });
    });

    describe('Unicode Boundaries', () => {
        it('should handle surrogate pairs split across pages correctly', () => {
            // "𝕳" is \uD835\uDD73 (2 chars)
            // Split it: \uD835 on page 0, \uDD73 on page 1
            const pages: Page[] = [
                { content: 'Prefix \uD835', id: 0 },
                { content: '\uDD73 Suffix', id: 1 },
            ];

            // The joined content should be "Prefix 𝕳 Suffix" (if joiner is empty/smart?)
            // Standard validator uses space/newline joiner.
            // If we use space joiner: "Prefix \uD835 \uDD73 Suffix" -> "Prefix   Suffix" (broken)
            // This test verifies robust handling or at least consistent failure if joiner breaks it.
            // BUT: If the original segmenter handled it, validateSegments should verify it.
            // Let's assume a segment spans both.

            const segments: Segment[] = [
                { content: 'Prefix \uD835\n\uDD73 Suffix', from: 0, to: 1 }, // Normalized joiner \n
            ];

            // Use newline joiner to avoid breaking the surrogate pair with a space?
            // Actually, inserting ANY joiner between surrogate halves breaks the char.
            // This tests if validation blows up or handles it gracefully.
            const report = validateSegments(pages, { maxPages: 1, pageJoiner: 'newline', rules: [] }, segments);

            // Expectation: It passes because we match "Prefix \uD835\n\uDD73 Suffix" exactly against joined content.
            expect(report.ok).toBe(true);
        });

        it('should handle combining marks at page boundaries', () => {
            // "Café" -> 'e' + combining acute (U+0301)
            const pages: Page[] = [
                { content: 'Caf', id: 0 },
                { content: 'e\u0301', id: 1 }, // 'é' starts on new page
            ];
            const segments: Segment[] = [{ content: 'Caf\ne\u0301', from: 0, to: 1 }];

            const report = validateSegments(pages, { maxPages: 1, pageJoiner: 'newline', rules: [] }, segments);

            expect(report.ok).toBe(true);
        });
    });

    describe('Normalization & Preprocessing', () => {
        it('should handle newline normalization', () => {
            const pages = [{ content: 'Line\r\nBreak', id: 0 }];
            const segments = [{ content: 'Line\nBreak', from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should handle single-page non-normalized content correctly', () => {
            const pgs = [{ content: 'Line 1\r\nLine 2', id: 0 }];
            const segs = [{ content: 'Line 1\nLine 2', from: 0 }]; // Segment has LF, page has CRLF
            const report = validateSegments(pgs, { maxPages: 0, rules: [] }, segs);
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

    describe('Empty Page Handling', () => {
        it('should handle mixed empty and non-empty pages correctly', () => {
            const pages: Page[] = [
                { content: 'Page 0', id: 0 },
                { content: '', id: 1 }, // Empty page
                { content: 'Page 2', id: 2 },
            ];
            // Segment spanning empty page (Page 1)
            const segments: Segment[] = [{ content: 'Page 0 Page 2', from: 0, to: 2 }];
            // "Page 0" + space + "" + space + "Page 2" -> "Page 0  Page 2" (double space)
            // Note: If joiner logic is smart, it might behave differently, but default joins with space.
            // Wait, buildJoinedContent adds joiner between pages.
            // P0 (len 6) + " " + P1 (len 0) + " " + P2 (len 6).
            // "Page 0  Page 2".
            const report = validateSegments(pages, { maxPages: 2, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });

        it('should report page_not_found for all segments if pages array is empty', () => {
            const pages: Page[] = [];
            const segments: Segment[] = [{ content: 'Some content', from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);

            expect(report.ok).toBe(false);
            expect(report.issues[0].type).toBe('page_not_found');
        });
    });

    describe('Binary Search Gap Edge Case (Theoretical)', () => {
        it.skip('should handle offset in joiner gap between pages', () => {
            const pages = [
                { content: 'ABC', id: 0 },
                { content: 'DEF', id: 1 },
            ];
            // Segment consists ONLY of the joiner (gap).
            const segments: Segment[] = [{ content: ' ', from: 0 }];
            const report = validateSegments(pages, { maxPages: 0, rules: [] }, segments);
            expect(report.ok).toBe(true);
        });
    });
});
