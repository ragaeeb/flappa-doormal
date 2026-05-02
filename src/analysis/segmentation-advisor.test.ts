import { describe, expect, it } from 'bun:test';
import type { Page } from '@/types/index.js';
import { suggestSegmentationOptions } from './segmentation-advisor.js';

describe('suggestSegmentationOptions', () => {
    it('should recommend numbered line-start rules for structured entry text', () => {
        const pages: Page[] = [
            {
                content: '١ - حدثنا زيد\n٢ - أخبرنا عمرو',
                id: 1,
            },
            {
                content: '٣ - حدثنا بكر\n٤ - أخبرنا خالد',
                id: 2,
            },
        ];

        const report = suggestSegmentationOptions(pages, {
            maxRules: 2,
            sampleSegments: 2,
        });

        expect(report.assessment.mode).toBe('structured');
        expect(report.ruleValidationErrors).toEqual([]);
        expect(report.recommendedOptions.rules).toBeArray();
        expect(report.recommendedOptions.pageJoiner).toBe('newline');
        expect(report.recommendedOptions.rules?.some((rule) => 'template' in rule)).toBeTrue();
        expect(JSON.stringify(report.recommendedOptions.rules)).toContain('^{{raqms:num}} {{dash}} ');
        expect(report.evaluation?.segmentCount).toBeGreaterThanOrEqual(4);
    });

    it('should prefer repeating-sequence template rules for continuous prose', () => {
        const pages: Page[] = [
            {
                content: 'حدثنا زيد عن عمر ثم حدثنا خالد عن علي',
                id: 1,
            },
            {
                content: 'أخبرنا بكر عن أنس ثم حدثنا صالح عن ابن عباس',
                id: 2,
            },
        ];

        const report = suggestSegmentationOptions(pages, {
            maxRules: 2,
            topRepeatingSequences: 4,
        });

        expect(report.assessment.mode).toBe('continuous');
        expect(report.ruleSuggestions[0]?.source).toBe('repeating-sequence');
        expect(report.recommendedOptions.rules?.some((rule) => 'template' in rule)).toBeTrue();
    });

    it('should surface preprocess cleanup hints before drafting rules', () => {
        const pages: Page[] = [
            {
                content: '\u200Fكتاب...\nقال و أحمد',
                id: 1,
            },
        ];

        const report = suggestSegmentationOptions(pages);
        const transforms = report.preprocess.suggestions.map((suggestion) => suggestion.transform);

        expect(transforms).toContain('removeZeroWidth');
        expect(transforms).toContain('condenseEllipsis');
        expect(transforms).toContain('fixTrailingWaw');
    });
});
