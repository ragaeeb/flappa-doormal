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
// Core segmentation
export { segmentPages } from './segmentation/segmenter.js';
// Text utilities
export { normalizeLineEndings, stripHtmlTags } from './segmentation/textUtils.js';

// Token expansion types
export type { ExpandResult } from './segmentation/tokens.js';

// Token expansion (with named capture support)
export {
    containsTokens,
    escapeTemplateBrackets,
    expandTokens,
    expandTokensWithCaptures,
    getAvailableTokens,
    getTokenPattern,
    TOKEN_PATTERNS,
    templateToRegex,
} from './segmentation/tokens.js';

// Type definitions
export type {
    Breakpoint,
    BreakpointRule,
    Logger,
    Page,
    PageRange,
    Segment,
    SegmentationOptions,
    SplitRule,
} from './segmentation/types.js';

// ─────────────────────────────────────────────────────────────
// Pattern Detection
// ─────────────────────────────────────────────────────────────

// Pattern detection types
export type { DetectedPattern } from './pattern-detection.js';
// Pattern detection utilities
export {
    analyzeTextForRule,
    detectTokenPatterns,
    generateTemplateFromText,
    suggestPatternConfig,
} from './pattern-detection.js';
