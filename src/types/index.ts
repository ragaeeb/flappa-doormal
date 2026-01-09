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
