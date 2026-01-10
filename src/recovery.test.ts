import { describe, expect, it } from 'bun:test';
import { segmentPages } from '@/segmentation/segmenter.js';
import type { Page } from '@/types/index.js';
import type { SegmentationOptions } from '@/types/options.js';
import { recoverMistakenLineStartsAfterMarkers } from './recovery';

describe('marker recovery (rerun-only MVP)', () => {
    it('baseline: lineStartsAfter strips marker (data loss)', () => {
        const pages: Page[] = [{ content: 'وروى أحمد\nوذكر خالد', id: 1 }];
        const options: SegmentationOptions = {
            rules: [{ lineStartsAfter: ['وروى '] }, { lineStartsAfter: ['وذكر '] }],
        };

        const segments = segmentPages(pages, options);
        expect(segments).toHaveLength(2);
        expect(segments[0].content).toBe('أحمد');
        expect(segments[1].content).toBe('خالد');
    });

    it('recovers selected mistaken markers by rule index; leaves other lineStartsAfter rules unchanged', () => {
        const pages: Page[] = [{ content: 'وروى أحمد\n## عنوان\nوذكر خالد', id: 1 }];
        const options: SegmentationOptions = {
            rules: [
                { lineStartsAfter: ['وروى '] }, // mistaken
                { lineStartsAfter: ['## '], meta: { type: 'chapter' } }, // legitimate, should remain stripped
                { lineStartsAfter: ['وذكر '] }, // mistaken, but we won't select it here
            ],
        };

        const segments = segmentPages(pages, options);
        expect(segments.map((s) => s.content)).toEqual(['أحمد', 'عنوان', 'خالد']);

        const recovered = recoverMistakenLineStartsAfterMarkers(pages, segments, options, {
            indices: [0],
            type: 'rule_indices',
        });

        expect(recovered.segments).toHaveLength(3);
        expect(recovered.segments[0].content).toBe('وروى أحمد'); // recovered
        expect(recovered.segments[1].content).toBe('عنوان'); // still stripped
        expect(recovered.segments[2].content).toBe('خالد'); // still stripped (unselected)
        expect(recovered.report.summary.recovered).toBe(1);
    });

    it('works with breakpoints: only the piece that begins at the structural boundary gains the marker', () => {
        const pages: Page[] = [
            { content: 'وروى أحمد\nنص طويل', id: 1 },
            { content: 'تكملة النص', id: 2 },
        ];
        const options: SegmentationOptions = {
            breakpoints: [''], // page boundary
            maxPages: 0, // force any multi-page segment to be split
            pageJoiner: 'space',
            rules: [{ lineStartsAfter: ['وروى '] }],
        };

        const segments = segmentPages(pages, options);
        expect(segments).toHaveLength(2);
        expect(segments[0]).toMatchObject({ from: 1 });
        expect(segments[1]).toMatchObject({ from: 2 });
        expect(segments[0].content).toStartWith('أحمد');

        const recovered = recoverMistakenLineStartsAfterMarkers(pages, segments, options, {
            indices: [0],
            type: 'rule_indices',
        });

        expect(recovered.segments).toHaveLength(2);
        expect(recovered.segments[0].content).toStartWith('وروى ');
        expect(recovered.segments[1].content).not.toStartWith('وروى ');
        expect(recovered.report.summary.recovered).toBe(1);
    });

    it('is idempotent when run twice (does not double-prepend)', () => {
        const pages: Page[] = [{ content: 'وروى أحمد', id: 1 }];
        const options: SegmentationOptions = { rules: [{ lineStartsAfter: ['وروى '] }] };
        const segments = segmentPages(pages, options);

        const once = recoverMistakenLineStartsAfterMarkers(pages, segments, options, {
            indices: [0],
            type: 'rule_indices',
        });
        expect(once.segments[0].content).toBe('وروى أحمد');

        const twice = recoverMistakenLineStartsAfterMarkers(pages, once.segments, options, {
            indices: [0],
            type: 'rule_indices',
        });
        expect(twice.segments[0].content).toBe('وروى أحمد');
        expect(twice.report.summary.recovered).toBe(0);
    });

    it('pattern selector reports error when pattern is missing and returns unchanged output', () => {
        const pages: Page[] = [{ content: 'وروى أحمد', id: 1 }];
        const options: SegmentationOptions = { rules: [{ lineStartsAfter: ['وروى '] }] };
        const segments = segmentPages(pages, options);

        const recovered = recoverMistakenLineStartsAfterMarkers(pages, segments, options, {
            patterns: ['غير_موجود'],
            type: 'lineStartsAfter_patterns',
        });

        expect(recovered.segments).toEqual(segments);
        expect(recovered.report.errors.length).toBeGreaterThan(0);
    });

    it('best-effort mode can recover via anchoring (stage1) and reports strategy=stage1', () => {
        const pages: Page[] = [{ content: 'وروى أحمد\nوذكر خالد', id: 1 }];
        const options: SegmentationOptions = {
            rules: [{ lineStartsAfter: ['وروى '] }, { lineStartsAfter: ['وذكر '] }],
        };

        const segments = segmentPages(pages, options);
        const recovered = recoverMistakenLineStartsAfterMarkers(
            pages,
            segments,
            options,
            { indices: [0], type: 'rule_indices' },
            { mode: 'best_effort_then_rerun' },
        );

        expect(recovered.segments[0].content).toBe('وروى أحمد');
        // First detail should be stage1 recovered or rerun recovered; we require stage1 to be used for this simple case.
        expect(recovered.report.details[0].strategy).toBe('stage1');
    });

    it('predicate selector selects rules matching the predicate', () => {
        const pages: Page[] = [{ content: 'وروى أحمد\nوذكر خالد', id: 1 }];
        const options: SegmentationOptions = {
            rules: [
                { lineStartsAfter: ['وروى '], meta: { recover: true } },
                { lineStartsAfter: ['وذكر '], meta: { recover: false } },
            ],
        };

        const segments = segmentPages(pages, options);
        expect(segments.map((s) => s.content)).toEqual(['أحمد', 'خالد']);

        // Use predicate to select only rules with meta.recover === true
        const recovered = recoverMistakenLineStartsAfterMarkers(pages, segments, options, {
            predicate: (rule) => (rule.meta as { recover?: boolean })?.recover === true,
            type: 'predicate',
        });

        expect(recovered.segments).toHaveLength(2);
        expect(recovered.segments[0].content).toBe('وروى أحمد'); // recovered by predicate
        expect(recovered.segments[1].content).toBe('خالد'); // not selected by predicate
        expect(recovered.report.summary.recovered).toBe(1);
    });
});
