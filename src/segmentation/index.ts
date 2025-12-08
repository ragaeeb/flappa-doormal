/**
 * Page Segmentation module for splitting Arabic text into logical segments.
 *
 * This module provides pattern-based segmentation of multi-page Arabic content,
 * with support for diacritic-insensitive matching and named capture groups.
 *
 * @module segmentation
 *
 * @example
 * import { segmentPages, makeDiacriticInsensitive } from './segmentation';
 *
 * const segments = segmentPages(pages, {
 *   rules: [
 *     { lineStartsWith: ['{{kitab}}'], split: 'before', fuzzy: true },
 *     { lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'before' }
 *   ]
 * });
 */

// Fuzzy matching utilities
export { escapeRegex, makeDiacriticInsensitive } from './fuzzy.js';

// HTML utilities
export { htmlToMarkdown, stripHtmlTags } from './html.js';

// Core segmentation
export { segmentPages } from './segmenter.js';

// Token expansion types
export type { ExpandResult } from './tokens.js';

// Token expansion (with named capture support)
export {
    containsTokens,
    expandTokens,
    expandTokensWithCaptures,
    getAvailableTokens,
    getTokenPattern,
    TOKEN_PATTERNS,
    templateToRegex,
} from './tokens.js';

// Type definitions
export type { PageInput, Segment, SegmentationOptions, SplitRule } from './types.js';
