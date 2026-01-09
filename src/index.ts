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
export type { MarkerRecoveryReport, MarkerRecoveryRun, MarkerRecoverySelector } from './recovery.js';
export { recoverMistakenLineStartsAfterMarkers, recoverMistakenMarkersForRuns } from './recovery.js';
export type { PatternProcessor } from './segmentation/breakpoint-utils.js';
export { escapeRegex, makeDiacriticInsensitive } from './segmentation/fuzzy.js';
export type { OptimizeResult } from './segmentation/optimize-rules.js';
export { optimizeRules } from './segmentation/optimize-rules.js';
export type {
    RuleValidationResult,
    ValidationIssue,
    ValidationIssueType,
} from './segmentation/pattern-validator.js';
export { formatValidationReport, validateRules } from './segmentation/pattern-validator.js';
export type { ReplaceRule } from './segmentation/replace.js';
export { applyReplacements } from './segmentation/replace.js';
export { segmentPages } from './segmentation/segmenter.js';
export type { ExpandResult, TokenKey, TokenMapping } from './segmentation/tokens.js';
export {
    applyTokenMappings,
    containsTokens,
    escapeTemplateBrackets,
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
export type {
    Breakpoint,
    BreakpointRule,
    Logger,
    Page,
    PageRange,
    PatternTypeKey,
    Segment,
    SegmentationOptions,
    SplitRule,
} from './segmentation/types.js';
export { PATTERN_TYPE_KEYS } from './segmentation/types.js';
