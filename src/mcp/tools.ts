import { type SegmentationAdvisorOptions, suggestSegmentationOptions } from '@/analysis/segmentation-advisor.js';
import { segmentPages } from '@/segmentation/segmenter.js';
import type { Page, Segment } from '@/types/index.js';
import type { SegmentationOptions } from '@/types/options.js';
import type { SegmentValidationReport } from '@/types/validation.js';
import { validateSegments } from '@/validation/validate-segments.js';

export type SegmentationPreview = {
    averageSegmentLength: number;
    maxSegmentLength: number;
    multiPageSegments: number;
    segmentCount: number;
    segmentSamples: Segment[];
    segments: Segment[];
    validation: SegmentValidationReport;
};

export type CandidateScore = {
    averageSegmentLength?: number;
    error?: string;
    index: number;
    maxSegmentLength?: number;
    multiPageSegments?: number;
    options: SegmentationOptions;
    score: number;
    segmentCount?: number;
    validation?: SegmentValidationReport;
};

const buildPreviewStats = (
    pages: Page[],
    options: SegmentationOptions,
    segments: Segment[],
    sampleSegments: number,
): SegmentationPreview => {
    const validation = validateSegments(pages, options, segments);
    const totalLength = segments.reduce((sum, segment) => sum + segment.content.length, 0);
    const multiPageSegments = segments.filter(
        (segment) => segment.to !== undefined && segment.to !== segment.from,
    ).length;

    return {
        averageSegmentLength: segments.length === 0 ? 0 : totalLength / segments.length,
        maxSegmentLength: Math.max(0, ...segments.map((segment) => segment.content.length)),
        multiPageSegments,
        segmentCount: segments.length,
        segmentSamples: segments.slice(0, sampleSegments),
        segments,
        validation,
    };
};

const computeCandidateScore = (preview: SegmentationPreview): number => {
    const issuePenalty = preview.validation.summary.issues * 100;
    const multiPagePenalty = preview.multiPageSegments * 5;
    const oversizePenalty = Math.floor(preview.maxSegmentLength / 500);
    const segmentReward = Math.min(preview.segmentCount, 200);

    return segmentReward - issuePenalty - multiPagePenalty - oversizePenalty;
};

export const inspectBook = (pages: Page[], options: SegmentationAdvisorOptions = {}) => {
    const report = suggestSegmentationOptions(pages, options);
    return {
        assessment: report.assessment,
        breakpointSuggestions: report.breakpointSuggestions,
        lineStarts: report.lineStarts,
        preprocess: report.preprocess,
        repeatingSequences: report.repeatingSequences,
        ruleSuggestions: report.ruleSuggestions,
    };
};

export const suggestBookSegmentation = (pages: Page[], options: SegmentationAdvisorOptions = {}) =>
    suggestSegmentationOptions(pages, options);

export const previewSegmentation = (
    pages: Page[],
    options: SegmentationOptions,
    sampleSegments = 10,
): SegmentationPreview => {
    const segments = segmentPages(pages, options);
    return buildPreviewStats(pages, options, segments, sampleSegments);
};

export const validateSegmentationPreview = (
    pages: Page[],
    options: SegmentationOptions,
    segments: Segment[],
): SegmentValidationReport => validateSegments(pages, options, segments);

export const scoreSegmentationCandidates = (
    pages: Page[],
    candidates: SegmentationOptions[],
    sampleSegments = 5,
): {
    bestIndex: number;
    results: CandidateScore[];
} => {
    const results = candidates.map<CandidateScore>((options, index) => {
        try {
            const preview = previewSegmentation(pages, options, sampleSegments);
            return {
                averageSegmentLength: preview.averageSegmentLength,
                index,
                maxSegmentLength: preview.maxSegmentLength,
                multiPageSegments: preview.multiPageSegments,
                options,
                score: computeCandidateScore(preview),
                segmentCount: preview.segmentCount,
                validation: preview.validation,
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error),
                index,
                options,
                score: Number.NEGATIVE_INFINITY,
            };
        }
    });

    const best = results.reduce(
        (currentBest, result) => (result.score > currentBest.score ? result : currentBest),
        results[0] ?? { index: -1, options: {}, score: Number.NEGATIVE_INFINITY },
    );

    return {
        bestIndex: best.index,
        results,
    };
};
