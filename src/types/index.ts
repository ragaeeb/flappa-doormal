/**
 * Output segment produced by `segmentPages()`.
 *
 * Each segment contains extracted content, page references, and
 * optional metadata from the matched rule and captured groups.
 *
 * @example
 * // Simple segment on a single page
 * { content: '## Chapter 1\nIntroduction...', from: 1, meta: { type: 'chapter' } }
 *
 * @example
 * // Segment spanning pages 5-7 with captured hadith number
 * { content: 'Hadith text...', from: 5, to: 7, meta: { type: 'hadith', hadithNum: '٤٢' } }
 */
export type Segment = {
    /**
     * Segment content with:
     * - Leading/trailing whitespace trimmed
     * - Page breaks converted to spaces (for multi-page segments)
     * - Markers stripped (for `lineStartsAfter` patterns)
     */
    content: string;

    /**
     * Starting page ID (from `Page.id`).
     */
    from: number;

    /**
     * Ending page ID if segment spans multiple pages.
     *
     * Only present when the segment content extends across page boundaries.
     * When `undefined`, the segment is contained within a single page.
     */
    to?: number;

    /**
     * Combined metadata from:
     * 1. Rule's `meta` property (static metadata)
     * 2. Named captures from patterns (e.g., `{{raqms:num}}` → `{ num: '٤٢' }`)
     *
     * Named captures override static metadata with the same key.
     */
    meta?: Record<string, unknown>;
};

/**
 * Input page structure for segmentation.
 *
 * Each page represents a logical unit of content (e.g., a book page,
 * a document section) that can be tracked across segment boundaries.
 *
 * @example
 * const pages: Page[] = [
 *   { id: 1, content: '## Chapter 1\nFirst paragraph...' },
 *   { id: 2, content: 'Continued text...\n## Chapter 2' },
 * ];
 */
export type Page = {
    /**
     * Unique page/entry ID used for:
     * - `min`/`max` constraint filtering
     * - `from`/`to` tracking in output segments
     */
    id: number;

    /**
     * Raw page content (may contain HTML).
     *
     * Line endings are normalized internally (`\r\n` and `\r` → `\n`).
     * Use a utility to convert html to markdown or `stripHtmlTags()` to preprocess HTML.
     */
    content: string;
};

/**
 * A single page ID or a range of page IDs.
 *
 * - `number`: A single page ID
 * - `[number, number]`: A range from first to second (inclusive)
 *
 * @example
 * 5           // Single page 5
 * [10, 20]    // Pages 10 through 20 (inclusive)
 */
export type PageRange = number | [number, number];

/**
 * Base page range constraint with min/max page IDs.
 *
 * Used by rules, breakpoints, and preprocess transforms to limit
 * which pages a configuration applies to.
 *
 * @example
 * // Only apply from page 10 onwards
 * { min: 10 }
 *
 * @example
 * // Only apply to pages 50-100
 * { min: 50, max: 100 }
 */
export type PageRangeConstraint = {
    /**
     * Minimum page ID for this to apply.
     * Items on pages with `id < min` are skipped.
     */
    min?: number;

    /**
     * Maximum page ID for this to apply.
     * Items on pages with `id > max` are skipped.
     */
    max?: number;
};

/**
 * Extended page range constraint with exclude list.
 *
 * Used by rules and breakpoints (not preprocess transforms) to
 * provide fine-grained control over which pages to skip.
 *
 * @example
 * // Apply to pages 1-100, but skip front matter and specific pages
 * { min: 1, max: 100, exclude: [[1, 5], 50] }
 */
export type PageRangeConstraintWithExclude = PageRangeConstraint & {
    /**
     * Specific pages or page ranges to exclude.
     *
     * @example
     * // Exclude specific pages
     * exclude: [1, 2, 5]
     *
     * @example
     * // Exclude page ranges
     * exclude: [[1, 10], [50, 100]]
     *
     * @example
     * // Mix single pages and ranges
     * exclude: [1, [5, 10], 50]
     */
    exclude?: PageRange[];
};

// Re-export preprocess types for convenience
export type {
    CondenseEllipsisRule,
    FixTrailingWawRule,
    PreprocessTransform,
    RemoveZeroWidthRule,
} from './options.js';

export type {
    SegmentValidationIssue as ValidationIssue,
    SegmentValidationIssueSeverity as ValidationIssueSeverity,
    SegmentValidationIssueType as ValidationIssueType,
    SegmentValidationReport as ValidationReport,
} from './validation.js';
