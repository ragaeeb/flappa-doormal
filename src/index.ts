export type {
    CommonLineStartPattern,
    LineStartAnalysisOptions,
    LineStartPatternExample,
    RepeatingSequenceExample,
    RepeatingSequenceOptions,
    RepeatingSequencePattern,
} from './analysis/index.js';
export { analyzeCommonLineStarts, analyzeRepeatingSequences } from './analysis/index.js';
export type { DetectedPattern } from './detection.js';
export {
    analyzeTextForRule,
    detectTokenPatterns,
    generateTemplateFromText,
    suggestPatternConfig,
} from './detection.js';
export type { OptimizeResult } from './optimization/optimize-rules.js';
export { optimizeRules } from './optimization/optimize-rules.js';
export {
    applyPreprocessToPage,
    condenseEllipsis,
    fixTrailingWaw,
    removeZeroWidth,
} from './preprocessing/transforms.js';
export type { MarkerRecoveryReport, MarkerRecoveryRun, MarkerRecoverySelector } from './recovery.js';
export { recoverMistakenLineStartsAfterMarkers, recoverMistakenMarkersForRuns } from './recovery.js';
export type { PatternProcessor } from './segmentation/breakpoint-utils.js';
export { escapeWordsOutsideTokens } from './segmentation/breakpoint-utils.js';
export { getDebugReason, getSegmentDebugReason } from './segmentation/debug-meta.js';
export type {
    RuleValidationResult,
    ValidationIssue,
    ValidationIssueType,
} from './segmentation/pattern-validator.js';
export { formatValidationReport, validateRules } from './segmentation/pattern-validator.js';
export { segmentPages } from './segmentation/segmenter.js';
export type { ExpandResult, TokenKey, TokenMapping } from './segmentation/tokens.js';
export {
    applyTokenMappings,
    containsTokens,
    expandCompositeTokensInTemplate,
    expandTokens,
    expandTokensWithCaptures,
    getAvailableTokens,
    getTokenPattern,
    shouldDefaultToFuzzy,
    stripTokenMappings,
    TOKEN_PATTERNS,
    Token,
    templateToRegex,
    withCapture,
} from './segmentation/tokens.js';
export type { Breakpoint, BreakpointRule } from './types/breakpoints.js';
export type {
    Page,
    PageRange,
    PageRangeConstraint,
    PageRangeConstraintWithExclude,
    Segment,
    SegmentValidationIssue,
    SegmentValidationIssueSeverity,
    SegmentValidationIssueType,
    SegmentValidationReport,
} from './types/index.js';
export type {
    CondenseEllipsisRule,
    FixTrailingWawRule,
    Logger,
    PreprocessTransform,
    RemoveZeroWidthRule,
    SegmentationOptions,
} from './types/options.js';
export { PATTERN_TYPE_KEYS, type PatternTypeKey, type SplitRule } from './types/rules.js';
export { escapeRegex, escapeTemplateBrackets, makeDiacriticInsensitive } from './utils/textUtils.js';
export { type ValidationOptions, validateSegments } from './validation/validate-segments.js';
