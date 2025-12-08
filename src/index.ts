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
 *     { lineStartsWith: ['{{kitab}}'], split: 'before', fuzzy: true, meta: { type: 'book' } },
 *     { lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'before', meta: { type: 'hadith' } }
 *   ]
 * });
 */

// ─────────────────────────────────────────────────────────────
// Page Segmentation
// ─────────────────────────────────────────────────────────────

// Fuzzy matching utilities
export { escapeRegex, makeDiacriticInsensitive } from './segmentation/fuzzy.js';

// HTML utilities
export { htmlToMarkdown, stripHtmlTags } from './segmentation/html.js';

// Core segmentation
export { segmentPages } from './segmentation/segmenter.js';

// Token expansion
export {
    containsTokens,
    expandTokens,
    getAvailableTokens,
    getTokenPattern,
    TOKEN_PATTERNS,
    templateToRegex,
} from './segmentation/tokens.js';

// Type definitions
export type { PageInput, Segment, SegmentationOptions, SplitRule } from './segmentation/types.js';
