import { optimizeRules } from '@/optimization/optimize-rules.js';
import { formatValidationReport, type RuleValidationResult, validateRules } from '@/segmentation/pattern-validator.js';
import { shouldDefaultToFuzzy } from '@/segmentation/tokens.js';
import type { Breakpoint } from '@/types/breakpoints.js';
import type { Page, Segment } from '@/types/index.js';
import type { PreprocessTransform, SegmentationOptions } from '@/types/options.js';
import type { SplitRule } from '@/types/rules.js';
import type { SegmentValidationReport } from '@/types/validation.js';
import { validateSegments } from '@/validation/validate-segments.js';
import { segmentPages } from '../segmentation/segmenter.js';
import type { CommonLineStartPattern } from './line-starts.js';
import { analyzeCommonLineStarts } from './line-starts.js';
import type { RepeatingSequencePattern } from './repeating-sequences.js';
import { analyzeRepeatingSequences } from './repeating-sequences.js';

const ZERO_WIDTH_REGEX = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/gu;
const ELLIPSIS_REGEX = /\.{3,}/g;
const TRAILING_WAW_REGEX = /\sو\s+(?=[\p{Script=Arabic}])/gu;

const STRUCTURAL_META_BY_TOKEN = {
    bab: 'chapter',
    basmalah: 'basmalah',
    fasl: 'section',
    kitab: 'book',
} as const;

const NUMBER_TOKENS = ['numbered', 'raqms', 'raqm', 'nums', 'num'] as const;
const DEFAULT_BREAKPOINTS: Breakpoint[] = [{ pattern: '{{tarqim}}\\s*', split: 'after' }, ''];

export type SegmentationAdvisorMode = 'structured' | 'continuous' | 'mixed';

export type SegmentationAdvisorOptions = {
    topLineStarts?: number;
    topRepeatingSequences?: number;
    minLineStartCount?: number;
    minRepeatingCount?: number;
    maxRules?: number;
    sampleSegments?: number;
};

export type PreprocessDetections = {
    ellipsisCount: number;
    trailingWawCount: number;
    zeroWidthCount: number;
};

export type PreprocessSuggestion = {
    count: number;
    reason: string;
    transform: PreprocessTransform;
};

export type RuleSuggestionSource = 'line-start' | 'repeating-sequence';
export type RuleSuggestionConfidence = 'high' | 'medium' | 'low';

export type SuggestedRule = {
    confidence: RuleSuggestionConfidence;
    count: number;
    example: {
        pageId: number;
        text: string;
    };
    pattern: string;
    reason: string;
    rule: SplitRule;
    source: RuleSuggestionSource;
};

export type BreakpointSuggestion = {
    breakpoints: Breakpoint[];
    maxPages: number;
    prefer: 'longer' | 'shorter';
    reason: string;
};

export type SegmentationEvaluation = {
    averageSegmentLength: number;
    maxSegmentLength: number;
    multiPageSegments: number;
    segmentCount: number;
    validation: SegmentValidationReport;
};

export type SegmentationSuggestionReport = {
    assessment: {
        mode: SegmentationAdvisorMode;
        reason: string;
    };
    breakpointSuggestions: BreakpointSuggestion[];
    evaluation?: SegmentationEvaluation;
    lineStarts: CommonLineStartPattern[];
    optimization: {
        mergedCount: number;
        optimizedRuleCount: number;
        originalRuleCount: number;
    };
    preprocess: {
        detections: PreprocessDetections;
        suggestions: PreprocessSuggestion[];
    };
    recommendedOptions: SegmentationOptions;
    repeatingSequences: RepeatingSequencePattern[];
    ruleSuggestions: SuggestedRule[];
    ruleValidation: RuleValidationResult[];
    ruleValidationErrors: string[];
    segmentSamples: Segment[];
};

type RuleShape = 'line-start' | 'sequence';

type ResolvedAdvisorOptions = Required<SegmentationAdvisorOptions>;

const resolveOptions = (pages: Page[], options: SegmentationAdvisorOptions = {}): ResolvedAdvisorOptions => {
    const minCount = pages.length >= 25 ? 3 : 2;
    return {
        maxRules: options.maxRules ?? 4,
        minLineStartCount: options.minLineStartCount ?? minCount,
        minRepeatingCount: options.minRepeatingCount ?? minCount,
        sampleSegments: options.sampleSegments ?? 5,
        topLineStarts: options.topLineStarts ?? 12,
        topRepeatingSequences: options.topRepeatingSequences ?? 8,
    };
};

const countMatches = (text: string, regex: RegExp): number => text.match(regex)?.length ?? 0;

const getDetections = (pages: Page[]): PreprocessDetections =>
    pages.reduce<PreprocessDetections>(
        (acc, page) => ({
            ellipsisCount: acc.ellipsisCount + countMatches(page.content, ELLIPSIS_REGEX),
            trailingWawCount: acc.trailingWawCount + countMatches(page.content, TRAILING_WAW_REGEX),
            zeroWidthCount: acc.zeroWidthCount + countMatches(page.content, ZERO_WIDTH_REGEX),
        }),
        { ellipsisCount: 0, trailingWawCount: 0, zeroWidthCount: 0 },
    );

const getPreprocessSuggestions = (detections: PreprocessDetections): PreprocessSuggestion[] => {
    const suggestions: PreprocessSuggestion[] = [];

    if (detections.zeroWidthCount > 0) {
        suggestions.push({
            count: detections.zeroWidthCount,
            reason: 'Invisible directional/zero-width marks can break anchors and token matching.',
            transform: 'removeZeroWidth',
        });
    }
    if (detections.ellipsisCount > 0) {
        suggestions.push({
            count: detections.ellipsisCount,
            reason: 'Repeated periods often cause noisy punctuation breakpoints.',
            transform: 'condenseEllipsis',
        });
    }
    if (detections.trailingWawCount > 0) {
        suggestions.push({
            count: detections.trailingWawCount,
            reason: 'Separated waw prefixes are a common digitization artifact in Arabic corpora.',
            transform: 'fixTrailingWaw',
        });
    }

    return suggestions;
};

const extractTokenNames = (pattern: string): string[] =>
    [...pattern.matchAll(/\{\{(\w+)(?::[^}]+)?\}\}/g)].map((match) => match[1]);

const getStructuralMeta = (tokens: string[]): string | undefined => {
    for (const token of tokens) {
        if (token in STRUCTURAL_META_BY_TOKEN) {
            return STRUCTURAL_META_BY_TOKEN[token as keyof typeof STRUCTURAL_META_BY_TOKEN];
        }
    }
    return undefined;
};

const applyFirstTokenReplacement = (pattern: string, token: string, replacement: string): string => {
    const target = `{{${token}}}`;
    return pattern.includes(target) ? pattern.replace(target, replacement) : pattern;
};

const addNamedCaptures = (pattern: string): string => {
    let next = pattern;

    if (next.includes('{{numbered}}')) {
        next = next.replace('{{numbered}}', '{{raqms:num}} {{dash}} ');
    } else {
        for (const token of NUMBER_TOKENS) {
            const replacement = token === 'num' ? '{{num:num}}' : `{{${token}:num}}`;
            const replaced = applyFirstTokenReplacement(next, token, replacement);
            if (replaced !== next) {
                next = replaced;
                break;
            }
        }
    }

    if (next.includes('{{rumuz}}')) {
        next = next.replace('{{rumuz}}', '{{rumuz:source}}');
    }

    return next;
};

const findTokenIndex = (pattern: string, token: string): number => {
    const plainIndex = pattern.indexOf(`{{${token}}}`);
    const namedIndex = pattern.indexOf(`{{${token}:`);

    if (plainIndex === -1) {
        return namedIndex;
    }
    if (namedIndex === -1) {
        return plainIndex;
    }
    return Math.min(plainIndex, namedIndex);
};

const trimNumberBoundaryPattern = (pattern: string): string => {
    const stopTokens = ['naql', 'bab', 'basmalah', 'fasl', 'kitab'];
    let end = pattern.length;

    for (const token of stopTokens) {
        const index = findTokenIndex(pattern, token);
        if (index >= 0) {
            end = Math.min(end, index);
        }
    }

    return pattern.slice(0, end).trimEnd();
};

const getRuleMeta = (tokens: string[]): Record<string, unknown> | undefined => {
    const structural = getStructuralMeta(tokens);
    if (structural) {
        return { type: structural };
    }
    if (
        tokens.includes('naql') ||
        tokens.some((token) => NUMBER_TOKENS.includes(token as (typeof NUMBER_TOKENS)[number]))
    ) {
        return { type: 'entry' };
    }
    return undefined;
};

const getSuggestionConfidence = (tokens: string[], shape: RuleShape): RuleSuggestionConfidence => {
    if (getStructuralMeta(tokens)) {
        return 'high';
    }
    if (
        tokens.some((token) => NUMBER_TOKENS.includes(token as (typeof NUMBER_TOKENS)[number])) ||
        tokens.includes('naql')
    ) {
        return 'high';
    }
    if (shape === 'sequence' && tokens.includes('rumuz')) {
        return 'medium';
    }
    return tokens.length > 0 ? 'medium' : 'low';
};

const getSuggestionReason = (tokens: string[], source: RuleSuggestionSource): string => {
    const structural = getStructuralMeta(tokens);
    if (structural) {
        return `Repeated structural marker suggests ${structural}-style boundaries.`;
    }
    if (tokens.some((token) => NUMBER_TOKENS.includes(token as (typeof NUMBER_TOKENS)[number]))) {
        return 'Repeated numbering marker is a strong candidate for entry boundaries.';
    }
    if (tokens.includes('naql')) {
        return source === 'line-start'
            ? 'Repeated transmission phrase appears at line starts and can anchor segments.'
            : 'Repeated transmission phrase inside prose is a good candidate for template-based splitting.';
    }
    return source === 'line-start'
        ? 'Frequent line-start signature is worth trying as a structural boundary.'
        : 'Frequent tokenized sequence may help split continuous prose.';
};

const createRule = (pattern: string, tokens: string[], shape: RuleShape): SplitRule => {
    const fuzzy = shouldDefaultToFuzzy(pattern);
    const meta = getRuleMeta(tokens);

    if (shape === 'line-start') {
        if (getStructuralMeta(tokens)) {
            return meta
                ? { fuzzy, lineStartsWith: [pattern], meta, split: 'at' }
                : { fuzzy, lineStartsWith: [pattern], split: 'at' };
        }

        if (tokens.some((token) => NUMBER_TOKENS.includes(token as (typeof NUMBER_TOKENS)[number]))) {
            const captured = addNamedCaptures(trimNumberBoundaryPattern(pattern));
            return meta
                ? { fuzzy, lineStartsAfter: [captured], meta, split: 'at' }
                : { fuzzy, lineStartsAfter: [captured], split: 'at' };
        }

        return meta
            ? { fuzzy, lineStartsWith: [pattern], meta, split: 'at' }
            : { fuzzy, lineStartsWith: [pattern], split: 'at' };
    }

    const captured = addNamedCaptures(pattern);
    return meta ? { fuzzy, meta, split: 'at', template: captured } : { fuzzy, split: 'at', template: captured };
};

const createLineStartSuggestion = (pattern: CommonLineStartPattern): SuggestedRule => {
    const tokens = extractTokenNames(pattern.pattern);
    return {
        confidence: getSuggestionConfidence(tokens, 'line-start'),
        count: pattern.count,
        example: {
            pageId: pattern.examples[0]?.pageId ?? -1,
            text: pattern.examples[0]?.line ?? '',
        },
        pattern: pattern.pattern,
        reason: getSuggestionReason(tokens, 'line-start'),
        rule: createRule(pattern.pattern, tokens, 'line-start'),
        source: 'line-start',
    };
};

const createRepeatingSuggestion = (pattern: RepeatingSequencePattern): SuggestedRule => {
    const tokens = extractTokenNames(pattern.pattern);
    return {
        confidence: getSuggestionConfidence(tokens, 'sequence'),
        count: pattern.count,
        example: {
            pageId: pattern.examples[0]?.pageId ?? -1,
            text: pattern.examples[0]?.text ?? '',
        },
        pattern: pattern.pattern,
        reason: getSuggestionReason(tokens, 'repeating-sequence'),
        rule: createRule(pattern.pattern, tokens, 'sequence'),
        source: 'repeating-sequence',
    };
};

const confidenceScore = (confidence: RuleSuggestionConfidence): number =>
    confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;

const sourceScore = (mode: SegmentationAdvisorMode, source: RuleSuggestionSource): number => {
    if (mode === 'structured') {
        return source === 'line-start' ? 3 : 1;
    }
    if (mode === 'continuous') {
        return source === 'repeating-sequence' ? 3 : 1;
    }
    return source === 'line-start' ? 3 : 2;
};

const compareSuggestions = (mode: SegmentationAdvisorMode, left: SuggestedRule, right: SuggestedRule): number =>
    sourceScore(mode, right.source) - sourceScore(mode, left.source) ||
    confidenceScore(right.confidence) - confidenceScore(left.confidence) ||
    right.count - left.count ||
    left.pattern.localeCompare(right.pattern);

const dedupeSuggestions = (suggestions: SuggestedRule[]): SuggestedRule[] => {
    const seen = new Set<string>();
    const deduped: SuggestedRule[] = [];

    for (const suggestion of suggestions) {
        const key = JSON.stringify(suggestion.rule);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(suggestion);
    }

    return deduped;
};

const chooseAssessment = (
    pages: Page[],
    lineStarts: CommonLineStartPattern[],
    repeatingSequences: RepeatingSequencePattern[],
): { mode: SegmentationAdvisorMode; reason: string } => {
    const totalLines = pages.reduce((sum, page) => sum + page.content.split('\n').length, 0);
    const topLine = lineStarts[0]?.count ?? 0;
    const topSequence = repeatingSequences[0]?.count ?? 0;
    const hasDenseLineBreaks = totalLines > pages.length;

    if (topLine >= Math.max(2, topSequence) && hasDenseLineBreaks) {
        return {
            mode: 'structured',
            reason: 'Frequent repeated line-start markers dominate and the text has strong line structure.',
        };
    }
    if (topSequence > topLine && !hasDenseLineBreaks) {
        return {
            mode: 'continuous',
            reason: 'Tokenized prose sequences are stronger than line-start signals and the pages are mostly continuous text.',
        };
    }
    return {
        mode: 'mixed',
        reason: 'The book shows both structural line markers and inline recurring sequences.',
    };
};

const getRecommendedOptions = (
    mode: SegmentationAdvisorMode,
    suggestions: SuggestedRule[],
    maxRules: number,
    preprocess: PreprocessTransform[],
): {
    optimization: SegmentationSuggestionReport['optimization'];
    options: SegmentationOptions;
} => {
    const primarySource = mode === 'continuous' ? 'repeating-sequence' : 'line-start';
    const sourceMatched = suggestions.filter((suggestion) => suggestion.source === primarySource);
    const selectedRules = (sourceMatched.length > 0 ? sourceMatched : suggestions)
        .slice(0, maxRules)
        .map((suggestion) => suggestion.rule);
    const optimized = optimizeRules(selectedRules);
    const shouldUseNewlineJoiner = primarySource === 'line-start';
    const baseOptions = shouldUseNewlineJoiner
        ? { pageJoiner: 'newline' as const, rules: optimized.rules }
        : { rules: optimized.rules };

    return {
        optimization: {
            mergedCount: optimized.mergedCount,
            optimizedRuleCount: optimized.rules.length,
            originalRuleCount: selectedRules.length,
        },
        options: preprocess.length > 0 ? { ...baseOptions, preprocess } : baseOptions,
    };
};

const evaluateRecommendation = (
    pages: Page[],
    options: SegmentationOptions,
    sampleSegments: number,
): { evaluation?: SegmentationEvaluation; segmentSamples: Segment[] } => {
    if ((options.rules?.length ?? 0) === 0) {
        return { segmentSamples: [] };
    }

    try {
        const segments = segmentPages(pages, options);
        const validation = validateSegments(pages, options, segments);
        const totalLength = segments.reduce((sum, segment) => sum + segment.content.length, 0);
        const multiPageSegments = segments.filter(
            (segment) => segment.to !== undefined && segment.to !== segment.from,
        ).length;

        return {
            evaluation: {
                averageSegmentLength: segments.length === 0 ? 0 : totalLength / segments.length,
                maxSegmentLength: Math.max(0, ...segments.map((segment) => segment.content.length)),
                multiPageSegments,
                segmentCount: segments.length,
                validation,
            },
            segmentSamples: segments.slice(0, sampleSegments),
        };
    } catch {
        return { segmentSamples: [] };
    }
};

const toTemplateFallbackRule = (rule: SplitRule): SplitRule | null => {
    if (!('lineStartsAfter' in rule) || !Array.isArray(rule.lineStartsAfter) || rule.lineStartsAfter.length !== 1) {
        return null;
    }

    return rule.meta
        ? { meta: rule.meta, split: rule.split, template: `^${rule.lineStartsAfter[0]}` }
        : { split: rule.split, template: `^${rule.lineStartsAfter[0]}` };
};

const getTemplateFallbackOptions = (options: SegmentationOptions): SegmentationOptions | null => {
    if ((options.rules?.length ?? 0) === 0) {
        return null;
    }

    const fallbackRules = options.rules?.map(toTemplateFallbackRule).filter((rule): rule is SplitRule => rule !== null);
    if (!fallbackRules || fallbackRules.length !== options.rules?.length || fallbackRules.length === 0) {
        return null;
    }

    return options.preprocess
        ? { pageJoiner: 'newline', preprocess: options.preprocess, rules: fallbackRules }
        : { pageJoiner: 'newline', rules: fallbackRules };
};

const shouldUseTemplateFallback = (primary?: SegmentationEvaluation, fallback?: SegmentationEvaluation): boolean => {
    if (!fallback) {
        return false;
    }
    if (!primary) {
        return true;
    }
    return (
        fallback.segmentCount > primary.segmentCount &&
        fallback.validation.summary.issues <= primary.validation.summary.issues
    );
};

const getBreakpointSuggestions = (pages: Page[], evaluation?: SegmentationEvaluation): BreakpointSuggestion[] => {
    const averagePageLength =
        pages.length === 0 ? 0 : pages.reduce((sum, page) => sum + page.content.length, 0) / pages.length;
    const needsBreakpoints =
        (evaluation?.multiPageSegments ?? 0) > 0 ||
        (evaluation?.maxSegmentLength ?? 0) > 4000 ||
        averagePageLength > 2500;

    if (!needsBreakpoints) {
        return [];
    }

    return [
        {
            breakpoints: DEFAULT_BREAKPOINTS,
            maxPages: 1,
            prefer: 'longer',
            reason: 'Some segments are likely to grow large enough that sentence punctuation plus page-boundary fallback is worth testing.',
        },
    ];
};

/**
 * Generate a machine-readable draft segmentation report for AI agents.
 *
 * This helper is intentionally deterministic: it inspects pages, drafts
 * candidate rules, validates them, and evaluates its own recommendation.
 */
export const suggestSegmentationOptions = (
    pages: Page[],
    options: SegmentationAdvisorOptions = {},
): SegmentationSuggestionReport => {
    const resolved = resolveOptions(pages, options);
    const detections = getDetections(pages);
    const preprocessSuggestions = getPreprocessSuggestions(detections);
    const preprocess = preprocessSuggestions.map((suggestion) => suggestion.transform);

    const lineStarts = analyzeCommonLineStarts(pages, {
        minCount: resolved.minLineStartCount,
        sortBy: 'count',
        topK: resolved.topLineStarts,
    });
    const repeatingSequences = analyzeRepeatingSequences(pages, {
        maxElements: 3,
        minCount: resolved.minRepeatingCount,
        minElements: 1,
        topK: resolved.topRepeatingSequences,
    });

    const assessment = chooseAssessment(pages, lineStarts, repeatingSequences);
    const lineSuggestions = lineStarts.map(createLineStartSuggestion);
    const repeatingSuggestions = repeatingSequences.map(createRepeatingSuggestion);
    const ruleSuggestions = dedupeSuggestions([...lineSuggestions, ...repeatingSuggestions]).sort((left, right) =>
        compareSuggestions(assessment.mode, left, right),
    );

    const { optimization, options: recommendedOptions } = getRecommendedOptions(
        assessment.mode,
        ruleSuggestions,
        resolved.maxRules,
        preprocess,
    );
    const primary = evaluateRecommendation(pages, recommendedOptions, resolved.sampleSegments);
    const fallbackOptions = getTemplateFallbackOptions(recommendedOptions);
    const fallback = fallbackOptions
        ? evaluateRecommendation(pages, fallbackOptions, resolved.sampleSegments)
        : undefined;
    const finalOptions =
        shouldUseTemplateFallback(primary.evaluation, fallback?.evaluation) && fallbackOptions
            ? fallbackOptions
            : recommendedOptions;
    const finalEvaluation = finalOptions === fallbackOptions && fallback ? fallback : primary;
    const ruleValidation = validateRules(finalOptions.rules ?? []).filter(
        (result): result is RuleValidationResult => result !== undefined,
    );
    const ruleValidationErrors = formatValidationReport(ruleValidation);

    return {
        assessment,
        breakpointSuggestions: getBreakpointSuggestions(pages, finalEvaluation.evaluation),
        evaluation: finalEvaluation.evaluation,
        lineStarts,
        optimization,
        preprocess: {
            detections,
            suggestions: preprocessSuggestions,
        },
        recommendedOptions: finalOptions,
        repeatingSequences,
        ruleSuggestions,
        ruleValidation,
        ruleValidationErrors,
        segmentSamples: finalEvaluation.segmentSamples,
    };
};
