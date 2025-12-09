// ─────────────────────────────────────────────────────────────
// Pattern Types (mutually exclusive - only ONE per rule)
// ─────────────────────────────────────────────────────────────

/**
 * Literal regex pattern rule - no token expansion is applied.
 *
 * Use this when you need full control over the regex pattern.
 * If the regex contains capturing groups, the captured content
 * will be used as the segment content.
 *
 * @example
 * // Match Arabic-Indic numbers followed by a dash
 * { regex: '^[٠-٩]+ - ', split: 'at' }
 *
 * @example
 * // Capture group - content after the marker becomes segment content
 * { regex: '^[٠-٩]+ - (.*)', split: 'at' }
 */
type RegexPattern = {
    /** Raw regex pattern string (no token expansion) */
    regex: string;
};

/**
 * Template pattern rule - expands `{{tokens}}` before compiling to regex.
 *
 * Supports all tokens defined in `TOKEN_PATTERNS` and named capture syntax.
 *
 * @example
 * // Using tokens for Arabic-Indic digits
 * { template: '^{{raqms}} {{dash}}', split: 'at' }
 *
 * @example
 * // Named capture to extract hadith number into metadata
 * { template: '^{{raqms:hadithNum}} {{dash}}', split: 'at' }
 *
 * @see TOKEN_PATTERNS for available tokens
 */
type TemplatePattern = {
    /** Template string with `{{token}}` or `{{token:name}}` placeholders */
    template: string;
};

/**
 * Line-start pattern rule - matches lines starting with any of the given patterns.
 *
 * Syntactic sugar for `^(?:pattern1|pattern2|...)`. The matched marker
 * is **included** in the segment content.
 *
 * Token expansion is applied to each pattern. Use `fuzzy: true` for
 * diacritic-insensitive Arabic matching.
 *
 * @example
 * // Split at chapter headings (marker included in content)
 * { lineStartsWith: ['## ', '### '], split: 'at' }
 *
 * @example
 * // Split at Arabic book/chapter markers with fuzzy matching
 * { lineStartsWith: ['{{kitab}}', '{{bab}}'], split: 'at', fuzzy: true }
 */
type LineStartsWithPattern = {
    /** Array of patterns that mark line beginnings (marker included in content) */
    lineStartsWith: string[];
};

/**
 * Line-start-after pattern rule - matches lines starting with patterns,
 * but **excludes** the marker from the segment content.
 *
 * Behaves like `lineStartsWith` but strips the marker from the output.
 * The segment content starts after the marker and extends to the next split point
 * (not just the end of the matching line).
 *
 * Token expansion is applied to each pattern. Use `fuzzy: true` for
 * diacritic-insensitive Arabic matching.
 *
 * @example
 * // Split at numbered hadiths, capturing content without the number prefix
 * // Content extends to next split, not just end of that line
 * { lineStartsAfter: ['{{raqms}} {{dash}} '], split: 'at' }
 *
 * @example
 * // Extract hadith number to metadata while stripping the prefix
 * { lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at' }
 */
type LineStartsAfterPattern = {
    /** Array of patterns that mark line beginnings (marker excluded from content) */
    lineStartsAfter: string[];
};

/**
 * Line-end pattern rule - matches lines ending with any of the given patterns.
 *
 * Syntactic sugar for `(?:pattern1|pattern2|...)$`.
 *
 * Token expansion is applied to each pattern. Use `fuzzy: true` for
 * diacritic-insensitive Arabic matching.
 *
 * @example
 * // Split at lines ending with Arabic sentence-ending punctuation
 * { lineEndsWith: ['۔', '؟', '!'], split: 'after' }
 */
type LineEndsWithPattern = {
    /** Array of patterns that mark line endings */
    lineEndsWith: string[];
};

/**
 * Union of all pattern types for split rules.
 *
 * Each rule must have exactly ONE pattern type:
 * - `regex` - Raw regex pattern (no token expansion)
 * - `template` - Pattern with `{{token}}` expansion
 * - `lineStartsWith` - Match line beginnings (marker included)
 * - `lineStartsAfter` - Match line beginnings (marker excluded)
 * - `lineEndsWith` - Match line endings
 */
type PatternType =
    | RegexPattern
    | TemplatePattern
    | LineStartsWithPattern
    | LineStartsAfterPattern
    | LineEndsWithPattern;

// ─────────────────────────────────────────────────────────────
// Split Behavior
// ─────────────────────────────────────────────────────────────

/**
 * Configuration for how and where to split content when a pattern matches.
 *
 * Controls the split position relative to matches, which occurrences to
 * split on, page span limits, and fuzzy matching for Arabic text.
 */
type SplitBehavior = {
    /**
     * Where to split relative to the match.
     * - `'at'`: New segment starts at the match position
     * - `'after'`: New segment starts after the match ends
     */
    split: 'at' | 'after';

    /**
     * Which occurrence(s) to split on.
     * - `'all'`: Split at every match (default)
     * - `'first'`: Only split at the first match
     * - `'last'`: Only split at the last match
     *
     * When `maxSpan` is set, occurrence filtering is applied per sliding
     * window rather than globally. With `'last'`, the algorithm prefers
     * longer segments by looking as far ahead as allowed before selecting
     * the last match in the window.
     *
     * @default 'all'
     */
    occurrence?: 'first' | 'last' | 'all';

    /**
     * Maximum page ID difference allowed when looking ahead for split points.
     *
     * Uses a sliding window algorithm that prefers longer segments:
     * 1. Start from the first page of the current segment
     * 2. Look for matches within pages where `pageId - startPageId <= maxSpan`
     * 3. Apply occurrence filter (e.g., 'last') to select a match
     * 4. Next window starts from the page after the match
     *
     * Examples:
     * - `maxSpan: 1` = look 1 page ahead (segments span at most 2 pages)
     * - `maxSpan: 2` = look 2 pages ahead (segments span at most 3 pages)
     * - `undefined` = no limit (entire content treated as one group)
     *
     * Note: With non-consecutive page IDs, the algorithm uses actual ID
     * difference, not array index. Pages 1 and 5 have a difference of 4.
     *
     * @example
     * // Split at last period, looking up to 1 page ahead
     * // Pages 1,2: split at page 2's last period
     * // Page 3: split at page 3's last period
     * { lineEndsWith: ['.'], split: 'after', occurrence: 'last', maxSpan: 1 }
     */
    maxSpan?: number;

    /**
     * Enable diacritic-insensitive matching for Arabic text.
     *
     * When `true`, patterns in `lineStartsWith`, `lineEndsWith`, and
     * `lineStartsAfter` are transformed to match text regardless of:
     * - Diacritics (harakat/tashkeel): فَتْحَة، ضَمَّة، كَسْرَة، etc.
     * - Character equivalences: ا/آ/أ/إ, ة/ه, ى/ي
     *
     * **Note**: Does NOT apply to `regex` or `template` patterns.
     * For templates, apply fuzzy manually using `makeDiacriticInsensitive()`.
     *
     * @default false
     */
    fuzzy?: boolean;
};

// ─────────────────────────────────────────────────────────────
// Constraints & Metadata
// ─────────────────────────────────────────────────────────────

/**
 * Optional constraints and metadata for a split rule.
 *
 * Use constraints to limit which pages a rule applies to, and
 * metadata to attach arbitrary data to resulting segments.
 */
type RuleConstraints = {
    /**
     * Minimum page ID for this rule to apply.
     *
     * Matches on pages with `id < min` are ignored.
     *
     * @example
     * // Only apply rule starting from page 10
     * { min: 10, lineStartsWith: ['##'], split: 'before' }
     */
    min?: number;

    /**
     * Maximum page ID for this rule to apply.
     *
     * Matches on pages with `id > max` are ignored.
     *
     * @example
     * // Only apply rule up to page 100
     * { max: 100, lineStartsWith: ['##'], split: 'before' }
     */
    max?: number;

    /**
     * Arbitrary metadata attached to segments matching this rule.
     *
     * This metadata is merged with any named captures from the pattern.
     * Named captures (e.g., `{{raqms:num}}`) take precedence over
     * static metadata with the same key.
     *
     * @example
     * // Tag segments as chapters
     * { lineStartsWith: ['{{bab}}'], split: 'before', meta: { type: 'chapter' } }
     */
    meta?: Record<string, unknown>;

    /**
     * Fallback behavior when no matches are found within a maxSpan boundary.
     * - 'page': Create split points at page boundaries
     * - undefined: No fallback (current behavior)
     */
    fallback?: 'page';
};

// ─────────────────────────────────────────────────────────────
// Combined Rule Type
// ─────────────────────────────────────────────────────────────

/**
 * A complete split rule combining pattern, behavior, and constraints.
 *
 * Each rule must specify:
 * - **Pattern** (exactly one): `regex`, `template`, `lineStartsWith`,
 *   `lineStartsAfter`, or `lineEndsWith`
 * - **Split behavior**: `split` (required), `occurrence`, `maxSpan`, `fuzzy`
 * - **Constraints** (optional): `min`, `max`, `meta`
 *
 * @example
 * // Basic rule: split at markdown headers
 * const rule: SplitRule = {
 *   lineStartsWith: ['## ', '### '],
 *   split: 'at',
 *   meta: { type: 'section' }
 * };
 *
 * @example
 * // Advanced rule: extract hadith numbers with fuzzy Arabic matching
 * const rule: SplitRule = {
 *   lineStartsAfter: ['{{raqms:hadithNum}} {{dash}} '],
 *   split: 'at',
 *   fuzzy: true,
 *   min: 5,
 *   max: 500,
 *   meta: { type: 'hadith' }
 * };
 */
export type SplitRule = PatternType & SplitBehavior & RuleConstraints;

// ─────────────────────────────────────────────────────────────
// Input & Output
// ─────────────────────────────────────────────────────────────

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
     * - `maxSpan` grouping (segments spanning multiple pages)
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
 * Segmentation options controlling how pages are split.
 *
 * @example
 * const options: SegmentationOptions = {
 *   rules: [
 *     { lineStartsWith: ['## '], split: 'at', meta: { type: 'chapter' } },
 *     { lineStartsWith: ['### '], split: 'at', meta: { type: 'section' } },
 *   ]
 * };
 */
export type SegmentationOptions = {
    /**
     * Rules applied in order to find split points.
     *
     * All rules are evaluated against the content, and their matches
     * are combined to determine final split points. The first matching
     * rule's metadata is used for each segment.
     */
    rules: SplitRule[];
};

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
