import { describe, expect, it } from 'bun:test';
import type { Page } from '@/types/index.js';
import {
    inspectBook,
    previewSegmentation,
    scoreSegmentationCandidates,
    suggestBookSegmentation,
    validateSegmentationPreview,
} from './tools.js';

describe('mcp tools', () => {
    const pages: Page[] = [
        { content: '١ - حدثنا زيد\n٢ - أخبرنا عمرو', id: 1 },
        { content: '٣ - حدثنا بكر', id: 2 },
    ];

    it('should inspect a book without requiring caller-side orchestration', () => {
        const result = inspectBook(pages, { maxRules: 2 });
        expect(result.assessment.mode).toBe('structured');
        expect(result.lineStarts.length).toBeGreaterThan(0);
        expect(result.ruleSuggestions.length).toBeGreaterThan(0);
    });

    it('should suggest draft segmentation options', () => {
        const result = suggestBookSegmentation(pages, { maxRules: 2 });
        expect(result.recommendedOptions.rules?.length).toBeGreaterThan(0);
        expect(result.ruleValidationErrors).toEqual([]);
    });

    it('should preview and validate segmentation output', () => {
        const preview = previewSegmentation(pages, {
            pageJoiner: 'newline',
            rules: [{ split: 'at', template: '^{{raqms:num}} {{dash}} ' }],
        });
        const validation = validateSegmentationPreview(
            pages,
            {
                pageJoiner: 'newline',
                rules: [{ split: 'at', template: '^{{raqms:num}} {{dash}} ' }],
            },
            preview.segments,
        );

        expect(preview.segmentCount).toBe(3);
        expect(validation.ok).toBeTrue();
    });

    it('should score candidate options and identify the stronger one', () => {
        const result = scoreSegmentationCandidates(pages, [
            { rules: [] },
            {
                pageJoiner: 'newline',
                rules: [{ split: 'at', template: '^{{raqms:num}} {{dash}} ' }],
            },
        ]);

        expect(result.bestIndex).toBe(1);
        expect(result.results).toHaveLength(2);
        expect(result.results[1]?.score).toBeGreaterThan(result.results[0]?.score ?? Number.NEGATIVE_INFINITY);
    });
});
