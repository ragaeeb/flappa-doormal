/**
 * flappa-doormal - Declarative text segmentation library for Arabic texts.
 *
 * Provides pattern-based segmentation of multi-page Arabic content using
 * human-readable template syntax with support for diacritic-insensitive
 * matching and automatic metadata extraction via named captures.
 *
 * @packageDocumentation
 *
 * @example
 * import { segmentPages, TOKEN_PATTERNS } from 'flappa-doormal';
 *
 * const pages = [
 *   { id: 1, content: '## كتاب الإيمان\nباب ما جاء...' },
 *   { id: 2, content: '٦٦٩٦ - حدثنا...' }
 * ];
 *
 * const segments = segmentPages(pages, {
 *   rules: [
 *     { lineStartsWith: ['{{kitab}}'], split: 'at', fuzzy: true, meta: { type: 'book' } },
 *     { lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at', meta: { type: 'hadith' } }
 *   ]
 * });
 */

// ─────────────────────────────────────────────────────────────
// Page Segmentation
// ─────────────────────────────────────────────────────────────

// Fuzzy matching utilities
export { escapeRegex, makeDiacriticInsensitive } from './segmentation/fuzzy.js';
// Rule optimization utilities
export type { OptimizeResult } from './segmentation/optimize-rules.js';
export { optimizeRules } from './segmentation/optimize-rules.js';
export type {
    RuleValidationResult,
    ValidationIssue,
    ValidationIssueType,
} from './segmentation/pattern-validator.js';
// Pattern validation utilities
export { formatValidationReport, validateRules } from './segmentation/pattern-validator.js';
export type { ReplaceRule } from './segmentation/replace.js';
// Replace preprocessor (optional, also used internally by segmentPages when options.replace is set)
export { applyReplacements } from './segmentation/replace.js';
// Core segmentation
export { segmentPages } from './segmentation/segmenter.js';
// Token expansion types
export type { ExpandResult, TokenKey, TokenMapping } from './segmentation/tokens.js';
// Token expansion (with named capture support)
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
// Type definitions
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
// Pattern type keys (runtime array for UI building)
export { PATTERN_TYPE_KEYS } from './segmentation/types.js';

// ─────────────────────────────────────────────────────────────
// Pattern Detection
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Analysis helpers
// ─────────────────────────────────────────────────────────────
export type {
    CommonLineStartPattern,
    LineStartAnalysisOptions,
    LineStartPatternExample,
    RepeatingSequenceExample,
    RepeatingSequenceOptions,
    RepeatingSequencePattern,
} from './analysis/index.js';
export { analyzeCommonLineStarts, analyzeRepeatingSequences } from './analysis/index.js';
// Pattern detection types
export type { DetectedPattern } from './detection.js';
// Pattern detection utilities
export {
    analyzeTextForRule,
    detectTokenPatterns,
    generateTemplateFromText,
    suggestPatternConfig,
} from './detection.js';

// ─────────────────────────────────────────────────────────────
// Recovery helpers
// ─────────────────────────────────────────────────────────────
export type { MarkerRecoveryReport, MarkerRecoveryRun, MarkerRecoverySelector } from './recovery.js';
export { recoverMistakenLineStartsAfterMarkers, recoverMistakenMarkersForRuns } from './recovery.js';
